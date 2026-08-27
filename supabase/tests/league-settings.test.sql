begin;

select no_plan();

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leagues'
      and column_name = 'settings_version'
      and data_type = 'integer'
      and is_nullable = 'NO'
  ),
  'leagues exposes a required optimistic settings version'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leagues'::regclass
      and conname = 'leagues_joins_close_at_finite_check'
      and contype = 'c'
      and convalidated
  ),
  'join deadlines have a validated finite database constraint'
);
select ok(
  (
    select prosecdef and proconfig @> array['search_path=""']
    from pg_proc
    where oid = 'public.get_editable_league_settings(uuid)'::regprocedure
  )
  and (
    select prosecdef and proconfig @> array['search_path=""']
    from pg_proc
    where oid = 'public.update_league_settings(uuid,integer,text,text,integer,text,timestamptz,boolean,smallint,smallint,smallint,jsonb)'::regprocedure
  ),
  'both settings gateways are security definer with an empty search path'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_editable_league_settings(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.update_league_settings(uuid,integer,text,text,integer,text,timestamptz,boolean,smallint,smallint,smallint,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.get_editable_league_settings(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.update_league_settings(uuid,integer,text,text,integer,text,timestamptz,boolean,smallint,smallint,smallint,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.get_editable_league_settings(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.update_league_settings(uuid,integer,text,text,integer,text,timestamptz,boolean,smallint,smallint,smallint,jsonb)',
    'EXECUTE'
  ),
  'only authenticated user sessions can execute settings gateways'
);
select ok(
  not has_table_privilege('authenticated', 'public.leagues', 'UPDATE')
  and not has_table_privilege(
    'authenticated', 'public.league_scoring_rules', 'UPDATE'
  )
  and not has_table_privilege(
    'authenticated', 'public.prize_rules', 'INSERT,UPDATE,DELETE'
  ),
  'authenticated settings editors still have no direct table mutation grants'
);
select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('leagues', 'league_scoring_rules', 'prize_rules')
      and (
        coalesce(qual, '') ilike '%system_admin%'
        or coalesce(with_check, '') ilike '%system_admin%'
      )
  ),
  'system-admin settings access does not broaden league table RLS'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'd9700000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'settings-manager@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Settings Manager"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd9700000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'settings-foreign-manager@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Foreign Manager"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd9700000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'settings-admin@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Settings Admin"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd9700000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'settings-member@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Settings Member"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd9700000-0000-4000-8000-000000000005',
    'authenticated', 'authenticated', 'settings-requester@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Settings Requester"}', now(), now()
  );

insert into public.system_admins (user_id, granted_by)
values (
  'd9700000-0000-4000-8000-000000000003',
  'd9700000-0000-4000-8000-000000000003'
);

insert into public.seasons (
  id, competition_id, name, starts_on, ends_on, is_current
)
values
  (
    'd9700000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000001',
    'Settings Future', '2099-01-01', '2099-12-31', false
  ),
  (
    'd9700000-0000-4000-8000-000000000102',
    '26000000-0000-4000-8000-000000000001',
    'Settings Started', '2020-01-01', '2099-12-31', false
  );

insert into public.leagues (
  id, manager_id, season_id, name, status
)
values
  (
    'd9700000-0000-4000-8000-000000000201',
    'd9700000-0000-4000-8000-000000000001',
    'd9700000-0000-4000-8000-000000000101',
    'Settings Main League', 'open'
  ),
  (
    'd9700000-0000-4000-8000-000000000202',
    'd9700000-0000-4000-8000-000000000002',
    'd9700000-0000-4000-8000-000000000101',
    'Settings Foreign League', 'open'
  ),
  (
    'd9700000-0000-4000-8000-000000000203',
    'd9700000-0000-4000-8000-000000000001',
    'd9700000-0000-4000-8000-000000000102',
    'Settings Clock Locked', 'open'
  ),
  (
    'd9700000-0000-4000-8000-000000000204',
    'd9700000-0000-4000-8000-000000000001',
    'd9700000-0000-4000-8000-000000000101',
    'Settings Active', 'active'
  ),
  (
    'd9700000-0000-4000-8000-000000000205',
    'd9700000-0000-4000-8000-000000000001',
    'd9700000-0000-4000-8000-000000000101',
    'Settings Completed', 'completed'
  ),
  (
    'd9700000-0000-4000-8000-000000000206',
    'd9700000-0000-4000-8000-000000000001',
    'd9700000-0000-4000-8000-000000000101',
    'Settings Archived', 'archived'
  );

insert into public.league_scoring_rules (league_id)
select id
from public.leagues
where id between
  'd9700000-0000-4000-8000-000000000201'
  and 'd9700000-0000-4000-8000-000000000206';

insert into public.prize_rules (league_id, position, percentage_bps)
select id, 1, 10000
from public.leagues
where id between
  'd9700000-0000-4000-8000-000000000201'
  and 'd9700000-0000-4000-8000-000000000206';

insert into public.league_members (league_id, user_id, approved_by)
values
  (
    'd9700000-0000-4000-8000-000000000201',
    'd9700000-0000-4000-8000-000000000001',
    'd9700000-0000-4000-8000-000000000001'
  ),
  (
    'd9700000-0000-4000-8000-000000000201',
    'd9700000-0000-4000-8000-000000000004',
    'd9700000-0000-4000-8000-000000000001'
  );

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status
)
values (
  'd9700000-0000-4000-8000-000000000301',
  'd9700000-0000-4000-8000-000000000102',
  1,
  '26000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000102',
  clock_timestamp() - interval '1 second',
  'scheduled'
);

-- Positional SQL literals infer integer, while PostgREST resolves the public
-- function by named arguments. This test-only adapter mirrors the application
-- call and narrows the three already-validated point values to smallint.
create function pg_temp.call_update_league_settings(
  p_league_id uuid,
  p_expected_settings_version integer,
  p_name text,
  p_description text,
  p_demo_entry_fee_agorot integer,
  p_demo_payment_instructions text,
  p_joins_close_at timestamptz,
  p_allow_late_join boolean,
  p_exact_points integer,
  p_correct_outcome_points integer,
  p_incorrect_points integer,
  p_prizes jsonb
)
returns table (
  league_id uuid,
  settings_version integer,
  scoring_version integer,
  changed boolean
)
language sql
set search_path = ''
as $$
  select *
  from public.update_league_settings(
    p_league_id,
    p_expected_settings_version,
    p_name,
    p_description,
    p_demo_entry_fee_agorot,
    p_demo_payment_instructions,
    p_joins_close_at,
    p_allow_late_join,
    p_exact_points::smallint,
    p_correct_outcome_points::smallint,
    p_incorrect_points::smallint,
    p_prizes
  );
$$;

-- Manager and system-admin reads return exactly one narrow document. A direct
-- system-admin table read remains empty, preventing dashboard enumeration.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9700000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  $$select editor_role, league_id, settings_version, scoring_version,
           rules_locked
    from public.get_editable_league_settings(
      'd9700000-0000-4000-8000-000000000201'
    )$$,
  $$values (
    'manager'::text,
    'd9700000-0000-4000-8000-000000000201'::uuid,
    1, 1, false
  )$$,
  'the exact manager reads one editable settings document'
);
select throws_ok(
  $$select * from public.get_editable_league_settings(
    'ffffffff-ffff-4fff-8fff-ffffffffffff'
  )$$,
  'P0001', 'LEAGUE_SETTINGS_NOT_FOUND',
  'a missing settings resource uses the opaque denial'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9700000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.leagues),
  0,
  'a system admin gains no broad league table visibility'
);
select results_eq(
  $$select editor_role, league_id
    from public.get_editable_league_settings(
      'd9700000-0000-4000-8000-000000000201'
    )$$,
  $$values (
    'system-admin'::text,
    'd9700000-0000-4000-8000-000000000201'::uuid
  )$$,
  'a system admin reads only an explicitly requested settings document'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9700000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.get_editable_league_settings(
    'd9700000-0000-4000-8000-000000000201'
  )$$,
  'P0001', 'LEAGUE_SETTINGS_NOT_FOUND',
  'another league manager receives the opaque settings response'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 1,
    'Foreign edit', null, 0, null, null, true,
    3, 1, 0,
    '[{"position":1,"percentage_bps":10000}]'
  )$$,
  'P0001', 'LEAGUE_SETTINGS_NOT_FOUND',
  'another league manager cannot mutate the requested league'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9700000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.get_editable_league_settings(
    'd9700000-0000-4000-8000-000000000201'
  )$$,
  'P0001', 'LEAGUE_SETTINGS_NOT_FOUND',
  'an active member receives the same opaque settings response'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select * from public.get_editable_league_settings(
    'd9700000-0000-4000-8000-000000000201'
  )$$,
  '42501', null,
  'anonymous sessions cannot execute the settings reader'
);
reset role;

-- Create an invite while joins are open. A later settings update must change
-- the admission decision used by the real submit_join_request RPC.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9700000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
create temp table settings_invite as
select public_id, raw_token
from public.create_or_rotate_invite(
  'd9700000-0000-4000-8000-000000000201'
);

create temp table settings_valid_result as
select *
from pg_temp.call_update_league_settings(
  'd9700000-0000-4000-8000-000000000201', 1,
  '  Settings Updated  ', '  Updated description  ', 2600,
  '  Demo only  ', '2098-12-31T23:59:59.123456Z', false,
  5, 2, 0,
  '[
    {"position":1,"percentage_bps":7000},
    {"position":2,"percentage_bps":3000}
  ]'
);
reset role;

select results_eq(
  $$select settings_version, scoring_version, changed
    from settings_valid_result$$,
  $$values (2, 2, true)$$,
  'a valid pre-lock update advances both versions atomically'
);
select results_eq(
  $$select name, description, demo_entry_fee_agorot,
           demo_payment_instructions, joins_close_at,
           allow_late_join, settings_version
    from public.leagues
    where id = 'd9700000-0000-4000-8000-000000000201'$$,
  $$values (
    'Settings Updated'::text, 'Updated description'::text, 2600,
    'Demo only'::text, '2098-12-31T23:59:59.123456Z'::timestamptz,
    false, 2
  )$$,
  'the complete explicit details allowlist is normalized and saved'
);
select results_eq(
  $$select exact_points::integer, correct_outcome_points::integer,
           incorrect_points::integer, version
    from public.league_scoring_rules
    where league_id = 'd9700000-0000-4000-8000-000000000201'$$,
  $$values (5, 2, 0, 2)$$,
  'scoring rules are replaced and versioned'
);
select results_eq(
  $$select position::integer, percentage_bps
    from public.prize_rules
    where league_id = 'd9700000-0000-4000-8000-000000000201'
    order by position$$,
  $$values (1, 7000), (2, 3000)$$,
  'prize rules are replaced as one exact 100 percent document'
);
select is(
  (
    select count(*)::integer
    from public.audit_logs
    where action = 'league_settings_updated'
      and entity_id = 'd9700000-0000-4000-8000-000000000201'
  ),
  1,
  'one changed settings document produces one audit row'
);

-- A stale semantic replay is safe and returns the current versions without a
-- second write or audit. A stale different document fails atomically.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9700000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
create temp table settings_replay_result as
select *
from pg_temp.call_update_league_settings(
  'd9700000-0000-4000-8000-000000000201', 1,
  'Settings Updated', 'Updated description', 2600,
  'Demo only', '2098-12-31T23:59:59.123456Z', false,
  5, 2, 0,
  '[
    {"position":1,"percentage_bps":7000},
    {"position":2,"percentage_bps":3000}
  ]'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 1,
    'Stale different document', 'Updated description', 2600,
    'Demo only', '2098-12-31T23:59:59.123456Z', false,
    5, 2, 0,
    '[
      {"position":1,"percentage_bps":7000},
      {"position":2,"percentage_bps":3000}
    ]'
  )$$,
  'P0001', 'SETTINGS_STALE',
  'a stale different document is rejected'
);
reset role;

select results_eq(
  $$select settings_version, scoring_version, changed
    from settings_replay_result$$,
  $$values (2, 2, false)$$,
  'semantic replay returns current versions and changed false'
);
select is(
  (
    select count(*)::integer
    from public.audit_logs
    where action = 'league_settings_updated'
      and entity_id = 'd9700000-0000-4000-8000-000000000201'
  ),
  1,
  'replay and stale conflict create no duplicate audit'
);
select is(
  (
    select name
    from public.leagues
    where id = 'd9700000-0000-4000-8000-000000000201'
  ),
  'Settings Updated',
  'the stale conflict leaves league details unchanged'
);

create temp table settings_invalid_baseline as
select
  league.settings_version,
  scoring.version as scoring_version,
  scoring.exact_points,
  (select count(*)::integer
   from public.audit_logs
   where action = 'league_settings_updated'
     and entity_id = league.id) as audit_count
from public.leagues as league
join public.league_scoring_rules as scoring on scoring.league_id = league.id
where league.id = 'd9700000-0000-4000-8000-000000000201';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9700000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 2,
    'Settings Updated', 'Updated description', 2600, 'Demo only',
    '2098-12-31T23:59:59.123456Z', false,
    -1, 0, 0,
    '[{"position":1,"percentage_bps":10000}]'
  )$$,
  'P0001', 'INVALID_SCORING_RULES',
  'negative scoring is rejected before mutation'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 2,
    'Settings Updated', 'Updated description', 2600, 'Demo only',
    '2098-12-31T23:59:59.123456Z', false,
    5, 2, 0,
    '[{"position":1,"percentage_bps":9999}]'
  )$$,
  'P0001', 'INVALID_PRIZE_RULES',
  'a prize total below 100 percent is rejected before mutation'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 2,
    'Settings Updated', 'Updated description', 2600, 'Demo only',
    '2098-12-31T23:59:59.123456Z', false,
    1, 2, 0,
    '[
      {"position":1,"percentage_bps":7000},
      {"position":2,"percentage_bps":3000}
    ]'
  )$$,
  'P0001', 'INVALID_SCORING_RULES',
  'invalid scoring order is rejected before mutation'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 2,
    'Settings Updated', 'Updated description', 2600, 'Demo only',
    '2098-12-31T23:59:59.123456Z', false,
    101, 1, 0,
    '[
      {"position":1,"percentage_bps":7000},
      {"position":2,"percentage_bps":3000}
    ]'
  )$$,
  'P0001', 'INVALID_SCORING_RULES',
  'scoring values above the allowed range are rejected before mutation'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 2,
    'Settings Updated', 'Updated description', 2600, 'Demo only',
    '2098-12-31T23:59:59.123456Z', false,
    5, 2, 0,
    '[
      {"position":1,"percentage_bps":5000},
      {"position":3,"percentage_bps":5000}
    ]'
  )$$,
  'P0001', 'INVALID_PRIZE_RULES',
  'nonconsecutive prize positions are rejected before mutation'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 2,
    'Settings Updated', 'Updated description', 2600, 'Demo only',
    '2098-12-31T23:59:59.123456Z', false,
    5, 2, 0,
    '[{"position":1,"percentage_bps":10000,"extra":true}]'
  )$$,
  'P0001', 'INVALID_PRIZE_RULES',
  'an extra prize key is rejected before mutation'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 2,
    'Settings Updated', 'Updated description', 2600, 'Demo only',
    '2098-12-31T23:59:59.123456Z', false,
    5, 2, 0,
    '[{"position":1}]'
  )$$,
  'P0001', 'INVALID_PRIZE_RULES',
  'a missing prize key is rejected before mutation'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 2,
    'Settings Updated', 'Updated description', 2600,
    'https://pay.example', '2098-12-31T23:59:59.123456Z', false,
    5, 2, 0,
    '[
      {"position":1,"percentage_bps":7000},
      {"position":2,"percentage_bps":3000}
    ]'
  )$$,
  'P0001', 'INVALID_LEAGUE_SETTINGS',
  'a payment link is rejected at the database boundary'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 2,
    repeat('x', 81), 'Updated description', 2600, 'Demo only',
    '2098-12-31T23:59:59.123456Z', false,
    5, 2, 0,
    '[
      {"position":1,"percentage_bps":7000},
      {"position":2,"percentage_bps":3000}
    ]'
  )$$,
  'P0001', 'INVALID_LEAGUE_SETTINGS',
  'the league text boundary is enforced in the database gateway'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', null,
    'Settings Updated', 'Updated description', 2600, 'Demo only',
    '2098-12-31T23:59:59.123456Z', false,
    5, 2, 0,
    '[
      {"position":1,"percentage_bps":7000},
      {"position":2,"percentage_bps":3000}
    ]'
  )$$,
  'P0001', 'INVALID_LEAGUE_SETTINGS',
  'a null expected settings version is rejected explicitly'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 0,
    'Settings Updated', 'Updated description', 2600, 'Demo only',
    '2098-12-31T23:59:59.123456Z', false,
    5, 2, 0,
    '[
      {"position":1,"percentage_bps":7000},
      {"position":2,"percentage_bps":3000}
    ]'
  )$$,
  'P0001', 'INVALID_LEAGUE_SETTINGS',
  'a nonpositive expected settings version is rejected explicitly'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 2,
    'Settings Updated', 'Updated description', 2600, 'Demo only',
    'infinity'::timestamptz, false,
    5, 2, 0,
    '[
      {"position":1,"percentage_bps":7000},
      {"position":2,"percentage_bps":3000}
    ]'
  )$$,
  'P0001', 'INVALID_LEAGUE_SETTINGS',
  'positive infinity is rejected by the mutation gateway'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 2,
    'Settings Updated', 'Updated description', 2600, 'Demo only',
    '-infinity'::timestamptz, false,
    5, 2, 0,
    '[
      {"position":1,"percentage_bps":7000},
      {"position":2,"percentage_bps":3000}
    ]'
  )$$,
  'P0001', 'INVALID_LEAGUE_SETTINGS',
  'negative infinity is rejected by the mutation gateway'
);
reset role;

select results_eq(
  $$select league.settings_version, scoring.version,
           scoring.exact_points, count(audit.id)::integer
    from public.leagues as league
    join public.league_scoring_rules as scoring on scoring.league_id = league.id
    left join public.audit_logs as audit
      on audit.entity_id = league.id
     and audit.action = 'league_settings_updated'
    where league.id = 'd9700000-0000-4000-8000-000000000201'
    group by league.settings_version, scoring.version, scoring.exact_points$$,
  $$select settings_version, scoring_version, exact_points, audit_count
    from settings_invalid_baseline$$,
  'invalid payloads leave versions, rules, and audit state atomic'
);
select throws_ok(
  $$update public.leagues
    set joins_close_at = 'infinity'::timestamptz
    where id = 'd9700000-0000-4000-8000-000000000201'$$,
  '23514', null,
  'the table constraint independently rejects positive infinity'
);
select throws_ok(
  $$update public.leagues
    set joins_close_at = '-infinity'::timestamptz
    where id = 'd9700000-0000-4000-8000-000000000201'$$,
  '23514', null,
  'the table constraint independently rejects negative infinity'
);
select throws_ok(
  $$select '0000-01-01T00:00:00Z'::timestamptz$$,
  '22008', null,
  'PostgreSQL independently rejects year zero before storage'
);

-- An unrelated details edit sends back the exact timestamp and must not round
-- its six fractional digits or advance the scoring version.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9700000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
create temp table settings_fraction_result as
select *
from pg_temp.call_update_league_settings(
  'd9700000-0000-4000-8000-000000000201', 2,
  'Fraction Preserved', 'Updated description', 2600,
  'Demo only', '2098-12-31T23:59:59.123456Z', false,
  5, 2, 0,
  '[
    {"position":1,"percentage_bps":7000},
    {"position":2,"percentage_bps":3000}
  ]'
);
reset role;
select results_eq(
  $$select changed, settings_version, scoring_version
    from settings_fraction_result$$,
  $$values (true, 3, 2)$$,
  'a details-only edit advances only the settings document version'
);
select results_eq(
  $$select joins_close_at,
           to_char(joins_close_at at time zone 'UTC', 'US')
    from public.leagues
    where id = 'd9700000-0000-4000-8000-000000000201'$$,
  $$values (
    '2098-12-31T23:59:59.123456Z'::timestamptz,
    '123456'::text
  )$$,
  'an unrelated edit preserves the exact microsecond join deadline'
);

-- System-admin mutation is narrow, authorized, and versioned even though the
-- same session has no direct table visibility.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9700000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
create temp table settings_admin_result as
select *
from pg_temp.call_update_league_settings(
  'd9700000-0000-4000-8000-000000000201', 3,
  'Admin Narrow Update', 'Updated description', 2600,
  'Demo only', '2098-12-31T23:59:59.123456Z', false,
  5, 2, 0,
  '[
    {"position":1,"percentage_bps":7000},
    {"position":2,"percentage_bps":3000}
  ]'
);
reset role;
select results_eq(
  $$select settings_version, scoring_version, changed
    from settings_admin_result$$,
  $$values (4, 2, true)$$,
  'a system admin updates one explicitly requested settings document'
);
select is(
  (
    select actor_id
    from public.audit_logs
    where action = 'league_settings_updated'
      and entity_id = 'd9700000-0000-4000-8000-000000000201'
    order by created_at desc, id desc
    limit 1
  ),
  'd9700000-0000-4000-8000-000000000003'::uuid,
  'the system-admin update is attributed to the actual actor'
);

-- Close joins through the settings gateway and exercise the real request RPC.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9700000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 4,
    'Admin Narrow Update', 'Updated description', 2600,
    'Demo only', clock_timestamp() - interval '1 second', false,
    5, 2, 0,
    '[
      {"position":1,"percentage_bps":7000},
      {"position":2,"percentage_bps":3000}
    ]'
  )$$,
  'the manager closes the join window through editable settings'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"d9700000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.submit_join_request(
    (select public_id from settings_invite),
    encode(
      extensions.digest(
        convert_to((select raw_token from settings_invite), 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  )$$,
  'P0001', 'JOIN_CLOSED',
  'the saved join deadline immediately closes real request eligibility'
);
reset role;

-- A prediction latch is irreversible competitive-state evidence even if the
-- kickoff is still in the future. Details-only edits remain available and do
-- not advance scoring, while scoring and prizes both fail atomically.
insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at,
  status, predictions_locked_at
)
values (
  'd9700000-0000-4000-8000-000000000302',
  'd9700000-0000-4000-8000-000000000101',
  1,
  '26000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000102',
  '2099-06-01T18:00:00Z', 'scheduled', clock_timestamp()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9700000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  $$select has_started_or_latched, rules_locked
    from public.get_editable_league_settings(
      'd9700000-0000-4000-8000-000000000201'
    )$$,
  $$values (true, true)$$,
  'the narrow read exposes the irreversible latch lock decision'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 5,
    'Admin Narrow Update', 'Updated description', 2600,
    'Demo only', null, false,
    6, 2, 0,
    '[
      {"position":1,"percentage_bps":7000},
      {"position":2,"percentage_bps":3000}
    ]'
  )$$,
  'P0001', 'LEAGUE_RULES_LOCKED',
  'a future-rescheduled latched match locks scoring changes'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 5,
    'Admin Narrow Update', 'Updated description', 2600,
    'Demo only', null, false,
    5, 2, 0,
    '[
      {"position":1,"percentage_bps":6000},
      {"position":2,"percentage_bps":4000}
    ]'
  )$$,
  'P0001', 'LEAGUE_RULES_LOCKED',
  'the same irreversible latch locks Demo prize changes'
);
select lives_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000201', 5,
    'Details Still Editable', 'Updated description', 2600,
    'Demo only', null, false,
    5, 2, 0,
    '[
      {"position":1,"percentage_bps":7000},
      {"position":2,"percentage_bps":3000}
    ]'
  )$$,
  'details-only changes remain available after the competitive latch'
);
reset role;
select results_eq(
  $$select settings_version, scoring.version
    from public.leagues as league
    join public.league_scoring_rules as scoring on scoring.league_id = league.id
    where league.id = 'd9700000-0000-4000-8000-000000000201'$$,
  $$values (6, 2)$$,
  'locked rule failures are atomic and details advance no scoring version'
);
select throws_ok(
  $$update public.league_scoring_rules
    set exact_points = 6
    where league_id = 'd9700000-0000-4000-8000-000000000201'$$,
  'P0001', 'SCORING_RULES_LOCKED',
  'the direct privileged trigger also honors the irreversible latch'
);

-- Database time and lifecycle state lock competitive changes. Completed and
-- archived settings documents are wholly read-only.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d9700000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000203', 1,
    'Settings Clock Locked', null, 0, null, null, true,
    4, 1, 0,
    '[{"position":1,"percentage_bps":10000}]'
  )$$,
  'P0001', 'LEAGUE_RULES_LOCKED',
  'fresh database time at or after first kickoff locks rules'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000204', 1,
    'Settings Active', null, 0, null, null, true,
    4, 1, 0,
    '[{"position":1,"percentage_bps":10000}]'
  )$$,
  'P0001', 'LEAGUE_RULES_LOCKED',
  'active status locks competitive rules'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000205', 1,
    'Completed changed', null, 0, null, null, true,
    3, 1, 0,
    '[{"position":1,"percentage_bps":10000}]'
  )$$,
  'P0001', 'LEAGUE_SETTINGS_LOCKED',
  'completed leagues are wholly read-only'
);
select throws_ok(
  $$select * from pg_temp.call_update_league_settings(
    'd9700000-0000-4000-8000-000000000206', 1,
    'Archived changed', null, 0, null, null, true,
    3, 1, 0,
    '[{"position":1,"percentage_bps":10000}]'
  )$$,
  'P0001', 'LEAGUE_SETTINGS_LOCKED',
  'archived leagues are wholly read-only'
);
reset role;

select * from finish();
rollback;
