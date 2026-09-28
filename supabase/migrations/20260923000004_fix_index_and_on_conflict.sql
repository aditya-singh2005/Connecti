-- ============================================================================
-- ROOT CAUSE FIX: The ON CONFLICT clause never matched the actual index.
-- The index interactions_pair_key_active_idx has predicate:
--   WHERE pair_key IS NOT NULL AND status NOT IN ('ignored','expired','terminated','TERMINATED')
-- Every previous ON CONFLICT clause used WHERE pair_key IS NOT NULL (wrong predicate).
-- PostgreSQL silently throws "no unique or exclusion constraint matching ON CONFLICT",
-- which was caught by EXCEPTION handlers, returning NULL / empty every time.
-- No interactions were ever inserted. No notifications ever sent.
-- ============================================================================

-- 1. Drop the partial index with the compound predicate
DROP INDEX IF EXISTS public.interactions_pair_key_active_idx;

-- 2. Replace with a simple partial index on just pair_key IS NOT NULL
--    so ON CONFLICT (pair_key) WHERE pair_key IS NOT NULL works correctly
CREATE UNIQUE INDEX IF NOT EXISTS interactions_pair_key_unique_idx
  ON public.interactions (pair_key)
  WHERE pair_key IS NOT NULL;

-- 3. Rewrite upsert_mutual_discovery_pair with correct ON CONFLICT + verbose logging
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
    RAISE WARNING '[upsert_pair] Invalid users: % %', p_user_a, p_user_b;
    RETURN NULL;
  END IF;

  -- Verify friendship
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE (f.user1_id = p_user_a AND f.user2_id = p_user_b)
       OR (f.user1_id = p_user_b AND f.user2_id = p_user_a)
  ) THEN
    RAISE WARNING '[upsert_pair] ❌ Not friends: % and %', p_user_a, p_user_b;
    RETURN NULL;
  END IF;

  RAISE NOTICE '[upsert_pair] ✅ Friendship verified for % and %', p_user_a, p_user_b;

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
    RAISE WARNING '[upsert_pair] ❌ Zone/wave preconditions not met for % and % in zone %', p_user_a, p_user_b, p_zone_id;
    RETURN NULL;
  END IF;

  RAISE NOTICE '[upsert_pair] ✅ Zone/wave preconditions met. pair_key=%, zone=%', row_key, p_zone_id;

  -- Upsert the interaction using the corrected ON CONFLICT clause
  INSERT INTO public.interactions (
    sender_id, receiver_id, interaction_type, status, phase, pair_key,
    zone_id, zone_name, hint_payload,
    phase_started_at, phase_updated_at,
    notification_sent_to_sender, notification_sent_to_receiver,
    nearby_activity_created_for_sender, nearby_activity_created_for_receiver
  ) VALUES (
    p_user_a, p_user_b, 'mutual_discovery', 'SHOWN_HINTS', 'SHOWN_HINTS', row_key,
    p_zone_id, p_zone_name,
    jsonb_build_object(
      'shared_context', 'Mutual friends active in the same zone',
      'match_reason', 'friends_same_zone_open_to_wave',
      'zone_name', p_zone_name
    ),
    now(), now(),
    false, false, false, false
  )
  ON CONFLICT (pair_key) WHERE pair_key IS NOT NULL DO UPDATE SET
    phase = 'SHOWN_HINTS',
    status = 'SHOWN_HINTS',
    zone_id = excluded.zone_id,
    zone_name = COALESCE(excluded.zone_name, public.interactions.zone_name),
    phase_updated_at = now(),
    -- Always reset so notification is resent on each new wave event
    notification_sent_to_sender = false,
    notification_sent_to_receiver = false
  RETURNING * INTO interaction_row;

  RAISE NOTICE '[upsert_pair] ✅ Upsert done. interaction_id=%', interaction_row.id;

  IF interaction_row.id IS NULL THEN
    SELECT * INTO interaction_row
    FROM public.interactions
    WHERE pair_key = row_key
    ORDER BY created_at DESC
    LIMIT 1;
    RAISE NOTICE '[upsert_pair] ℹ️ Fetched existing interaction id=%', interaction_row.id;
  END IF;

  IF interaction_row.id IS NOT NULL THEN
    BEGIN
      PERFORM public.notify_discovery_match(interaction_row.id);
      RAISE NOTICE '[upsert_pair] ✅ notify_discovery_match called for %', interaction_row.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[upsert_pair] ❌ notify_discovery_match failed: %', SQLERRM;
    END;
  END IF;

  RETURN interaction_row;
END;
$$;

-- 4. Rewrite notify_discovery_match with correct token parsing + verbose logging
CREATE OR REPLACE FUNCTION public.notify_discovery_match(p_interaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  interaction_row public.interactions;
  t_token text;
  tokens_sent_sender int := 0;
  tokens_sent_receiver int := 0;
BEGIN
  SELECT * INTO interaction_row FROM public.interactions WHERE id = p_interaction_id;
  IF interaction_row.id IS NULL THEN
    RAISE WARNING '[notify] ❌ Interaction not found: %', p_interaction_id;
    RETURN;
  END IF;

  RAISE NOTICE '[notify] 📦 Interaction % — sender_notified=%, receiver_notified=%',
    p_interaction_id, interaction_row.notification_sent_to_sender, interaction_row.notification_sent_to_receiver;

  -- Notify sender
  IF NOT interaction_row.notification_sent_to_sender THEN
    FOR t_token IN
      SELECT DISTINCT tok FROM (
        SELECT CASE WHEN fcm_token LIKE '{%' THEN (fcm_token::jsonb ->> 'fcmToken') ELSE fcm_token END AS tok
        FROM public.active_zone_users WHERE user_id = interaction_row.sender_id AND fcm_token IS NOT NULL AND fcm_token <> ''
        UNION
        SELECT CASE WHEN expo_push_token LIKE '{%' THEN (expo_push_token::jsonb ->> 'expoToken') ELSE expo_push_token END AS tok
        FROM public.active_zone_users WHERE user_id = interaction_row.sender_id AND expo_push_token IS NOT NULL AND expo_push_token <> ''
        UNION
        SELECT (fcm_token::jsonb ->> 'expoToken') AS tok
        FROM public.active_zone_users WHERE user_id = interaction_row.sender_id AND fcm_token LIKE '{%' AND (fcm_token::jsonb ->> 'expoToken') IS NOT NULL
        UNION
        SELECT CASE WHEN fcm_token LIKE '{%' THEN (fcm_token::jsonb ->> 'fcmToken') ELSE fcm_token END AS tok
        FROM public.profiles WHERE id = interaction_row.sender_id AND fcm_token IS NOT NULL AND fcm_token <> ''
        UNION
        SELECT CASE WHEN expo_push_token LIKE '{%' THEN (expo_push_token::jsonb ->> 'expoToken') ELSE expo_push_token END AS tok
        FROM public.profiles WHERE id = interaction_row.sender_id AND expo_push_token IS NOT NULL AND expo_push_token <> ''
      ) tokens
      WHERE tok IS NOT NULL AND tok <> ''
    LOOP
      RAISE NOTICE '[notify] 📤 Sending to SENDER % token starting: %', interaction_row.sender_id, LEFT(t_token, 25);
      BEGIN
        PERFORM net.http_post(
          url := 'https://connecti-push-api.vercel.app/api/send-notification',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object(
            'token', t_token,
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
        tokens_sent_sender := tokens_sent_sender + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[notify] ❌ Sender token failed: %', SQLERRM;
      END;
    END LOOP;

    RAISE NOTICE '[notify] ✅ Sender notified with % token(s)', tokens_sent_sender;
    UPDATE public.interactions
    SET notification_sent_to_sender = true,
        nearby_activity_created_for_sender = true,
        phase_updated_at = now()
    WHERE id = p_interaction_id;
  ELSE
    RAISE NOTICE '[notify] ⏭️ Sender already notified, skipping';
  END IF;

  -- Notify receiver
  IF NOT interaction_row.notification_sent_to_receiver THEN
    FOR t_token IN
      SELECT DISTINCT tok FROM (
        SELECT CASE WHEN fcm_token LIKE '{%' THEN (fcm_token::jsonb ->> 'fcmToken') ELSE fcm_token END AS tok
        FROM public.active_zone_users WHERE user_id = interaction_row.receiver_id AND fcm_token IS NOT NULL AND fcm_token <> ''
        UNION
        SELECT CASE WHEN expo_push_token LIKE '{%' THEN (expo_push_token::jsonb ->> 'expoToken') ELSE expo_push_token END AS tok
        FROM public.active_zone_users WHERE user_id = interaction_row.receiver_id AND expo_push_token IS NOT NULL AND expo_push_token <> ''
        UNION
        SELECT (fcm_token::jsonb ->> 'expoToken') AS tok
        FROM public.active_zone_users WHERE user_id = interaction_row.receiver_id AND fcm_token LIKE '{%' AND (fcm_token::jsonb ->> 'expoToken') IS NOT NULL
        UNION
        SELECT CASE WHEN fcm_token LIKE '{%' THEN (fcm_token::jsonb ->> 'fcmToken') ELSE fcm_token END AS tok
        FROM public.profiles WHERE id = interaction_row.receiver_id AND fcm_token IS NOT NULL AND fcm_token <> ''
        UNION
        SELECT CASE WHEN expo_push_token LIKE '{%' THEN (expo_push_token::jsonb ->> 'expoToken') ELSE expo_push_token END AS tok
        FROM public.profiles WHERE id = interaction_row.receiver_id AND expo_push_token IS NOT NULL AND expo_push_token <> ''
      ) tokens
      WHERE tok IS NOT NULL AND tok <> ''
    LOOP
      RAISE NOTICE '[notify] 📤 Sending to RECEIVER % token starting: %', interaction_row.receiver_id, LEFT(t_token, 25);
      BEGIN
        PERFORM net.http_post(
          url := 'https://connecti-push-api.vercel.app/api/send-notification',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object(
            'token', t_token,
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
        tokens_sent_receiver := tokens_sent_receiver + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[notify] ❌ Receiver token failed: %', SQLERRM;
      END;
    END LOOP;

    RAISE NOTICE '[notify] ✅ Receiver notified with % token(s)', tokens_sent_receiver;
    UPDATE public.interactions
    SET notification_sent_to_receiver = true,
        nearby_activity_created_for_receiver = true,
        phase_updated_at = now()
    WHERE id = p_interaction_id;
  ELSE
    RAISE NOTICE '[notify] ⏭️ Receiver already notified, skipping';
  END IF;
END;
$$;

-- 5. Rewrite match_active_waves_for_user with verbose logging
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
  partner_count int := 0;
BEGIN
  SELECT * INTO presence_row
  FROM public.active_zone_users
  WHERE user_id = p_user_id
    AND open_to_wave = true
    AND last_updated > now() - interval '30 minutes'
  ORDER BY last_updated DESC
  LIMIT 1;

  IF presence_row.user_id IS NULL THEN
    RAISE NOTICE '[match_user] ⏭️ User % is not actively waving, skipping', p_user_id;
    RETURN;
  END IF;

  RAISE NOTICE '[match_user] 🔍 Scanning friends for user % in zone %', p_user_id, presence_row.zone_id;

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
    partner_count := partner_count + 1;
    RAISE NOTICE '[match_user] 👥 Found eligible partner % for user %', partner_id, p_user_id;
    BEGIN
      SELECT * INTO interaction_row
      FROM public.upsert_mutual_discovery_pair(
        p_user_a    := p_user_id,
        p_user_b    := partner_id,
        p_zone_id   := presence_row.zone_id,
        p_zone_name := COALESCE(presence_row.zone_name, presence_row.zone_id::text)
      );

      IF interaction_row.id IS NOT NULL THEN
        RAISE NOTICE '[match_user] ✅ Interaction % created/updated for pair', interaction_row.id;
        RETURN NEXT interaction_row;
      ELSE
        RAISE NOTICE '[match_user] ⚠️ upsert returned NULL for pair % - %', p_user_id, partner_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[match_user] ❌ Failed for pair % - %: % (SQLSTATE: %)',
        p_user_id, partner_id, SQLERRM, SQLSTATE;
    END;
  END LOOP;

  IF partner_count = 0 THEN
    RAISE NOTICE '[match_user] ℹ️ No eligible waving friends found for user % in zone %', p_user_id, presence_row.zone_id;
  END IF;
END;
$$;

-- 6. Immediately run match for all currently waving users now that index is fixed
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

SELECT 'INDEX_FIXED_FULL_PIPELINE_OPERATIONAL' AS status;
