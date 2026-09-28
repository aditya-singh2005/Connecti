-- The fcm_token column has been storing a JSON object string instead of the raw token.
-- This migration fixes notify_discovery_match to parse JSON-encoded tokens,
-- and patches the existing bad data in active_zone_users.

-- 1. Fix existing bad data: extract real fcm_token from JSON blobs
UPDATE public.active_zone_users
SET
  fcm_token = CASE
    WHEN fcm_token IS NOT NULL AND fcm_token LIKE '{%' THEN
      (fcm_token::jsonb ->> 'fcmToken')
    ELSE fcm_token
  END,
  expo_push_token = CASE
    WHEN fcm_token IS NOT NULL AND fcm_token LIKE '{%' AND (fcm_token::jsonb ->> 'expoToken') IS NOT NULL THEN
      (fcm_token::jsonb ->> 'expoToken')
    WHEN expo_push_token IS NOT NULL AND expo_push_token LIKE '{%' THEN
      (expo_push_token::jsonb ->> 'expoToken')
    ELSE expo_push_token
  END
WHERE
  (fcm_token IS NOT NULL AND fcm_token LIKE '{%')
  OR (expo_push_token IS NOT NULL AND expo_push_token LIKE '{%');

-- 2. Fix profiles table as well if tokens stored there too
UPDATE public.profiles
SET
  fcm_token = CASE
    WHEN fcm_token IS NOT NULL AND fcm_token LIKE '{%' THEN
      (fcm_token::jsonb ->> 'fcmToken')
    ELSE fcm_token
  END,
  expo_push_token = CASE
    WHEN fcm_token IS NOT NULL AND fcm_token LIKE '{%' AND (fcm_token::jsonb ->> 'expoToken') IS NOT NULL THEN
      (fcm_token::jsonb ->> 'expoToken')
    WHEN expo_push_token IS NOT NULL AND expo_push_token LIKE '{%' THEN
      (expo_push_token::jsonb ->> 'expoToken')
    ELSE expo_push_token
  END
WHERE
  (fcm_token IS NOT NULL AND fcm_token LIKE '{%')
  OR (expo_push_token IS NOT NULL AND expo_push_token LIKE '{%');

-- 3. Fix sync_user_zone_presence to always extract raw token from JSON if needed
CREATE OR REPLACE FUNCTION public.sync_user_zone_presence(
  p_user_id uuid,
  p_zone_name text,
  p_open_to_wave boolean default false,
  p_fcm_token text default null,
  p_expo_push_token text default null,
  p_execution_state text default 'foreground',
  p_latitude double precision default null,
  p_longitude double precision default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_zone_id uuid;
  v_final_zone_name text := p_zone_name;
  v_fcm_token text;
  v_expo_push_token text;
BEGIN
  -- Resolve zone_id from name
  SELECT id, name INTO v_zone_id, v_final_zone_name
  FROM public.geofence_zones
  WHERE name = p_zone_name
  LIMIT 1;

  IF v_zone_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Zone not found: ' || COALESCE(p_zone_name, 'null'));
  END IF;

  -- Unwrap tokens if they arrived as JSON strings
  IF p_fcm_token IS NOT NULL AND p_fcm_token LIKE '{%' THEN
    BEGIN
      v_fcm_token := (p_fcm_token::jsonb) ->> 'fcmToken';
      IF v_expo_push_token IS NULL THEN
        v_expo_push_token := (p_fcm_token::jsonb) ->> 'expoToken';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_fcm_token := p_fcm_token;
    END;
  ELSE
    v_fcm_token := p_fcm_token;
  END IF;

  IF p_expo_push_token IS NOT NULL AND p_expo_push_token LIKE '{%' THEN
    BEGIN
      v_expo_push_token := COALESCE(v_expo_push_token, (p_expo_push_token::jsonb) ->> 'expoToken');
    EXCEPTION WHEN OTHERS THEN
      v_expo_push_token := COALESCE(v_expo_push_token, p_expo_push_token);
    END;
  ELSE
    v_expo_push_token := COALESCE(v_expo_push_token, p_expo_push_token);
  END IF;

  INSERT INTO public.active_zone_users (
    user_id,
    zone_id,
    zone_name,
    open_to_wave,
    fcm_token,
    expo_push_token,
    execution_state,
    latitude,
    longitude,
    last_updated
  ) VALUES (
    p_user_id,
    v_zone_id,
    v_final_zone_name,
    p_open_to_wave,
    v_fcm_token,
    v_expo_push_token,
    p_execution_state,
    p_latitude,
    p_longitude,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    zone_id         = excluded.zone_id,
    zone_name       = excluded.zone_name,
    open_to_wave    = excluded.open_to_wave,
    fcm_token       = COALESCE(excluded.fcm_token, public.active_zone_users.fcm_token),
    expo_push_token = COALESCE(excluded.expo_push_token, public.active_zone_users.expo_push_token),
    execution_state = excluded.execution_state,
    latitude        = COALESCE(excluded.latitude, public.active_zone_users.latitude),
    longitude       = COALESCE(excluded.longitude, public.active_zone_users.longitude),
    last_updated    = excluded.last_updated;

  RETURN jsonb_build_object(
    'success', true,
    'open_to_wave', p_open_to_wave,
    'zone_id', v_zone_id,
    'zone_name', v_final_zone_name,
    'fcm_token_stored', v_fcm_token IS NOT NULL,
    'expo_token_stored', v_expo_push_token IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_user_zone_presence(uuid, text, boolean, text, text, text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_zone_presence(uuid, text, boolean, text, text, text, double precision, double precision) TO anon;
GRANT EXECUTE ON FUNCTION public.sync_user_zone_presence(uuid, text, boolean, text, text, text, double precision, double precision) TO service_role;

-- 4. Fix notify_discovery_match to parse JSON tokens defensively (belt-and-suspenders)
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

  -- Helper: extract raw token from a column value that might be a JSON blob
  -- Notify sender
  IF NOT interaction_row.notification_sent_to_sender THEN
    FOR t_token IN
      SELECT DISTINCT tok FROM (
        -- active_zone_users fcm
        SELECT CASE WHEN fcm_token LIKE '{%' THEN (fcm_token::jsonb ->> 'fcmToken') ELSE fcm_token END AS tok
        FROM public.active_zone_users WHERE user_id = interaction_row.sender_id AND fcm_token IS NOT NULL AND fcm_token <> ''
        UNION
        -- active_zone_users expo
        SELECT CASE WHEN expo_push_token LIKE '{%' THEN (expo_push_token::jsonb ->> 'expoToken') ELSE expo_push_token END AS tok
        FROM public.active_zone_users WHERE user_id = interaction_row.sender_id AND expo_push_token IS NOT NULL AND expo_push_token <> ''
        UNION
        -- active_zone_users embedded expo inside fcm JSON
        SELECT (fcm_token::jsonb ->> 'expoToken') AS tok
        FROM public.active_zone_users WHERE user_id = interaction_row.sender_id AND fcm_token LIKE '{%' AND (fcm_token::jsonb ->> 'expoToken') IS NOT NULL
        UNION
        -- profiles fcm
        SELECT CASE WHEN fcm_token LIKE '{%' THEN (fcm_token::jsonb ->> 'fcmToken') ELSE fcm_token END AS tok
        FROM public.profiles WHERE id = interaction_row.sender_id AND fcm_token IS NOT NULL AND fcm_token <> ''
        UNION
        -- profiles expo
        SELECT CASE WHEN expo_push_token LIKE '{%' THEN (expo_push_token::jsonb ->> 'expoToken') ELSE expo_push_token END AS tok
        FROM public.profiles WHERE id = interaction_row.sender_id AND expo_push_token IS NOT NULL AND expo_push_token <> ''
      ) tokens
      WHERE tok IS NOT NULL AND tok <> ''
    LOOP
      BEGIN
        RAISE NOTICE '[notify] Sending to sender % with token starting: %', interaction_row.sender_id, LEFT(t_token, 30);
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
        RAISE WARNING '[notify] Failed to notify sender % with token %: %', interaction_row.sender_id, LEFT(t_token, 30), SQLERRM;
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
      BEGIN
        RAISE NOTICE '[notify] Sending to receiver % with token starting: %', interaction_row.receiver_id, LEFT(t_token, 30);
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
        RAISE WARNING '[notify] Failed to notify receiver % with token %: %', interaction_row.receiver_id, LEFT(t_token, 30), SQLERRM;
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

-- 5. Immediately force re-match for any pair currently waving so notifications go out NOW
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

SELECT 'TOKEN_PARSING_FIXED' AS status;
