-- Enhance notification function to fetch the most recent push tokens.
-- The WaveService saves tokens to active_zone_users on every sync, 
-- so these are often more up-to-date than the profiles table.

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

  -- 1. Try to get sender token from active_zone_users (freshest)
  SELECT COALESCE(fcm_token, expo_push_token) INTO sender_token
  FROM public.active_zone_users
  WHERE user_id = interaction_row.sender_id
  ORDER BY last_updated DESC LIMIT 1;

  -- 2. Fallback to profiles table
  IF sender_token IS NULL OR sender_token = '' THEN
    SELECT COALESCE(fcm_token, expo_push_token) INTO sender_token
    FROM public.profiles WHERE id = interaction_row.sender_id;
  END IF;

  -- 1. Try to get receiver token from active_zone_users (freshest)
  SELECT COALESCE(fcm_token, expo_push_token) INTO receiver_token
  FROM public.active_zone_users
  WHERE user_id = interaction_row.receiver_id
  ORDER BY last_updated DESC LIMIT 1;

  -- 2. Fallback to profiles table
  IF receiver_token IS NULL OR receiver_token = '' THEN
    SELECT COALESCE(fcm_token, expo_push_token) INTO receiver_token
    FROM public.profiles WHERE id = interaction_row.receiver_id;
  END IF;

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

-- Immediately run match for everyone waving to retroactively send notifications
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

SELECT 'NOTIFY_FIXED_AND_TRIGGERED' as status;
