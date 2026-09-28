CREATE OR REPLACE FUNCTION public.debug_match_state(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  presence_record record;
  friends_list jsonb;
  friends_presences jsonb;
BEGIN
  -- 1. Get user presence
  SELECT * INTO presence_record
  FROM public.active_zone_users
  WHERE user_id = p_user_id;

  -- 2. Get friends list
  SELECT jsonb_agg(
    CASE WHEN f.user1_id = p_user_id THEN f.user2_id ELSE f.user1_id END
  ) INTO friends_list
  FROM public.friendships f
  WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id;

  -- 3. Get friends presences
  SELECT jsonb_agg(row_to_json(pp)) INTO friends_presences
  FROM public.friendships f
  JOIN public.active_zone_users pp
    ON pp.user_id = CASE WHEN f.user1_id = p_user_id THEN f.user2_id ELSE f.user1_id END
  WHERE (f.user1_id = p_user_id OR f.user2_id = p_user_id);

  RETURN jsonb_build_object(
    'target_user_id', p_user_id,
    'user_presence', row_to_json(presence_record),
    'friends', COALESCE(friends_list, '[]'::jsonb),
    'friends_presences', COALESCE(friends_presences, '[]'::jsonb)
  );
END;
$$;
