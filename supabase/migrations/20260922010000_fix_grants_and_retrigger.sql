-- Fix: grant had wrong uuid signature for zone_id param (should be text)
-- Also fix the trigger to fire on open_to_wave changes correctly
-- And re-run match for all currently active waving users

-- Fix grants with correct text signature
grant execute on function public.upsert_mutual_discovery_pair(uuid, uuid, text, text) to authenticated;
grant execute on function public.match_active_waves_for_user(uuid) to authenticated;
grant execute on function public.notify_discovery_match(uuid) to authenticated;
grant execute on function public.pair_key_for(uuid, uuid) to authenticated;
grant execute on function public.mark_user_revealed(uuid, uuid) to authenticated;
grant execute on function public.terminate_reconnect(uuid, uuid, public.discovery_termination_reason) to authenticated;

-- Ensure security definer allows trigger to bypass RLS
alter function public.match_active_waves_for_user(uuid) security definer;
alter function public.match_active_waves_after_presence() security definer;
alter function public.upsert_mutual_discovery_pair(uuid, uuid, text, text) security definer;
alter function public.notify_discovery_match(uuid) security definer;

-- Recreate the presence trigger cleanly to ensure it's live
drop trigger if exists match_active_waves_on_presence on public.active_zone_users;
create trigger match_active_waves_on_presence
after insert or update of zone_id, open_to_wave, last_updated on public.active_zone_users
for each row
when (new.open_to_wave = true)
execute function public.match_active_waves_after_presence();

-- Re-run match for ALL currently active waving users right now
-- so already-waving friends get matched immediately
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
      -- ignore individual user errors, continue loop
      null;
    end;
  end loop;
end $$;

select 'GRANTS_AND_TRIGGERS_FIXED' as status;
