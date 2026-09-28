-- Create a server-side RPC to sync user zone presence.
-- This bypasses PostgREST uuid/text casting issues entirely.
create or replace function public.sync_user_zone_presence(
  p_user_id uuid,
  p_zone_name text,
  p_open_to_wave boolean default false,
  p_fcm_token text default null,
  p_expo_push_token text default null,
  p_execution_state text default 'foreground',
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone_id uuid;
  v_final_zone_name text := p_zone_name;
begin
  -- Resolve zone_id from name
  select id, name into v_zone_id, v_final_zone_name
  from public.geofence_zones
  where name = p_zone_name
  limit 1;

  if v_zone_id is null then
    return jsonb_build_object('success', false, 'error', 'Zone not found: ' || coalesce(p_zone_name, 'null'));
  end if;

  insert into public.active_zone_users (
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
  ) values (
    p_user_id,
    v_zone_id,
    v_final_zone_name,
    p_open_to_wave,
    p_fcm_token,
    p_expo_push_token,
    p_execution_state,
    p_latitude,
    p_longitude,
    now()
  )
  on conflict (user_id) do update set
    zone_id        = excluded.zone_id,
    zone_name      = excluded.zone_name,
    open_to_wave   = excluded.open_to_wave,
    fcm_token      = coalesce(excluded.fcm_token, public.active_zone_users.fcm_token),
    expo_push_token = coalesce(excluded.expo_push_token, public.active_zone_users.expo_push_token),
    execution_state = excluded.execution_state,
    latitude       = coalesce(excluded.latitude, public.active_zone_users.latitude),
    longitude      = coalesce(excluded.longitude, public.active_zone_users.longitude),
    last_updated   = excluded.last_updated;

  return jsonb_build_object(
    'success', true,
    'open_to_wave', p_open_to_wave,
    'zone_id', v_zone_id,
    'zone_name', v_final_zone_name
  );
end;
$$;

grant execute on function public.sync_user_zone_presence(uuid, text, boolean, text, text, text, double precision, double precision) to authenticated;
grant execute on function public.sync_user_zone_presence(uuid, text, boolean, text, text, text, double precision, double precision) to anon;
grant execute on function public.sync_user_zone_presence(uuid, text, boolean, text, text, text, double precision, double precision) to service_role;

select 'SYNC_USER_ZONE_RPC_CREATED' as status;
