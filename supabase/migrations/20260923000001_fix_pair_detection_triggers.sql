-- 1. Fix trigger so it ONLY fires on state changes (open_to_wave becomes true, or zone_id changes while open_to_wave is true).
-- It will NO LONGER fire on periodic `last_updated` bumps from the background location task.
CREATE OR REPLACE FUNCTION public.match_active_waves_after_presence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger match finding on state changes (INSERT, or UPDATE where open_to_wave turned true, or zone_id changed)
  IF TG_OP = 'INSERT' OR 
    (TG_OP = 'UPDATE' AND (OLD.open_to_wave = false OR OLD.zone_id IS DISTINCT FROM NEW.zone_id)) THEN
    BEGIN
      PERFORM public.match_active_waves_for_user(NEW.user_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[match_trigger] Match-finding failed for user %: % (SQLSTATE: %)',
        NEW.user_id, SQLERRM, SQLSTATE;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_active_waves_on_presence ON public.active_zone_users;
CREATE TRIGGER match_active_waves_on_presence
AFTER INSERT OR UPDATE OF zone_id, open_to_wave ON public.active_zone_users
FOR EACH ROW
WHEN (NEW.open_to_wave = true)
EXECUTE FUNCTION public.match_active_waves_after_presence();

-- 2. Modify upsert_mutual_discovery_pair so it ALWAYS resets notifications when called.
-- Since it's now only called on state changes or explicit user actions, this will not spam.
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
    phase = 'SHOWN_HINTS',
    status = 'SHOWN_HINTS',
    zone_id = excluded.zone_id,
    zone_name = COALESCE(excluded.zone_name, public.interactions.zone_name),
    phase_updated_at = now(),
    -- STRICTLY notify both on any state change that triggers this function
    notification_sent_to_sender = false,
    notification_sent_to_receiver = false
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
