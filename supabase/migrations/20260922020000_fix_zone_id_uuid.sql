-- Fix: upsert_mutual_discovery_pair must accept uuid for p_zone_id
-- because active_zone_users.zone_id is uuid (FK to geofence_zones.id)
-- Our earlier "text" fix was wrong. Reverting to uuid.

DROP FUNCTION IF EXISTS public.upsert_mutual_discovery_pair(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.upsert_mutual_discovery_pair(uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.upsert_mutual_discovery_pair(
  p_user_a uuid,
  p_user_b uuid,
  p_zone_id uuid,
  p_zone_name text default null
)
RETURNS public.interactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  row_key text := public.pair_key_for(p_user_a, p_user_b);
  interaction_row public.interactions;
begin
  if p_user_a is null or p_user_b is null or p_user_a = p_user_b then
    raise exception 'Mutual discovery requires two distinct users';
  end if;

  if not exists (
    select 1
    from public.friendships f
    where (f.user1_id = p_user_a and f.user2_id = p_user_b)
       or (f.user1_id = p_user_b and f.user2_id = p_user_a)
  ) then
    raise exception 'Only mutual friends can enter the discovery flow';
  end if;

  if not exists (
    select 1
    from public.active_zone_users a1
    join public.active_zone_users a2 on a2.user_id = p_user_b
    where a1.user_id = p_user_a
      and a1.zone_id = p_zone_id
      and a2.zone_id = p_zone_id
      and a1.open_to_wave = true
      and a2.open_to_wave = true
      and a1.last_updated > now() - interval '30 minutes'
      and a2.last_updated > now() - interval '30 minutes'
  ) then
    raise exception 'Both users must be active in the same zone with open_to_wave = true';
  end if;

  insert into public.interactions (
    sender_id,
    receiver_id,
    interaction_type,
    status,
    phase,
    pair_key,
    zone_id,
    zone_name,
    hint_payload,
    phase_started_at,
    phase_updated_at,
    notification_sent_to_sender,
    notification_sent_to_receiver,
    nearby_activity_created_for_sender,
    nearby_activity_created_for_receiver
  ) values (
    p_user_a,
    p_user_b,
    'mutual_discovery',
    'SHOWN_HINTS',
    'SHOWN_HINTS',
    row_key,
    p_zone_id::text,
    p_zone_name,
    jsonb_build_object(
      'shared_context', 'Mutual friends active in the same zone',
      'match_reason', 'friends_same_zone_open_to_wave',
      'zone_name', p_zone_name
    ),
    now(),
    now(),
    false,
    false,
    false,
    false
  )
  on conflict (pair_key) do update set
    phase = case
      when public.interactions.phase in ('TERMINATED','EXPIRED') then public.interactions.phase
      else 'SHOWN_HINTS'
    end,
    status = case
      when public.interactions.phase in ('TERMINATED','EXPIRED') then public.interactions.status
      else 'SHOWN_HINTS'
    end,
    zone_id = excluded.zone_id,
    zone_name = coalesce(excluded.zone_name, public.interactions.zone_name),
    phase_updated_at = now()
  returning * into interaction_row;

  if interaction_row.id is null then
    select * into interaction_row
    from public.interactions
    where pair_key = row_key
    order by created_at desc
    limit 1;
  end if;

  perform public.notify_discovery_match(interaction_row.id);
  return interaction_row;
end;
$$;

-- Re-grant with correct uuid signature
grant execute on function public.upsert_mutual_discovery_pair(uuid, uuid, uuid, text) to authenticated;

-- Recreate trigger cleanly (only fire when open_to_wave=true to avoid useless scans)
drop trigger if exists match_active_waves_on_presence on public.active_zone_users;
create trigger match_active_waves_on_presence
after insert or update of zone_id, open_to_wave, last_updated on public.active_zone_users
for each row
when (new.open_to_wave = true)
execute function public.match_active_waves_after_presence();

-- Immediately re-run match for all currently waving users
do $$
declare
  u record;
begin
  for u in
    select distinct user_id
    from public.active_zone_users
    where open_to_wave = true
      and last_updated > now() - interval '30 minutes'
  loop
    begin
      perform public.match_active_waves_for_user(u.user_id);
    exception when others then
      null; -- ignore per-user errors
    end;
  end loop;
end $$;

select 'ZONE_ID_UUID_FIX_APPLIED' as status;
