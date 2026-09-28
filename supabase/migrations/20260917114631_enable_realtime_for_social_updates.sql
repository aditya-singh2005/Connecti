-- Keep social badges and chat lists responsive across active clients.
alter table public.interactions replica identity full;
alter table public.connections replica identity full;
alter table public.messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.interactions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.connections;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;