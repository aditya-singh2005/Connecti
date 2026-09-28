-- Keep friendship-created Wave matching on the renamed friendships table.
create or replace function public.match_active_waves_after_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.match_active_waves_for_user(new.user1_id);
  perform public.match_active_waves_for_user(new.user2_id);
  return new;
end;
$$;

drop trigger if exists match_active_waves_on_connection on public.friendships;
drop trigger if exists match_active_waves_on_friendship on public.friendships;
create trigger match_active_waves_on_friendship
after insert on public.friendships
for each row execute function public.match_active_waves_after_connection();
