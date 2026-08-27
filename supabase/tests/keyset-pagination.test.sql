begin;

select no_plan();

-- DEF-009 replaces every capped collection reader with an actor-derived,
-- bounded keyset contract. Keep these checks on the exact exposed signatures
-- so a permissive overload cannot accidentally satisfy the suite.
select ok(
  to_regprocedure(
    'public.get_dashboard_leagues_page(timestamp with time zone,uuid,integer)'
  ) is not null
  and to_regprocedure(
    'public.get_manager_join_requests_page(uuid,join_request_status,timestamp with time zone,uuid,integer)'
  ) is not null
  and to_regprocedure(
    'public.get_my_join_requests_page(timestamp with time zone,uuid,integer)'
  ) is not null
  and to_regprocedure(
    'public.get_match_eligible_leagues_page(uuid,timestamp with time zone,uuid,integer)'
  ) is not null
  and to_regprocedure('public.get_match_selection_context(uuid)') is not null
  and to_regprocedure('public.get_match_detail_context(uuid,uuid)') is not null
  and to_regprocedure(
    'public.get_revealed_predictions_page(uuid,uuid,timestamp with time zone,uuid,integer)'
  ) is not null,
  'all exact DEF-009 reader signatures exist'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_dashboard_leagues_page(timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.get_dashboard_leagues_page(timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.get_dashboard_leagues_page(timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.get_manager_join_requests_page(uuid,join_request_status,timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.get_manager_join_requests_page(uuid,join_request_status,timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.get_manager_join_requests_page(uuid,join_request_status,timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.get_my_join_requests_page(timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.get_my_join_requests_page(timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.get_my_join_requests_page(timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.get_match_eligible_leagues_page(uuid,timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.get_match_eligible_leagues_page(uuid,timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.get_match_eligible_leagues_page(uuid,timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.get_match_selection_context(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.get_match_selection_context(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.get_match_selection_context(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.get_match_detail_context(uuid,uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.get_match_detail_context(uuid,uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.get_match_detail_context(uuid,uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.get_revealed_predictions_page(uuid,uuid,timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.get_revealed_predictions_page(uuid,uuid,timestamp with time zone,uuid,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.get_revealed_predictions_page(uuid,uuid,timestamp with time zone,uuid,integer)',
    'EXECUTE'
  ),
  'only authenticated can execute every DEF-009 reader'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.oid in (
        'public.get_dashboard_leagues_page(timestamp with time zone,uuid,integer)'::regprocedure,
        'public.get_manager_join_requests_page(uuid,join_request_status,timestamp with time zone,uuid,integer)'::regprocedure,
        'public.get_my_join_requests_page(timestamp with time zone,uuid,integer)'::regprocedure,
        'public.get_match_eligible_leagues_page(uuid,timestamp with time zone,uuid,integer)'::regprocedure,
        'public.get_match_selection_context(uuid)'::regprocedure,
        'public.get_match_detail_context(uuid,uuid)'::regprocedure,
        'public.get_revealed_predictions_page(uuid,uuid,timestamp with time zone,uuid,integer)'::regprocedure
      )
      and (
        not procedure.prosecdef
        or coalesce(pg_catalog.array_to_string(procedure.proconfig, ','), '')
          <> 'search_path=""'
      )
  ),
  'every reader is SECURITY DEFINER with an empty search_path'
);

select ok(
  to_regprocedure('public.get_my_join_requests()') is null
  and to_regprocedure('public.get_my_join_requests_v2()') is null
  and to_regprocedure('public.get_manager_join_requests(uuid)') is null,
  'legacy capped join-request readers are absent'
);

create function pg_temp.set_actor(p_actor_id uuid)
returns void
language plpgsql
as $$
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', p_actor_id::text,
      'role', 'authenticated'
    )::text,
    true
  );
end;
$$;

-- The generated population deliberately crosses each historical cap: 101
-- leagues and request rows, 202 catalog matches, and 202 stored predictions.
-- Exactly 201 prediction owners remain active, so owner #201 proves that
-- exact authorization no longer depends on a capped member list.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'd9900000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'keyset-manager@example.com',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Keyset Manager"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd9900000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'keyset-requester@example.com',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Keyset Requester"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd9900000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'keyset-outsider@example.com',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Keyset Outsider"}', now(), now()
  );

with password_hash as materialized (
  select extensions.crypt('password123', extensions.gen_salt('bf')) as value
)
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  ('d9920000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.i), 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'keyset-member-' || series.i || '@example.com',
  password_hash.value,
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  pg_catalog.jsonb_build_object('display_name', 'Keyset Member ' || series.i),
  now(),
  now()
from pg_catalog.generate_series(1, 202) as series(i)
cross join password_hash;

insert into public.competitions (
  id, name, slug, country_code
)
values (
  'd9900000-0000-4000-8000-000000000010',
  'Keyset competition',
  'keyset-pagination-test',
  'IL'
);

insert into public.seasons (
  id, competition_id, name, starts_on, ends_on, is_current
)
values (
  'd9900000-0000-4000-8000-000000000011',
  'd9900000-0000-4000-8000-000000000010',
  'Keyset 2026/27',
  '2026-01-01',
  '2027-12-31',
  false
);

insert into public.teams (id, name, short_name)
values
  (
    'd9900000-0000-4000-8000-000000000012',
    'Keyset Home Team',
    'Keyset Home'
  ),
  (
    'd9900000-0000-4000-8000-000000000013',
    'Keyset Away Team',
    'Keyset Away'
  );

insert into public.leagues (
  id, manager_id, season_id, name, status, created_at, updated_at
)
select
  ('d9930000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.i), 12, '0'))::uuid,
  'd9900000-0000-4000-8000-000000000001',
  'd9900000-0000-4000-8000-000000000011',
  'Keyset League ' || series.i,
  'open',
  '2026-02-01 00:00:00+00'::timestamptz,
  '2026-02-01 00:00:00+00'::timestamptz
from pg_catalog.generate_series(1, 101) as series(i);

insert into public.leagues (
  id, manager_id, season_id, name, status, created_at, updated_at
)
values (
  'd9900000-0000-4000-8000-000000000014',
  'd9900000-0000-4000-8000-000000000001',
  'd9900000-0000-4000-8000-000000000011',
  'Keyset Manager Queue',
  'open',
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00'
);

insert into public.matches (
  id,
  season_id,
  round_number,
  home_team_id,
  away_team_id,
  kickoff_at,
  status,
  created_at,
  updated_at
)
select
  ('d9950000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.i), 12, '0'))::uuid,
  'd9900000-0000-4000-8000-000000000011',
  (((series.i - 1) % 34) + 1)::smallint,
  'd9900000-0000-4000-8000-000000000012',
  'd9900000-0000-4000-8000-000000000013',
  '2026-01-01 12:00:00+00'::timestamptz + series.i * interval '1 minute',
  'scheduled',
  '2026-01-01 00:00:00+00'::timestamptz,
  '2026-01-01 00:00:00+00'::timestamptz
from pg_catalog.generate_series(1, 202) as series(i);

-- All 201 active prediction owners belong to the first league. Owner #201
-- also belongs to all 100 remaining leagues and is the exact-page viewer.
insert into public.league_members (
  league_id, user_id, status, approved_by, approved_at, created_at, updated_at
)
select
  'd9930000-0000-4000-8000-000000000001',
  ('d9920000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.i), 12, '0'))::uuid,
  'active',
  'd9900000-0000-4000-8000-000000000001',
  '2026-02-01 00:00:00+00',
  '2026-02-01 00:00:00+00',
  '2026-02-01 00:00:00+00'
from pg_catalog.generate_series(1, 201) as series(i);

insert into public.league_members (
  league_id, user_id, status, approved_by, approved_at, created_at, updated_at
)
select
  ('d9930000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.i), 12, '0'))::uuid,
  'd9920000-0000-4000-8000-0000000000c9',
  'active',
  'd9900000-0000-4000-8000-000000000001',
  '2026-02-01 00:00:00+00',
  '2026-02-01 00:00:00+00',
  '2026-02-01 00:00:00+00'
from pg_catalog.generate_series(2, 101) as series(i);

insert into public.league_members (
  league_id,
  user_id,
  status,
  approved_by,
  approved_at,
  removed_by,
  removed_at,
  created_at,
  updated_at
)
values (
  'd9930000-0000-4000-8000-000000000001',
  'd9920000-0000-4000-8000-0000000000ca',
  'removed',
  'd9900000-0000-4000-8000-000000000001',
  '2026-02-01 00:00:00+00',
  'd9900000-0000-4000-8000-000000000001',
  '2026-02-02 00:00:00+00',
  '2026-02-01 00:00:00+00',
  '2026-02-02 00:00:00+00'
);

insert into public.join_requests (
  id, league_id, user_id, status, created_at, updated_at
)
select
  ('d9960000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.i), 12, '0'))::uuid,
  ('d9930000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.i), 12, '0'))::uuid,
  'd9900000-0000-4000-8000-000000000002',
  'pending_proof',
  '2026-03-01 00:00:00+00',
  '2026-03-01 00:00:00+00'
from pg_catalog.generate_series(1, 101) as series(i);

insert into public.join_requests (
  id, league_id, user_id, status, created_at, updated_at
)
select
  ('d9970000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.i), 12, '0'))::uuid,
  'd9900000-0000-4000-8000-000000000014',
  ('d9920000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.i), 12, '0'))::uuid,
  'pending_approval',
  '2026-04-01 00:00:00+00',
  '2026-04-01 00:00:00+00'
from pg_catalog.generate_series(1, 101) as series(i);

insert into public.predictions (
  id,
  league_id,
  match_id,
  user_id,
  predicted_home_score,
  predicted_away_score,
  created_at,
  updated_at
)
select
  ('d9980000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.i), 12, '0'))::uuid,
  'd9930000-0000-4000-8000-000000000001',
  'd9950000-0000-4000-8000-0000000000c9',
  ('d9920000-0000-4000-8000-' || pg_catalog.lpad(pg_catalog.to_hex(series.i), 12, '0'))::uuid,
  (series.i % 5)::smallint,
  ((series.i + 1) % 5)::smallint,
  '2026-05-01 00:00:00+00',
  '2026-05-01 00:00:00+00'
from pg_catalog.generate_series(1, 202) as series(i);

-- Actor identity is always derived from the JWT. Missing sub is rejected even
-- though the SQL caller possesses the authenticated role.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims', '{"role":"authenticated"}', true
);
select throws_ok(
  $$select * from public.get_dashboard_leagues_page(null, null, 20)$$,
  'P0001', 'UNAUTHENTICATED',
  'dashboard paging rejects a missing JWT actor'
);
select throws_ok(
  $$select * from public.get_manager_join_requests_page(
    'd9900000-0000-4000-8000-000000000014', null, null, null, 25
  )$$,
  'P0001', 'UNAUTHENTICATED',
  'manager paging rejects a missing JWT actor'
);
select throws_ok(
  $$select * from public.get_my_join_requests_page(null, null, 25)$$,
  'P0001', 'UNAUTHENTICATED',
  'own-request paging rejects a missing JWT actor'
);
select throws_ok(
  $$select * from public.get_match_eligible_leagues_page(
    'd9950000-0000-4000-8000-0000000000c9', null, null, 20
  )$$,
  'P0001', 'UNAUTHENTICATED',
  'eligible-league paging rejects a missing JWT actor'
);
select throws_ok(
  $$select * from public.get_match_selection_context(
    'd9950000-0000-4000-8000-0000000000c9'
  )$$,
  'P0001', 'UNAUTHENTICATED',
  'match selection context rejects a missing JWT actor'
);
select throws_ok(
  $$select * from public.get_match_detail_context(
    'd9950000-0000-4000-8000-0000000000c9',
    'd9930000-0000-4000-8000-000000000001'
  )$$,
  'P0001', 'UNAUTHENTICATED',
  'match detail context rejects a missing JWT actor'
);
select throws_ok(
  $$select * from public.get_revealed_predictions_page(
    'd9930000-0000-4000-8000-000000000001',
    'd9950000-0000-4000-8000-0000000000c9', null, null, 25
  )$$,
  'P0001', 'UNAUTHENTICATED',
  'revealed-prediction paging rejects a missing JWT actor'
);

select pg_temp.set_actor('d9920000-0000-4000-8000-0000000000c9');
select lives_ok(
  $$select * from public.get_dashboard_leagues_page(null, null, 20)$$,
  'an authenticated actor can execute the granted dashboard reader'
);
reset role;

-- Every page contract rejects NULL, zero, and over-bound sizes before doing
-- resource work. This prevents LIMIT NULL and oversized Data API requests.
select pg_temp.set_actor('d9900000-0000-4000-8000-000000000001');
select throws_ok(
  $$select * from public.get_dashboard_leagues_page(null, null, null)$$,
  '22023', 'INVALID_PAGE_SIZE', 'dashboard rejects NULL page size'
);
select throws_ok(
  $$select * from public.get_dashboard_leagues_page(null, null, 0)$$,
  '22023', 'INVALID_PAGE_SIZE', 'dashboard rejects zero page size'
);
select throws_ok(
  $$select * from public.get_dashboard_leagues_page(null, null, 51)$$,
  '22023', 'INVALID_PAGE_SIZE', 'dashboard rejects page size 51'
);
select throws_ok(
  $$select * from public.get_manager_join_requests_page(
    'd9900000-0000-4000-8000-000000000014', null, null, null, null
  )$$,
  '22023', 'INVALID_PAGE_SIZE', 'manager queue rejects NULL page size'
);
select throws_ok(
  $$select * from public.get_manager_join_requests_page(
    'd9900000-0000-4000-8000-000000000014', null, null, null, 0
  )$$,
  '22023', 'INVALID_PAGE_SIZE', 'manager queue rejects zero page size'
);
select throws_ok(
  $$select * from public.get_manager_join_requests_page(
    'd9900000-0000-4000-8000-000000000014', null, null, null, 51
  )$$,
  '22023', 'INVALID_PAGE_SIZE', 'manager queue rejects page size 51'
);

select pg_temp.set_actor('d9900000-0000-4000-8000-000000000002');
select throws_ok(
  $$select * from public.get_my_join_requests_page(null, null, null)$$,
  '22023', 'INVALID_PAGE_SIZE', 'own requests reject NULL page size'
);
select throws_ok(
  $$select * from public.get_my_join_requests_page(null, null, 0)$$,
  '22023', 'INVALID_PAGE_SIZE', 'own requests reject zero page size'
);
select throws_ok(
  $$select * from public.get_my_join_requests_page(null, null, 51)$$,
  '22023', 'INVALID_PAGE_SIZE', 'own requests reject page size 51'
);

select pg_temp.set_actor('d9920000-0000-4000-8000-0000000000c9');
select throws_ok(
  $$select * from public.get_match_eligible_leagues_page(
    'd9950000-0000-4000-8000-0000000000c9', null, null, null
  )$$,
  '22023', 'INVALID_PAGE_SIZE', 'eligible leagues reject NULL page size'
);
select throws_ok(
  $$select * from public.get_match_eligible_leagues_page(
    'd9950000-0000-4000-8000-0000000000c9', null, null, 0
  )$$,
  '22023', 'INVALID_PAGE_SIZE', 'eligible leagues reject zero page size'
);
select throws_ok(
  $$select * from public.get_match_eligible_leagues_page(
    'd9950000-0000-4000-8000-0000000000c9', null, null, 51
  )$$,
  '22023', 'INVALID_PAGE_SIZE', 'eligible leagues reject page size 51'
);
select throws_ok(
  $$select * from public.get_revealed_predictions_page(
    'd9930000-0000-4000-8000-000000000001',
    'd9950000-0000-4000-8000-0000000000c9', null, null, null
  )$$,
  '22023', 'INVALID_PAGE_SIZE', 'revealed predictions reject NULL page size'
);
select throws_ok(
  $$select * from public.get_revealed_predictions_page(
    'd9930000-0000-4000-8000-000000000001',
    'd9950000-0000-4000-8000-0000000000c9', null, null, 0
  )$$,
  '22023', 'INVALID_PAGE_SIZE', 'revealed predictions reject zero page size'
);
select throws_ok(
  $$select * from public.get_revealed_predictions_page(
    'd9930000-0000-4000-8000-000000000001',
    'd9950000-0000-4000-8000-0000000000c9', null, null, 51
  )$$,
  '22023', 'INVALID_PAGE_SIZE', 'revealed predictions reject page size 51'
);

-- A cursor is an indivisible timestamp/UUID pair. Half cursors and non-finite
-- PostgreSQL timestamps are rejected instead of acquiring surprising sort
-- semantics.
select throws_ok(
  $$select * from public.get_dashboard_leagues_page(
    '2026-02-01 00:00:00+00', null, 10
  )$$,
  '22023', 'INVALID_CURSOR', 'dashboard rejects timestamp-only cursor'
);
select throws_ok(
  $$select * from public.get_dashboard_leagues_page(
    null, 'd9930000-0000-4000-8000-000000000050', 10
  )$$,
  '22023', 'INVALID_CURSOR', 'dashboard rejects UUID-only cursor'
);
select throws_ok(
  $$select * from public.get_dashboard_leagues_page(
    'infinity', 'd9930000-0000-4000-8000-000000000050', 10
  )$$,
  '22023', 'INVALID_CURSOR', 'dashboard rejects positive infinity cursor'
);
select throws_ok(
  $$select * from public.get_dashboard_leagues_page(
    '-infinity', 'd9930000-0000-4000-8000-000000000050', 10
  )$$,
  '22023', 'INVALID_CURSOR', 'dashboard rejects negative infinity cursor'
);

select pg_temp.set_actor('d9900000-0000-4000-8000-000000000001');
select throws_ok(
  $$select * from public.get_manager_join_requests_page(
    'd9900000-0000-4000-8000-000000000014', null,
    '2026-04-01 00:00:00+00', null, 10
  )$$,
  '22023', 'INVALID_CURSOR', 'manager queue rejects timestamp-only cursor'
);
select throws_ok(
  $$select * from public.get_manager_join_requests_page(
    'd9900000-0000-4000-8000-000000000014', null,
    null, 'd9970000-0000-4000-8000-000000000050', 10
  )$$,
  '22023', 'INVALID_CURSOR', 'manager queue rejects UUID-only cursor'
);
select throws_ok(
  $$select * from public.get_manager_join_requests_page(
    'd9900000-0000-4000-8000-000000000014', null,
    'infinity', 'd9970000-0000-4000-8000-000000000050', 10
  )$$,
  '22023', 'INVALID_CURSOR', 'manager queue rejects infinity cursor'
);

select pg_temp.set_actor('d9900000-0000-4000-8000-000000000002');
select throws_ok(
  $$select * from public.get_my_join_requests_page(
    '2026-03-01 00:00:00+00', null, 10
  )$$,
  '22023', 'INVALID_CURSOR', 'own requests reject timestamp-only cursor'
);
select throws_ok(
  $$select * from public.get_my_join_requests_page(
    null, 'd9960000-0000-4000-8000-000000000050', 10
  )$$,
  '22023', 'INVALID_CURSOR', 'own requests reject UUID-only cursor'
);
select throws_ok(
  $$select * from public.get_my_join_requests_page(
    '-infinity', 'd9960000-0000-4000-8000-000000000050', 10
  )$$,
  '22023', 'INVALID_CURSOR', 'own requests reject infinity cursor'
);

select pg_temp.set_actor('d9920000-0000-4000-8000-0000000000c9');
select throws_ok(
  $$select * from public.get_match_eligible_leagues_page(
    'd9950000-0000-4000-8000-0000000000c9',
    '2026-02-01 00:00:00+00', null, 10
  )$$,
  '22023', 'INVALID_CURSOR', 'eligible leagues reject timestamp-only cursor'
);
select throws_ok(
  $$select * from public.get_match_eligible_leagues_page(
    'd9950000-0000-4000-8000-0000000000c9',
    null, 'd9930000-0000-4000-8000-000000000050', 10
  )$$,
  '22023', 'INVALID_CURSOR', 'eligible leagues reject UUID-only cursor'
);
select throws_ok(
  $$select * from public.get_match_eligible_leagues_page(
    'd9950000-0000-4000-8000-0000000000c9',
    'infinity', 'd9930000-0000-4000-8000-000000000050', 10
  )$$,
  '22023', 'INVALID_CURSOR', 'eligible leagues reject infinity cursor'
);
select throws_ok(
  $$select * from public.get_revealed_predictions_page(
    'd9930000-0000-4000-8000-000000000001',
    'd9950000-0000-4000-8000-0000000000c9',
    '2026-05-01 00:00:00+00', null, 10
  )$$,
  '22023', 'INVALID_CURSOR', 'revealed predictions reject timestamp-only cursor'
);
select throws_ok(
  $$select * from public.get_revealed_predictions_page(
    'd9930000-0000-4000-8000-000000000001',
    'd9950000-0000-4000-8000-0000000000c9',
    null, 'd9980000-0000-4000-8000-000000000050', 10
  )$$,
  '22023', 'INVALID_CURSOR', 'revealed predictions reject UUID-only cursor'
);
select throws_ok(
  $$select * from public.get_revealed_predictions_page(
    'd9930000-0000-4000-8000-000000000001',
    'd9950000-0000-4000-8000-0000000000c9',
    '-infinity', 'd9980000-0000-4000-8000-000000000050', 10
  )$$,
  '22023', 'INVALID_CURSOR', 'revealed predictions reject infinity cursor'
);

-- Resource authorization stays exact and opaque. A same-season membership is
-- not permission to substitute another league ID.
select pg_temp.set_actor('d9900000-0000-4000-8000-000000000003');
select throws_ok(
  $$select * from public.get_manager_join_requests_page(
    'd9900000-0000-4000-8000-000000000014', null, null, null, 10
  )$$,
  'P0001', 'NOT_FOUND',
  'a foreign manager receives an opaque queue denial'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.get_match_selection_context(
      'd9950000-0000-4000-8000-0000000000c9'
    )
  ),
  0,
  'an outsider receives no match selection facts'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.get_match_detail_context(
      'd9950000-0000-4000-8000-0000000000c9',
      'd9930000-0000-4000-8000-000000000001'
    )
  ),
  0,
  'an outsider receives no exact match detail facts'
);
select throws_ok(
  $$select * from public.get_revealed_predictions_page(
    'd9930000-0000-4000-8000-000000000001',
    'd9950000-0000-4000-8000-0000000000c9', null, null, 10
  )$$,
  'P0001', 'NOT_FOUND',
  'an outsider receives an opaque revealed-prediction denial'
);

select pg_temp.set_actor('d9920000-0000-4000-8000-0000000000c9');
select is(
  (
    select pg_catalog.count(*)::integer
    from public.get_match_detail_context(
      'd9950000-0000-4000-8000-0000000000c9',
      'd9900000-0000-4000-8000-000000000014'
    )
  ),
  0,
  'an active same-season member cannot substitute a foreign league ID'
);
select results_eq(
  $$select match_id::text, league_id::text, own_prediction_id::text
    from public.get_match_detail_context(
      'd9950000-0000-4000-8000-0000000000c9',
      'd9930000-0000-4000-8000-000000000001'
    )$$,
  $$values (
    'd9950000-0000-4000-8000-0000000000c9'::text,
    'd9930000-0000-4000-8000-000000000001'::text,
    'd9980000-0000-4000-8000-0000000000c9'::text
  )$$,
  'member #201 receives the exact match and only their own prediction'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.get_match_selection_context(
      'd9950000-0000-4000-8000-0000000000c9'
    )
  ),
  1,
  'match #201 is reachable through exact season membership beyond old caps'
);

-- Each function returns one extra sentinel row. All fixture timestamps are
-- equal, so these counts also require the UUID half of the keyset.
select is(
  (
    select pg_catalog.count(*)::integer
    from public.get_dashboard_leagues_page(null, null, 50)
  ),
  51,
  'dashboard first page includes exactly one has-more sentinel'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.get_match_eligible_leagues_page(
      'd9950000-0000-4000-8000-0000000000c9', null, null, 50
    )
  ),
  51,
  'eligible-league first page includes exactly one has-more sentinel'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.get_revealed_predictions_page(
      'd9930000-0000-4000-8000-000000000001',
      'd9950000-0000-4000-8000-0000000000c9', null, null, 50
    )
  ),
  51,
  'revealed-prediction first page includes exactly one has-more sentinel'
);

select pg_temp.set_actor('d9900000-0000-4000-8000-000000000002');
select is(
  (
    select pg_catalog.count(*)::integer
    from public.get_my_join_requests_page(null, null, 50)
  ),
  51,
  'own-request first page includes exactly one has-more sentinel'
);

select pg_temp.set_actor('d9900000-0000-4000-8000-000000000001');
select is(
  (
    select pg_catalog.count(*)::integer
    from public.get_manager_join_requests_page(
      'd9900000-0000-4000-8000-000000000014',
      'pending_approval', null, null, 50
    )
  ),
  51,
  'manager-request first page includes exactly one has-more sentinel'
);

-- Walk every collection exactly as the application does: consume at most the
-- requested size, use the final consumed row as the next cursor, and discard
-- the extra sentinel. Equal timestamp ties must neither skip nor duplicate.
create temp table dashboard_walk (
  visit bigint generated always as identity,
  league_id uuid not null,
  created_at timestamptz not null
);
select pg_temp.set_actor('d9920000-0000-4000-8000-0000000000c9');
do $$
declare
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_inserted integer;
begin
  loop
    insert into dashboard_walk (league_id, created_at)
    select page.league_id, page.league_created_at
    from (
      select result.*,
        pg_catalog.row_number() over (
          order by result.league_created_at desc, result.league_id desc
        ) as ordinal
      from public.get_dashboard_leagues_page(
        v_cursor_at, v_cursor_id, 10
      ) as result
    ) as page
    where page.ordinal <= 10
    order by page.ordinal;

    get diagnostics v_inserted = row_count;
    exit when v_inserted = 0;

    select walk.created_at, walk.league_id
      into v_cursor_at, v_cursor_id
    from dashboard_walk as walk
    order by walk.visit desc
    limit 1;
  end loop;
end;
$$;
select is(
  (select pg_catalog.count(*)::integer from dashboard_walk),
  101,
  'dashboard traverses all 101 actor leagues'
);
select is(
  (select pg_catalog.count(distinct league_id)::integer from dashboard_walk),
  101,
  'dashboard traversal has no gaps or duplicates at equal timestamps'
);

create temp table eligible_walk (
  visit bigint generated always as identity,
  league_id uuid not null,
  created_at timestamptz not null
);
do $$
declare
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_inserted integer;
begin
  loop
    insert into eligible_walk (league_id, created_at)
    select page.league_id, page.league_created_at
    from (
      select result.*,
        pg_catalog.row_number() over (
          order by result.league_created_at asc, result.league_id asc
        ) as ordinal
      from public.get_match_eligible_leagues_page(
        'd9950000-0000-4000-8000-0000000000c9',
        v_cursor_at, v_cursor_id, 10
      ) as result
    ) as page
    where page.ordinal <= 10
    order by page.ordinal;

    get diagnostics v_inserted = row_count;
    exit when v_inserted = 0;

    select walk.created_at, walk.league_id
      into v_cursor_at, v_cursor_id
    from eligible_walk as walk
    order by walk.visit desc
    limit 1;
  end loop;
end;
$$;
select is(
  (select pg_catalog.count(*)::integer from eligible_walk),
  101,
  'eligible selector traverses all 101 exact active memberships'
);
select is(
  (select pg_catalog.count(distinct league_id)::integer from eligible_walk),
  101,
  'eligible selector traversal has no gaps or duplicates at equal timestamps'
);

create temp table own_request_walk (
  visit bigint generated always as identity,
  request_id uuid not null,
  created_at timestamptz not null
);
select pg_temp.set_actor('d9900000-0000-4000-8000-000000000002');
do $$
declare
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_inserted integer;
begin
  loop
    insert into own_request_walk (request_id, created_at)
    select page.request_id, page.created_at
    from (
      select result.*,
        pg_catalog.row_number() over (
          order by result.created_at desc, result.request_id desc
        ) as ordinal
      from public.get_my_join_requests_page(
        v_cursor_at, v_cursor_id, 10
      ) as result
    ) as page
    where page.ordinal <= 10
    order by page.ordinal;

    get diagnostics v_inserted = row_count;
    exit when v_inserted = 0;

    select walk.created_at, walk.request_id
      into v_cursor_at, v_cursor_id
    from own_request_walk as walk
    order by walk.visit desc
    limit 1;
  end loop;
end;
$$;
select is(
  (select pg_catalog.count(*)::integer from own_request_walk),
  101,
  'own-request history traverses all 101 actor-derived rows'
);
select is(
  (select pg_catalog.count(distinct request_id)::integer from own_request_walk),
  101,
  'own-request traversal has no gaps or duplicates at equal timestamps'
);

create temp table manager_request_walk (
  visit bigint generated always as identity,
  request_id uuid not null,
  created_at timestamptz not null
);
select pg_temp.set_actor('d9900000-0000-4000-8000-000000000001');
do $$
declare
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_inserted integer;
begin
  loop
    insert into manager_request_walk (request_id, created_at)
    select page.request_id, page.created_at
    from (
      select result.*,
        pg_catalog.row_number() over (
          order by result.created_at desc, result.request_id desc
        ) as ordinal
      from public.get_manager_join_requests_page(
        'd9900000-0000-4000-8000-000000000014',
        'pending_approval', v_cursor_at, v_cursor_id, 10
      ) as result
    ) as page
    where page.ordinal <= 10
    order by page.ordinal;

    get diagnostics v_inserted = row_count;
    exit when v_inserted = 0;

    select walk.created_at, walk.request_id
      into v_cursor_at, v_cursor_id
    from manager_request_walk as walk
    order by walk.visit desc
    limit 1;
  end loop;
end;
$$;
select is(
  (select pg_catalog.count(*)::integer from manager_request_walk),
  101,
  'manager queue traverses all 101 exact-league request rows'
);
select is(
  (select pg_catalog.count(distinct request_id)::integer from manager_request_walk),
  101,
  'manager queue traversal has no gaps or duplicates at equal timestamps'
);

create temp table prediction_walk (
  visit bigint generated always as identity,
  prediction_id uuid not null,
  created_at timestamptz not null
);
select pg_temp.set_actor('d9920000-0000-4000-8000-0000000000c9');
do $$
declare
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_inserted integer;
begin
  loop
    insert into prediction_walk (prediction_id, created_at)
    select page.prediction_id, page.created_at
    from (
      select result.*,
        pg_catalog.row_number() over (
          order by result.created_at asc, result.prediction_id asc
        ) as ordinal
      from public.get_revealed_predictions_page(
        'd9930000-0000-4000-8000-000000000001',
        'd9950000-0000-4000-8000-0000000000c9',
        v_cursor_at, v_cursor_id, 10
      ) as result
    ) as page
    where page.ordinal <= 10
    order by page.ordinal;

    get diagnostics v_inserted = row_count;
    exit when v_inserted = 0;

    select walk.created_at, walk.prediction_id
      into v_cursor_at, v_cursor_id
    from prediction_walk as walk
    order by walk.visit desc
    limit 1;
  end loop;
end;
$$;
select is(
  (select pg_catalog.count(*)::integer from prediction_walk),
  201,
  'revealed predictions traverse all 201 active-member rows'
);
select is(
  (select pg_catalog.count(distinct prediction_id)::integer from prediction_walk),
  201,
  'revealed-prediction traversal has no gaps or duplicates at equal timestamps'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from prediction_walk
    where prediction_id = 'd9980000-0000-4000-8000-0000000000ca'
  ),
  0,
  'the removed owner row is excluded even after reveal'
);

select pg_temp.set_actor('d9900000-0000-4000-8000-000000000003');
select is(
  (
    select pg_catalog.count(*)::integer
    from public.get_dashboard_leagues_page(null, null, 20)
  ),
  0,
  'dashboard actor derivation does not trust a caller-supplied user identity'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.get_my_join_requests_page(null, null, 20)
  ),
  0,
  'own-request actor derivation cannot read another requester history'
);

select * from finish();
rollback;
