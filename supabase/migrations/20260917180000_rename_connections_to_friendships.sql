-- Friendships are durable accepted relationships; zone membership belongs to Wave presence.

do $$
begin
  if to_regclass('public.connections') is not null and to_regclass('public.friendships') is null then
    alter table public.connections rename to friendships;
  end if;
end $$;

alter table if exists public.friendships drop column if exists zone_id;
alter table if exists public.friendships replica identity full;

do $$
begin
  alter publication supabase_realtime drop table public.connections;
exception when undefined_table then null;
when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;

create or replace function public.match_active_waves_for_user(p_user_id uuid)
returns setof public.reconnection_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  presence_row public.active_zone_users;
  partner_id uuid;
  existing_session public.reconnection_sessions;
  created_session public.reconnection_sessions;
  profile_row record;
begin
  select * into presence_row
  from public.active_zone_users
  where user_id = p_user_id
    and open_to_wave = true
    and last_updated > now() - interval '30 minutes'
  order by last_updated desc
  limit 1;

  if presence_row.user_id is null then
    return;
  end if;

  for partner_id in
    select case when f.user1_id = p_user_id then f.user2_id else f.user1_id end
    from public.friendships f
    join public.active_zone_users partner_presence
      on partner_presence.user_id = case when f.user1_id = p_user_id then f.user2_id else f.user1_id end
    where (f.user1_id = p_user_id or f.user2_id = p_user_id)
      and partner_presence.zone_id = presence_row.zone_id
      and partner_presence.open_to_wave = true
      and partner_presence.last_updated > now() - interval '30 minutes'
  loop
    select * into existing_session
    from public.reconnection_sessions
    where least(participant_a, participant_b) = least(p_user_id, partner_id)
      and greatest(participant_a, participant_b) = greatest(p_user_id, partner_id)
      and phase not in ('CANCELLED', 'EXPIRED')
    limit 1;

    if existing_session.id is not null then
      return next existing_session;
      continue;
    end if;

    select p.username, p.bio, p.date_of_birth, p.avatar_url
    into profile_row
    from public.profiles p
    where p.id = partner_id;

    insert into public.reconnection_sessions (participant_a, participant_b, zone_id, hint_payload)
    values (
      p_user_id,
      partner_id,
      presence_row.zone_id,
      jsonb_build_object(
        'participant_a', jsonb_build_object(
          'username_initial', left(coalesce((select username from public.profiles where id = p_user_id), 'C'), 1),
          'bio', coalesce((select bio from public.profiles where id = p_user_id), ''),
          'birth_year', extract(year from (select date_of_birth from public.profiles where id = p_user_id))
        ),
        'participant_b', jsonb_build_object(
          'username_initial', left(coalesce(profile_row.username, 'C'), 1),
          'bio', coalesce(profile_row.bio, ''),
          'birth_year', extract(year from profile_row.date_of_birth)
        ),
        'shared_context', 'Someone you know might be nearby.'
      )
    ) returning * into created_session;

    return next created_session;
  end loop;
end;
$$;

-- The table was renamed, so move the matching trigger to the new relation.
drop trigger if exists match_active_waves_on_connection on public.friendships;
create trigger match_active_waves_on_friendship
after insert on public.friendships
for each row execute function public.match_active_waves_after_connection();
