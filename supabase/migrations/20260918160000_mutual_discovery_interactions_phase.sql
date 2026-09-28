-- Mutual discovery lifecycle implemented directly on public.interactions.
-- This matches the required 4-phase flow:
--   WAVE_MATCHED -> SHOWN_HINTS -> REVEALED -> RECONNECTED
-- and supports immediate termination / cancellation.
--
-- Design rules enforced here:
-- 1) a pair only enters the flow if both users are already friends,
--    both are in the same active zone, and both have open_to_wave = true;
-- 2) the row is created/updated as the source of truth for the mutual discovery;
-- 3) the notification/nearby activity flow is derived from the interaction row itself,
--    rather than from a separate state store;
-- 4) reveal and terminate actions are server-authoritative and idempotent.

create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'discovery_phase') then
    create type public.discovery_phase as enum (
      'SHOWN_HINTS',
      'BOTH_REVEALS_PENDING',
      'RECONNECTED',
      'TERMINATED',
      'EXPIRED'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'discovery_termination_reason') then
    create type public.discovery_termination_reason as enum (
      'USER_DECLINED',
      'USER_CANCELLED',
      'SYSTEM_TIMEOUT',
      'EXPIRED',
      'BOTH_DECLINED'
    );
  end if;
end $$;

alter table public.interactions
  add column if not exists pair_key text,
  add column if not exists phase public.discovery_phase not null default 'SHOWN_HINTS',
  add column if not exists phase_started_at timestamptz not null default now(),
  add column if not exists phase_updated_at timestamptz not null default now(),
  add column if not exists zone_name text,
  add column if not exists match_confidence numeric(5,2) not null default 1.00,
  add column if not exists matched_via text not null default 'active_zone_users' check (matched_via in ('active_zone_users', 'manual', 'friendship', 'reconnect')),
  add column if not exists notification_sent_to_sender boolean not null default false,
  add column if not exists notification_sent_to_receiver boolean not null default false,
  add column if not exists nearby_activity_created_for_sender boolean not null default false,
  add column if not exists nearby_activity_created_for_receiver boolean not null default false,
  add column if not exists hint_payload jsonb not null default '{}'::jsonb,
  add column if not exists hints_visible_to_sender boolean not null default false,
  add column if not exists hints_visible_to_receiver boolean not null default false,
  add column if not exists hint_seen_at_sender timestamptz,
  add column if not exists hint_seen_at_receiver timestamptz,
  add column if not exists sender_revealed boolean not null default false,
  add column if not exists receiver_revealed boolean not null default false,
  add column if not exists reveal_completed_at timestamptz,
  add column if not exists reconnect_started_at timestamptz,
  add column if not exists reconnect_confirmed_by_sender boolean not null default false,
  add column if not exists reconnect_confirmed_by_receiver boolean not null default false,
  add column if not exists reconnect_confirmed_at timestamptz,
  add column if not exists terminated_by uuid references public.profiles(id),
  add column if not exists terminated_at timestamptz,
  add column if not exists expires_at timestamptz;

update public.interactions
set pair_key = least(sender_id::text, receiver_id::text) || ':' || greatest(sender_id::text, receiver_id::text)
where pair_key is null and sender_id is not null and receiver_id is not null;

update public.interactions
set phase = 'SHOWN_HINTS',
    status = 'SHOWN_HINTS',
    phase_started_at = coalesce(phase_started_at, created_at, now()),
    phase_updated_at = now(),
    hints_visible_to_sender = true,
    hints_visible_to_receiver = true
where phase is null and sender_id is not null and receiver_id is not null and status in ('pending', 'accepted');

create unique index if not exists interactions_pair_key_active_idx
on public.interactions (pair_key)
where pair_key is not null and status not in ('ignored', 'expired', 'terminated', 'TERMINATED');

create index if not exists interactions_phase_zone_idx
on public.interactions (phase, zone_id, status, expires_at, phase_updated_at desc);

create index if not exists interactions_sender_receiver_idx
on public.interactions (sender_id, receiver_id, phase, status, phase_updated_at desc);

create or replace function public.pair_key_for(p_user_a uuid, p_user_b uuid)
returns text
language sql
stable
as $$
  select least(p_user_a::text, p_user_b::text) || ':' || greatest(p_user_a::text, p_user_b::text);
$$;

    create extension if not exists pg_net with schema extensions;

    do $$
    begin
      if not exists (select 1 from pg_type where typname = 'discovery_phase') then
        create type public.discovery_phase as enum (
          'SHOWN_HINTS',
          'BOTH_REVEALS_PENDING',
          'RECONNECTED',
          'TERMINATED',
          'EXPIRED'
        );
      end if;
    end $$;

    do $$
    begin
      if not exists (select 1 from pg_type where typname = 'discovery_termination_reason') then
        create type public.discovery_termination_reason as enum (
          'USER_DECLINED',
          'USER_CANCELLED',
          'SYSTEM_TIMEOUT',
          'EXPIRED',
          'BOTH_DECLINED'
        );
      end if;
    end $$;

    drop trigger if exists match_active_waves_on_presence on public.active_zone_users;
    drop trigger if exists match_active_waves_on_friendship on public.friendships;

    drop function if exists public.notify_reconnection_hint();
    drop function if exists public.match_active_waves_after_presence();
    drop function if exists public.match_active_waves_after_friendship();
    drop function if exists public.match_active_waves_for_user(uuid);
    drop function if exists public.create_reconnection_for_interaction(uuid);
    drop function if exists public.continue_reconnection(uuid);
    drop function if exists public.cancel_reconnection(uuid);

    drop table if exists public.reconnection_rewards;
    drop table if exists public.reconnection_sessions;

    alter table public.interactions
      add column if not exists pair_key text,
      add column if not exists phase public.discovery_phase not null default 'SHOWN_HINTS',
      add column if not exists phase_started_at timestamptz not null default now(),
      add column if not exists phase_updated_at timestamptz not null default now(),
      add column if not exists zone_name text,
      add column if not exists match_confidence numeric(5,2) not null default 1.00,
      add column if not exists matched_via text not null default 'active_zone_users' check (matched_via in ('active_zone_users', 'manual', 'friendship', 'reconnect')),
      add column if not exists notification_sent_to_sender boolean not null default false,
      add column if not exists notification_sent_to_receiver boolean not null default false,
      add column if not exists nearby_activity_created_for_sender boolean not null default false,
      add column if not exists nearby_activity_created_for_receiver boolean not null default false,
      add column if not exists hint_payload jsonb not null default '{}'::jsonb,
      add column if not exists hints_visible_to_sender boolean not null default false,
      add column if not exists hints_visible_to_receiver boolean not null default false,
      add column if not exists hint_seen_at_sender timestamptz,
      add column if not exists hint_seen_at_receiver timestamptz,
      add column if not exists sender_revealed boolean not null default false,
      add column if not exists receiver_revealed boolean not null default false,
      add column if not exists reveal_completed_at timestamptz,
      add column if not exists reconnect_started_at timestamptz,
      add column if not exists reconnect_confirmed_by_sender boolean not null default false,
      add column if not exists reconnect_confirmed_by_receiver boolean not null default false,
      add column if not exists reconnect_confirmed_at timestamptz,
      add column if not exists terminated_by uuid references public.profiles(id),
      add column if not exists terminated_at timestamptz,
      add column if not exists expires_at timestamptz;

    update public.interactions
    set pair_key = least(sender_id::text, receiver_id::text) || ':' || greatest(sender_id::text, receiver_id::text)
    where pair_key is null and sender_id is not null and receiver_id is not null and sender_id <> receiver_id;

    update public.interactions
    set phase = 'SHOWN_HINTS',
        phase_started_at = coalesce(phase_started_at, created_at, now()),
        phase_updated_at = now(),
        hints_visible_to_sender = true,
        hints_visible_to_receiver = true,
        hint_payload = coalesce(hint_payload, '{}'::jsonb) || jsonb_build_object(
          'shared_context', 'Mutual friends active in the same zone',
          'match_reason', 'friends_same_zone_open_to_wave'
        )
    where phase is null and sender_id is not null and receiver_id is not null and sender_id <> receiver_id;

    with ranked as (
      select id,
             row_number() over (
               partition by pair_key
               order by created_at desc, id desc
             ) as rn
      from public.interactions
      where pair_key is not null
    )
    delete from public.interactions
    where id in (select id from ranked where rn > 1);

    create unique index if not exists interactions_pair_key_unique_idx
    on public.interactions (pair_key)
    where pair_key is not null;

    create index if not exists interactions_phase_zone_idx
    on public.interactions (phase, zone_id, created_at desc);

    create or replace function public.pair_key_for(p_user_a uuid, p_user_b uuid)
    returns text
    language sql
    stable
    as $$
      select least(p_user_a::text, p_user_b::text) || ':' || greatest(p_user_a::text, p_user_b::text);
    $$;

    create or replace function public.notify_discovery_match(p_interaction_id uuid)
    returns void
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare
      interaction_row public.interactions;
      sender_token text;
      receiver_token text;
    begin
      select * into interaction_row from public.interactions where id = p_interaction_id;
      if interaction_row.id is null then
        return;
      end if;

      select coalesce(fcm_token, expo_push_token) into sender_token
      from public.profiles where id = interaction_row.sender_id;

      select coalesce(fcm_token, expo_push_token) into receiver_token
      from public.profiles where id = interaction_row.receiver_id;

      if sender_token is not null and sender_token <> '' and not interaction_row.notification_sent_to_sender then
        perform net.http_post(
          url := 'https://connecti-push-api.vercel.app/api/send-notification',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object(
            'token', sender_token,
            'title', 'Someone you know might be nearby',
            'body', 'Open Connecti to see hints or remove this activity.',
            'data', jsonb_build_object(
              'type', 'MATCH_HINT',
              'categoryId', 'MATCH_HINT',
              'interactionId', interaction_row.id::text,
              'sessionId', interaction_row.id::text,
              'phase', 'SHOWN_HINTS'
            )
          )
        );

        update public.interactions
        set notification_sent_to_sender = true,
            nearby_activity_created_for_sender = true,
            phase_updated_at = now()
        where id = p_interaction_id;
      end if;

      if receiver_token is not null and receiver_token <> '' and not interaction_row.notification_sent_to_receiver then
        perform net.http_post(
          url := 'https://connecti-push-api.vercel.app/api/send-notification',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object(
            'token', receiver_token,
            'title', 'Someone you know might be nearby',
            'body', 'Open Connecti to see hints or remove this activity.',
            'data', jsonb_build_object(
              'type', 'MATCH_HINT',
              'categoryId', 'MATCH_HINT',
              'interactionId', interaction_row.id::text,
              'sessionId', interaction_row.id::text,
              'phase', 'SHOWN_HINTS'
            )
          )
        );

        update public.interactions
        set notification_sent_to_receiver = true,
            nearby_activity_created_for_receiver = true,
            phase_updated_at = now()
        where id = p_interaction_id;
      end if;
    end;
    $$;

    create or replace function public.upsert_mutual_discovery_pair(
      p_user_a uuid,
      p_user_b uuid,
      p_zone_id text,
      p_zone_name text default null
    )
    returns public.interactions
    language plpgsql
    security definer
    set search_path = public
    as $$
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
          and a2.user_id = p_user_b
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
        p_zone_id,
        p_zone_name,
        jsonb_build_object(
          'shared_context', 'Mutual friends active in the same zone',
          'match_reason', 'friends_same_zone_open_to_wave',
          'zone_name', p_zone_name
        ),
        now(),
        now(),
        true,
        true,
        true,
        true
      )
      on conflict (pair_key) do update set
        phase = case when public.interactions.phase in ('TERMINATED','EXPIRED') then public.interactions.phase else 'SHOWN_HINTS' end,
        status = case when public.interactions.phase in ('TERMINATED','EXPIRED') then public.interactions.phase::text else 'SHOWN_HINTS' end,
        zone_id = excluded.zone_id,
        zone_name = coalesce(excluded.zone_name, public.interactions.zone_name),
        phase_updated_at = now(),
        hint_payload = coalesce(public.interactions.hint_payload, '{}'::jsonb) || jsonb_build_object(
          'shared_context', 'Mutual friends active in the same zone',
          'match_reason', 'friends_same_zone_open_to_wave',
          'zone_name', coalesce(excluded.zone_name, public.interactions.zone_name)
        )
      returning * into interaction_row;

      if interaction_row.id is null then
        select * into interaction_row from public.interactions where pair_key = row_key order by created_at desc limit 1;
      end if;

      perform public.notify_discovery_match(interaction_row.id);
      return interaction_row;
    end;
    $$;

    create or replace function public.mark_user_revealed(p_interaction_id uuid, p_user_id uuid)
    returns public.interactions
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare
      interaction_row public.interactions;
    begin
      select * into interaction_row from public.interactions where id = p_interaction_id for update;
      if interaction_row.id is null then
        raise exception 'Interaction not found';
      end if;

      if p_user_id not in (interaction_row.sender_id, interaction_row.receiver_id) then
        raise exception 'User is not part of this discovery';
      end if;

      if interaction_row.phase in ('TERMINATED', 'EXPIRED') then
        raise exception 'This discovery has already ended';
      end if;

      if p_user_id = interaction_row.sender_id then
        update public.interactions
        set sender_revealed = true,
            phase = case when interaction_row.receiver_revealed then 'RECONNECTED' else 'BOTH_REVEALS_PENDING' end,
            status = case when interaction_row.receiver_revealed then 'RECONNECTED' else 'BOTH_REVEALS_PENDING' end,
            phase_updated_at = now()
        where id = p_interaction_id;
      else
        update public.interactions
        set receiver_revealed = true,
            phase = case when interaction_row.sender_revealed then 'RECONNECTED' else 'BOTH_REVEALS_PENDING' end,
            status = case when interaction_row.sender_revealed then 'RECONNECTED' else 'BOTH_REVEALS_PENDING' end,
            phase_updated_at = now()
        where id = p_interaction_id;
      end if;

      select * into interaction_row from public.interactions where id = p_interaction_id;

      if interaction_row.sender_revealed and interaction_row.receiver_revealed then
        update public.interactions
        set phase = 'RECONNECTED',
            status = 'RECONNECTED',
            phase_updated_at = now(),
            reveal_completed_at = coalesce(reveal_completed_at, now())
        where id = p_interaction_id;

        perform net.http_post(
          url := 'https://connecti-push-api.vercel.app/api/send-notification',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object(
            'token', (select coalesce(fcm_token, expo_push_token) from public.profiles where id = interaction_row.sender_id),
            'title', 'Both of you revealed each other',
            'body', 'Tap to see who is on the other side.',
            'data', jsonb_build_object(
              'type', 'MATCH_REVEALED',
              'categoryId', 'MATCH_REVEALED',
              'interactionId', interaction_row.id::text,
              'phase', 'RECONNECTED'
            )
          )
        );

        perform net.http_post(
          url := 'https://connecti-push-api.vercel.app/api/send-notification',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := jsonb_build_object(
            'token', (select coalesce(fcm_token, expo_push_token) from public.profiles where id = interaction_row.receiver_id),
            'title', 'Both of you revealed each other',
            'body', 'Tap to see who is on the other side.',
            'data', jsonb_build_object(
              'type', 'MATCH_REVEALED',
              'categoryId', 'MATCH_REVEALED',
              'interactionId', interaction_row.id::text,
              'phase', 'RECONNECTED'
            )
          )
        );
      end if;

      select * into interaction_row from public.interactions where id = p_interaction_id;
      return interaction_row;
    end;
    $$;

    create or replace function public.terminate_reconnect(
      p_interaction_id uuid,
      p_actor_id uuid,
      p_reason public.discovery_termination_reason default 'USER_CANCELLED'
    )
    returns public.interactions
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare
      interaction_row public.interactions;
    begin
      select * into interaction_row from public.interactions where id = p_interaction_id for update;
      if interaction_row.id is null then
        raise exception 'Interaction not found';
      end if;

      if p_actor_id not in (interaction_row.sender_id, interaction_row.receiver_id) then
        raise exception 'Actor is not part of this discovery';
      end if;

      update public.interactions
      set phase = 'TERMINATED',
          status = 'TERMINATED',
          terminated_by = p_actor_id,
          terminated_at = coalesce(terminated_at, now()),
          phase_updated_at = now()
      where id = p_interaction_id;

      select * into interaction_row from public.interactions where id = p_interaction_id;
      return interaction_row;
    end;
    $$;

    create or replace function public.match_active_waves_for_user(p_user_id uuid)
    returns setof public.interactions
    language plpgsql
    security definer
    set search_path = public
    as $$
    declare
      presence_row public.active_zone_users;
      partner_id uuid;
      interaction_row public.interactions;
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
        select * into interaction_row
        from public.upsert_mutual_discovery_pair(
          p_user_a := p_user_id,
          p_user_b := partner_id,
          p_zone_id := presence_row.zone_id,
          p_zone_name := coalesce(presence_row.zone_name, presence_row.zone_id::text)
        );

        if interaction_row.id is not null then
          return next interaction_row;
        end if;
      end loop;
    end;
    $$;

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

    create or replace function public.match_active_waves_after_friendship()
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

    drop trigger if exists match_active_waves_on_presence on public.active_zone_users;
    create trigger match_active_waves_on_presence
    after insert or update of zone_id, open_to_wave, last_updated on public.active_zone_users
    for each row execute function public.match_active_waves_after_presence();

    drop trigger if exists match_active_waves_on_friendship on public.friendships;
    create trigger match_active_waves_on_friendship
    after insert on public.friendships
    for each row execute function public.match_active_waves_after_friendship();

    grant execute on function public.pair_key_for(uuid, uuid) to authenticated;
    grant execute on function public.notify_discovery_match(uuid) to authenticated;
    grant execute on function public.upsert_mutual_discovery_pair(uuid, uuid, uuid, text) to authenticated;
    grant execute on function public.mark_user_revealed(uuid, uuid) to authenticated;
    grant execute on function public.terminate_reconnect(uuid, uuid, public.discovery_termination_reason) to authenticated;
    grant execute on function public.match_active_waves_for_user(uuid) to authenticated;

    select 'MUTUAL_DISCOVERY_INTERACTIONS_APPLIED' as status;
