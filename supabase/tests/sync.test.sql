-- This test commits cross-session fixtures outside the pgTAP transaction so
-- dblink sessions can see them. If execution stops before cleanup, run
-- `npm exec -- supabase db reset --local` before relying on absolute local
-- table counts. The fixed fixture identities self-heal on the next full run.
begin;

select no_plan();

-- Slice 7 schema, comments, and least-privilege Data API surface.
select ok(
  to_regclass('public.sync_runs') is not null,
  'sync_runs exists'
);
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'sync_runs'
  ),
  'id,provider,status,started_at,finished_at,fixtures_seen,matches_changed,results_changed,error_code,error_message_safe',
  'sync_runs exposes the documented operational columns only'
);
select is(
  enum_range(null::public.sync_status)::text,
  '{running,succeeded,failed,skipped}',
  'sync_status retains future lifecycle values while supporting terminal skips'
);
select ok(
  obj_description('public.sync_status'::regtype, 'pg_type') like '%future live-provider lease%',
  'the enum comment marks running as future-only'
);
select ok(
  col_description(
    'public.sync_runs'::regclass,
    (select attnum from pg_attribute
     where attrelid = 'public.sync_runs'::regclass and attname = 'error_code')
  ) like '%status = failed%never with error_code is not null%',
  'error_code is documented as a legacy result-code name and status is authoritative'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sync_runs'::regclass),
  'sync_runs has RLS enabled'
);
select is(
  (select count(*)::integer from pg_policy
   where polrelid = 'public.sync_runs'::regclass),
  1,
  'sync_runs has one system-administrator read policy'
);
select ok(
  exists (
    select 1
    from pg_index
    where indrelid = 'public.sync_runs'::regclass
      and pg_get_indexdef(indexrelid) like '%(started_at DESC)%'
  ),
  'sync_runs has the bounded-list ordering index'
);
select ok(
  has_table_privilege('authenticated', 'public.sync_runs', 'SELECT')
  and not has_table_privilege('authenticated', 'public.sync_runs', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.sync_runs', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.sync_runs', 'SELECT,INSERT,UPDATE,DELETE'),
  'only authenticated reads reach RLS and no Data API role has direct writes'
);
select ok(
  has_type_privilege('authenticated', 'public.sync_status', 'USAGE')
  and has_type_privilege('service_role', 'public.sync_status', 'USAGE')
  and not has_type_privilege('anon', 'public.sync_status', 'USAGE'),
  'enum usage is limited to the roles that need it'
);

select ok(
  to_regprocedure('public.record_sync_attempt()') is not null,
  'the no-argument atomic attempt RPC exists'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'public.record_sync_attempt()'::regprocedure)
  and (select array_to_string(proconfig, ',') from pg_proc
       where oid = 'public.record_sync_attempt()'::regprocedure) = 'search_path=""',
  'record_sync_attempt is security definer with an empty search path'
);
select ok(
  has_function_privilege('service_role', 'public.record_sync_attempt()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.record_sync_attempt()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_sync_attempt()', 'EXECUTE'),
  'only service_role can execute the attempt RPC'
);
select ok(
  position(
    'pg_try_advisory_xact_lock'
    in lower(pg_get_functiondef('public.record_sync_attempt()'::regprocedure))
  ) > 0
  and position(
    'pg_try_advisory_lock('
    in lower(pg_get_functiondef('public.record_sync_attempt()'::regprocedure))
  ) = 0,
  'the RPC uses a transaction lock and never a session advisory lock'
);
select ok(
  position('score_match' in lower(
    pg_get_functiondef('public.record_sync_attempt()'::regprocedure)
  )) = 0,
  'the manual RPC does not enter the scoring path'
);

select throws_ok(
  $$insert into public.sync_runs (
      provider, status, finished_at, error_code
    ) values ('manual', 'skipped', null, 'MANUAL_PROVIDER')$$,
  '23514', null,
  'a terminal row without finished_at is rejected'
);
select throws_ok(
  $$insert into public.sync_runs (
      provider, status, finished_at, fixtures_seen, error_code
    ) values ('manual', 'skipped', clock_timestamp(), -1, 'MANUAL_PROVIDER')$$,
  '23514', null,
  'negative operational counts are rejected'
);

-- A committed, non-interactive fixture is visible to the independent sessions
-- used below. It is local-only and removed before this test finishes.
create extension if not exists dblink with schema extensions;

select is(
  extensions.dblink_connect(
    'slice7_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'sync concurrency control connection opens against disposable local Supabase'
);
select is(
  extensions.dblink_exec('slice7_control', $remote$
    begin;
    delete from public.system_admins
      where user_id = 'd7111111-1111-4111-8111-111111111111'::uuid;
    delete from auth.users
      where id = 'd7111111-1111-4111-8111-111111111111'::uuid;
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      'd7111111-1111-4111-8111-111111111111',
      'authenticated', 'authenticated',
      'slice7-sync-actor@example.com',
      extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"display_name":"Slice 7 sync actor"}',
      now(), now()
    );
    insert into public.system_admins (user_id, granted_by)
    values (
      'd7111111-1111-4111-8111-111111111111',
      'd7111111-1111-4111-8111-111111111111'
    );
    commit;
  $remote$),
  'COMMIT',
  'isolated non-interactive sync actor is installed'
);

-- Unauthorized actors fail before either operational or application logging.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'd7222222-2222-4222-8222-222222222222',
  'authenticated', 'authenticated', 'slice7-removed-actor@example.com',
  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Removed sync actor"}', now(), now()
);
create temp table slice7_unauthorized_counts as
select
  (select count(*)::bigint from public.sync_runs) as sync_count,
  (select count(*)::bigint from public.audit_logs) as audit_count;

set local role service_role;
select set_config('request.headers', '{}', true);
select throws_ok(
  $$select * from public.record_sync_attempt()$$,
  'P0001', 'FORBIDDEN',
  'a missing actor header is rejected'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"not-a-uuid"}',
  true
);
select throws_ok(
  $$select * from public.record_sync_attempt()$$,
  'P0001', 'FORBIDDEN',
  'a malformed actor header is rejected'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d7222222-2222-4222-8222-222222222222"}',
  true
);
select throws_ok(
  $$select * from public.record_sync_attempt()$$,
  'P0001', 'FORBIDDEN',
  'an actor absent from system_admins is rejected'
);
reset role;
select is(
  (select count(*) from public.sync_runs),
  (select sync_count from slice7_unauthorized_counts),
  'rejected actor attempts write no sync_runs rows'
);
select is(
  (select count(*) from public.audit_logs),
  (select audit_count from slice7_unauthorized_counts),
  'rejected actor attempts write no audit_logs rows'
);

-- Real two-session contention: the loser records the attempt, then a serial
-- retry after commit observes no leaked lock and gets the manual outcome.
select is(
  extensions.dblink_connect(
    'slice7_locker',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'sync lock-holder connection opens'
);
select is(
  extensions.dblink_connect(
    'slice7_caller',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'concurrent RPC connection opens'
);
select is(
  extensions.dblink_exec('slice7_locker', 'begin'),
  'BEGIN',
  'the first session starts its claim transaction'
);
select is(
  extensions.dblink_exec('slice7_locker', $remote$
    do $lock$
    begin
      perform pg_catalog.pg_advisory_xact_lock(2026090607);
    end;
    $lock$;
  $remote$),
  'DO',
  'the first session holds the documented transaction lock'
);
select is(
  extensions.dblink_exec('slice7_caller', $remote$
    set statement_timeout = '5s';
    set role service_role;
    set request.headers = '{"x-predictor-system-actor":"d7111111-1111-4111-8111-111111111111"}';
  $remote$),
  'SET',
  'the RPC session receives only the fixed system-actor context'
);

create temp table slice7_concurrent_attempt as
select run.*
from extensions.dblink(
  'slice7_caller',
  $remote$
    select result_id, result_provider, result_status::text,
           result_started_at, result_finished_at, result_code
    from public.record_sync_attempt()
  $remote$
) as run(
  result_id uuid,
  result_provider text,
  result_status text,
  result_started_at timestamptz,
  result_finished_at timestamptz,
  result_code text
);
select results_eq(
  $$select result_provider, result_status, result_code,
           result_finished_at is not null
    from slice7_concurrent_attempt$$,
  $$values ('manual'::text, 'skipped'::text, 'CONCURRENT_ATTEMPT'::text, true)$$,
  'the lock loser records one final concurrent attempt without waiting'
);
select results_eq(
  $$select fixtures_seen, matches_changed, results_changed,
           error_message_safe
    from public.sync_runs
    where id = (select result_id from slice7_concurrent_attempt)$$,
  $$values (0, 0, 0, null::text)$$,
  'the concurrent skip has zero mutations and no error message'
);

select is(
  extensions.dblink_exec('slice7_locker', 'commit'),
  'COMMIT',
  'the first claim transaction releases its lock'
);
create temp table slice7_serial_attempt as
select run.*
from extensions.dblink(
  'slice7_caller',
  $remote$
    select result_id, result_provider, result_status::text,
           result_started_at, result_finished_at, result_code
    from public.record_sync_attempt()
  $remote$
) as run(
  result_id uuid,
  result_provider text,
  result_status text,
  result_started_at timestamptz,
  result_finished_at timestamptz,
  result_code text
);
select results_eq(
  $$select result_provider, result_status, result_code,
           result_finished_at is not null
    from slice7_serial_attempt$$,
  $$values ('manual'::text, 'skipped'::text, 'MANUAL_PROVIDER'::text, true)$$,
  'a serial retry after release records the distinct manual-provider outcome'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_locks
    where locktype = 'advisory'
      and classid = 0
      and objid = 2026090607
  ),
  'the transaction advisory lock does not leak into the connection pool'
);

select is(
  extensions.dblink_exec(
    'slice7_control',
    format(
      'delete from public.sync_runs where id in (%L::uuid, %L::uuid)',
      (select result_id from slice7_concurrent_attempt),
      (select result_id from slice7_serial_attempt)
    )
  ),
  'DELETE 2',
  'committed concurrency attempt rows are removed from the disposable database'
);
select is(extensions.dblink_disconnect('slice7_locker'), 'OK', 'lock-holder connection closes');
select is(extensions.dblink_disconnect('slice7_caller'), 'OK', 'RPC connection closes');

-- A normal authorized call is terminal and performs no application audit.
create temp table slice7_authorized_counts as
select
  (select count(*)::bigint from public.audit_logs) as audit_count,
  (select count(*)::bigint from public.matches) as match_count,
  (select count(*)::bigint from public.predictions) as prediction_count;
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d7111111-1111-4111-8111-111111111111"}',
  true
);
create temp table slice7_manual_attempt as
select * from public.record_sync_attempt();
reset role;
grant select on table slice7_manual_attempt to authenticated;
select results_eq(
  $$select result_provider, result_status::text, result_code,
           result_finished_at is not null
    from slice7_manual_attempt$$,
  $$values ('manual'::text, 'skipped'::text, 'MANUAL_PROVIDER'::text, true)$$,
  'a single authorized call records one final manual-provider attempt'
);
select results_eq(
  $$select fixtures_seen, matches_changed, results_changed,
           error_message_safe, started_at = finished_at
    from public.sync_runs
    where id = (select result_id from slice7_manual_attempt)$$,
  $$values (0, 0, 0, null::text, true)$$,
  'the manual skip has zero mutations, no error message, and final timestamps'
);
select is(
  (select count(*) from public.audit_logs),
  (select audit_count from slice7_authorized_counts),
  'an authorized attempt does not write audit_logs'
);
select is(
  (select count(*) from public.matches),
  (select match_count from slice7_authorized_counts),
  'the manual attempt changes no matches'
);
select is(
  (select count(*) from public.predictions),
  (select prediction_count from slice7_authorized_counts),
  'the manual attempt changes no predictions'
);

-- RLS allows the fixed administrator to read the row and hides it from an
-- ordinary authenticated user. Direct mutations remain unavailable.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d7111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.sync_runs
   where id = (select result_id from slice7_manual_attempt)),
  1,
  'a system administrator can read sync_runs through RLS'
);
select throws_ok(
  $$insert into public.sync_runs (
      provider, status, finished_at, error_code
    ) values ('manual', 'skipped', clock_timestamp(), 'MANUAL_PROVIDER')$$,
  '42501', null,
  'an authenticated system administrator cannot insert sync_runs directly'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"d7222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.sync_runs),
  0,
  'an ordinary authenticated user reads no sync_runs rows'
);
select throws_ok(
  $$update public.sync_runs set fixtures_seen = 1$$,
  '42501', null,
  'an ordinary authenticated user cannot update sync_runs'
);
select throws_ok(
  $$delete from public.sync_runs$$,
  '42501', null,
  'an ordinary authenticated user cannot delete sync_runs'
);
select throws_ok(
  $$select * from public.record_sync_attempt()$$,
  '42501', null,
  'authenticated callers cannot execute the privileged attempt RPC'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select * from public.sync_runs$$,
  '42501', null,
  'anon cannot read sync_runs'
);
select throws_ok(
  $$insert into public.sync_runs (
      provider, status, finished_at, error_code
    ) values ('manual', 'skipped', clock_timestamp(), 'MANUAL_PROVIDER')$$,
  '42501', null,
  'anon cannot write sync_runs'
);
select throws_ok(
  $$select * from public.record_sync_attempt()$$,
  '42501', null,
  'anon cannot execute the privileged attempt RPC'
);
reset role;

select is(
  extensions.dblink_exec('slice7_control', $remote$
    begin;
    delete from public.system_admins
      where user_id = 'd7111111-1111-4111-8111-111111111111'::uuid;
    delete from auth.users
      where id = 'd7111111-1111-4111-8111-111111111111'::uuid;
    commit;
  $remote$),
  'COMMIT',
  'the committed system-actor fixture is removed'
);
select is(extensions.dblink_disconnect('slice7_control'), 'OK', 'control connection closes');

select * from finish();
rollback;
