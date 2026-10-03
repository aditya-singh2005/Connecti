-- 1. Alter 'phase' column type to TEXT to avoid enum casting errors and support all statuses seamlessly.
ALTER TABLE public.interactions ALTER COLUMN phase DROP DEFAULT;
ALTER TABLE public.interactions ALTER COLUMN phase TYPE text USING phase::text;

-- 2. Update mark_user_revealed to push successful reconnect notifications to BOTH users
CREATE OR REPLACE FUNCTION public.mark_user_revealed(p_interaction_id uuid, p_user_id uuid)
RETURNS public.interactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  interaction_row public.interactions;
BEGIN
  SELECT * INTO interaction_row FROM public.interactions WHERE id = p_interaction_id FOR UPDATE;
  IF interaction_row.id IS NULL THEN
    RAISE EXCEPTION 'Interaction not found';
  END IF;

  IF p_user_id NOT IN (interaction_row.sender_id, interaction_row.receiver_id) THEN
    RAISE EXCEPTION 'User is not part of this discovery';
  END IF;

  IF interaction_row.phase IN ('TERMINATED', 'EXPIRED') THEN
    RAISE EXCEPTION 'This discovery has already ended';
  END IF;

  IF p_user_id = interaction_row.sender_id THEN
    UPDATE public.interactions
    SET sender_revealed = true,
        phase = CASE WHEN interaction_row.receiver_revealed THEN 'RECONNECTED' ELSE 'BOTH_REVEALS_PENDING' END,
        status = CASE WHEN interaction_row.receiver_revealed THEN 'RECONNECTED' ELSE 'BOTH_REVEALS_PENDING' END,
        phase_updated_at = now()
    WHERE id = p_interaction_id;
  ELSE
    UPDATE public.interactions
    SET receiver_revealed = true,
        phase = CASE WHEN interaction_row.sender_revealed THEN 'RECONNECTED' ELSE 'BOTH_REVEALS_PENDING' END,
        status = CASE WHEN interaction_row.sender_revealed THEN 'RECONNECTED' ELSE 'BOTH_REVEALS_PENDING' END,
        phase_updated_at = now()
    WHERE id = p_interaction_id;
  END IF;

  -- Re-fetch to check if both have revealed
  SELECT * INTO interaction_row FROM public.interactions WHERE id = p_interaction_id;

  IF interaction_row.sender_revealed AND interaction_row.receiver_revealed THEN
    UPDATE public.interactions
    SET phase = 'RECONNECTED',
        status = 'RECONNECTED',
        phase_updated_at = now(),
        reveal_completed_at = COALESCE(reveal_completed_at, now())
    WHERE id = p_interaction_id;

    -- Notification to sender
    BEGIN
      PERFORM net.http_post(
        url := 'https://connecti-push-api.vercel.app/api/send-notification',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'token', (SELECT COALESCE(fcm_token, expo_push_token) FROM public.profiles WHERE id = interaction_row.sender_id),
          'title', 'Successful Reconnection! 🎉',
          'body', 'Check out who it is!',
          'data', jsonb_build_object(
            'type', 'MATCH_REVEALED',
            'categoryId', 'MATCH_REVEALED',
            'interactionId', interaction_row.id::text,
            'sessionId', interaction_row.id::text,
            'phase', 'RECONNECTED'
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to notify sender: %', SQLERRM;
    END;

    -- Notification to receiver
    BEGIN
      PERFORM net.http_post(
        url := 'https://connecti-push-api.vercel.app/api/send-notification',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'token', (SELECT COALESCE(fcm_token, expo_push_token) FROM public.profiles WHERE id = interaction_row.receiver_id),
          'title', 'Successful Reconnection! 🎉',
          'body', 'Check out who it is!',
          'data', jsonb_build_object(
            'type', 'MATCH_REVEALED',
            'categoryId', 'MATCH_REVEALED',
            'interactionId', interaction_row.id::text,
            'sessionId', interaction_row.id::text,
            'phase', 'RECONNECTED'
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to notify receiver: %', SQLERRM;
    END;
  END IF;

  SELECT * INTO interaction_row FROM public.interactions WHERE id = p_interaction_id;
  RETURN interaction_row;
END;
$$;
