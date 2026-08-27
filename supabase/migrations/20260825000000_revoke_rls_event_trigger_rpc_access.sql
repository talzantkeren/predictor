-- S9-REQ-005: Supabase-hosted projects can contain this event-trigger helper
-- even though it is not part of the local migration history. Event triggers run
-- as their owning function and do not need Data API roles to hold EXECUTE.
do $$
begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'alter function public.rls_auto_enable() set search_path = ''''';
    execute 'revoke all privileges on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end
$$;
