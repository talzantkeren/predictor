-- Local Supabase does not create the Hosted-only rls_auto_enable helper. Build
-- an exact event-trigger fixture inside this rolled-back test, prove every
-- guard detects its own vulnerable state, and then invoke the migration-defined
-- maintenance contract that applies the hardening.
begin;

select no_plan();

select ok(
  pg_catalog.to_regprocedure('public.rls_auto_enable()') is null
  and not exists (
    select 1
    from pg_catalog.pg_event_trigger as event_trigger
    where event_trigger.evtname = 'ensure_rls'
  ),
  'the local schema starts without the Hosted-only helper fixture'
);

select is(
  private.slice9_harden_hosted_rls_auto_enable(),
  false,
  'the maintenance contract is a no-op when the Hosted helper is absent'
);

select ok(
  (
    select not procedure.prosecdef
      and procedure.proconfig is not distinct from array['search_path=""']
    from pg_catalog.pg_proc as procedure
    where procedure.oid =
      'private.slice9_harden_hosted_rls_auto_enable()'::regprocedure
  )
  and not pg_catalog.has_function_privilege(
    'public',
    'private.slice9_harden_hosted_rls_auto_enable()',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'private.slice9_harden_hosted_rls_auto_enable()',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'private.slice9_harden_hosted_rls_auto_enable()',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'service_role',
    'private.slice9_harden_hosted_rls_auto_enable()',
    'EXECUTE'
  )
  and not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) as privilege
    where procedure.oid =
      'private.slice9_harden_hosted_rls_auto_enable()'::regprocedure
      and privilege.privilege_type = 'EXECUTE'
      and privilege.grantee <> procedure.proowner
  ),
  'the maintenance contract is invoker-rights, empty-path, and has no non-owner EXECUTE ACL'
);

create function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  null;
end;
$$;

create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();

create function pg_temp.rls_helper_has_hardened_config()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select procedure.prosecdef
      and procedure.proconfig is not distinct from array['search_path=""']
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'rls_auto_enable'
      and procedure.pronargs = 0
  ), false);
$$;

create function pg_temp.rls_helper_has_event_trigger()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    join pg_catalog.pg_event_trigger as event_trigger
      on event_trigger.evtfoid = procedure.oid
    where namespace.nspname = 'public'
      and procedure.proname = 'rls_auto_enable'
      and procedure.pronargs = 0
      and event_trigger.evtname = 'ensure_rls'
      and event_trigger.evtenabled = 'O'
  );
$$;

create function pg_temp.rls_helper_denies_execute(p_role name)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not pg_catalog.has_function_privilege(
    p_role,
    'public.rls_auto_enable()'::regprocedure,
    'EXECUTE'
  );
$$;

alter function public.rls_auto_enable() security invoker;
alter function public.rls_auto_enable() set search_path = '';
select is(
  pg_temp.rls_helper_has_hardened_config(),
  false,
  'the config guard detects SECURITY INVOKER'
);

alter function public.rls_auto_enable() security definer;
alter function public.rls_auto_enable() set search_path = public;
select is(
  pg_temp.rls_helper_has_hardened_config(),
  false,
  'the config guard detects a non-empty search_path'
);

drop event trigger ensure_rls;
select is(
  pg_temp.rls_helper_has_event_trigger(),
  false,
  'the linkage guard detects a missing event trigger'
);
create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();

revoke all privileges on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

grant execute on function public.rls_auto_enable() to public;
select is(
  pg_temp.rls_helper_denies_execute('public'),
  false,
  'the PUBLIC ACL guard detects direct execution'
);
revoke execute on function public.rls_auto_enable() from public;

grant execute on function public.rls_auto_enable() to anon;
select is(
  pg_temp.rls_helper_denies_execute('anon'),
  false,
  'the anon ACL guard detects direct execution independently'
);
revoke execute on function public.rls_auto_enable() from anon;

grant execute on function public.rls_auto_enable() to authenticated;
select is(
  pg_temp.rls_helper_denies_execute('authenticated'),
  false,
  'the authenticated ACL guard detects direct execution independently'
);
revoke execute on function public.rls_auto_enable() from authenticated;

grant execute on function public.rls_auto_enable() to service_role;
select is(
  pg_temp.rls_helper_denies_execute('service_role'),
  false,
  'the service_role ACL guard detects direct execution independently'
);

alter function public.rls_auto_enable() set search_path = public;
grant execute on function public.rls_auto_enable()
  to public, anon, authenticated, service_role;

select ok(
  not pg_temp.rls_helper_has_hardened_config()
  and pg_temp.rls_helper_has_event_trigger()
  and not pg_temp.rls_helper_denies_execute('public')
  and not pg_temp.rls_helper_denies_execute('anon')
  and not pg_temp.rls_helper_denies_execute('authenticated')
  and not pg_temp.rls_helper_denies_execute('service_role'),
  'the simulated Hosted helper is vulnerable before the real migration runs'
);

select is(
  private.slice9_harden_hosted_rls_auto_enable(),
  true,
  'the schema-owner maintenance contract observes and hardens the simulated Hosted helper'
);

select ok(
  pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null
  and pg_temp.rls_helper_has_hardened_config(),
  'the real migration preserves the helper as SECURITY DEFINER with an empty search_path'
);

select ok(
  pg_temp.rls_helper_has_event_trigger(),
  'the real migration preserves the enabled ensure_rls event-trigger linkage'
);

select ok(
  pg_temp.rls_helper_denies_execute('public'),
  'the real migration removes PUBLIC execution'
);

select ok(
  pg_temp.rls_helper_denies_execute('anon'),
  'the real migration removes anon execution'
);

select ok(
  pg_temp.rls_helper_denies_execute('authenticated'),
  'the real migration removes authenticated execution'
);

select ok(
  pg_temp.rls_helper_denies_execute('service_role'),
  'the real migration removes service_role execution'
);

select * from finish();

rollback;
