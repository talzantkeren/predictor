begin;

select no_plan();

-- Schema, generated outcome, constraints, indexes, RLS, and grants.
select ok(to_regclass('public.predictions') is not null, 'predictions table exists');
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'predictions'
  ),
  'id,league_id,match_id,user_id,predicted_home_score,predicted_away_score,predicted_outcome,points,is_exact,is_correct_outcome,scored_at,scored_result_version,scored_rule_version,created_at,updated_at',
  'predictions has exactly the canonical Slice 5 columns'
);
select ok(
  exists (
    select 1
    from pg_type
    join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where pg_namespace.nspname = 'public'
      and pg_type.typname = 'outcome'
      and pg_type.typtype = 'e'
  ),
  'outcome enum exists'
);
select is(
  (
    select string_agg(pg_enum.enumlabel, ',' order by pg_enum.enumsortorder)
    from pg_enum
    join pg_type on pg_type.oid = pg_enum.enumtypid
    join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where pg_namespace.nspname = 'public' and pg_type.typname = 'outcome'
  ),
  'HOME,DRAW,AWAY',
  'outcome enum contains the canonical ordered values'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.predictions'::regclass),
  'predictions has RLS enabled'
);
select is(
  (select attgenerated from pg_attribute
   where attrelid = 'public.predictions'::regclass and attname = 'predicted_outcome'),
  's'::"char",
  'predicted_outcome is a stored generated column'
);
select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'predictions'
      and column_name in (
        'id', 'league_id', 'match_id', 'user_id', 'predicted_home_score',
        'predicted_away_score', 'predicted_outcome', 'points', 'created_at',
        'updated_at'
      )
      and is_nullable <> 'NO'
  )
  and (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'predictions'
         and column_name = 'points') = '0',
  'identity, relation, score, outcome, points, and timestamp columns are not null and points defaults to zero'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.predictions'::regclass
      and conname = 'predictions_home_score_check'
      and contype = 'c'
  )
  and exists (
    select 1 from pg_constraint
    where conrelid = 'public.predictions'::regclass
      and conname = 'predictions_away_score_check'
      and contype = 'c'
  )
  and exists (
    select 1 from pg_constraint
    where conrelid = 'public.predictions'::regclass
      and conname = 'predictions_league_match_user_key'
      and contype = 'u'
  )
  and exists (
    select 1 from pg_constraint
    where conrelid = 'public.predictions'::regclass
      and conname = 'predictions_points_check'
      and contype = 'c'
  ),
  'score/points bounds and one-current-prediction uniqueness are constrained'
);
select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.predictions'::regclass and contype = 'f'),
  3,
  'predictions has foreign keys to league, match, and authenticated user'
);
select ok(
  to_regclass('public.predictions_match_idx') is not null
  and to_regclass('public.predictions_league_user_idx') is not null,
  'the two documented prediction query indexes exist'
);
select ok(
  has_table_privilege('authenticated', 'public.predictions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.predictions', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.predictions', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.predictions', 'SELECT,INSERT,UPDATE,DELETE'),
  'predictions grants are authenticated SELECT-only with no anon or service-role access'
);
select is(
  (select count(*)::integer from pg_policy where polrelid = 'public.predictions'::regclass),
  1,
  'predictions exposes one time-and-membership SELECT policy and no client write policy'
);

select ok(
  to_regprocedure('public.save_prediction(uuid,uuid,numeric,numeric)') is not null
  and to_regprocedure('public.get_prediction_database_time()') is not null,
  'prediction save and database-time RPCs exist'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'public.save_prediction(uuid,uuid,numeric,numeric)'::regprocedure)
  and (select array_to_string(proconfig, ',') from pg_proc
       where oid = 'public.save_prediction(uuid,uuid,numeric,numeric)'::regprocedure) = 'search_path=""',
  'save_prediction is security definer with an empty search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.save_prediction(uuid,uuid,numeric,numeric)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_prediction_database_time()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.save_prediction(uuid,uuid,numeric,numeric)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_prediction_database_time()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.save_prediction(uuid,uuid,numeric,numeric)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.get_prediction_database_time()', 'EXECUTE'),
  'prediction RPC execution is granted only to authenticated'
);
select ok(
  not exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    cross join lateral aclexplode(coalesce(pg_proc.proacl, acldefault('f', pg_proc.proowner))) as privilege
    where pg_namespace.nspname = 'private'
      and pg_proc.proname in (
        'enforce_prediction_season_consistency',
        'prevent_league_prediction_season_change',
        'prevent_match_prediction_season_change',
        'touch_prediction_updated_at'
      )
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'prediction trigger helpers are not executable by PUBLIC'
);
select ok(
  not exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where (
      (pg_namespace.nspname = 'public' and pg_proc.proname in (
        'save_prediction', 'get_prediction_database_time'
      ))
      or (pg_namespace.nspname = 'private' and pg_proc.proname in (
        'enforce_prediction_season_consistency',
        'prevent_league_prediction_season_change',
        'prevent_match_prediction_season_change',
        'touch_prediction_updated_at'
      ))
    )
      and coalesce(array_to_string(pg_proc.proconfig, ','), '') <> 'search_path=""'
  )
  and not (select prosecdef from pg_proc
           where oid = 'public.get_prediction_database_time()'::regprocedure),
  'every Slice 5 function fixes an empty search_path and the read-only clock RPC remains invoker security'
);

-- Auth users are transaction-local fixtures; the identity trigger creates profiles.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'prediction-manager@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"מנהלת ניחושים"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'prediction-member-a@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"חברה א"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a3333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'prediction-member-b@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"חבר ב"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a4444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'prediction-outsider@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"משתמשת זרה"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a5555555-5555-4555-8555-555555555555',
   'authenticated', 'authenticated', 'prediction-removed@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"חבר שהוסר"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a6666666-6666-4666-8666-666666666666',
   'authenticated', 'authenticated', 'prediction-pending-proof@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"ממתינה להוכחה"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a7777777-7777-4777-8777-777777777777',
   'authenticated', 'authenticated', 'prediction-pending-approval@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"ממתין לאישור"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a8888888-8888-4888-8888-888888888888',
   'authenticated', 'authenticated', 'prediction-rejected@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"בקשה שנדחתה"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9999999-9999-4999-8999-999999999999',
   'authenticated', 'authenticated', 'prediction-other-manager@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"מנהלת ליגה אחרת"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'authenticated', 'authenticated', 'prediction-late@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"מצטרפת מאוחרת"}', now(), now());

insert into public.competitions (id, name, slug, country_code)
values ('27000000-0000-4000-8000-000000000001', 'תחרות בדיקה שנייה', 'prediction-test-second', 'IL');
insert into public.seasons (id, competition_id, name, starts_on, ends_on, is_current)
values (
  '27000000-0000-4000-8000-000000000027',
  '27000000-0000-4000-8000-000000000001',
  '2027/28', '2027-07-01', '2028-06-30', false
);
insert into public.teams (id, name, short_name)
values
  ('e1000000-0000-4000-8000-000000000001', 'קבוצת בדיקה בית', 'בית'),
  ('e1000000-0000-4000-8000-000000000002', 'קבוצת בדיקה חוץ', 'חוץ');

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status,
  home_score, away_score
)
values
  ('51000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000027', 90,
   'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', now() + interval '1 day', 'scheduled', null, null),
  ('51000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000027', 90,
   'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', now(), 'scheduled', null, null),
  ('51000000-0000-4000-8000-000000000003', '26000000-0000-4000-8000-000000000027', 90,
   'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', now() - interval '1 day', 'scheduled', null, null),
  ('51000000-0000-4000-8000-000000000004', '26000000-0000-4000-8000-000000000027', 91,
   'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', now() + interval '1 day', 'postponed', null, null),
  ('51000000-0000-4000-8000-000000000005', '26000000-0000-4000-8000-000000000027', 91,
   'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', now() + interval '1 day', 'canceled', null, null),
  ('51000000-0000-4000-8000-000000000006', '26000000-0000-4000-8000-000000000027', 91,
   'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', now() + interval '1 day', 'live', null, null),
  ('51000000-0000-4000-8000-000000000007', '26000000-0000-4000-8000-000000000027', 91,
   'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', now() + interval '1 day', 'finished', 1, 1),
  ('51000000-0000-4000-8000-000000000008', '26000000-0000-4000-8000-000000000027', 92,
   'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', now() + interval '1 second', 'scheduled', null, null),
  ('51000000-0000-4000-8000-000000000009', '26000000-0000-4000-8000-000000000027', 92,
   'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', now() + interval '1 day', 'scheduled', null, null),
  ('52000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000027', 1,
   'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', now() + interval '1 day', 'scheduled', null, null);

-- Create two private leagues through the same user-scoped production RPC.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$select public.create_league(
    '26000000-0000-4000-8000-000000000027', 'ליגת ניחושים ראשית', null, 0,
    null, null, true, 3::smallint, 1::smallint, 0::smallint,
    '[{"position":1,"percentage_bps":10000}]'::jsonb
  )$$,
  'main prediction league is created'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a9999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
select lives_ok(
  $$select public.create_league(
    '26000000-0000-4000-8000-000000000027', 'ליגת ניחושים זרה', null, 0,
    null, null, true, 3::smallint, 1::smallint, 0::smallint,
    '[{"position":1,"percentage_bps":10000}]'::jsonb
  )$$,
  'other prediction league is created'
);
reset role;

create temp table prediction_fixture as
select
  (select id from public.leagues where name = 'ליגת ניחושים ראשית')::uuid as league_id,
  (select id from public.leagues where name = 'ליגת ניחושים זרה')::uuid as other_league_id;
grant select on table prediction_fixture to anon, authenticated;

insert into public.league_members (
  league_id, user_id, status, approved_by, approved_at, removed_by, removed_at
)
values
  ((select league_id from prediction_fixture), 'a2222222-2222-4222-8222-222222222222', 'active',
   'a1111111-1111-4111-8111-111111111111', now(), null, null),
  ((select league_id from prediction_fixture), 'a3333333-3333-4333-8333-333333333333', 'active',
   'a1111111-1111-4111-8111-111111111111', now(), null, null),
  ((select league_id from prediction_fixture), 'a5555555-5555-4555-8555-555555555555', 'removed',
   'a1111111-1111-4111-8111-111111111111', now() - interval '2 days',
   'a1111111-1111-4111-8111-111111111111', now() - interval '1 day');

insert into public.join_requests (
  league_id, user_id, status, rejection_reason, decided_by, decided_at
)
values
  ((select league_id from prediction_fixture), 'a6666666-6666-4666-8666-666666666666',
   'pending_proof', null, null, null),
  ((select league_id from prediction_fixture), 'a7777777-7777-4777-8777-777777777777',
   'pending_approval', null, null, null),
  ((select league_id from prediction_fixture), 'a8888888-8888-4888-8888-888888888888',
   'rejected', 'הבקשה נדחתה בבדיקת fixture', 'a1111111-1111-4111-8111-111111111111', now());

-- Privileged transaction fixtures represent predictions saved before these kickoffs.
insert into public.predictions (
  league_id, match_id, user_id, predicted_home_score, predicted_away_score
)
values
  ((select league_id from prediction_fixture), '51000000-0000-4000-8000-000000000002',
   'a2222222-2222-4222-8222-222222222222', 1, 0),
  ((select league_id from prediction_fixture), '51000000-0000-4000-8000-000000000002',
   'a3333333-3333-4333-8333-333333333333', 0, 1),
  ((select league_id from prediction_fixture), '51000000-0000-4000-8000-000000000003',
   'a2222222-2222-4222-8222-222222222222', 2, 0),
  ((select league_id from prediction_fixture), '51000000-0000-4000-8000-000000000003',
   'a3333333-3333-4333-8333-333333333333', 1, 1),
  ((select league_id from prediction_fixture), '51000000-0000-4000-8000-000000000005',
   'a2222222-2222-4222-8222-222222222222', 0, 0);

-- Grant boundary and missing-subject authentication.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  '42501', null,
  'anon cannot execute save_prediction'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'UNAUTHENTICATED',
  'an authenticated role without a subject cannot save'
);
select is(
  (select count(*)::integer from public.predictions
   where match_id = '51000000-0000-4000-8000-000000000003'),
  0,
  'an authenticated role without a subject reads zero revealed rows'
);
reset role;

-- Active member create/update/retry; actor and outcome are database-owned.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select results_eq(
  format($sql$select predicted_home_score, predicted_away_score, predicted_outcome::text
    from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  $$values (1::smallint, 0::smallint, 'HOME'::text)$$,
  'an active member creates an exact-score prediction with generated HOME outcome'
);
reset role;
create temp table first_prediction_save as
select id, updated_at
from public.predictions
where league_id = (select league_id from prediction_fixture)
  and match_id = '51000000-0000-4000-8000-000000000001'
  and user_id = 'a2222222-2222-4222-8222-222222222222';
grant select on table first_prediction_save to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select lives_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 2, 2)$sql$,
    (select league_id from prediction_fixture)),
  'the owner can replace the prediction before kickoff'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000001'
     and user_id = 'a2222222-2222-4222-8222-222222222222'),
  1,
  'an update keeps one current row'
);
select results_eq(
  $$select predicted_home_score, predicted_away_score, predicted_outcome::text
    from public.predictions
    where id = (select id from first_prediction_save)$$,
  $$values (2::smallint, 2::smallint, 'DRAW'::text)$$,
  'replacement updates the score pair and regenerates DRAW'
);
select ok(
  (select prediction.updated_at > first_save.updated_at
   from public.predictions as prediction
   join first_prediction_save as first_save on first_save.id = prediction.id),
  'replacement advances updated_at'
);
select lives_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 2, 2)$sql$,
    (select league_id from prediction_fixture)),
  'an identical retry is safe'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000001'
     and user_id = 'a2222222-2222-4222-8222-222222222222'),
  1,
  'an identical retry does not create a duplicate'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select lives_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 0, 1)$sql$,
    (select league_id from prediction_fixture)),
  'a second active member saves an independent prediction'
);
select results_eq(
  $$select predicted_outcome::text from public.predictions
    where match_id = '51000000-0000-4000-8000-000000000001'$$,
  $$values ('AWAY'::text)$$,
  'the second owner sees their generated AWAY outcome before kickoff'
);
reset role;

-- Completed and archived leagues remain readable but reject new prediction writes.
update public.leagues
set status = 'completed'
where id = (select league_id from prediction_fixture);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000009', 1, 1)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'STATE_CONFLICT',
  'an active member cannot save in a completed league'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000001'),
  1,
  'a completed league preserves the owner existing prediction for reading'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000009', 1, 1)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'FORBIDDEN',
  'league lifecycle errors stay opaque to a non-member'
);
reset role;

update public.leagues
set status = 'archived'
where id = (select league_id from prediction_fixture);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000009', 1, 1)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'STATE_CONFLICT',
  'an active member cannot save in an archived league'
);
reset role;

update public.leagues
set status = 'active'
where id = (select league_id from prediction_fixture);

-- Before kickoff, each active member sees only their own row, with zero rows for another ID.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000001'),
  1,
  'an active member sees only their own pre-kickoff prediction'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000001'
     and user_id = 'a3333333-3333-4333-8333-333333333333'),
  0,
  'a filtered read of another member before kickoff returns zero rows'
);

-- Score validation and exact lock boundary use transaction-stable PostgreSQL now().
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', -1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'VALIDATION_ERROR', 'negative scores are rejected'
);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 31, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'VALIDATION_ERROR', 'scores above 30 are rejected'
);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 1.5, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'VALIDATION_ERROR', 'fractional numeric scores are rejected before the smallint cast'
);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000002', 3, 2)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'PREDICTION_LOCKED', 'an update at exactly kickoff is denied'
);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000003', 3, 2)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'PREDICTION_LOCKED', 'an update after kickoff is denied'
);
select lives_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000008', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'a kickoff at transaction now plus one second remains writable without sleeping'
);

select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000002', 1, 1)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'PREDICTION_LOCKED', 'a new insert at exactly kickoff is denied'
);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000003', 1, 1)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'PREDICTION_LOCKED', 'a new insert after kickoff is denied'
);
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

-- Safe status composition: only scheduled/postponed before kickoff are writable.
select lives_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000004', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'postponed with a future kickoff is writable'
);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000005', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'PREDICTION_LOCKED', 'canceled is not writable even with a future kickoff'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000005'),
  1,
  'a canceled match preserves the owner existing prediction for viewing'
);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000006', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'PREDICTION_LOCKED', 'live is not writable even with a future kickoff'
);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000007', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'PREDICTION_LOCKED', 'finished is not writable even with a future kickoff'
);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '52000000-0000-4000-8000-000000000001', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'FORBIDDEN', 'a cross-season match is denied'
);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 1, 0)$sql$,
    (select other_league_id from prediction_fixture)),
  'P0001', 'FORBIDDEN', 'a member cannot substitute another league ID'
);

-- Direct Data API writes cannot bypass actor, lock, or generated fields.
select throws_ok(
  format($sql$insert into public.predictions (
      league_id, match_id, user_id, predicted_home_score, predicted_away_score
    ) values (%L::uuid, '51000000-0000-4000-8000-000000000009',
      'a2222222-2222-4222-8222-222222222222', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  '42501', null, 'authenticated cannot insert directly even as the claimed owner'
);
select throws_ok(
  $$update public.predictions set predicted_home_score = 7
    where match_id = '51000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'authenticated cannot update directly before or after lock'
);
select throws_ok(
  $$delete from public.predictions
    where match_id = '51000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'authenticated cannot delete predictions'
);
reset role;

-- Constraints/triggers hold for privileged writes and parent-season changes.
select throws_ok(
  format($sql$insert into public.predictions (
      league_id, match_id, user_id, predicted_home_score, predicted_away_score
    ) values (%L::uuid, '52000000-0000-4000-8000-000000000001',
      'a2222222-2222-4222-8222-222222222222', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'PREDICTION_SEASON_MISMATCH',
  'privileged cross-season insertion is rejected by the consistency trigger'
);
select throws_ok(
  format($sql$insert into public.predictions (
      league_id, match_id, user_id, predicted_home_score, predicted_away_score
    ) values (%L::uuid, '51000000-0000-4000-8000-000000000001',
      'a2222222-2222-4222-8222-222222222222', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  '23505', null, 'the unique constraint rejects a privileged duplicate'
);
select throws_ok(
  format($sql$update public.leagues set season_id = '27000000-0000-4000-8000-000000000027'
    where id = %L::uuid$sql$, (select league_id from prediction_fixture)),
  'P0001', 'PREDICTION_SEASON_MISMATCH',
  'a league with predictions cannot be moved to another season'
);
select throws_ok(
  $$update public.matches set season_id = '27000000-0000-4000-8000-000000000027'
    where id = '51000000-0000-4000-8000-000000000001'$$,
  'P0001', 'PREDICTION_SEASON_MISMATCH',
  'a match with predictions cannot be moved to another season'
);

-- Pending, rejected, removed, unrelated, and other-league users are all denied.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'FORBIDDEN', 'a non-member cannot save'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000003'),
  0,
  'a non-member reads zero rows after kickoff'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a6666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'FORBIDDEN', 'a pending-proof requester cannot save'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000003'),
  0,
  'a pending-proof requester reads zero rows after kickoff'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a7777777-7777-4777-8777-777777777777","role":"authenticated"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'FORBIDDEN', 'a pending-approval requester cannot save'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000003'),
  0,
  'a pending-approval requester reads zero rows after kickoff'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a8888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'FORBIDDEN', 'a rejected requester cannot save'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000003'),
  0,
  'a rejected requester reads zero rows after kickoff'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a5555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'FORBIDDEN', 'a removed member cannot save'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000003'),
  0,
  'a removed member reads zero rows after kickoff'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a9999999-9999-4999-8999-999999999999","role":"authenticated"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000001', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'FORBIDDEN', 'a member of another league cannot save in this league'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000003'),
  0,
  'a member of another league reads zero rows in this league after kickoff'
);
reset role;

-- At/after kickoff, active same-league members see all active-member rows; outsiders see zero.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000002'),
  2,
  'same-league active members see both predictions at the exact kickoff boundary'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000003'),
  2,
  'same-league active members see both predictions after kickoff'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000003'),
  0,
  'an outsider sees zero rows after kickoff'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a5555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)
     and match_id = '51000000-0000-4000-8000-000000000003'),
  0,
  'a removed member sees zero rows after kickoff'
);
reset role;

-- Removing an owner immediately removes both own and revealed visibility.
update public.league_members
set status = 'removed',
    removed_by = 'a1111111-1111-4111-8111-111111111111',
    removed_at = clock_timestamp()
where league_id = (select league_id from prediction_fixture)
  and user_id = 'a3333333-3333-4333-8333-333333333333';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.predictions
   where league_id = (select league_id from prediction_fixture)),
  0,
  'a removed prediction owner loses all prediction visibility'
);
reset role;

-- Late approval adds no retroactive write exception: past denied, future allowed.
insert into public.league_members (
  league_id, user_id, status, approved_by, approved_at
)
values (
  (select league_id from prediction_fixture),
  'abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'active',
  'a1111111-1111-4111-8111-111111111111',
  clock_timestamp()
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"abbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000003', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'PREDICTION_LOCKED', 'a late joiner cannot predict a past match'
);
select lives_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000009', 1, 0)$sql$,
    (select league_id from prediction_fixture)),
  'a late joiner can predict a future match'
);
reset role;

-- Stale RPC replay is rejected after the database moves the fixture to kickoff.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select lives_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000009', 2, 1)$sql$,
    (select league_id from prediction_fixture)),
  'an active member saves the stale-tab fixture before lock'
);
reset role;
update public.matches
set kickoff_at = now()
where id = '51000000-0000-4000-8000-000000000009';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  format($sql$select * from public.save_prediction(%L::uuid, '51000000-0000-4000-8000-000000000009', 3, 2)$sql$,
    (select league_id from prediction_fixture)),
  'P0001', 'PREDICTION_LOCKED', 'an RPC replay from a stale tab is rejected after lock'
);
reset role;

select ok(
  not exists (
    select 1
    from public.predictions
    where points <> 0
       or is_exact is not null
       or is_correct_outcome is not null
       or scored_at is not null
       or scored_result_version is not null
       or scored_rule_version is not null
  ),
  'Slice 5 saves leave points at zero and all Slice 6 scoring metadata null'
);

select * from finish();
rollback;
