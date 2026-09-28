-- Fix: Don't reset notification flags on conflict if they are already true.
-- This prevents duplicate notifications when:
-- 1. The trigger sends once → sets notification_sent_to_sender = true
-- 2. Client RPC calls match again → ON CONFLICT sees flag is true → skips re-sending
-- Only reset when interaction was TERMINATED/EXPIRED (genuinely re-matching).

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

  -- Advisory lock: prevent concurrent duplicate notifications for same pair
  PERFORM pg_advisory_xact_lock(hashtext(row_key));

  -- Verify friendship
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE (f.user1_id = p_user_a AND f.user2_id = p_user_b)
       OR (f.user1_id = p_user_b AND f.user2_id = p_user_a)
  ) THEN
    RAISE WARNING '[upsert_pair] ❌ Not friends: % and %', p_user_a, p_user_b;
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
    RAISE WARNING '[upsert_pair] ❌ Zone/wave preconditions not met for % and % in zone %', p_user_a, p_user_b, p_zone_id;
    RETURN NULL;
  END IF;

  RAISE NOTICE '[upsert_pair] ✅ Conditions met, upserting pair % | zone=%', row_key, p_zone_id;

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
    -- KEY FIX: Only reset notification flags if this is a genuine re-match
    -- (was TERMINATED/EXPIRED). If already notified for this match, preserve the flag.
    notification_sent_to_sender = CASE
      WHEN public.interactions.phase IN ('TERMINATED','EXPIRED') THEN false
      ELSE public.interactions.notification_sent_to_sender
    END,
    notification_sent_to_receiver = CASE
      WHEN public.interactions.phase IN ('TERMINATED','EXPIRED') THEN false
      ELSE public.interactions.notification_sent_to_receiver
    END
  RETURNING * INTO interaction_row;

  IF interaction_row.id IS NULL THEN
    SELECT * INTO interaction_row FROM public.interactions WHERE pair_key = row_key ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF interaction_row.id IS NOT NULL THEN
    BEGIN
      PERFORM public.notify_discovery_match(interaction_row.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[upsert_pair] ❌ notify_discovery_match failed: %', SQLERRM;
    END;
  END IF;

  RETURN interaction_row;
END;
$$;

SELECT 'DEDUP_NOTIFICATION_FIX_APPLIED' AS status;
