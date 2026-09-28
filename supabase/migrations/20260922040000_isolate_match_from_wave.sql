-- ============================================================================
-- ISOLATION FIX: Decouple "wave write" from "match finding"
-- ============================================================================
-- Problem: The trigger match_active_waves_on_presence runs INSIDE the same
-- transaction as the wave upsert. If matching fails (type errors, network
-- issues in notify_discovery_match, etc.), the ENTIRE wave write rolls back.
--
-- Solution:
-- 1. Trigger function wraps ALL match-finding in BEGIN...EXCEPTION so errors
--    are caught and logged but never roll back the parent transaction.
-- 2. upsert_mutual_discovery_pair handles type casting explicitly.
-- 3. notify_discovery_match wraps HTTP calls in exception handlers.
-- ============================================================================

-- ── 1. Bulletproof trigger: catch ALL errors from match-finding ─────────────
CREATE OR REPLACE FUNCTION public.match_active_waves_after_presence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Wrap in a sub-block so ANY error in matching is caught
  -- and the parent INSERT/UPDATE on active_zone_users ALWAYS commits.
  BEGIN
    PERFORM public.match_active_waves_for_user(NEW.user_id);
  EXCEPTION WHEN OTHERS THEN
    -- Log the error but NEVER abort the wave write
    RAISE WARNING '[match_trigger] Match-finding failed for user %: % (SQLSTATE: %)',
      NEW.user_id, SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$$;

-- ── 2. Bulletproof match loop: catch per-partner errors ─────────────────────
CREATE OR REPLACE FUNCTION public.match_active_waves_for_user(p_user_id uuid)
RETURNS SETOF public.interactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  presence_row public.active_zone_users;
  partner_id uuid;
  interaction_row public.interactions;
BEGIN
  -- Get user's current wave presence
  SELECT * INTO presence_row
  FROM public.active_zone_users
  WHERE user_id = p_user_id
    AND open_to_wave = true
    AND last_updated > now() - interval '30 minutes'
  ORDER BY last_updated DESC
  LIMIT 1;

  IF presence_row.user_id IS NULL THEN
    RETURN;  -- user is not actively waving
  END IF;

  -- Loop through friends who are also waving in the same zone
  FOR partner_id IN
    SELECT CASE WHEN f.user1_id = p_user_id THEN f.user2_id ELSE f.user1_id END
    FROM public.friendships f
    JOIN public.active_zone_users pp
      ON pp.user_id = CASE WHEN f.user1_id = p_user_id THEN f.user2_id ELSE f.user1_id END
    WHERE (f.user1_id = p_user_id OR f.user2_id = p_user_id)
      AND pp.zone_id = presence_row.zone_id
      AND pp.open_to_wave = true
      AND pp.last_updated > now() - interval '30 minutes'
  LOOP
    -- Wrap EACH partner match in its own exception handler
    -- so one bad pair doesn't block other valid matches
    BEGIN
      SELECT * INTO interaction_row
      FROM public.upsert_mutual_discovery_pair(
        p_user_a  := p_user_id,
        p_user_b  := partner_id,
        p_zone_id := presence_row.zone_id,
        p_zone_name := COALESCE(presence_row.zone_name, presence_row.zone_id::text)
      );

      IF interaction_row.id IS NOT NULL THEN
        RETURN NEXT interaction_row;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[match_loop] Failed to match user % with partner %: % (SQLSTATE: %)',
        p_user_id, partner_id, SQLERRM, SQLSTATE;
    END;
  END LOOP;
END;
$$;

-- ── 3. Bulletproof upsert: explicit type casts ──────────────────────────────
DROP FUNCTION IF EXISTS public.upsert_mutual_discovery_pair(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.upsert_mutual_discovery_pair(uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.upsert_mutual_discovery_pair(
  p_user_a uuid,
  p_user_b uuid,
  p_zone_id uuid,
  p_zone_name text DEFAULT NULL
)
RETURNS public.interactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_key text := public.pair_key_for(p_user_a, p_user_b);
  interaction_row public.interactions;
BEGIN
  IF p_user_a IS NULL OR p_user_b IS NULL OR p_user_a = p_user_b THEN
    RAISE EXCEPTION 'Mutual discovery requires two distinct users';
  END IF;

  -- Verify friendship
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE (f.user1_id = p_user_a AND f.user2_id = p_user_b)
       OR (f.user1_id = p_user_b AND f.user2_id = p_user_a)
  ) THEN
    RAISE WARNING '[upsert_pair] Users % and % are not friends, skipping', p_user_a, p_user_b;
    RETURN NULL;
  END IF;

  -- Verify both are waving in the same zone
  IF NOT EXISTS (
    SELECT 1
    FROM public.active_zone_users a1
    JOIN public.active_zone_users a2 ON a2.user_id = p_user_b
    WHERE a1.user_id = p_user_a
      AND a1.zone_id = p_zone_id
      AND a2.zone_id = p_zone_id
      AND a1.open_to_wave = true
      AND a2.open_to_wave = true
      AND a1.last_updated > now() - interval '30 minutes'
      AND a2.last_updated > now() - interval '30 minutes'
  ) THEN
    RAISE WARNING '[upsert_pair] Preconditions not met for % and % in zone %', p_user_a, p_user_b, p_zone_id;
    RETURN NULL;
  END IF;

  -- Upsert the interaction: zone_id is cast to text for the interactions table
  INSERT INTO public.interactions (
    sender_id, receiver_id, interaction_type, status, phase, pair_key,
    zone_id, zone_name, hint_payload,
    phase_started_at, phase_updated_at,
    notification_sent_to_sender, notification_sent_to_receiver,
    nearby_activity_created_for_sender, nearby_activity_created_for_receiver
  ) VALUES (
    p_user_a, p_user_b, 'mutual_discovery', 'SHOWN_HINTS', 'SHOWN_HINTS', row_key,
    p_zone_id::text, p_zone_name,
    jsonb_build_object(
      'shared_context', 'Mutual friends active in the same zone',
      'match_reason', 'friends_same_zone_open_to_wave',
      'zone_name', p_zone_name
    ),
    now(), now(),
    false, false, false, false
  )
  ON CONFLICT (pair_key) DO UPDATE SET
    phase = CASE
      WHEN public.interactions.phase IN ('TERMINATED','EXPIRED') THEN public.interactions.phase
      ELSE 'SHOWN_HINTS'
    END,
    status = CASE
      WHEN public.interactions.phase IN ('TERMINATED','EXPIRED') THEN public.interactions.status
      ELSE 'SHOWN_HINTS'
    END,
    zone_id = excluded.zone_id,
    zone_name = COALESCE(excluded.zone_name, public.interactions.zone_name),
    phase_updated_at = now(),
    -- Reset notification flags so notifications are re-sent for re-matches
    notification_sent_to_sender = CASE
      WHEN public.interactions.phase IN ('TERMINATED','EXPIRED') THEN public.interactions.notification_sent_to_sender
      ELSE false
    END,
    notification_sent_to_receiver = CASE
      WHEN public.interactions.phase IN ('TERMINATED','EXPIRED') THEN public.interactions.notification_sent_to_receiver
      ELSE false
    END
  RETURNING * INTO interaction_row;

  IF interaction_row.id IS NULL THEN
    SELECT * INTO interaction_row
    FROM public.interactions
    WHERE pair_key = row_key
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Send notifications — also wrapped in exception handler
  IF interaction_row.id IS NOT NULL THEN
    BEGIN
      PERFORM public.notify_discovery_match(interaction_row.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[upsert_pair] Notification failed for interaction %: %', interaction_row.id, SQLERRM;
    END;
  END IF;

  RETURN interaction_row;
END;
$$;

-- ── 4. Bulletproof notification: wrap HTTP calls ────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_discovery_match(p_interaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  interaction_row public.interactions;
  sender_token text;
  receiver_token text;
BEGIN
  SELECT * INTO interaction_row FROM public.interactions WHERE id = p_interaction_id;
  IF interaction_row.id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(fcm_token, expo_push_token) INTO sender_token
  FROM public.profiles WHERE id = interaction_row.sender_id;

  SELECT COALESCE(fcm_token, expo_push_token) INTO receiver_token
  FROM public.profiles WHERE id = interaction_row.receiver_id;

  -- Send to sender
  IF sender_token IS NOT NULL AND sender_token <> '' AND NOT interaction_row.notification_sent_to_sender THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://connecti-push-api.vercel.app/api/send-notification',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'token', sender_token,
          'title', 'Someone you know might be nearby',
          'body', 'Open Connecti to see hints.',
          'data', jsonb_build_object(
            'type', 'MATCH_HINT',
            'categoryId', 'MATCH_HINT',
            'interactionId', interaction_row.id::text,
            'sessionId', interaction_row.id::text,
            'phase', 'SHOWN_HINTS'
          )
        )
      );
      UPDATE public.interactions
      SET notification_sent_to_sender = true,
          nearby_activity_created_for_sender = true,
          phase_updated_at = now()
      WHERE id = p_interaction_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[notify] Failed to notify sender %: %', interaction_row.sender_id, SQLERRM;
    END;
  END IF;

  -- Send to receiver
  IF receiver_token IS NOT NULL AND receiver_token <> '' AND NOT interaction_row.notification_sent_to_receiver THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://connecti-push-api.vercel.app/api/send-notification',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'token', receiver_token,
          'title', 'Someone you know might be nearby',
          'body', 'Open Connecti to see hints.',
          'data', jsonb_build_object(
            'type', 'MATCH_HINT',
            'categoryId', 'MATCH_HINT',
            'interactionId', interaction_row.id::text,
            'sessionId', interaction_row.id::text,
            'phase', 'SHOWN_HINTS'
          )
        )
      );
      UPDATE public.interactions
      SET notification_sent_to_receiver = true,
          nearby_activity_created_for_receiver = true,
          phase_updated_at = now()
      WHERE id = p_interaction_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[notify] Failed to notify receiver %: %', interaction_row.receiver_id, SQLERRM;
    END;
  END IF;
END;
$$;

-- ── 5. Friendship trigger: also isolate ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_active_waves_after_friendship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.match_active_waves_for_user(NEW.user1_id);
    PERFORM public.match_active_waves_for_user(NEW.user2_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[friendship_trigger] Match-finding failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- ── 6. Recreate triggers cleanly ────────────────────────────────────────────
DROP TRIGGER IF EXISTS match_active_waves_on_presence ON public.active_zone_users;
CREATE TRIGGER match_active_waves_on_presence
AFTER INSERT OR UPDATE OF zone_id, open_to_wave, last_updated ON public.active_zone_users
FOR EACH ROW
WHEN (NEW.open_to_wave = true)
EXECUTE FUNCTION public.match_active_waves_after_presence();

DROP TRIGGER IF EXISTS match_active_waves_on_friendship ON public.friendships;
CREATE TRIGGER match_active_waves_on_friendship
AFTER INSERT ON public.friendships
FOR EACH ROW
EXECUTE FUNCTION public.match_active_waves_after_friendship();

-- ── 7. Re-grant all functions ───────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.pair_key_for(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_discovery_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_mutual_discovery_pair(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_user_revealed(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terminate_reconnect(uuid, uuid, public.discovery_termination_reason) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_active_waves_for_user(uuid) TO authenticated;

-- ── 8. Immediately match all currently waving users ─────────────────────────
DO $$
DECLARE u record;
BEGIN
  FOR u IN
    SELECT DISTINCT user_id
    FROM public.active_zone_users
    WHERE open_to_wave = true AND last_updated > now() - interval '30 minutes'
  LOOP
    BEGIN
      PERFORM public.match_active_waves_for_user(u.user_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[retrigger] User % failed: %', u.user_id, SQLERRM;
    END;
  END LOOP;
END $$;

SELECT 'ISOLATED_MATCH_FINDING_APPLIED' AS status;
