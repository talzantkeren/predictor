begin;

select no_plan();

-- Slice 6 schema and least-privilege boundaries.
select ok(
  to_regclass('public.system_admins') is not null,
  'system_admins is available for manual-result authorization'
);
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'system_admins'
  ),
  'user_id,granted_by,granted_at,automation_purpose',
  'system_admins is the minimal documented table'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.system_admins'::regclass),
  'system_admins has RLS enabled'
);
select is(
  (select count(*)::integer from pg_policy where polrelid = 'public.system_admins'::regclass),
  0,
  'system_admins exposes no direct row policy'
);
select ok(
  not has_table_privilege('anon', 'public.system_admins', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.system_admins', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.system_admins', 'SELECT,INSERT,UPDATE,DELETE'),
  'no Data API role has direct system_admins CRUD'
);

select ok(
  to_regprocedure('public.is_system_admin()') is not null
  and to_regprocedure(
    'public.score_match(uuid,public.match_status,numeric,numeric,boolean,text)'
  ) is not null,
  'system-admin and atomic scoring RPCs exist'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.is_system_admin()'::regprocedure)
  and (select array_to_string(proconfig, ',') from pg_proc
       where oid = 'public.is_system_admin()'::regprocedure) = 'search_path=""'
  and (select prosecdef from pg_proc where oid =
       'public.score_match(uuid,public.match_status,numeric,numeric,boolean,text)'::regprocedure)
  and (select array_to_string(proconfig, ',') from pg_proc where oid =
       'public.score_match(uuid,public.match_status,numeric,numeric,boolean,text)'::regprocedure) = 'search_path=""',
  'Slice 6 privileged RPCs are security definer with empty search paths'
);
select ok(
  has_function_privilege('authenticated', 'public.is_system_admin()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.is_system_admin()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.is_system_admin()', 'EXECUTE'),
  'only authenticated callers can ask for their own system-admin status'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.score_match(uuid,public.match_status,numeric,numeric,boolean,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.score_match(uuid,public.match_status,numeric,numeric,boolean,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.score_match(uuid,public.match_status,numeric,numeric,boolean,text)',
    'EXECUTE'
  ),
  'score_match execution is service-role only'
);

select ok(
  to_regclass('public.league_leaderboard') is not null
  and (select relkind = 'v' from pg_class where oid = 'public.league_leaderboard'::regclass),
  'league_leaderboard is a view rather than duplicated state'
);
select ok(
  coalesce(
    (select reloptions @> array['security_invoker=true']
     from pg_class where oid = 'public.league_leaderboard'::regclass),
    false
  ),
  'league_leaderboard uses security_invoker'
);
select is(
  (
    select string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'league_leaderboard'
  ),
  'league_id,user_id,display_name,total_points,correct_outcomes,exact_scores,predictions_submitted,rank',
  'leaderboard exposes only identity, display, aggregate, and competition-rank columns'
);
select ok(
  has_table_privilege('authenticated', 'public.league_leaderboard', 'SELECT')
  and not has_table_privilege('anon', 'public.league_leaderboard', 'SELECT')
  and not has_table_privilege('service_role', 'public.league_leaderboard', 'SELECT'),
  'leaderboard is authenticated read-only and keeps privileged reads behind user RLS'
);
select ok(
  position('rank() over' in lower(pg_get_viewdef('public.league_leaderboard'::regclass, true))) > 0
  and position('dense_rank' in lower(pg_get_viewdef('public.league_leaderboard'::regclass, true))) = 0,
  'leaderboard uses rank and never dense_rank'
);

-- Real concurrent sessions prove that score_match does not introduce the
-- reverse matches -> leagues lock edge. A third session holds the audit actor
-- row after scoring owns the match, so save_prediction acquires league/member
-- locks and waits on that match. Releasing audit must let scoring finish without
-- requesting a league lock.
create extension if not exists dblink with schema extensions;

select is(
  extensions.dblink_connect(
    'slice6_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'concurrency control connection opens against disposable local Supabase'
);
select is(
  extensions.dblink_exec('slice6_control', $remote$
    begin;
    delete from public.audit_logs
      where entity_type = 'match_result'
        and entity_id = 'c6000000-0000-4000-8000-000000000001'::uuid;
    delete from public.predictions
      where match_id = 'c6000000-0000-4000-8000-000000000001'::uuid;
    delete from public.system_admins
      where user_id = 'c6111111-1111-4111-8111-111111111111'::uuid;
    delete from public.league_members
      where league_id = 'c6000000-0000-4000-8000-000000000010'::uuid;
    delete from public.league_scoring_rules
      where league_id = 'c6000000-0000-4000-8000-000000000010'::uuid;
    delete from public.leagues
      where id = 'c6000000-0000-4000-8000-000000000010'::uuid;
    delete from public.matches
      where id = 'c6000000-0000-4000-8000-000000000001'::uuid;
    delete from public.teams
      where id in (
        'c6000000-0000-4000-8000-000000000101'::uuid,
        'c6000000-0000-4000-8000-000000000102'::uuid
      );
    delete from public.seasons
      where id = 'c6000000-0000-4000-8000-000000000027'::uuid;
    delete from public.competitions
      where id = 'c6000000-0000-4000-8000-000000000020'::uuid;
    delete from auth.users
      where id in (
        'c6111111-1111-4111-8111-111111111111'::uuid,
        'c6222222-2222-4222-8222-222222222222'::uuid
      );

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
      ('00000000-0000-0000-0000-000000000000', 'c6111111-1111-4111-8111-111111111111',
       'authenticated', 'authenticated', 'slice6-concurrency-admin@example.com', crypt('password123', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{"display_name":"מנהל מקביליות"}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', 'c6222222-2222-4222-8222-222222222222',
       'authenticated', 'authenticated', 'slice6-concurrency-member@example.com', crypt('password123', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{"display_name":"חבר מקביליות"}', now(), now());
    insert into public.competitions (id, name, slug, country_code)
    values ('c6000000-0000-4000-8000-000000000020', 'תחרות מקביליות', 'slice6-concurrency', 'IL');
    insert into public.seasons (id, competition_id, name, starts_on, ends_on, is_current)
    values (
      'c6000000-0000-4000-8000-000000000027',
      'c6000000-0000-4000-8000-000000000020',
      '2030/31', '2030-07-01', '2031-06-30', false
    );
    insert into public.teams (id, name, short_name) values
      ('c6000000-0000-4000-8000-000000000101', 'בית מקביליות', 'בית'),
      ('c6000000-0000-4000-8000-000000000102', 'חוץ מקביליות', 'חוץ');
    insert into public.matches (
      id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status
    ) values (
      'c6000000-0000-4000-8000-000000000001',
      'c6000000-0000-4000-8000-000000000027',
      1,
      'c6000000-0000-4000-8000-000000000101',
      'c6000000-0000-4000-8000-000000000102',
      now() - interval '1 minute',
      'scheduled'
    );
    insert into public.leagues (
      id, manager_id, season_id, name, status
    ) values (
      'c6000000-0000-4000-8000-000000000010',
      'c6111111-1111-4111-8111-111111111111',
      'c6000000-0000-4000-8000-000000000027',
      'ליגת מקביליות Slice 6',
      'active'
    );
    insert into public.league_scoring_rules (
      league_id, exact_points, correct_outcome_points, incorrect_points
    ) values ('c6000000-0000-4000-8000-000000000010', 3, 1, 0);
    insert into public.league_members (
      league_id, user_id, status, approved_by, approved_at
    ) values
      ('c6000000-0000-4000-8000-000000000010', 'c6111111-1111-4111-8111-111111111111', 'active',
       'c6111111-1111-4111-8111-111111111111', now()),
      ('c6000000-0000-4000-8000-000000000010', 'c6222222-2222-4222-8222-222222222222', 'active',
       'c6111111-1111-4111-8111-111111111111', now());
    insert into public.system_admins (user_id, granted_by)
    values ('c6111111-1111-4111-8111-111111111111', 'c6111111-1111-4111-8111-111111111111');
    insert into public.predictions (
      league_id, match_id, user_id, predicted_home_score, predicted_away_score
    ) values (
      'c6000000-0000-4000-8000-000000000010',
      'c6000000-0000-4000-8000-000000000001',
      'c6222222-2222-4222-8222-222222222222',
      1, 0
    );

    commit;
  $remote$),
  'COMMIT',
  'isolated concurrency fixture is installed'
);
select is(
  extensions.dblink_connect(
    'slice6_score',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'concurrent scoring connection opens'
);
select is(
  extensions.dblink_connect(
    'slice6_save',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'concurrent prediction connection opens'
);
select is(
  extensions.dblink_exec('slice6_score', $remote$
    set statement_timeout = '5s';
    set lock_timeout = '3s';
    set role service_role;
    set request.headers = '{"x-predictor-system-actor":"c6111111-1111-4111-8111-111111111111"}';
  $remote$),
  'SET',
  'scoring connection receives only the fixed system-actor context'
);
select is(
  extensions.dblink_exec('slice6_save', $remote$
    set statement_timeout = '5s';
    set lock_timeout = '3s';
    set role authenticated;
    set request.jwt.claims = '{"sub":"c6222222-2222-4222-8222-222222222222","role":"authenticated"}';
  $remote$),
  'SET',
  'prediction connection receives an authenticated member context'
);
create temp table slice6_concurrency_backends (
  operation text primary key,
  backend_pid integer not null
);
insert into slice6_concurrency_backends (operation, backend_pid)
select 'score', backend.pid
from extensions.dblink(
  'slice6_score',
  'select pg_catalog.pg_backend_pid()'
) as backend(pid integer);
insert into slice6_concurrency_backends (operation, backend_pid)
select 'save', backend.pid
from extensions.dblink(
  'slice6_save',
  'select pg_catalog.pg_backend_pid()'
) as backend(pid integer);
select is(
  extensions.dblink_exec('slice6_control', $remote$
    begin;
    set statement_timeout = '5s';
    do $lock$
    begin
      perform 1
      from auth.users
      where id = 'c6111111-1111-4111-8111-111111111111'::uuid
      for update;
    end;
    $lock$;
  $remote$),
  'DO',
  'control connection holds the audit actor row after fixture setup'
);
select is(
  extensions.dblink_send_query('slice6_score', $remote$
    select 'score-ok'::text
    from public.score_match(
      'c6000000-0000-4000-8000-000000000001',
      'finished', 2, 1, true, 'manual'
    )
  $remote$),
  1,
  'score_match starts asynchronously'
);
select lives_ok(
  $wait$
    do $$
    declare
      v_attempt integer := 0;
    begin
      loop
        exit when exists (
          select 1
          from pg_catalog.pg_stat_activity as activity
          join slice6_concurrency_backends as backend
            on backend.operation = 'score'
           and backend.backend_pid = activity.pid
          where activity.wait_event_type = 'Lock'
        );
        v_attempt := v_attempt + 1;
        if v_attempt >= 100 then
          raise exception 'scoring session did not reach its controlled lock wait';
        end if;
        perform pg_catalog.pg_sleep(0.02);
      end loop;
    end;
    $$
  $wait$,
  'score_match owns the match before reaching the controlled audit lock wait'
);
select is(
  extensions.dblink_send_query('slice6_save', $remote$
    select 'save-ok'::text
    from public.save_prediction(
      'c6000000-0000-4000-8000-000000000010',
      'c6000000-0000-4000-8000-000000000001',
      2, 1
    )
  $remote$),
  1,
  'save_prediction starts while score_match owns the match row'
);
select lives_ok(
  $wait$
    do $$
    declare
      v_attempt integer := 0;
    begin
      loop
        exit when exists (
          select 1
          from pg_catalog.pg_stat_activity as activity
          join slice6_concurrency_backends as backend
            on backend.operation = 'save'
           and backend.backend_pid = activity.pid
          where activity.wait_event_type = 'Lock'
        );
        v_attempt := v_attempt + 1;
        if v_attempt >= 100 then
          raise exception 'prediction session did not reach the match lock wait';
        end if;
        perform pg_catalog.pg_sleep(0.02);
      end loop;
    end;
    $$
  $wait$,
  'save_prediction waits on the match while scoring holds it'
);
select is(
  extensions.dblink_exec('slice6_control', 'commit'),
  'COMMIT',
  'releasing the audit actor lets scoring and then prediction save resolve'
);

create temp table slice6_concurrency_results (
  operation text primary key,
  result_text text,
  error_text text
);
insert into slice6_concurrency_results (operation, result_text)
select 'score', result.value
from extensions.dblink_get_result('slice6_score', false) as result(value text);
update slice6_concurrency_results
set error_text = extensions.dblink_error_message('slice6_score')
where operation = 'score';
insert into slice6_concurrency_results (operation, result_text)
select 'save', result.value
from extensions.dblink_get_result('slice6_save', false) as result(value text)
on conflict (operation) do update set result_text = excluded.result_text;
insert into slice6_concurrency_results (operation, error_text)
values ('save', null)
on conflict (operation) do nothing;
update slice6_concurrency_results
set error_text = extensions.dblink_error_message('slice6_save')
where operation = 'save';

select is(
  (select result_text from slice6_concurrency_results where operation = 'score'),
  'score-ok',
  'score_match completes while save_prediction waits on the match'
);
select is(
  (select error_text from slice6_concurrency_results where operation = 'score'),
  'OK',
  'concurrent scoring reports no lock or deadlock error'
);
select ok(
  (select error_text = 'OK' or position('PREDICTION_LOCKED' in error_text) > 0
   from slice6_concurrency_results where operation = 'save')
  and not exists (
    select 1
    from slice6_concurrency_results
    where lower(coalesce(error_text, '')) like '%deadlock%'
       or lower(coalesce(error_text, '')) like '%lock timeout%'
  ),
  'the concurrent save resolves normally or observes the finished match, never a deadlock'
);
select is(
  (select result_version from public.matches
   where id = 'c6000000-0000-4000-8000-000000000001'),
  1,
  'the concurrent result commits exactly once'
);

select is(
  extensions.dblink_exec('slice6_control', $remote$
    begin;
    delete from public.audit_logs
      where entity_type = 'match_result'
        and entity_id = 'c6000000-0000-4000-8000-000000000001'::uuid;
    delete from public.predictions
      where match_id = 'c6000000-0000-4000-8000-000000000001'::uuid;
    delete from public.system_admins
      where user_id = 'c6111111-1111-4111-8111-111111111111'::uuid;
    delete from public.league_members
      where league_id = 'c6000000-0000-4000-8000-000000000010'::uuid;
    delete from public.league_scoring_rules
      where league_id = 'c6000000-0000-4000-8000-000000000010'::uuid;
    delete from public.leagues
      where id = 'c6000000-0000-4000-8000-000000000010'::uuid;
    delete from public.matches
      where id = 'c6000000-0000-4000-8000-000000000001'::uuid;
    delete from public.teams
      where id in (
        'c6000000-0000-4000-8000-000000000101'::uuid,
        'c6000000-0000-4000-8000-000000000102'::uuid
      );
    delete from public.seasons
      where id = 'c6000000-0000-4000-8000-000000000027'::uuid;
    delete from public.competitions
      where id = 'c6000000-0000-4000-8000-000000000020'::uuid;
    delete from auth.users
      where id in (
        'c6111111-1111-4111-8111-111111111111'::uuid,
        'c6222222-2222-4222-8222-222222222222'::uuid
      );
    commit;
  $remote$),
  'COMMIT',
  'concurrency fixtures are removed'
);
select is(extensions.dblink_disconnect('slice6_score'), 'OK', 'scoring connection closes');
select is(extensions.dblink_disconnect('slice6_save'), 'OK', 'prediction connection closes');
select is(extensions.dblink_disconnect('slice6_control'), 'OK', 'control connection closes');

-- Transaction-local scoring matrix fixtures.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'b6111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'scoring-admin@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"מנהלת תוצאות"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b6222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'scoring-member-a@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"חברה א"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b6333333-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'scoring-member-b@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"חבר ב"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b6444444-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'scoring-member-c@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"חברה ג"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b6555555-5555-4555-8555-555555555555',
   'authenticated', 'authenticated', 'scoring-outsider@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"משתמש זר"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b6666666-6666-4666-8666-666666666666',
   'authenticated', 'authenticated', 'scoring-zero@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"ללא ניחושים"}', now(), now());

insert into public.system_admins (user_id, granted_by)
values ('b6111111-1111-4111-8111-111111111111', 'b6111111-1111-4111-8111-111111111111');

insert into public.competitions (id, name, slug, country_code)
values ('28000000-0000-4000-8000-000000000001', 'תחרות ניקוד', 'slice6-scoring', 'IL');
insert into public.seasons (id, competition_id, name, starts_on, ends_on, is_current)
values (
  '28000000-0000-4000-8000-000000000027',
  '28000000-0000-4000-8000-000000000001',
  '2028/29', '2028-07-01', '2029-06-30', false
);
insert into public.teams (id, name, short_name)
values
  ('e6000000-0000-4000-8000-000000000001', 'קבוצת ניקוד בית', 'בית'),
  ('e6000000-0000-4000-8000-000000000002', 'קבוצת ניקוד חוץ', 'חוץ');
insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status
)
values
  ('61000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-000000000027', 1,
   'e6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000002',
   now() - interval '2 days', 'scheduled'),
  ('61000000-0000-4000-8000-000000000002', '28000000-0000-4000-8000-000000000027', 2,
    'e6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000002',
    now() - interval '1 day', 'scheduled'),
  ('61000000-0000-4000-8000-000000000003', '28000000-0000-4000-8000-000000000027', 3,
    'e6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000002',
    now() + interval '1 day', 'scheduled');

insert into public.leagues (id, manager_id, season_id, name, status)
values
  ('62000000-0000-4000-8000-000000000001', 'b6111111-1111-4111-8111-111111111111',
   '28000000-0000-4000-8000-000000000027', 'ליגת ניקוד רגילה', 'active'),
  ('62000000-0000-4000-8000-000000000002', 'b6111111-1111-4111-8111-111111111111',
   '28000000-0000-4000-8000-000000000027', 'ליגת ניקוד מותאם', 'active'),
  ('62000000-0000-4000-8000-000000000003', 'b6111111-1111-4111-8111-111111111111',
   '28000000-0000-4000-8000-000000000027', 'ליגת שוויון', 'active'),
  ('62000000-0000-4000-8000-000000000004', 'b6555555-5555-4555-8555-555555555555',
   '28000000-0000-4000-8000-000000000027', 'ליגה זרה', 'active');
insert into public.league_scoring_rules (
  league_id, exact_points, correct_outcome_points, incorrect_points
)
values
  ('62000000-0000-4000-8000-000000000001', 3, 1, 0),
  ('62000000-0000-4000-8000-000000000002', 5, 2, 0),
  ('62000000-0000-4000-8000-000000000003', 1, 1, 0),
  ('62000000-0000-4000-8000-000000000004', 3, 1, 0);
insert into public.league_members (
  league_id, user_id, status, approved_by, approved_at
)
values
  ('62000000-0000-4000-8000-000000000001', 'b6111111-1111-4111-8111-111111111111', 'active',
   'b6111111-1111-4111-8111-111111111111', now()),
  ('62000000-0000-4000-8000-000000000001', 'b6222222-2222-4222-8222-222222222222', 'active',
   'b6111111-1111-4111-8111-111111111111', now()),
  ('62000000-0000-4000-8000-000000000001', 'b6333333-3333-4333-8333-333333333333', 'active',
   'b6111111-1111-4111-8111-111111111111', now()),
  ('62000000-0000-4000-8000-000000000001', 'b6444444-4444-4444-8444-444444444444', 'active',
   'b6111111-1111-4111-8111-111111111111', now()),
  ('62000000-0000-4000-8000-000000000001', 'b6666666-6666-4666-8666-666666666666', 'active',
   'b6111111-1111-4111-8111-111111111111', now()),
  ('62000000-0000-4000-8000-000000000002', 'b6111111-1111-4111-8111-111111111111', 'active',
   'b6111111-1111-4111-8111-111111111111', now()),
  ('62000000-0000-4000-8000-000000000002', 'b6222222-2222-4222-8222-222222222222', 'active',
   'b6111111-1111-4111-8111-111111111111', now()),
  ('62000000-0000-4000-8000-000000000003', 'b6222222-2222-4222-8222-222222222222', 'active',
   'b6111111-1111-4111-8111-111111111111', now()),
  ('62000000-0000-4000-8000-000000000003', 'b6333333-3333-4333-8333-333333333333', 'active',
   'b6111111-1111-4111-8111-111111111111', now()),
  ('62000000-0000-4000-8000-000000000003', 'b6444444-4444-4444-8444-444444444444', 'active',
   'b6111111-1111-4111-8111-111111111111', now()),
  ('62000000-0000-4000-8000-000000000004', 'b6555555-5555-4555-8555-555555555555', 'active',
   'b6555555-5555-4555-8555-555555555555', now());

insert into public.predictions (
  league_id, match_id, user_id, predicted_home_score, predicted_away_score
)
values
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001',
   'b6111111-1111-4111-8111-111111111111', 2, 1),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001',
   'b6222222-2222-4222-8222-222222222222', 3, 0),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001',
   'b6333333-3333-4333-8333-333333333333', 0, 1),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001',
   'b6444444-4444-4444-8444-444444444444', 1, 1),
  ('62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000001',
   'b6111111-1111-4111-8111-111111111111', 2, 1),
  ('62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000001',
   'b6222222-2222-4222-8222-222222222222', 3, 0),
  ('62000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000001',
   'b6222222-2222-4222-8222-222222222222', 2, 1),
  ('62000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000001',
   'b6333333-3333-4333-8333-333333333333', 3, 0),
  ('62000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000001',
   'b6444444-4444-4444-8444-444444444444', 0, 1),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002',
   'b6111111-1111-4111-8111-111111111111', 1, 1),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002',
    'b6222222-2222-4222-8222-222222222222', 0, 0),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002',
    'b6333333-3333-4333-8333-333333333333', 2, 1),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003',
    'b6111111-1111-4111-8111-111111111111', 1, 0),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003',
    'b6222222-2222-4222-8222-222222222222', 0, 1);

-- User-facing authorization and direct-RPC denial.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b6111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select is(public.is_system_admin(), true, 'the seeded system administrator sees only their own true status');
select throws_ok(
  $$select * from public.system_admins$$,
  '42501', null,
  'a system administrator cannot read the protected table directly'
);
select throws_ok(
  $$select * from public.score_match(
    '61000000-0000-4000-8000-000000000001', 'finished', 2, 1, true, 'manual'
  )$$,
  '42501', null,
  'authenticated users cannot execute score_match even when they are administrators'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"b6222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select is(public.is_system_admin(), false, 'a normal active member is not a system administrator');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.is_system_admin()$$,
  '42501', null,
  'anon cannot probe system-admin status'
);
select throws_ok(
  $$select * from public.league_leaderboard$$,
  '42501', null,
  'anon cannot read standings'
);
reset role;

set local role service_role;
select set_config('request.headers', '{}', true);
select throws_ok(
  $$select * from public.score_match(
    '61000000-0000-4000-8000-000000000001', 'finished', 2, 1, true, 'manual'
  )$$,
  'P0001', 'FORBIDDEN',
  'service role without the server-owned actor context is rejected'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"b6555555-5555-4555-8555-555555555555"}',
  true
);
select throws_ok(
  $$select * from public.score_match(
    '61000000-0000-4000-8000-000000000001', 'finished', 2, 1, true, 'manual'
  )$$,
  'P0001', 'FORBIDDEN',
  'a non-admin actor cannot be asserted through the privileged gateway'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"b6111111-1111-4111-8111-111111111111"}',
  true
);
select throws_ok(
  $$select * from public.score_match(
    '61000000-0000-4000-8000-000000000001', 'live', 2, 1, true, 'manual'
  )$$,
  'P0001', 'VALIDATION_ERROR',
  'only finished or canceled is accepted'
);
select throws_ok(
  $$select * from public.score_match(
    '61000000-0000-4000-8000-000000000001', 'finished', null, 1, true, 'manual'
  )$$,
  'P0001', 'VALIDATION_ERROR',
  'finished requires both scores'
);
select throws_ok(
  $$select * from public.score_match(
    '61000000-0000-4000-8000-000000000001', 'canceled', 0, 0, true, 'manual'
  )$$,
  'P0001', 'VALIDATION_ERROR',
  'canceled rejects supplied scores'
);
select throws_ok(
  $$select * from public.score_match(
    '61000000-0000-4000-8000-000000000001', 'finished', 1.5, 0, true, 'manual'
  )$$,
  'P0001', 'VALIDATION_ERROR',
  'fractional results are rejected'
);
select throws_ok(
  $$select * from public.score_match(
    '61000000-0000-4000-8000-000000000001', 'finished', 2, 1, true, 'manual input'
  )$$,
  'P0001', 'VALIDATION_ERROR',
  'audit source uses a constrained machine-readable value'
);
select throws_ok(
  $$select * from public.score_match(
    '61000000-0000-4000-8000-000000000003', 'finished', 2, 1, true, 'manual'
  )$$,
  'P0001', 'MATCH_NOT_STARTED',
  'a finished result is rejected before the database kickoff time'
);
reset role;
select results_eq(
  $$select status::text, home_score, away_score, result_version
    from public.matches
    where id = '61000000-0000-4000-8000-000000000003'$$,
  $$values ('scheduled'::text, null::smallint, null::smallint, 0)$$,
  'a premature result rejection leaves the match unchanged'
);
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"b6111111-1111-4111-8111-111111111111"}',
  true
);

-- Home, exact, wrong, custom rules, and initial metadata.
select results_eq(
  $$select result_version, result_changed, predictions_scored
    from public.score_match(
      '61000000-0000-4000-8000-000000000001', 'finished', 2, 1, true, 'manual'
    )$$,
  $$values (1, true, 9)$$,
  'the first result advances the version and scores all league predictions once'
);
reset role;
select results_eq(
  $$select user_id, points, is_exact, is_correct_outcome,
           scored_result_version, scored_rule_version
    from public.predictions
    where league_id = '62000000-0000-4000-8000-000000000001'
      and match_id = '61000000-0000-4000-8000-000000000001'
    order by user_id$$,
  $$values
    ('b6111111-1111-4111-8111-111111111111'::uuid, 3::smallint, true, true, 1, 1),
    ('b6222222-2222-4222-8222-222222222222'::uuid, 1::smallint, false, true, 1, 1),
    ('b6333333-3333-4333-8333-333333333333'::uuid, 0::smallint, false, false, 1, 1),
    ('b6444444-4444-4444-8444-444444444444'::uuid, 0::smallint, false, false, 1, 1)$$,
  'default 3/1/0 scoring covers exact, HOME, and wrong outcomes'
);
select results_eq(
  $$select user_id, points, is_exact, is_correct_outcome
    from public.predictions
    where league_id = '62000000-0000-4000-8000-000000000002'
      and match_id = '61000000-0000-4000-8000-000000000001'
    order by user_id$$,
  $$values
    ('b6111111-1111-4111-8111-111111111111'::uuid, 5::smallint, true, true),
    ('b6222222-2222-4222-8222-222222222222'::uuid, 2::smallint, false, true)$$,
  'the same match and predictions receive different points under another league ruleset'
);

-- DRAW is first-class, including a non-exact correct draw.
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"b6111111-1111-4111-8111-111111111111"}',
  true
);
select results_eq(
  $$select result_version, result_changed, predictions_scored
    from public.score_match(
      '61000000-0000-4000-8000-000000000002', 'finished', 1, 1, true, 'manual'
    )$$,
  $$values (1, true, 3)$$,
  'the draw result scores its submitted predictions'
);
reset role;
select results_eq(
  $$select user_id, points, is_exact, is_correct_outcome
    from public.predictions
    where league_id = '62000000-0000-4000-8000-000000000001'
      and match_id = '61000000-0000-4000-8000-000000000002'
    order by user_id$$,
  $$values
    ('b6111111-1111-4111-8111-111111111111'::uuid, 3::smallint, true, true),
    ('b6222222-2222-4222-8222-222222222222'::uuid, 1::smallint, false, true),
    ('b6333333-3333-4333-8333-333333333333'::uuid, 0::smallint, false, false)$$,
  'DRAW exact, DRAW direction, and wrong result are distinguished'
);

-- Competition ranking: exact_scores is display-only and a zero-prediction
-- active member is retained through the member-first LEFT JOIN.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b6222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select results_eq(
  $$select user_id, total_points, correct_outcomes, exact_scores,
           predictions_submitted, rank
    from public.league_leaderboard
    where league_id = '62000000-0000-4000-8000-000000000003'
    order by user_id$$,
  $$values
    ('b6222222-2222-4222-8222-222222222222'::uuid, 1::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint),
    ('b6333333-3333-4333-8333-333333333333'::uuid, 1::bigint, 1::bigint, 0::bigint, 1::bigint, 1::bigint),
    ('b6444444-4444-4444-8444-444444444444'::uuid, 0::bigint, 0::bigint, 0::bigint, 1::bigint, 3::bigint)$$,
  'equal points and outcomes share rank 1 despite different exact counts, then rank 3 follows'
);
select results_eq(
  $$select total_points, correct_outcomes, exact_scores, predictions_submitted, rank
    from public.league_leaderboard
    where league_id = '62000000-0000-4000-8000-000000000001'
      and user_id = 'b6666666-6666-4666-8666-666666666666'$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint, 3::bigint)$$,
  'an active member without a prediction appears with zero aggregates'
);
select results_eq(
  $$select user_id, predictions_submitted
    from public.league_leaderboard
    where league_id = '62000000-0000-4000-8000-000000000001'
      and user_id in (
        'b6111111-1111-4111-8111-111111111111'::uuid,
        'b6222222-2222-4222-8222-222222222222'::uuid
      )
    order by user_id$$,
  $$values
    ('b6111111-1111-4111-8111-111111111111'::uuid, 2::bigint),
    ('b6222222-2222-4222-8222-222222222222'::uuid, 2::bigint)$$,
  'submission counts exclude every pre-kickoff prediction, including the viewer own row'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b6555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.league_leaderboard
   where league_id = '62000000-0000-4000-8000-000000000001'),
  0,
  'a member of another league reads no foreign standings rows'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b6111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.league_leaderboard
   where league_id = '62000000-0000-4000-8000-000000000004'),
  0,
  'system-admin status alone does not bypass league standings RLS'
);
reset role;

-- Idempotent retry preserves all prediction fields, timestamps, version, and audit count.
create temp table slice6_retry_snapshot as
select id, points, is_exact, is_correct_outcome, scored_at,
       scored_result_version, scored_rule_version, updated_at
from public.predictions
where match_id = '61000000-0000-4000-8000-000000000001';
create temp table slice6_retry_audit_snapshot as
select count(*)::integer as audit_count
from public.audit_logs
where entity_type = 'match_result'
  and entity_id = '61000000-0000-4000-8000-000000000001';

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"b6111111-1111-4111-8111-111111111111"}',
  true
);
select results_eq(
  $$select result_version, result_changed, predictions_scored
    from public.score_match(
      '61000000-0000-4000-8000-000000000001', 'finished', 2, 1, true, 'manual'
    )$$,
  $$values (1, false, 0)$$,
  'an identical result and rule-version retry performs no scoring writes'
);
reset role;
select results_eq(
  $$select id, points, is_exact, is_correct_outcome, scored_at,
           scored_result_version, scored_rule_version, updated_at
    from public.predictions
    where match_id = '61000000-0000-4000-8000-000000000001'
    order by id$$,
  $$select id, points, is_exact, is_correct_outcome, scored_at,
           scored_result_version, scored_rule_version, updated_at
    from slice6_retry_snapshot
    order by id$$,
  'retry preserves points, flags, versions, scored_at, and updated_at exactly'
);
select is(
  (select count(*)::integer from public.audit_logs
   where entity_type = 'match_result'
     and entity_id = '61000000-0000-4000-8000-000000000001'),
  (select audit_count from slice6_retry_audit_snapshot),
  'an identical retry does not duplicate audit history'
);

-- Correcting HOME to AWAY overwrites rather than increments every league row.
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"b6111111-1111-4111-8111-111111111111"}',
  true
);
select results_eq(
  $$select result_version, result_changed, predictions_scored
    from public.score_match(
      '61000000-0000-4000-8000-000000000001', 'finished', 0, 1, true, 'manual'
    )$$,
  $$values (2, true, 9)$$,
  'a corrected result advances the version and recalculates every prediction'
);
reset role;
select results_eq(
  $$select user_id, points, is_exact, is_correct_outcome, scored_result_version
    from public.predictions
    where league_id = '62000000-0000-4000-8000-000000000001'
      and match_id = '61000000-0000-4000-8000-000000000001'
    order by user_id$$,
  $$values
    ('b6111111-1111-4111-8111-111111111111'::uuid, 0::smallint, false, false, 2),
    ('b6222222-2222-4222-8222-222222222222'::uuid, 0::smallint, false, false, 2),
    ('b6333333-3333-4333-8333-333333333333'::uuid, 3::smallint, true, true, 2),
    ('b6444444-4444-4444-8444-444444444444'::uuid, 0::smallint, false, false, 2)$$,
  'AWAY correction replaces prior HOME points and flags without accumulation'
);
select is(
  (select points from public.predictions
   where league_id = '62000000-0000-4000-8000-000000000001'
     and match_id = '61000000-0000-4000-8000-000000000002'
     and user_id = 'b6111111-1111-4111-8111-111111111111'),
  3::smallint,
  'correcting one match leaves another match scoring untouched'
);

-- Cancellation keeps rows but overwrites every relevant score to zero/false.
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"b6111111-1111-4111-8111-111111111111"}',
  true
);
select results_eq(
  $$select result_version, result_changed, predictions_scored
    from public.score_match(
      '61000000-0000-4000-8000-000000000001', 'canceled', null, null, true, 'manual'
    )$$,
  $$values (3, true, 9)$$,
  'cancellation advances the result and rewrites all relevant predictions'
);
reset role;
select is(
  (select count(*)::integer from public.predictions
   where match_id = '61000000-0000-4000-8000-000000000001'),
  9,
  'cancellation never deletes a prediction'
);
select is(
  (select count(*)::integer from public.predictions
   where match_id = '61000000-0000-4000-8000-000000000001'
     and points = 0
     and is_exact is false
     and is_correct_outcome is false
     and scored_result_version = 3
     and scored_rule_version = 1),
  9,
  'cancellation stores zero points, false flags, and current scoring metadata'
);
select results_eq(
  $$select status::text, home_score, away_score, result_version, is_manually_overridden
    from public.matches
    where id = '61000000-0000-4000-8000-000000000001'$$,
  $$values ('canceled'::text, null::smallint, null::smallint, 3, true)$$,
  'canceled result state has no scores and retains the manual override marker'
);

create temp table slice6_cancel_retry_snapshot as
select id, points, is_exact, is_correct_outcome, scored_at,
       scored_result_version, scored_rule_version, updated_at
from public.predictions
where match_id = '61000000-0000-4000-8000-000000000001';
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"b6111111-1111-4111-8111-111111111111"}',
  true
);
select results_eq(
  $$select result_version, result_changed, predictions_scored
    from public.score_match(
      '61000000-0000-4000-8000-000000000001', 'canceled', null, null, true, 'manual'
    )$$,
  $$values (3, false, 0)$$,
  'a cancellation retry is also idempotent'
);
reset role;
select results_eq(
  $$select id, points, is_exact, is_correct_outcome, scored_at,
           scored_result_version, scored_rule_version, updated_at
    from public.predictions
    where match_id = '61000000-0000-4000-8000-000000000001'
    order by id$$,
  $$select id, points, is_exact, is_correct_outcome, scored_at,
           scored_result_version, scored_rule_version, updated_at
    from slice6_cancel_retry_snapshot
    order by id$$,
  'cancellation retry preserves the overwritten state byte-for-byte at column level'
);

select is(
  (select count(*)::integer from public.audit_logs
   where entity_type = 'match_result'
     and entity_id = '61000000-0000-4000-8000-000000000001'),
  3,
  'apply, correction, and cancellation each produce one audit row while retries do not'
);
select ok(
  not exists (
    select 1
    from public.audit_logs
    where entity_type = 'match_result'
      and (
        metadata ? 'request_headers'
        or metadata ? 'system_actor'
        or metadata::text like '%x-predictor-system-actor%'
      )
  ),
  'audit metadata contains no internal actor header or request context'
);

select * from finish();
rollback;
