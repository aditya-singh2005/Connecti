-- Privacy-first reconnection state machine.
-- All phase transitions happen through SECURITY DEFINER functions so a client
-- cannot reveal an identity or grant rewards by changing local state.

create table if not exists public.reconnection_sessions (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references public.profiles(id) on delete cascade,
  participant_b uuid not null references public.profiles(id) on delete cascade,
  zone_id uuid,
  source_interaction_id uuid references public.interactions(id) on delete set null,
  phase text not null default 'SHOW_HINT' check (phase in ('SHOW_HINT', 'REVEAL_PENDING', 'RECONNECT_ACTIVE', 'CANCELLED', 'EXPIRED')),
  hint_payload jsonb not null default '{}'::jsonb,
  participant_a_revealed boolean not null default false,
  participant_b_revealed boolean not null default false,
  base_reward integer not null default 100,
  coins_awarded boolean not null default false,
  ble_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revealed_at timestamptz,
  cancelled_at timestamptz,
  check (participant_a <> participant_b)
);

create unique index if not exists reconnection_sessions_active_pair_idx
  on public.reconnection_sessions (least(participant_a, participant_b), greatest(participant_a, participant_b))
  where phase not in ('CANCELLED', 'EXPIRED');

create table if not exists public.reconnection_rewards (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.reconnection_sessions(id) on delete cascade, reward_type text not null,
  amount integer not null check (amount > 0), idempotency_key text not null unique, created_at timestamptz not null default now()
);

alter table public.reconnection_sessions enable row level security;
alter table public.reconnection_rewards enable row level security;
drop policy if exists "participants can read reconnection sessions" on public.reconnection_sessions;
create policy "participants can read reconnection sessions" on public.reconnection_sessions for select using (auth.uid() in (participant_a, participant_b));
drop policy if exists "users can read their reconnection rewards" on public.reconnection_rewards;
create policy "users can read their reconnection rewards" on public.reconnection_rewards for select using (auth.uid() = user_id);

create or replace function public.create_reconnection_for_interaction(p_interaction_id uuid)
returns public.reconnection_sessions language plpgsql security definer set search_path = public as $$
declare interaction_row public.interactions; session_row public.reconnection_sessions; current_user_id uuid := auth.uid();
begin
  select * into interaction_row from public.interactions where id = p_interaction_id;
  if interaction_row.id is null or current_user_id not in (interaction_row.sender_id, interaction_row.receiver_id) then raise exception 'Interaction is not available'; end if;
  select * into session_row from public.reconnection_sessions where source_interaction_id = p_interaction_id and phase not in ('CANCELLED', 'EXPIRED') limit 1;
  if session_row.id is not null then return session_row; end if;
  insert into public.reconnection_sessions (participant_a, participant_b, zone_id, source_interaction_id, hint_payload)
  values (interaction_row.sender_id, interaction_row.receiver_id, interaction_row.zone_id, p_interaction_id,
    jsonb_build_object('shared_context', 'You both chose to participate in this Connecti Zone.', 'last_met', 'A while ago')) returning * into session_row;
  return session_row;
end; $$;

create or replace function public.continue_reconnection(p_session_id uuid)
returns public.reconnection_sessions language plpgsql security definer set search_path = public as $$
declare session_row public.reconnection_sessions; current_user_id uuid := auth.uid();
begin
  select * into session_row from public.reconnection_sessions where id = p_session_id and current_user_id in (participant_a, participant_b) for update;
  if session_row.id is null or session_row.phase in ('CANCELLED', 'EXPIRED') then raise exception 'This reconnection is no longer available'; end if;
  if current_user_id = session_row.participant_a then update public.reconnection_sessions set participant_a_revealed = true, phase = 'REVEAL_PENDING', updated_at = now() where id = p_session_id;
  else update public.reconnection_sessions set participant_b_revealed = true, phase = 'REVEAL_PENDING', updated_at = now() where id = p_session_id; end if;
  select * into session_row from public.reconnection_sessions where id = p_session_id;
  if session_row.participant_a_revealed and session_row.participant_b_revealed then
    update public.reconnection_sessions set phase = 'RECONNECT_ACTIVE', revealed_at = coalesce(revealed_at, now()), updated_at = now(), coins_awarded = true where id = p_session_id;
    insert into public.reconnection_rewards (user_id, session_id, reward_type, amount, idempotency_key) values
      (session_row.participant_a, p_session_id, 'reveal_coins', 100, p_session_id::text || ':a:coins'),
      (session_row.participant_b, p_session_id, 'reveal_coins', 100, p_session_id::text || ':b:coins') on conflict (idempotency_key) do nothing;
    select * into session_row from public.reconnection_sessions where id = p_session_id;
  end if;
  return session_row;
end; $$;

create or replace function public.cancel_reconnection(p_session_id uuid)
returns public.reconnection_sessions language plpgsql security definer set search_path = public as $$
declare session_row public.reconnection_sessions;
begin
  update public.reconnection_sessions set phase = 'CANCELLED', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
    where id = p_session_id and auth.uid() in (participant_a, participant_b) and phase not in ('CANCELLED', 'EXPIRED') returning * into session_row;
  if session_row.id is null then select * into session_row from public.reconnection_sessions where id = p_session_id and auth.uid() in (participant_a, participant_b); end if;
  return session_row;
end; $$;

grant execute on function public.create_reconnection_for_interaction(uuid) to authenticated;
grant execute on function public.continue_reconnection(uuid) to authenticated;
grant execute on function public.cancel_reconnection(uuid) to authenticated;