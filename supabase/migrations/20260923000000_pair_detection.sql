-- 1. Fix upsert_mutual_discovery_pair to handle idempotency correctly without duplicate notifications
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

  -- Upsert the interaction.
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
    -- If TERMINATED or EXPIRED, reset to SHOWN_HINTS to restart discovery. 
    -- If already SHOWN_HINTS, just leave it as SHOWN_HINTS.
    phase = 'SHOWN_HINTS',
    status = 'SHOWN_HINTS',
    zone_id = excluded.zone_id,
    zone_name = COALESCE(excluded.zone_name, public.interactions.zone_name),
    phase_updated_at = CASE
      WHEN public.interactions.phase IN ('TERMINATED','EXPIRED') THEN now()
      ELSE public.interactions.phase_updated_at
    END,
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
    SELECT * INTO interaction_row
    FROM public.interactions
    WHERE pair_key = row_key
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

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

-- 2. Fix notify_discovery_match to loop through all unique device tokens
CREATE OR REPLACE FUNCTION public.notify_discovery_match(p_interaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  interaction_row public.interactions;
  t_token text;
BEGIN
  SELECT * INTO interaction_row FROM public.interactions WHERE id = p_interaction_id;
  IF interaction_row.id IS NULL THEN RETURN; END IF;

  -- Notify sender
  IF NOT interaction_row.notification_sent_to_sender THEN
    FOR t_token IN
      SELECT DISTINCT t FROM (
        SELECT fcm_token as t FROM public.active_zone_users WHERE user_id = interaction_row.sender_id AND fcm_token IS NOT NULL AND fcm_token <> ''
        UNION
        SELECT expo_push_token as t FROM public.active_zone_users WHERE user_id = interaction_row.sender_id AND expo_push_token IS NOT NULL AND expo_push_token <> ''
        UNION
        SELECT fcm_token as t FROM public.profiles WHERE id = interaction_row.sender_id AND fcm_token IS NOT NULL AND fcm_token <> ''
        UNION
        SELECT expo_push_token as t FROM public.profiles WHERE id = interaction_row.sender_id AND expo_push_token IS NOT NULL AND expo_push_token <> ''
      ) tokens
    LOOP
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
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[notify] Failed to notify sender % with token %: %', interaction_row.sender_id, t_token, SQLERRM;
      END;
    END LOOP;

    UPDATE public.interactions
    SET notification_sent_to_sender = true,
        nearby_activity_created_for_sender = true,
        phase_updated_at = now()
    WHERE id = p_interaction_id;
  END IF;

  -- Notify receiver
  IF NOT interaction_row.notification_sent_to_receiver THEN
    FOR t_token IN
      SELECT DISTINCT t FROM (
        SELECT fcm_token as t FROM public.active_zone_users WHERE user_id = interaction_row.receiver_id AND fcm_token IS NOT NULL AND fcm_token <> ''
        UNION
        SELECT expo_push_token as t FROM public.active_zone_users WHERE user_id = interaction_row.receiver_id AND expo_push_token IS NOT NULL AND expo_push_token <> ''
        UNION
        SELECT fcm_token as t FROM public.profiles WHERE id = interaction_row.receiver_id AND fcm_token IS NOT NULL AND fcm_token <> ''
        UNION
        SELECT expo_push_token as t FROM public.profiles WHERE id = interaction_row.receiver_id AND expo_push_token IS NOT NULL AND expo_push_token <> ''
      ) tokens
    LOOP
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
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[notify] Failed to notify receiver % with token %: %', interaction_row.receiver_id, t_token, SQLERRM;
      END;
    END LOOP;

    UPDATE public.interactions
    SET notification_sent_to_receiver = true,
        nearby_activity_created_for_receiver = true,
        phase_updated_at = now()
    WHERE id = p_interaction_id;
  END IF;
END;
$$;
