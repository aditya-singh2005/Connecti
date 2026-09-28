-- Server-authoritative Wave matching.
-- A session is created only when accepted friends are both actively waved in one zone.

create extension if not exists pg_net with schema extensions;

alter table public.reconnection_sessions
  add column if not exists match_notified_at timestamptz;

alter table public.reconnection_sessions replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.reconnection_sessions;
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
    select case when c.user1_id = p_user_id then c.user2_id else c.user1_id end
    from public.connections c
    join public.active_zone_users partner_presence
      on partner_presence.user_id = case when c.user1_id = p_user_id then c.user2_id else c.user1_id end
    where (c.user1_id = p_user_id or c.user2_id = p_user_id)
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

    insert into public.reconnection_sessions (
      participant_a,
      participant_b,
      zone_id,
      hint_payload
    ) values (
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

grant execute on function public.match_active_waves_for_user(uuid) to authenticated;

create or replace function public.match_active_waves_after_presence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.match_active_waves_for_user(new.user_id);
  return new;
end;
$$;

drop trigger if exists match_active_waves_on_presence on public.active_zone_users;
create trigger match_active_waves_on_presence
after insert or update of zone_id, open_to_wave, last_updated on public.active_zone_users
for each row execute function public.match_active_waves_after_presence();

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

drop trigger if exists match_active_waves_on_connection on public.connections;
create trigger match_active_waves_on_connection
after insert on public.connections
for each row execute function public.match_active_waves_after_connection();

create or replace function public.notify_reconnection_hint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient record;
  push_token text;
  notifications_sent integer := 0;
begin
  if new.phase <> 'SHOW_HINT' then
    return new;
  end if;

  for recipient in
    select p.id,
           coalesce(p.fcm_token, p.expo_push_token, az.fcm_token, az.expo_push_token) as token
    from public.profiles p
    left join public.active_zone_users az on az.user_id = p.id
    where p.id in (new.participant_a, new.participant_b)
  loop
    push_token := recipient.token;
    if push_token is not null and push_token <> '' then
      notifications_sent := notifications_sent + 1;
      perform net.http_post(
        url := 'https://connecti-push-api.vercel.app/api/send-notification',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'token', push_token,
          'title', 'Someone you know might be nearby',
          'body', 'Open Connecti to show hints or remove this activity.',
          'data', jsonb_build_object(
            'type', 'MATCH_HINT',
            'categoryId', 'MATCH_HINT',
            'sessionId', new.id::text
          )
        )
      );
    end if;
  end loop;

  if notifications_sent = 2 then
    update public.reconnection_sessions
    set match_notified_at = now(), updated_at = now()
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_reconnection_hint_on_insert on public.reconnection_sessions;
create trigger notify_reconnection_hint_on_insert
after insert on public.reconnection_sessions
for each row execute function public.notify_reconnection_hint();
