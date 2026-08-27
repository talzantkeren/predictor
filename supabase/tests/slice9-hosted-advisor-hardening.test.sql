begin;

select plan(6);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'rls_auto_enable'
      and procedure.pronargs = 0
      and (
        not procedure.prosecdef
        or procedure.proconfig is distinct from array['search_path=""']
      )
  ),
  'the hosted RLS event-trigger helper keeps SECURITY DEFINER with an empty search_path when present'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'rls_auto_enable'
      and procedure.pronargs = 0
      and not exists (
        select 1
        from pg_catalog.pg_event_trigger as event_trigger
        where event_trigger.evtfoid = procedure.oid
      )
  ),
  'the hosted RLS helper remains reachable only through its event trigger when present'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'rls_auto_enable'
      and procedure.pronargs = 0
      and pg_catalog.has_function_privilege('public', procedure.oid, 'EXECUTE')
  ),
  'the hosted RLS event-trigger helper is not executable by PUBLIC when present'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'rls_auto_enable'
      and procedure.pronargs = 0
      and pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
  ),
  'the hosted RLS event-trigger helper is not executable by anon when present'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'rls_auto_enable'
      and procedure.pronargs = 0
      and pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
  ),
  'the hosted RLS event-trigger helper is not executable by authenticated when present'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'rls_auto_enable'
      and procedure.pronargs = 0
      and pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE')
  ),
  'the hosted RLS event-trigger helper is not executable by service_role when present'
);

select * from finish();

rollback;
