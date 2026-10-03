-- ============================================================================
-- ADD RANDOM LATENCY TO RECONNECTION NOTIFICATIONS
-- When both users reveal, wait a random 10-45 seconds before sending
-- the "Successful Reconnection" push notification to create suspense.
-- ============================================================================

-- We use pg_cron (already available in Supabase) or a deferred pg_notify
-- approach via a dedicated helper function that marks the interaction as
-- RECONNECTED_PENDING_NOTIFY, then a cron job flushes them after delay.

-- Step 1: Add a column to track the "notify_after" timestamp
ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS notify_after timestamptz;

-- Step 2: Rewrite mark_user_revealed to SET notify_after = now() + random delay
--         and move to phase RECONNECTED, but NOT send notification immediately.
CREATE OR REPLACE FUNCTION public.mark_user_revealed(p_interaction_id uuid, p_user_id uuid)
RETURNS public.interactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  interaction_row public.interactions;
  delay_seconds int;
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

  -- Re-fetch to check mutual reveal
  SELECT * INTO interaction_row FROM public.interactions WHERE id = p_interaction_id;

  IF interaction_row.sender_revealed AND interaction_row.receiver_revealed THEN
    -- Random delay: 10 to 45 seconds
    delay_seconds := 10 + floor(random() * 36)::int;

    UPDATE public.interactions
    SET phase = 'RECONNECTED',
        status = 'RECONNECTED',
        phase_updated_at = now(),
        reveal_completed_at = COALESCE(reveal_completed_at, now()),
        notify_after = now() + (delay_seconds || ' seconds')::interval
    WHERE id = p_interaction_id;
  END IF;

  SELECT * INTO interaction_row FROM public.interactions WHERE id = p_interaction_id;
  RETURN interaction_row;
END;
$$;

-- Step 3: A function that sends pending reconnect notifications
--         (called by cron every 10 seconds)
CREATE OR REPLACE FUNCTION public.flush_reconnect_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.interactions;
BEGIN
  FOR rec IN
    SELECT * FROM public.interactions
    WHERE phase = 'RECONNECTED'
      AND notify_after IS NOT NULL
      AND notify_after <= now()
      AND (notification_sent_to_sender = false OR notification_sent_to_receiver = false)
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Notify sender
    IF NOT rec.notification_sent_to_sender THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://connecti-push-api.vercel.app/api/send-notification',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object(
            'token', (SELECT COALESCE(fcm_token, expo_push_token) FROM public.profiles WHERE id = rec.sender_id),
            'title', 'Successful Reconnection! 🎉',
            'body', 'Check out who it is — someone you know was nearby.',
            'data', jsonb_build_object(
              'type', 'MATCH_REVEALED',
              'categoryId', 'MATCH_REVEALED',
              'interactionId', rec.id::text,
              'sessionId', rec.id::text,
              'phase', 'RECONNECTED'
            )
          )
        );
        UPDATE public.interactions SET notification_sent_to_sender = true WHERE id = rec.id;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'flush_reconnect_notifications: failed sender notify for %: %', rec.id, SQLERRM;
      END;
    END IF;

    -- Notify receiver
    IF NOT rec.notification_sent_to_receiver THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://connecti-push-api.vercel.app/api/send-notification',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object(
            'token', (SELECT COALESCE(fcm_token, expo_push_token) FROM public.profiles WHERE id = rec.receiver_id),
            'title', 'Successful Reconnection! 🎉',
            'body', 'Check out who it is — someone you know was nearby.',
            'data', jsonb_build_object(
              'type', 'MATCH_REVEALED',
              'categoryId', 'MATCH_REVEALED',
              'interactionId', rec.id::text,
              'sessionId', rec.id::text,
              'phase', 'RECONNECTED'
            )
          )
        );
        UPDATE public.interactions SET notification_sent_to_receiver = true WHERE id = rec.id;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'flush_reconnect_notifications: failed receiver notify for %: %', rec.id, SQLERRM;
      END;
    END IF;
  END LOOP;
END;
$$;

-- Step 4: Schedule the flush to run every minute via pg_cron
-- (Supabase hosted projects have pg_cron available)
SELECT cron.schedule(
  'flush-reconnect-notifications',
  '* * * * *',
  $$SELECT public.flush_reconnect_notifications();$$
);

-- Grants
GRANT EXECUTE ON FUNCTION public.mark_user_revealed(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flush_reconnect_notifications() TO authenticated;
