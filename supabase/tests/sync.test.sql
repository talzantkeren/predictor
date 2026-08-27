begin;

select no_plan();

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
  'id,provider,status,started_at,finished_at,fixtures_seen,matches_changed,results_changed,error_code,error_message_safe,sync_kind,lease_generation,locked_until,rows_inserted,teams_changed,manual_overrides_skipped,quota_remaining,operator_notes',
  'sync_runs exposes the documented operational columns only'
);
select is(
  enum_range(null::public.sync_status)::text,
  '{running,succeeded,failed,skipped}',
  'sync_status retains live-provider and legacy historical states'
);
select ok(
  obj_description('public.sync_status'::regtype, 'pg_type')
    like '%durable live-provider lease%',
  'the enum comment documents the durable live-provider lifecycle'
);
select ok(
  col_description(
    'public.sync_runs'::regclass,
    (select attnum from pg_attribute
     where attrelid = 'public.sync_runs'::regclass and attname = 'error_code')
  ) like '%status = failed%never with error_code is not null%',
  'status remains authoritative for persisted failure metadata'
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
    select 1 from pg_index
    where indrelid = 'public.sync_runs'::regclass
      and pg_get_indexdef(indexrelid) like '%(started_at DESC)%'
  ),
  'sync_runs has the bounded-list ordering index'
);
select ok(
  has_table_privilege('authenticated', 'public.sync_runs', 'SELECT')
  and not has_table_privilege(
    'authenticated', 'public.sync_runs', 'INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'anon', 'public.sync_runs', 'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'service_role', 'public.sync_runs', 'SELECT,INSERT,UPDATE,DELETE'
  ),
  'only authenticated reads reach RLS and no Data API role has direct writes'
);
select ok(
  has_type_privilege('authenticated', 'public.sync_status', 'USAGE')
  and has_type_privilege('service_role', 'public.sync_status', 'USAGE')
  and not has_type_privilege('anon', 'public.sync_status', 'USAGE'),
  'enum usage is limited to the roles that need it'
);
select ok(
  to_regprocedure('public.record_sync_attempt()') is null
  and to_regprocedure('public.apply_manual_fixture_catalog(jsonb)') is not null,
  'the skipped placeholder was replaced by the bounded Manual import'
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
select throws_ok(
  $$insert into public.sync_runs (
      provider, status, finished_at, error_code
    ) values ('manual', 'succeeded', clock_timestamp(), 'MANUAL_NO_CHANGE')$$,
  '23514', null,
  'successful runs cannot persist a result in the legacy error column'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'd7111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'sync-admin@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Sync administrator"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd7222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', 'sync-user@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Sync ordinary user"}', now(), now()
  );
insert into public.system_admins (user_id, granted_by)
values (
  'd7111111-1111-4111-8111-111111111111',
  'd7111111-1111-4111-8111-111111111111'
);
insert into public.sync_runs (
  id, provider, status, sync_kind, started_at, finished_at,
  fixtures_seen, rows_inserted, teams_changed, matches_changed
) values (
  'd7333333-3333-4333-8333-333333333333',
  'manual', 'succeeded', 'manual',
  clock_timestamp(), clock_timestamp(), 5, 0, 0, 0
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d7111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.sync_runs
   where id = 'd7333333-3333-4333-8333-333333333333'),
  1,
  'a system administrator can read the operational run through RLS'
);
select throws_ok(
  $$insert into public.sync_runs (
      provider, status, finished_at, error_code
    ) values ('manual', 'skipped', clock_timestamp(), 'MANUAL_PROVIDER')$$,
  '42501', null,
  'an authenticated administrator cannot insert operational rows directly'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"d7222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.sync_runs),
  0,
  'an ordinary authenticated user reads no operational rows'
);
select throws_ok(
  $$update public.sync_runs set fixtures_seen = 1$$,
  '42501', null,
  'an ordinary user cannot update operational rows'
);
select throws_ok(
  $$select * from public.apply_manual_fixture_catalog('{}'::jsonb)$$,
  '42501', null,
  'authenticated callers cannot execute the Manual import RPC'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select * from public.sync_runs$$,
  '42501', null,
  'anonymous callers cannot read operational rows'
);
select throws_ok(
  $$select * from public.apply_manual_fixture_catalog('{}'::jsonb)$$,
  '42501', null,
  'anonymous callers cannot execute the Manual import RPC'
);
reset role;

select * from finish();
rollback;
