do $$ 
declare
    r record;
begin
    for r in (
        select trigger_name 
        from information_schema.triggers 
        where event_object_table = 'active_zone_users'
    ) loop
        execute 'drop trigger if exists ' || quote_ident(r.trigger_name) || ' on public.active_zone_users cascade';
    end loop;
end $$;

select 'ALL_TRIGGERS_DROPPED_ON_ACTIVE_ZONE_USERS' as status;
