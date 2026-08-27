begin;

select no_plan();

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leagues'
      and column_name = 'activated_at'
      and data_type = 'timestamp with time zone'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leagues'::regclass
      and conname = 'leagues_activated_at_check'
      and contype = 'c'
      and convalidated
  ),
  'leagues persist a finite effective activation timestamp'
);

select ok(
  to_regprocedure('public.start_league(uuid)') is not null
  and to_regprocedure('public.activate_due_leagues()') is not null
  and to_regprocedure(
    'private.slice9_activate_league_core(uuid,uuid,text,timestamptz)'
  ) is not null
  and to_regprocedure(
    'private.slice9_activate_due_leagues_core(uuid,timestamptz,interval)'
  ) is not null,
  'manual and scheduled lifecycle activation gateways exist'
);

select ok(
  (
    select bool_and(prosecdef and proconfig @> array['search_path=""'])
    from pg_proc
    where oid in (
      'public.start_league(uuid)'::regprocedure,
      'public.activate_due_leagues()'::regprocedure,
      'private.slice9_activate_league_core(uuid,uuid,text,timestamptz)'::regprocedure,
      'private.slice9_activate_due_leagues_core(uuid,timestamptz,interval)'::regprocedure
    )
  ),
  'all activation functions are security definer with empty search paths'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.start_league(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.start_league(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.start_league(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.activate_due_leagues()', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.activate_due_leagues()', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.activate_due_leagues()', 'EXECUTE'
  ),
  'manual start is session-only and the Cron fallback is service-role only'
);

select ok(
  not has_function_privilege(
    'service_role',
    'private.slice9_activate_league_core(uuid,uuid,text,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.slice9_activate_league_core(uuid,uuid,text,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'private.slice9_activate_due_leagues_core(uuid,timestamptz,interval)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.slice9_activate_due_leagues_core(uuid,timestamptz,interval)',
    'EXECUTE'
  ),
  'explicit-time activation test seams have no Data API execution grant'
);

select ok(
  position(
    'pg_advisory_xact_lock(2026090609' in
    replace(
      lower(pg_get_functiondef(
        'public.apply_api_football_sync_batch(uuid,bigint,uuid,jsonb)'::regprocedure
      )),
      ')',
      ''
    )
  ) > 0
  and position(
    'slice9_apply_api_football_sync_batch_unserialized' in
    lower(pg_get_functiondef(
      'public.apply_api_football_sync_batch(uuid,bigint,uuid,jsonb)'::regprocedure
    ))
  ) > 0,
  'provider apply shares the lifecycle advisory lock before fixture writes'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'db000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'activation-manager@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Activation Manager"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'db000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'activation-foreign@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Activation Foreign"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'db000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'activation-admin@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Activation Admin"}', now(), now()
  );

insert into public.system_admins (user_id, granted_by)
values (
  'db000000-0000-4000-8000-000000000003',
  'db000000-0000-4000-8000-000000000003'
);

insert into public.seasons (
  id, competition_id, name, starts_on, ends_on, is_current
)
values
  (
    'db000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000001',
    'Activation On Time', '2026-01-01', '2026-12-31', false
  ),
  (
    'db000000-0000-4000-8000-000000000102',
    '26000000-0000-4000-8000-000000000001',
    'Activation Late', '2026-01-01', '2026-12-31', false
  ),
  (
    'db000000-0000-4000-8000-000000000103',
    '26000000-0000-4000-8000-000000000001',
    'Activation Not Due', '2026-01-01', '2026-12-31', false
  ),
  (
    'db000000-0000-4000-8000-000000000104',
    '26000000-0000-4000-8000-000000000001',
    'Activation Manual', '2099-01-01', '2099-12-31', false
  );

insert into public.leagues (id, manager_id, season_id, name, status)
values
  (
    'db000000-0000-4000-8000-000000000201',
    'db000000-0000-4000-8000-000000000001',
    'db000000-0000-4000-8000-000000000101',
    'Activation On Time League', 'open'
  ),
  (
    'db000000-0000-4000-8000-000000000202',
    'db000000-0000-4000-8000-000000000001',
    'db000000-0000-4000-8000-000000000102',
    'Activation Late League', 'open'
  ),
  (
    'db000000-0000-4000-8000-000000000203',
    'db000000-0000-4000-8000-000000000001',
    'db000000-0000-4000-8000-000000000103',
    'Activation Not Due League', 'open'
  ),
  (
    'db000000-0000-4000-8000-000000000204',
    'db000000-0000-4000-8000-000000000001',
    'db000000-0000-4000-8000-000000000104',
    'Activation Manual League', 'open'
  );

insert into public.league_scoring_rules (league_id)
select id
from public.leagues
where id between
  'db000000-0000-4000-8000-000000000201'
  and 'db000000-0000-4000-8000-000000000204';

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status
)
values
  (
    'db000000-0000-4000-8000-000000000301',
    'db000000-0000-4000-8000-000000000101', 1,
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000102',
    '2026-08-27T12:01:00Z', 'scheduled'
  ),
  (
    'db000000-0000-4000-8000-000000000302',
    'db000000-0000-4000-8000-000000000102', 1,
    '26000000-0000-4000-8000-000000000103',
    '26000000-0000-4000-8000-000000000104',
    '2026-08-27T11:59:59Z', 'scheduled'
  ),
  (
    'db000000-0000-4000-8000-000000000303',
    'db000000-0000-4000-8000-000000000103', 1,
    '26000000-0000-4000-8000-000000000105',
    '26000000-0000-4000-8000-000000000106',
    '2026-08-27T12:03:00Z', 'scheduled'
  ),
  (
    'db000000-0000-4000-8000-000000000304',
    'db000000-0000-4000-8000-000000000104', 1,
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000103',
    '2099-08-27T12:00:00Z', 'scheduled'
  );

create temp table activation_due_result as
select *
from private.slice9_activate_due_leagues_core(
  'db000000-0000-4000-8000-000000000003',
  '2026-08-27T12:00:00Z',
  interval '2 minutes'
);

select results_eq(
  $$select activated_count, late_count, recorded_at
    from activation_due_result$$,
  $$values (2, 1, '2026-08-27T12:00:00Z'::timestamptz)$$,
  'the fixed lookahead activates due leagues and counts late recovery separately'
);

select results_eq(
  $$select id, status::text, activated_at
    from public.leagues
    where id between
      'db000000-0000-4000-8000-000000000201'
      and 'db000000-0000-4000-8000-000000000203'
    order by id$$,
  $$values
    ('db000000-0000-4000-8000-000000000201'::uuid, 'active'::text, '2026-08-27T12:00:00Z'::timestamptz),
    ('db000000-0000-4000-8000-000000000202'::uuid, 'active'::text, '2026-08-27T11:59:59Z'::timestamptz),
    ('db000000-0000-4000-8000-000000000203'::uuid, 'open'::text, null::timestamptz)$$,
  'on-time activation uses write time, late recovery uses first kickoff, and not-due stays open'
);

select results_eq(
  $$select entity_id, metadata ->> 'code', created_at,
           (metadata ->> 'recorded_at')::timestamptz,
           (metadata ->> 'activated_at')::timestamptz
    from public.audit_logs
    where action = 'league_activated'
      and entity_id in (
        'db000000-0000-4000-8000-000000000201',
        'db000000-0000-4000-8000-000000000202'
      )
    order by entity_id$$,
  $$values
    ('db000000-0000-4000-8000-000000000201'::uuid, 'ACTIVATION_FALLBACK'::text, '2026-08-27T12:00:00Z'::timestamptz, '2026-08-27T12:00:00Z'::timestamptz, '2026-08-27T12:00:00Z'::timestamptz),
    ('db000000-0000-4000-8000-000000000202'::uuid, 'ACTIVATION_PERSIST_LATE'::text, '2026-08-27T12:00:00Z'::timestamptz, '2026-08-27T12:00:00Z'::timestamptz, '2026-08-27T11:59:59Z'::timestamptz)$$,
  'audit preserves real recorded time and explicitly marks late persistence without backdating'
);

select ok(
  (
    select created_at > (metadata ->> 'activated_at')::timestamptz
    from public.audit_logs
    where action = 'league_activated'
      and entity_id = 'db000000-0000-4000-8000-000000000202'
  ),
  'ACTIVATION_PERSIST_LATE is observable and cannot count as an on-time deadline success'
);

select results_eq(
  $$select league_id, locked_at
    from public.league_scoring_rules
    where league_id in (
      'db000000-0000-4000-8000-000000000201',
      'db000000-0000-4000-8000-000000000202'
    )
    order by league_id$$,
  $$values
    ('db000000-0000-4000-8000-000000000201'::uuid, '2026-08-27T12:00:00Z'::timestamptz),
    ('db000000-0000-4000-8000-000000000202'::uuid, '2026-08-27T11:59:59Z'::timestamptz)$$,
  'activation atomically locks each league scoring rule at its effective boundary'
);

select results_eq(
  $$select activated_count, late_count
    from private.slice9_activate_due_leagues_core(
      'db000000-0000-4000-8000-000000000003',
      '2026-08-27T12:00:30Z',
      interval '2 minutes'
    )$$,
  $$values (0, 0)$$,
  'scheduled activation replay is an idempotent no-op'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where action = 'league_activated'
      and entity_id in (
        'db000000-0000-4000-8000-000000000201',
        'db000000-0000-4000-8000-000000000202'
      )
  ),
  2,
  'scheduled replay does not duplicate activation audit rows'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"db000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.start_league(
    'db000000-0000-4000-8000-000000000204'
  )$$,
  'P0001', 'LEAGUE_NOT_FOUND',
  'a foreign actor receives an opaque denial for manual activation'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"db000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
create temp table activation_manual_result as
select *
from public.start_league('db000000-0000-4000-8000-000000000204');
select results_eq(
  $$select result_status::text, result_code, result_changed
    from activation_manual_result$$,
  $$values ('active'::text, 'MANUAL_ACTIVATION'::text, true)$$,
  'the exact manager can activate an open league early'
);
select results_eq(
  $$select result_status::text, result_code, result_changed
    from public.start_league('db000000-0000-4000-8000-000000000204')$$,
  $$values ('active'::text, 'ALREADY_ACTIVE'::text, false)$$,
  'manual double submit is idempotent'
);
select throws_ok(
  $$select * from public.activate_due_leagues()$$,
  '42501', null,
  'an authenticated manager cannot execute the Cron fallback'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where action = 'league_activated'
      and entity_id = 'db000000-0000-4000-8000-000000000204'
  ),
  1,
  'manual replay writes exactly one activation audit event'
);

set local role service_role;
select set_config('request.headers', '{}', true);
select throws_ok(
  $$select * from public.activate_due_leagues()$$,
  'P0001', 'FORBIDDEN',
  'the Cron fallback rejects a missing fixed system actor'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"db000000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$select * from public.activate_due_leagues()$$,
  'P0001', 'FORBIDDEN',
  'the Cron fallback rejects an ordinary fixed actor'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"db000000-0000-4000-8000-000000000003"}',
  true
);
select lives_ok(
  $$select * from public.activate_due_leagues()$$,
  'the existing-Cron gateway accepts the fixed system actor without provider input'
);
reset role;

select * from finish();
rollback;
