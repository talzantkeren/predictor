-- Make the Hosted-only rls_auto_enable hardening behavior directly testable
-- without creating that platform-managed object on projects where it is absent.
-- This maintenance function runs with invoker rights. No application or Data
-- API role receives an EXECUTE ACL.

create function private.slice9_harden_hosted_rls_auto_enable()
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is null then
    return false;
  end if;

  execute 'alter function public.rls_auto_enable() set search_path = ''''';
  execute 'revoke all privileges on function public.rls_auto_enable() from public, anon, authenticated, service_role';

  return true;
end;
$$;

revoke all on function private.slice9_harden_hosted_rls_auto_enable()
  from public, anon, authenticated, service_role;

comment on function private.slice9_harden_hosted_rls_auto_enable() is
  'Invoker-rights maintenance contract for the optional Hosted rls_auto_enable event-trigger helper. It has no application/Data API EXECUTE ACL, sets an empty search_path, and removes direct execution without changing trigger linkage.';

select private.slice9_harden_hosted_rls_auto_enable();
