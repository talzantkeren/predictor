-- These committed dblink sessions are intentional. Row/advisory behavior
-- cannot be established by two calls inside one pgTAP transaction.
begin;

select no_plan();

create extension if not exists dblink with schema extensions;

create function pg_temp.wait_for_remote_lock(p_backend_pid integer)
returns boolean
language plpgsql
as $$
declare
  v_attempt integer := 0;
begin
  loop
    if exists (
      select 1
      from pg_catalog.pg_stat_activity as activity
      where activity.pid = p_backend_pid
        and activity.wait_event_type = 'Lock'
    ) then
      return true;
    end if;

    v_attempt := v_attempt + 1;
    if v_attempt >= 300 then
      return false;
    end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
end;
$$;

create function pg_temp.wait_for_remote_completion(p_connection_name text)
returns boolean
language plpgsql
as $$
declare
  v_attempt integer := 0;
begin
  loop
    if extensions.dblink_is_busy(p_connection_name) = 0 then
      return true;
    end if;

    v_attempt := v_attempt + 1;
    if v_attempt >= 100 then
      return false;
    end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
end;
$$;

create function pg_temp.wait_until_after(p_boundary timestamptz)
returns void
language plpgsql
as $$
begin
  if p_boundary > clock_timestamp() + interval '5 seconds' then
    raise exception 'test boundary is unexpectedly far in the future';
  end if;

  while clock_timestamp() <= p_boundary + interval '50 milliseconds' loop
    perform pg_catalog.pg_sleep(0.01);
  end loop;
end;
$$;

select is(
  extensions.dblink_connect(
    'settings_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the committed fixture control connection opens'
);
select is(
  extensions.dblink_connect(
    'settings_first',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the first authenticated settings connection opens'
);
select is(
  extensions.dblink_connect(
    'settings_second',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the second authenticated settings connection opens'
);
select is(
  extensions.dblink_connect(
    'settings_fixture',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the independent fixture writer connection opens'
);

select is(
  extensions.dblink_exec('settings_control', $remote$
    delete from public.audit_logs
    where entity_id in (
      'd9710000-0000-4000-8000-000000000201',
      'd9710000-0000-4000-8000-000000000202',
      'd9710000-0000-4000-8000-000000000203',
      'd9710000-0000-4000-8000-000000000204'
    );
    delete from public.matches
    where id between
      'd9710000-0000-4000-8000-000000000301'
      and 'd9710000-0000-4000-8000-000000000304';
    delete from public.prize_rules
    where league_id in (
      'd9710000-0000-4000-8000-000000000201',
      'd9710000-0000-4000-8000-000000000202',
      'd9710000-0000-4000-8000-000000000203',
      'd9710000-0000-4000-8000-000000000204'
    );
    delete from public.league_scoring_rules
    where league_id in (
      'd9710000-0000-4000-8000-000000000201',
      'd9710000-0000-4000-8000-000000000202',
      'd9710000-0000-4000-8000-000000000203',
      'd9710000-0000-4000-8000-000000000204'
    );
    delete from public.leagues
    where id in (
      'd9710000-0000-4000-8000-000000000201',
      'd9710000-0000-4000-8000-000000000202',
      'd9710000-0000-4000-8000-000000000203',
      'd9710000-0000-4000-8000-000000000204'
    );
    delete from public.seasons
    where id in (
      'd9710000-0000-4000-8000-000000000101',
      'd9710000-0000-4000-8000-000000000102',
      'd9710000-0000-4000-8000-000000000103',
      'd9710000-0000-4000-8000-000000000104'
    );
    delete from public.system_admins
    where user_id = 'd9710000-0000-4000-8000-000000000002';
    delete from auth.users
    where id in (
      'd9710000-0000-4000-8000-000000000001',
      'd9710000-0000-4000-8000-000000000002'
    );

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values
      (
        '00000000-0000-0000-0000-000000000000',
        'd9710000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated',
        'settings-concurrency-manager@example.com',
        extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
        now(), '{"provider":"email","providers":["email"]}',
        '{"display_name":"Settings Race Manager"}', now(), now()
      ),
      (
        '00000000-0000-0000-0000-000000000000',
        'd9710000-0000-4000-8000-000000000002',
        'authenticated', 'authenticated',
        'settings-concurrency-admin@example.com',
        extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
        now(), '{"provider":"email","providers":["email"]}',
        '{"display_name":"Settings Race Admin"}', now(), now()
      );

    insert into public.system_admins (user_id, granted_by)
    values (
      'd9710000-0000-4000-8000-000000000002',
      'd9710000-0000-4000-8000-000000000002'
    );

    insert into public.seasons (
      id, competition_id, name, starts_on, ends_on, is_current
    ) values
      (
        'd9710000-0000-4000-8000-000000000101',
        '26000000-0000-4000-8000-000000000001',
        'Settings concurrency one', '2099-01-01', '2099-12-31', false
      ),
      (
        'd9710000-0000-4000-8000-000000000102',
        '26000000-0000-4000-8000-000000000001',
        'Settings concurrency two', '2099-01-01', '2099-12-31', false
      ),
      (
        'd9710000-0000-4000-8000-000000000103',
        '26000000-0000-4000-8000-000000000001',
        'Settings identical race', '2099-01-01', '2099-12-31', false
      ),
      (
        'd9710000-0000-4000-8000-000000000104',
        '26000000-0000-4000-8000-000000000001',
        'Settings clock crossing', '2026-01-01', '2099-12-31', false
      );

    insert into public.leagues (
      id, manager_id, season_id, name, status
    ) values
      (
        'd9710000-0000-4000-8000-000000000201',
        'd9710000-0000-4000-8000-000000000001',
        'd9710000-0000-4000-8000-000000000101',
        'Settings concurrent writers', 'open'
      ),
      (
        'd9710000-0000-4000-8000-000000000202',
        'd9710000-0000-4000-8000-000000000001',
        'd9710000-0000-4000-8000-000000000102',
        'Settings first then fixture', 'open'
      ),
      (
        'd9710000-0000-4000-8000-000000000203',
        'd9710000-0000-4000-8000-000000000001',
        'd9710000-0000-4000-8000-000000000103',
        'Settings identical waiters', 'open'
      ),
      (
        'd9710000-0000-4000-8000-000000000204',
        'd9710000-0000-4000-8000-000000000001',
        'd9710000-0000-4000-8000-000000000104',
        'Settings crosses kickoff', 'open'
      );

    insert into public.league_scoring_rules (league_id)
    values
      ('d9710000-0000-4000-8000-000000000201'),
      ('d9710000-0000-4000-8000-000000000202'),
      ('d9710000-0000-4000-8000-000000000203'),
      ('d9710000-0000-4000-8000-000000000204');

    insert into public.prize_rules (league_id, position, percentage_bps)
    values
      ('d9710000-0000-4000-8000-000000000201', 1, 10000),
      ('d9710000-0000-4000-8000-000000000202', 1, 10000),
      ('d9710000-0000-4000-8000-000000000203', 1, 10000),
      ('d9710000-0000-4000-8000-000000000204', 1, 10000);
  $remote$),
  'INSERT 0 4',
  'the isolated concurrency fixtures are committed'
);

select is(
  extensions.dblink_exec('settings_first', $remote$
    set statement_timeout = '15s';
    set lock_timeout = '10s';
    set role authenticated;
    set request.jwt.claims =
      '{"sub":"d9710000-0000-4000-8000-000000000001","role":"authenticated"}';

    create function pg_temp.try_settings(
      p_league_id uuid,
      p_expected_version integer,
      p_name text,
      p_exact_points integer,
      p_prizes jsonb
    )
    returns text
    language plpgsql
    set search_path = ''
    as $function$
    declare
      v_result record;
    begin
      select * into strict v_result
      from public.update_league_settings(
        p_league_id, p_expected_version, p_name, null, 0, null,
        null, true, p_exact_points::smallint, 1::smallint, 0::smallint, p_prizes
      );
      return format(
        'OK:%s:%s:%s',
        v_result.settings_version,
        v_result.scoring_version,
        v_result.changed
      );
    exception when others then
      return sqlstate || ':' || sqlerrm;
    end;
    $function$;
  $remote$),
  'CREATE FUNCTION',
  'the first authenticated connection installs a safe result probe'
);
select is(
  extensions.dblink_exec('settings_second', $remote$
    set statement_timeout = '15s';
    set lock_timeout = '10s';
    set role authenticated;
    set request.jwt.claims =
      '{"sub":"d9710000-0000-4000-8000-000000000001","role":"authenticated"}';

    create function pg_temp.try_settings(
      p_league_id uuid,
      p_expected_version integer,
      p_name text,
      p_exact_points integer,
      p_prizes jsonb
    )
    returns text
    language plpgsql
    set search_path = ''
    as $function$
    declare
      v_result record;
    begin
      select * into strict v_result
      from public.update_league_settings(
        p_league_id, p_expected_version, p_name, null, 0, null,
        null, true, p_exact_points::smallint, 1::smallint, 0::smallint, p_prizes
      );
      return format(
        'OK:%s:%s:%s',
        v_result.settings_version,
        v_result.scoring_version,
        v_result.changed
      );
    exception when others then
      return sqlstate || ':' || sqlerrm;
    end;
    $function$;
  $remote$),
  'CREATE FUNCTION',
  'the second authenticated connection installs the same result probe'
);

create temp table settings_remote_pids as
select 'first'::text as connection_name, result.pid
from extensions.dblink(
  'settings_first', 'select pg_backend_pid()'
) as result(pid integer)
union all
select 'second', result.pid
from extensions.dblink(
  'settings_second', 'select pg_backend_pid()'
) as result(pid integer)
union all
select 'fixture', result.pid
from extensions.dblink(
  'settings_fixture', 'select pg_backend_pid()'
) as result(pid integer);

-- Two writers start from version 1. The first owns the league document; the
-- second waits, then observes version 2 and fails stale without a partial row.
select is(
  extensions.dblink_exec('settings_first', 'begin'),
  'BEGIN',
  'the first settings writer begins'
);
select results_eq(
  $$select value
    from extensions.dblink(
      'settings_first',
      $remote$
        select pg_temp.try_settings(
          'd9710000-0000-4000-8000-000000000201', 1,
          'Concurrent winner', 4,
          '[
            {"position":1,"percentage_bps":6000},
            {"position":2,"percentage_bps":4000}
          ]'
        )
      $remote$
    ) as result(value text)$$,
  $$values ('OK:2:2:t'::text)$$,
  'the first writer updates details, scoring, and prizes atomically'
);
select is(
  extensions.dblink_send_query('settings_second', $remote$
    select pg_temp.try_settings(
      'd9710000-0000-4000-8000-000000000201', 1,
      'Concurrent loser', 5,
      '[{"position":1,"percentage_bps":10000}]'
    )
  $remote$),
  1,
  'the competing writer starts with the same expected version'
);
select ok(
  pg_temp.wait_for_remote_lock(
    (select pid from settings_remote_pids where connection_name = 'second')
  ),
  'the competing writer really waits on the first transaction'
);
select is(
  extensions.dblink_exec('settings_first', 'commit'),
  'COMMIT',
  'the winning settings document commits'
);
create temp table settings_stale_result as
select result.value
from extensions.dblink_get_result('settings_second') as result(value text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('settings_second') as drained(value text)),
  0,
  'the stale-writer asynchronous result is fully drained'
);
select is(
  (select value from settings_stale_result),
  'P0001:SETTINGS_STALE',
  'the waiting writer rechecks and loses with the stable stale code'
);
select results_eq(
  $$select league.name, league.settings_version, scoring.version,
           scoring.exact_points::integer,
           (select count(*)::integer
            from public.audit_logs
            where action = 'league_settings_updated'
              and entity_id = league.id)
    from public.leagues as league
    join public.league_scoring_rules as scoring on scoring.league_id = league.id
    where league.id = 'd9710000-0000-4000-8000-000000000201'$$,
  $$values ('Concurrent winner'::text, 2, 2, 4, 1)$$,
  'exactly one version bump, scoring change, and audit commit'
);
select results_eq(
  $$select value
    from extensions.dblink(
      'settings_second',
      $remote$
        select pg_temp.try_settings(
          'd9710000-0000-4000-8000-000000000201', 1,
          'Concurrent winner', 4,
          '[
            {"position":1,"percentage_bps":6000},
            {"position":2,"percentage_bps":4000}
          ]'
        )
      $remote$
    ) as result(value text)$$,
  $$values ('OK:2:2:f'::text)$$,
  'a stale same-document retry is a semantic replay'
);

-- Two truly concurrent identical submissions still serialize. The waiter
-- compares after the winner commits and becomes a no-op, not a second audit.
select is(
  extensions.dblink_exec('settings_first', 'begin'),
  'BEGIN',
  'the identical-submission winner begins'
);
select results_eq(
  $$select value
    from extensions.dblink(
      'settings_first',
      $remote$
        select pg_temp.try_settings(
          'd9710000-0000-4000-8000-000000000203', 1,
          'Identical concurrent document', 4,
          '[{"position":1,"percentage_bps":10000}]'
        )
      $remote$
    ) as result(value text)$$,
  $$values ('OK:2:2:t'::text)$$,
  'the first identical submission mutates once'
);
select is(
  extensions.dblink_send_query('settings_second', $remote$
    select pg_temp.try_settings(
      'd9710000-0000-4000-8000-000000000203', 1,
      'Identical concurrent document', 4,
      '[{"position":1,"percentage_bps":10000}]'
    )
  $remote$),
  1,
  'the second identical submission starts before commit'
);
select ok(
  pg_temp.wait_for_remote_lock(
    (select pid from settings_remote_pids where connection_name = 'second')
  ),
  'the identical waiter really serializes behind the winner'
);
select is(
  extensions.dblink_exec('settings_first', 'commit'),
  'COMMIT',
  'the identical-submission winner commits'
);
create temp table settings_identical_waiter_result as
select result.value
from extensions.dblink_get_result('settings_second') as result(value text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('settings_second') as drained(value text)),
  0,
  'the identical waiter asynchronous result is fully drained'
);
select is(
  (select value from settings_identical_waiter_result),
  'OK:2:2:f',
  'the identical waiter returns the winner versions as a no-op'
);
select results_eq(
  $$select league.settings_version, scoring.version,
           (select count(*)::integer
            from public.audit_logs
            where action = 'league_settings_updated'
              and entity_id = league.id)
    from public.leagues as league
    join public.league_scoring_rules as scoring on scoring.league_id = league.id
    where league.id = 'd9710000-0000-4000-8000-000000000203'$$,
  $$values (2, 2, 1)$$,
  'concurrent identical submissions create one mutation and one audit'
);

-- Invalid payload validation occurs before the league lock. Holding that lock
-- cannot turn malformed JSON into an attacker-controlled wait.
select is(
  extensions.dblink_exec('settings_fixture', $remote$
    begin;
    do $block$
    begin
      perform league.id
      from public.leagues as league
      where league.id = 'd9710000-0000-4000-8000-000000000201'
      for update;
    end;
    $block$;
  $remote$),
  'DO',
  'the league row is held for the cheap-validation probe'
);
select is(
  extensions.dblink_send_query('settings_second', $remote$
    select pg_temp.try_settings(
      'd9710000-0000-4000-8000-000000000201', 2,
      'Invalid payload', 4,
      '[{"position":1}]'
    )
  $remote$),
  1,
  'the malformed payload is submitted while the league is locked'
);
select ok(
  pg_temp.wait_for_remote_completion('settings_second'),
  'missing-key prize validation returns without waiting on the league row'
);
create temp table settings_invalid_fast_result as
select result.value
from extensions.dblink_get_result('settings_second') as result(value text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('settings_second') as drained(value text)),
  0,
  'the fast-validation asynchronous result is fully drained'
);
select is(
  (select value from settings_invalid_fast_result),
  'P0001:INVALID_PRIZE_RULES',
  'the fast rejection keeps the stable validation code'
);
select is(
  extensions.dblink_exec('settings_fixture', 'rollback'),
  'ROLLBACK',
  'the validation probe releases the league row'
);

-- Details-only changes must not lock every match. Hold a match row and prove a
-- normal details edit completes before that independent lock is released.
select is(
  extensions.dblink_exec('settings_control', $remote$
    insert into public.matches (
      id, season_id, round_number, home_team_id, away_team_id,
      kickoff_at, status
    ) values (
      'd9710000-0000-4000-8000-000000000301',
      'd9710000-0000-4000-8000-000000000101', 1,
      '26000000-0000-4000-8000-000000000101',
      '26000000-0000-4000-8000-000000000102',
      '2099-06-01T18:00:00Z', 'scheduled'
    );
  $remote$),
  'INSERT 0 1',
  'a future fixture exists for the details-only lock probe'
);
select is(
  extensions.dblink_exec('settings_fixture', $remote$
    begin;
    update public.matches
    set kickoff_at = kickoff_at
    where id = 'd9710000-0000-4000-8000-000000000301';
  $remote$),
  'UPDATE 1',
  'an independent transaction holds the season match row'
);
select is(
  extensions.dblink_send_query('settings_second', $remote$
    select pg_temp.try_settings(
      'd9710000-0000-4000-8000-000000000201', 2,
      'Details bypass match locks', 4,
      '[
        {"position":1,"percentage_bps":6000},
        {"position":2,"percentage_bps":4000}
      ]'
    )
  $remote$),
  1,
  'a details-only update starts while the match row is held'
);
select ok(
  pg_temp.wait_for_remote_completion('settings_second'),
  'the details-only update completes without waiting on the match row'
);
select is(
  extensions.dblink_exec('settings_fixture', 'rollback'),
  'ROLLBACK',
  'the independent match lock is released'
);
create temp table settings_details_result as
select result.value
from extensions.dblink_get_result('settings_second') as result(value text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('settings_second') as drained(value text)),
  0,
  'the details-only asynchronous result is fully drained'
);
select is(
  (select value from settings_details_result),
  'OK:3:2:t',
  'details advance only the settings version'
);

-- Fixture wins: its FK KEY SHARE on the season blocks the competitive edit.
-- Once committed, the waiter re-reads the latch and fails closed.
select is(
  extensions.dblink_exec('settings_fixture', $remote$
    begin;
    insert into public.matches (
      id, season_id, round_number, home_team_id, away_team_id,
      kickoff_at, status, predictions_locked_at
    ) values (
      'd9710000-0000-4000-8000-000000000302',
      'd9710000-0000-4000-8000-000000000101', 2,
      '26000000-0000-4000-8000-000000000101',
      '26000000-0000-4000-8000-000000000102',
      '2099-06-02T18:00:00Z', 'scheduled', clock_timestamp()
    );
  $remote$),
  'INSERT 0 1',
  'the fixture writer inserts an uncommitted irreversible latch'
);
select is(
  extensions.dblink_send_query('settings_second', $remote$
    select pg_temp.try_settings(
      'd9710000-0000-4000-8000-000000000201', 3,
      'Details bypass match locks', 5,
      '[
        {"position":1,"percentage_bps":6000},
        {"position":2,"percentage_bps":4000}
      ]'
    )
  $remote$),
  1,
  'a competitive edit starts behind the uncommitted fixture'
);
select ok(
  pg_temp.wait_for_remote_lock(
    (select pid from settings_remote_pids where connection_name = 'second')
  ),
  'the competitive edit waits on the season parent serialization row'
);
select is(
  extensions.dblink_exec('settings_fixture', 'commit'),
  'COMMIT',
  'the fixture latch commits first'
);
create temp table settings_fixture_first_result as
select result.value
from extensions.dblink_get_result('settings_second') as result(value text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('settings_second') as drained(value text)),
  0,
  'the fixture-first asynchronous result is fully drained'
);
select is(
  (select value from settings_fixture_first_result),
  'P0001:LEAGUE_RULES_LOCKED',
  'the waiting competitive edit observes the committed latch and fails closed'
);
select results_eq(
  $$select league.settings_version, scoring.version,
           scoring.exact_points::integer
    from public.leagues as league
    join public.league_scoring_rules as scoring on scoring.league_id = league.id
    where league.id = 'd9710000-0000-4000-8000-000000000201'$$,
  $$values (3, 2, 4)$$,
  'the fixture-first denial changes no settings or scoring version'
);

-- Settings wins: the competitive transaction owns the season row. A missing
-- fixture insert has no match-row conflict yet, so waiting proves FK/season
-- serialization rather than an accidental leaf lock.
select is(
  extensions.dblink_exec('settings_first', 'begin'),
  'BEGIN',
  'the settings-first transaction begins'
);
select results_eq(
  $$select value
    from extensions.dblink(
      'settings_first',
      $remote$
        select pg_temp.try_settings(
          'd9710000-0000-4000-8000-000000000202', 1,
          'Settings first winner', 4,
          '[{"position":1,"percentage_bps":10000}]'
        )
      $remote$
    ) as result(value text)$$,
  $$values ('OK:2:2:t'::text)$$,
  'the competitive settings update succeeds before any included fixture exists'
);
select is(
  extensions.dblink_send_query('settings_fixture', $remote$
    insert into public.matches (
      id, season_id, round_number, home_team_id, away_team_id,
      kickoff_at, status, predictions_locked_at
    ) values (
      'd9710000-0000-4000-8000-000000000303',
      'd9710000-0000-4000-8000-000000000102', 1,
      '26000000-0000-4000-8000-000000000101',
      '26000000-0000-4000-8000-000000000102',
      clock_timestamp() - interval '1 second', 'scheduled', clock_timestamp()
    )
    returning id::text
  $remote$),
  1,
  'a genuinely missing fixture insert starts concurrently'
);
select ok(
  pg_temp.wait_for_remote_lock(
    (select pid from settings_remote_pids where connection_name = 'fixture')
  ),
  'the missing insert waits on the settings-owned season row'
);
select is(
  extensions.dblink_exec('settings_first', 'commit'),
  'COMMIT',
  'the settings document commits before fixture membership changes'
);
create temp table settings_insert_after_result as
select result.match_id
from extensions.dblink_get_result('settings_fixture') as result(match_id text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('settings_fixture') as drained(value text)),
  0,
  'the settings-first fixture result is fully drained'
);
select is(
  (select match_id from settings_insert_after_result),
  'd9710000-0000-4000-8000-000000000303',
  'the fixture inserts coherently after the settings transaction'
);
select results_eq(
  $$select value
    from extensions.dblink(
      'settings_second',
      $remote$
        select pg_temp.try_settings(
          'd9710000-0000-4000-8000-000000000202', 2,
          'Settings first winner', 5,
          '[{"position":1,"percentage_bps":10000}]'
        )
      $remote$
    ) as result(value text)$$,
  $$values ('P0001:LEAGUE_RULES_LOCKED'::text)$$,
  'later competitive edits observe the committed past/latch fixture'
);

-- A waiter that began before kickoff cannot retain transaction-start time.
-- Hold the league row across a near boundary, then release it only after the
-- database clock passes kickoff; the resumed competitive edit must deny.
select is(
  extensions.dblink_exec('settings_control', $remote$
    insert into public.matches (
      id, season_id, round_number, home_team_id, away_team_id,
      kickoff_at, status
    ) values (
      'd9710000-0000-4000-8000-000000000304',
      'd9710000-0000-4000-8000-000000000104', 1,
      '26000000-0000-4000-8000-000000000101',
      '26000000-0000-4000-8000-000000000102',
      clock_timestamp() + interval '1500 milliseconds', 'scheduled'
    );
  $remote$),
  'INSERT 0 1',
  'the committed clock-crossing fixture has a near future kickoff'
);
select is(
  extensions.dblink_exec('settings_fixture', $remote$
    begin;
    update public.leagues
    set name = name
    where id = 'd9710000-0000-4000-8000-000000000204';
  $remote$),
  'UPDATE 1',
  'the lock holder serializes the settings document before kickoff'
);
select is(
  extensions.dblink_send_query('settings_second', $remote$
    select pg_temp.try_settings(
      'd9710000-0000-4000-8000-000000000204', 1,
      'Settings crosses kickoff', 4,
      '[{"position":1,"percentage_bps":10000}]'
    )
  $remote$),
  1,
  'the competitive edit begins before the near kickoff'
);
select ok(
  pg_temp.wait_for_remote_lock(
    (select pid from settings_remote_pids where connection_name = 'second')
  ),
  'the competitive edit is a real lock waiter before kickoff'
);
select lives_ok(
  $$select pg_temp.wait_until_after(
    (select kickoff_at
     from public.matches
     where id = 'd9710000-0000-4000-8000-000000000304')
  )$$,
  'the bounded probe crosses the database kickoff boundary'
);
select is(
  extensions.dblink_exec('settings_fixture', 'rollback'),
  'ROLLBACK',
  'the league row releases only after database kickoff'
);
create temp table settings_clock_crossing_result as
select result.value
from extensions.dblink_get_result('settings_second') as result(value text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('settings_second') as drained(value text)),
  0,
  'the clock-crossing asynchronous result is fully drained'
);
select is(
  (select value from settings_clock_crossing_result),
  'P0001:LEAGUE_RULES_LOCKED',
  'the waiter samples fresh DB time after release and denies the edit'
);
select results_eq(
  $$select league.settings_version, scoring.version,
           (select count(*)::integer
            from public.audit_logs
            where action = 'league_settings_updated'
              and entity_id = league.id)
    from public.leagues as league
    join public.league_scoring_rules as scoring on scoring.league_id = league.id
    where league.id = 'd9710000-0000-4000-8000-000000000204'$$,
  $$values (1, 1, 0)$$,
  'the DB-time denial changes no version or audit state'
);

-- A system-admin settings mutation retains its authorization row with KEY
-- SHARE through commit. Revocation therefore waits; after it wins, later calls
-- receive the same opaque missing-resource code.
select is(
  extensions.dblink_exec('settings_first', $remote$
    reset role;
    set role authenticated;
    set request.jwt.claims =
      '{"sub":"d9710000-0000-4000-8000-000000000002","role":"authenticated"}';
    begin;
  $remote$),
  'BEGIN',
  'the first connection switches to the system admin and begins'
);
select results_eq(
  $$select value
    from extensions.dblink(
      'settings_first',
      $remote$
        select pg_temp.try_settings(
          'd9710000-0000-4000-8000-000000000201', 3,
          'Admin authorization retained', 4,
          '[
            {"position":1,"percentage_bps":6000},
            {"position":2,"percentage_bps":4000}
          ]'
        )
      $remote$
    ) as result(value text)$$,
  $$values ('OK:4:2:t'::text)$$,
  'the authorized admin details update succeeds inside its transaction'
);
select is(
  extensions.dblink_send_query('settings_fixture', $remote$
    delete from public.system_admins
    where user_id = 'd9710000-0000-4000-8000-000000000002'
    returning user_id::text
  $remote$),
  1,
  'admin revocation starts while the settings mutation is uncommitted'
);
select ok(
  pg_temp.wait_for_remote_lock(
    (select pid from settings_remote_pids where connection_name = 'fixture')
  ),
  'revocation waits on the settings transaction retained authorization row'
);
select is(
  extensions.dblink_exec('settings_first', 'commit'),
  'COMMIT',
  'the already-authorized settings mutation commits first'
);
create temp table settings_revocation_result as
select result.user_id
from extensions.dblink_get_result('settings_fixture') as result(user_id text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('settings_fixture') as drained(value text)),
  0,
  'the revocation asynchronous result is fully drained'
);
select is(
  (select user_id from settings_revocation_result),
  'd9710000-0000-4000-8000-000000000002',
  'revocation commits immediately after retained authorization releases'
);
select results_eq(
  $$select value
    from extensions.dblink(
      'settings_first',
      $remote$
        select pg_temp.try_settings(
          'd9710000-0000-4000-8000-000000000201', 4,
          'Revoked admin attempt', 4,
          '[
            {"position":1,"percentage_bps":6000},
            {"position":2,"percentage_bps":4000}
          ]'
        )
      $remote$
    ) as result(value text)$$,
  $$values ('P0001:LEAGUE_SETTINGS_NOT_FOUND'::text)$$,
  'the revoked admin receives the opaque denial on its next attempt'
);

select results_eq(
  $$select league.settings_version, scoring.version,
           (select count(*)::integer
            from public.audit_logs
            where action = 'league_settings_updated'
              and entity_id = league.id)
    from public.leagues as league
    join public.league_scoring_rules as scoring on scoring.league_id = league.id
    where league.id = 'd9710000-0000-4000-8000-000000000201'$$,
  $$values (4, 2, 3)$$,
  'all races leave exact monotonic versions and one audit per committed change'
);

select is(
  extensions.dblink_exec('settings_control', $remote$
    delete from public.audit_logs
    where entity_id in (
      'd9710000-0000-4000-8000-000000000201',
      'd9710000-0000-4000-8000-000000000202',
      'd9710000-0000-4000-8000-000000000203',
      'd9710000-0000-4000-8000-000000000204'
    );
    delete from public.matches
    where id between
      'd9710000-0000-4000-8000-000000000301'
      and 'd9710000-0000-4000-8000-000000000304';
    delete from public.prize_rules
    where league_id in (
      'd9710000-0000-4000-8000-000000000201',
      'd9710000-0000-4000-8000-000000000202',
      'd9710000-0000-4000-8000-000000000203',
      'd9710000-0000-4000-8000-000000000204'
    );
    delete from public.league_scoring_rules
    where league_id in (
      'd9710000-0000-4000-8000-000000000201',
      'd9710000-0000-4000-8000-000000000202',
      'd9710000-0000-4000-8000-000000000203',
      'd9710000-0000-4000-8000-000000000204'
    );
    delete from public.leagues
    where id in (
      'd9710000-0000-4000-8000-000000000201',
      'd9710000-0000-4000-8000-000000000202',
      'd9710000-0000-4000-8000-000000000203',
      'd9710000-0000-4000-8000-000000000204'
    );
    delete from public.seasons
    where id in (
      'd9710000-0000-4000-8000-000000000101',
      'd9710000-0000-4000-8000-000000000102',
      'd9710000-0000-4000-8000-000000000103',
      'd9710000-0000-4000-8000-000000000104'
    );
    delete from auth.users
    where id in (
      'd9710000-0000-4000-8000-000000000001',
      'd9710000-0000-4000-8000-000000000002'
    );
  $remote$),
  'DELETE 2',
  'all committed concurrency fixtures are removed'
);

select is(
  extensions.dblink_disconnect('settings_control'),
  'OK',
  'the control connection closes'
);
select is(
  extensions.dblink_disconnect('settings_first'),
  'OK',
  'the first settings connection closes'
);
select is(
  extensions.dblink_disconnect('settings_second'),
  'OK',
  'the second settings connection closes'
);
select is(
  extensions.dblink_disconnect('settings_fixture'),
  'OK',
  'the fixture writer connection closes'
);

select * from finish();
rollback;
