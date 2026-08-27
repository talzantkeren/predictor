-- Real committed dblink sessions are intentional: duplicate handoff, provider
-- resume, and administrator revocation cannot be proved inside one pgTAP
-- transaction. If this file is interrupted before cleanup, reset Local Supabase
-- before trusting later counts.

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

select is(
  extensions.dblink_connect(
    'slice9_clear_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the committed fixture/control connection opens'
);
select is(
  extensions.dblink_connect(
    'slice9_clear_one',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the first handoff connection opens'
);
select is(
  extensions.dblink_connect(
    'slice9_clear_two',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the second handoff connection opens'
);
select is(
  extensions.dblink_connect(
    'slice9_clear_provider',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the fenced provider connection opens'
);
select is(
  extensions.dblink_connect(
    'slice9_clear_locker',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the league lock-holder connection opens'
);
select is(
  extensions.dblink_connect(
    'slice9_clear_revoker',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the administrator-revocation connection opens'
);

select is(
  extensions.dblink_exec('slice9_clear_control', $remote$
    set statement_timeout = '20s';
    set lock_timeout = '10s';
  $remote$),
  'SET',
  'the control connection has bounded waits'
);
select is(
  extensions.dblink_exec('slice9_clear_one', $remote$
    set statement_timeout = '15s';
    set lock_timeout = '10s';
    set role service_role;
    set request.headers =
      '{"x-predictor-system-actor":"d9911111-1111-4111-8111-111111111111"}';
  $remote$),
  'SET',
  'the first handoff caller has only the fixed server actor context'
);
select is(
  extensions.dblink_exec('slice9_clear_two', $remote$
    set statement_timeout = '15s';
    set lock_timeout = '10s';
    set role service_role;
    set request.headers =
      '{"x-predictor-system-actor":"d9911111-1111-4111-8111-111111111111"}';
  $remote$),
  'SET',
  'the second handoff caller has only the fixed server actor context'
);
select is(
  extensions.dblink_exec('slice9_clear_provider', $remote$
    set statement_timeout = '15s';
    set lock_timeout = '10s';
    set role service_role;
    set request.headers =
      '{"x-predictor-system-actor":"d9911111-1111-4111-8111-111111111111"}';
  $remote$),
  'SET',
  'the provider caller has a bounded service-role session'
);
select is(
  extensions.dblink_exec('slice9_clear_locker', $remote$
    set statement_timeout = '15s';
    set lock_timeout = '10s';
  $remote$),
  'SET',
  'the league lock holder has bounded waits'
);
select is(
  extensions.dblink_exec('slice9_clear_revoker', $remote$
    set statement_timeout = '15s';
    set lock_timeout = '10s';
  $remote$),
  'SET',
  'the revocation connection has bounded waits'
);

select is(
  extensions.dblink_exec('slice9_clear_control', $remote$
    begin;

    create temp table slice9_clear_lease_snapshot
      on commit preserve rows
      as select * from public.sync_leases where provider = 'api-football';

    update public.sync_leases
    set run_id = null,
        fencing_token = null,
        locked_until = null
    where run_id = 'd9900000-0000-4000-8000-000000000900';
    delete from public.sync_runs
    where id = 'd9900000-0000-4000-8000-000000000900';
    delete from public.audit_logs
    where actor_id = 'd9911111-1111-4111-8111-111111111111'
       or entity_id between
         'd9900000-0000-4000-8000-000000000001'::uuid and
         'd9900000-0000-4000-8000-000000000099'::uuid;
    delete from public.predictions
    where match_id = 'd9900000-0000-4000-8000-000000000001';
    delete from public.leagues
    where id = 'd9900000-0000-4000-8000-000000000010';
    delete from public.matches
    where id = 'd9900000-0000-4000-8000-000000000001';
    delete from public.sports_provider_rounds
    where season_id = 'd9900000-0000-4000-8000-000000000027';
    delete from public.teams
    where id between
      'd9900000-0000-4000-8000-000000000101'::uuid and
      'd9900000-0000-4000-8000-000000000102'::uuid;
    delete from public.seasons
    where id = 'd9900000-0000-4000-8000-000000000027';
    delete from public.competitions
    where id = 'd9900000-0000-4000-8000-000000000020';
    delete from public.system_admins
    where user_id = 'd9911111-1111-4111-8111-111111111111';
    delete from auth.users
    where id = 'd9911111-1111-4111-8111-111111111111';

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      'd9911111-1111-4111-8111-111111111111',
      'authenticated', 'authenticated',
      'slice9-clear-race-admin@example.com',
      extensions.crypt(
        extensions.gen_random_uuid()::text,
        extensions.gen_salt('bf')
      ),
      clock_timestamp(),
      '{"provider":"email","providers":["email"]}',
      '{"display_name":"Slice 9 Clear Race Admin"}',
      clock_timestamp(), clock_timestamp()
    );
    insert into public.system_admins (user_id, granted_by)
    values (
      'd9911111-1111-4111-8111-111111111111',
      'd9911111-1111-4111-8111-111111111111'
    );
    insert into public.competitions (
      id, name, slug, country_code, external_provider, external_id
    ) values (
      'd9900000-0000-4000-8000-000000000020',
      'Slice 9 clear race competition', 'slice9-clear-race', 'IL',
      'api-football', '383'
    );
    insert into public.seasons (
      id, competition_id, name, starts_on, ends_on, is_current,
      external_provider, external_id
    ) values (
      'd9900000-0000-4000-8000-000000000027',
      'd9900000-0000-4000-8000-000000000020',
      '2098/99', '2098-07-01', '2099-06-30', false,
      'api-football', '2026'
    );
    insert into public.teams (
      id, name, short_name, external_provider, external_id
    ) values
      (
        'd9900000-0000-4000-8000-000000000101',
        'Slice 9 race home', 'Race home', 'api-football', '9990081'
      ),
      (
        'd9900000-0000-4000-8000-000000000102',
        'Slice 9 race away', 'Race away', 'api-football', '9990082'
      );
    insert into public.matches (
      id, season_id, round_number, provider_round_label, provider_status,
      home_team_id, away_team_id, kickoff_at, status,
      result_version, is_manually_overridden, predictions_locked_at,
      external_provider, external_id, updated_at
    ) values (
      'd9900000-0000-4000-8000-000000000001',
      'd9900000-0000-4000-8000-000000000027',
      1, 'Regular Season - 1', 'NS',
      'd9900000-0000-4000-8000-000000000101',
      'd9900000-0000-4000-8000-000000000102',
      '2099-05-01T17:00:00Z', 'scheduled',
      0, true, null, 'api-football', '9990083',
      '2098-08-01T00:00:00Z'
    );
    insert into public.leagues (
      id, manager_id, season_id, name, status
    ) values (
      'd9900000-0000-4000-8000-000000000010',
      'd9911111-1111-4111-8111-111111111111',
      'd9900000-0000-4000-8000-000000000027',
      'Slice 9 clear race league', 'open'
    );

    insert into public.sync_runs (
      id, provider, status, started_at, sync_kind,
      lease_generation, locked_until
    ) values (
      'd9900000-0000-4000-8000-000000000900',
      'api-football', 'running', clock_timestamp(), 'targeted',
      9100, clock_timestamp() + interval '30 minutes'
    );
    update public.sync_leases
    set generation = 9100,
        run_id = 'd9900000-0000-4000-8000-000000000900',
        fencing_token = 'd9900000-0000-4000-8000-000000000901',
        locked_until = clock_timestamp() + interval '30 minutes',
        backoff_until = null,
        updated_at = clock_timestamp()
    where provider = 'api-football';

    commit;
  $remote$),
  'COMMIT',
  'the isolated committed fixture and original lease snapshot are installed'
);

create temp table slice9_clear_backend_pids as
select 'one'::text as name, backend.pid
from extensions.dblink(
  'slice9_clear_one', 'select pg_catalog.pg_backend_pid()'
) as backend(pid integer)
union all
select 'two'::text, backend.pid
from extensions.dblink(
  'slice9_clear_two', 'select pg_catalog.pg_backend_pid()'
) as backend(pid integer)
union all
select 'provider'::text, backend.pid
from extensions.dblink(
  'slice9_clear_provider', 'select pg_catalog.pg_backend_pid()'
) as backend(pid integer)
union all
select 'revoker'::text, backend.pid
from extensions.dblink(
  'slice9_clear_revoker', 'select pg_catalog.pg_backend_pid()'
) as backend(pid integer);

-- Two concurrent clears serialize. The winner changes ownership once; the
-- waiter observes the committed state and returns a true no-op.
select is(
  extensions.dblink_exec('slice9_clear_one', 'begin'),
  'BEGIN',
  'the first duplicate-clear transaction begins'
);
create temp table slice9_first_clear as
select result.*
from extensions.dblink('slice9_clear_one', $remote$
  select result_cleared
  from public.clear_manual_match_override(
    'd9900000-0000-4000-8000-000000000001'
  )
$remote$) as result(cleared boolean);
select is(
  (select cleared from slice9_first_clear),
  true,
  'the first concurrent caller clears ownership'
);
select is(
  extensions.dblink_send_query('slice9_clear_two', $remote$
    select result_cleared
    from public.clear_manual_match_override(
      'd9900000-0000-4000-8000-000000000001'
    )
  $remote$),
  1,
  'the second duplicate clear starts asynchronously'
);
select ok(
  pg_temp.wait_for_remote_lock(
    (select pid from slice9_clear_backend_pids where name = 'two')
  ),
  'the duplicate clear waits on the canonical locked path'
);
select is(
  extensions.dblink_exec('slice9_clear_one', 'commit'),
  'COMMIT',
  'the winning clear commits without deadlock'
);
create temp table slice9_first_clear_timestamp as
select match.updated_at
from public.matches as match
where match.id = 'd9900000-0000-4000-8000-000000000001';
create temp table slice9_second_clear as
select result.*
from extensions.dblink_get_result('slice9_clear_two', false)
  as result(cleared boolean);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_clear_two', false)
     as drained(value text)),
  0,
  'the duplicate-clear asynchronous protocol is fully drained'
);
select is(
  (select cleared from slice9_second_clear),
  false,
  'the duplicate waiter returns an idempotent no-op'
);
select ok(
  (
    select match.updated_at = first.updated_at
    from public.matches as match
    cross join slice9_first_clear_timestamp as first
    where match.id = 'd9900000-0000-4000-8000-000000000001'
  )
  and (
    select count(*) = 1
    from public.audit_logs as audit
    where audit.action = 'match_manual_override_cleared'
      and audit.entity_id = 'd9900000-0000-4000-8000-000000000001'
  ),
  'duplicate clear moves the timestamp once and writes exactly one audit'
);

-- Clear wins the match row before the real fenced provider apply. The provider
-- waits, then observes ownership restored and applies the validated fixture.
select is(
  extensions.dblink_exec('slice9_clear_control', $remote$
    update public.matches
    set round_number = 1,
        provider_round_label = 'Regular Season - 1',
        provider_status = 'NS',
        kickoff_at = '2099-05-01T17:00:00Z',
        status = 'scheduled',
        home_score = null,
        away_score = null,
        result_version = 0,
        is_manually_overridden = true,
        predictions_locked_at = null,
        updated_at = '2098-08-01T00:00:00Z'
    where id = 'd9900000-0000-4000-8000-000000000001';
    delete from public.audit_logs
    where action = 'match_manual_override_cleared'
      and entity_id = 'd9900000-0000-4000-8000-000000000001';
  $remote$),
  'DELETE 1',
  'the provider-resume fixture is reset and committed'
);
select is(
  extensions.dblink_exec('slice9_clear_one', 'begin'),
  'BEGIN',
  'the provider-resume clear transaction begins'
);
create temp table slice9_provider_race_clear as
select result.*
from extensions.dblink('slice9_clear_one', $remote$
  select result_cleared
  from public.clear_manual_match_override(
    'd9900000-0000-4000-8000-000000000001'
  )
$remote$) as result(cleared boolean);
select is(
  extensions.dblink_send_query('slice9_clear_provider', $remote$
    select result_matches_changed, result_manual_overrides_skipped
    from public.apply_api_football_sync_batch(
      'd9900000-0000-4000-8000-000000000900',
      9100,
      'd9900000-0000-4000-8000-000000000901',
      '{
        "competition": null,
        "season": null,
        "teams": [],
        "rounds": [],
        "fixtures": [{
          "externalId": "9990083",
          "homeTeamExternalId": "9990081",
          "awayTeamExternalId": "9990082",
          "roundNumber": 2,
          "roundLabel": "Regular Season - 2",
          "providerStatus": "NS",
          "kickoffAt": "2099-05-08T17:30:00Z",
          "status": "scheduled",
          "homeScore": null,
          "awayScore": null,
          "resultDisposition": "none",
          "locksPredictions": false
        }]
      }'::jsonb
    )
  $remote$),
  1,
  'a real fenced API-Football apply starts behind the uncommitted clear'
);
select ok(
  pg_temp.wait_for_remote_lock(
    (select pid from slice9_clear_backend_pids where name = 'provider')
  ),
  'the provider apply waits for the exact match row without deadlock'
);
select is(
  extensions.dblink_exec('slice9_clear_one', 'commit'),
  'COMMIT',
  'the handoff commits before provider mutation resumes'
);
create temp table slice9_provider_race_result as
select result.*
from extensions.dblink_get_result('slice9_clear_provider', false)
  as result(matches_changed integer, manual_skipped integer);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_clear_provider', false)
     as drained(value text)),
  0,
  'the clear-first provider protocol is fully drained'
);
select results_eq(
  $$select
      (select cleared from slice9_provider_race_clear),
      matches_changed,
      manual_skipped
    from slice9_provider_race_result$$,
  $$values (true, 1, 0)$$,
  'the clear wins once and the waiting provider applies instead of skipping'
);
select results_eq(
  $$select
      match.round_number,
      match.provider_round_label,
      match.provider_status,
      match.kickoff_at,
      match.status::text,
      match.home_score,
      match.away_score,
      match.result_version,
      match.is_manually_overridden,
      match.external_provider,
      match.external_id
    from public.matches as match
    where match.id = 'd9900000-0000-4000-8000-000000000001'$$,
  $$values (
    2::smallint,
    'Regular Season - 2'::text,
    'NS'::text,
    '2099-05-08T17:30:00Z'::timestamptz,
    'scheduled'::text,
    null::smallint,
    null::smallint,
    0,
    false,
    'api-football'::text,
    '9990083'::text
  )$$,
  'the next valid provider snapshot mutates only its validated fixture fields'
);
select is(
  (
    select count(*)::integer
    from public.audit_logs as audit
    where audit.action = 'match_manual_override_cleared'
      and audit.entity_id = 'd9900000-0000-4000-8000-000000000001'
  ),
  1,
  'provider resume does not duplicate the explicit handoff audit'
);

-- The opposite ordering is coherent too. A provider transaction that owns the
-- row while it is still Manual records one skip; clear waits behind it, then a
-- later validated provider apply resumes mutation.
select is(
  extensions.dblink_exec('slice9_clear_control', $remote$
    update public.matches
    set round_number = 1,
        provider_round_label = 'Regular Season - 1',
        provider_status = 'NS',
        kickoff_at = '2099-05-01T17:00:00Z',
        status = 'scheduled',
        home_score = null,
        away_score = null,
        result_version = 0,
        is_manually_overridden = true,
        predictions_locked_at = null,
        updated_at = '2098-08-01T00:00:00Z'
    where id = 'd9900000-0000-4000-8000-000000000001';
    delete from public.audit_logs
    where action = 'match_manual_override_cleared'
      and entity_id = 'd9900000-0000-4000-8000-000000000001';
  $remote$),
  'DELETE 1',
  'the provider-first fixture is reset and committed'
);
select is(
  extensions.dblink_exec('slice9_clear_provider', $remote$
    create function pg_temp.apply_reverse_fixture()
    returns table (matches_changed integer, manual_skipped integer)
    language sql
    as $function$
      select result_matches_changed, result_manual_overrides_skipped
      from public.apply_api_football_sync_batch(
        'd9900000-0000-4000-8000-000000000900',
        9100,
        'd9900000-0000-4000-8000-000000000901',
        '{
          "competition": null,
          "season": null,
          "teams": [],
          "rounds": [],
          "fixtures": [{
            "externalId": "9990083",
            "homeTeamExternalId": "9990081",
            "awayTeamExternalId": "9990082",
            "roundNumber": 3,
            "roundLabel": "Regular Season - 3",
            "providerStatus": "NS",
            "kickoffAt": "2099-05-15T18:00:00Z",
            "status": "scheduled",
            "homeScore": null,
            "awayScore": null,
            "resultDisposition": "none",
            "locksPredictions": false
          }]
        }'::jsonb
      );
    $function$;
  $remote$),
  'CREATE FUNCTION',
  'the provider session has one reusable validated reverse-order payload'
);
select is(
  extensions.dblink_exec('slice9_clear_provider', 'begin'),
  'BEGIN',
  'the provider-first transaction begins'
);
create temp table slice9_provider_first_skip as
select result.*
from extensions.dblink(
  'slice9_clear_provider',
  'select * from pg_temp.apply_reverse_fixture()'
) as result(matches_changed integer, manual_skipped integer);
select results_eq(
  $$select matches_changed, manual_skipped from slice9_provider_first_skip$$,
  $$values (0, 1)$$,
  'the provider owner sees Manual state and records exactly one coherent skip'
);
select is(
  extensions.dblink_send_query('slice9_clear_two', $remote$
    select result_cleared
    from public.clear_manual_match_override(
      'd9900000-0000-4000-8000-000000000001'
    )
  $remote$),
  1,
  'clear starts behind the provider-owned match row'
);
select ok(
  pg_temp.wait_for_remote_lock(
    (select pid from slice9_clear_backend_pids where name = 'two')
  ),
  'clear waits for the provider transaction without deadlock'
);
select is(
  extensions.dblink_exec('slice9_clear_provider', 'commit'),
  'COMMIT',
  'the provider skip commits before handoff resumes'
);
create temp table slice9_provider_first_clear as
select result.*
from extensions.dblink_get_result('slice9_clear_two', false)
  as result(cleared boolean);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_clear_two', false)
     as drained(value text)),
  0,
  'the provider-first clear protocol is fully drained'
);
select is(
  (select cleared from slice9_provider_first_clear),
  true,
  'the waiting clear succeeds after the provider releases the Manual row'
);
create temp table slice9_provider_after_clear as
select result.*
from extensions.dblink(
  'slice9_clear_provider',
  'select * from pg_temp.apply_reverse_fixture()'
) as result(matches_changed integer, manual_skipped integer);
select results_eq(
  $$select matches_changed, manual_skipped from slice9_provider_after_clear$$,
  $$values (1, 0)$$,
  'the next provider apply resumes with no Manual skip'
);
select ok(
  (
    select match.round_number = 3
      and match.provider_round_label = 'Regular Season - 3'
      and match.kickoff_at = '2099-05-15T18:00:00Z'::timestamptz
      and not match.is_manually_overridden
      and match.result_version = 0
    from public.matches as match
    where match.id = 'd9900000-0000-4000-8000-000000000001'
  )
  and (
    select count(*) = 1
    from public.audit_logs as audit
    where audit.action = 'match_manual_override_cleared'
      and audit.entity_id = 'd9900000-0000-4000-8000-000000000001'
  ),
  'provider-first ordering preserves one handoff audit and then applies data'
);

-- Revocation wins while clear waits on a league. The helper authenticated the
-- initial request, but post-wait key-share revalidation must reject it.
select is(
  extensions.dblink_exec('slice9_clear_control', $remote$
    update public.matches
    set round_number = 1,
        provider_round_label = 'Regular Season - 1',
        provider_status = 'NS',
        kickoff_at = '2099-05-01T17:00:00Z',
        is_manually_overridden = true,
        updated_at = '2098-08-01T00:00:00Z'
    where id = 'd9900000-0000-4000-8000-000000000001';
    delete from public.audit_logs
    where action = 'match_manual_override_cleared'
      and entity_id = 'd9900000-0000-4000-8000-000000000001';
  $remote$),
  'DELETE 1',
  'the revocation-wins fixture is reset and committed'
);
select is(
  extensions.dblink_exec('slice9_clear_one', $remote$
    create function pg_temp.try_clear_manual_override()
    returns text
    language plpgsql
    as $function$
    begin
      perform * from public.clear_manual_match_override(
        'd9900000-0000-4000-8000-000000000001'
      );
      return 'NO_ERROR';
    exception when raise_exception then
      return sqlerrm;
    end;
    $function$;
  $remote$),
  'CREATE FUNCTION',
  'the handoff session has a safe stable-error probe'
);
select is(
  extensions.dblink_exec('slice9_clear_locker', $remote$
    begin;
    update public.leagues
    set name = name
    where id = 'd9900000-0000-4000-8000-000000000010';
  $remote$),
  'UPDATE 1',
  'the lock holder owns the league before clear begins'
);
select is(
  extensions.dblink_send_query(
    'slice9_clear_one',
    'select pg_temp.try_clear_manual_override()'
  ),
  1,
  'clear starts and reaches the canonical league wait'
);
select ok(
  pg_temp.wait_for_remote_lock(
    (select pid from slice9_clear_backend_pids where name = 'one')
  ),
  'clear is waiting before administrator revalidation'
);
select is(
  extensions.dblink_exec('slice9_clear_revoker', $remote$
    delete from public.system_admins
    where user_id = 'd9911111-1111-4111-8111-111111111111';
  $remote$),
  'DELETE 1',
  'administrator revocation commits while clear waits'
);
select is(
  extensions.dblink_exec('slice9_clear_locker', 'commit'),
  'COMMIT',
  'the league lock is released after revocation commits'
);
create temp table slice9_revocation_wins_result as
select result.*
from extensions.dblink_get_result('slice9_clear_one', false)
  as result(error_code text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_clear_one', false)
     as drained(value text)),
  0,
  'the revocation-wins clear protocol is fully drained'
);
select is(
  (select error_code from slice9_revocation_wins_result),
  'FORBIDDEN',
  'post-wait actor revalidation makes the committed revocation win'
);
select ok(
  (
    select match.is_manually_overridden
      and match.round_number = 1
      and match.kickoff_at = '2099-05-01T17:00:00Z'::timestamptz
      and match.result_version = 0
    from public.matches as match
    where match.id = 'd9900000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.audit_logs as audit
    where audit.action = 'match_manual_override_cleared'
      and audit.entity_id = 'd9900000-0000-4000-8000-000000000001'
  ),
  'a revocation-winning race preserves the match and writes no audit'
);

-- Once clear retains the administrator key-share, a concurrent revocation must
-- wait until the already-authorized mutation commits.
select is(
  extensions.dblink_exec('slice9_clear_control', $remote$
    insert into public.system_admins (user_id, granted_by)
    values (
      'd9911111-1111-4111-8111-111111111111',
      'd9911111-1111-4111-8111-111111111111'
    );
  $remote$),
  'INSERT 0 1',
  'the administrator is restored for the opposite ordering'
);
select is(
  extensions.dblink_exec('slice9_clear_revoker', $remote$
    create function pg_temp.revoke_clear_actor()
    returns integer
    language plpgsql
    as $function$
    declare
      v_rows integer;
    begin
      delete from public.system_admins
      where user_id = 'd9911111-1111-4111-8111-111111111111';
      get diagnostics v_rows = row_count;
      return v_rows;
    end;
    $function$;
  $remote$),
  'CREATE FUNCTION',
  'the revocation session has a bounded result probe'
);
select is(
  extensions.dblink_exec('slice9_clear_one', 'begin'),
  'BEGIN',
  'the clear-wins transaction begins'
);
create temp table slice9_clear_wins_result as
select result.*
from extensions.dblink('slice9_clear_one', $remote$
  select result_cleared
  from public.clear_manual_match_override(
    'd9900000-0000-4000-8000-000000000001'
  )
$remote$) as result(cleared boolean);
select is(
  (select cleared from slice9_clear_wins_result),
  true,
  'clear succeeds while retaining the actor key-share lock'
);
select is(
  extensions.dblink_send_query(
    'slice9_clear_revoker',
    'select pg_temp.revoke_clear_actor()'
  ),
  1,
  'revocation starts behind the authorized clear'
);
select ok(
  pg_temp.wait_for_remote_lock(
    (select pid from slice9_clear_backend_pids where name = 'revoker')
  ),
  'revocation waits on the retained administrator key-share lock'
);
select is(
  extensions.dblink_exec('slice9_clear_one', 'commit'),
  'COMMIT',
  'the already-authorized handoff commits without deadlock'
);
create temp table slice9_clear_wins_revocation as
select result.*
from extensions.dblink_get_result('slice9_clear_revoker', false)
  as result(rows_deleted integer);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_clear_revoker', false)
     as drained(value text)),
  0,
  'the clear-wins revocation protocol is fully drained'
);
select is(
  (select rows_deleted from slice9_clear_wins_revocation),
  1,
  'revocation proceeds only after the authorized clear commits'
);
select ok(
  not exists (
    select 1 from public.system_admins as administrator
    where administrator.user_id = 'd9911111-1111-4111-8111-111111111111'
  )
  and not (
    select match.is_manually_overridden
    from public.matches as match
    where match.id = 'd9900000-0000-4000-8000-000000000001'
  )
  and (
    select count(*) = 1
    from public.audit_logs as audit
    where audit.action = 'match_manual_override_cleared'
      and audit.entity_id = 'd9900000-0000-4000-8000-000000000001'
  ),
  'the clear-wins ordering leaves one durable mutation/audit before revocation'
);

-- Restore global lease state and remove every committed disposable row.
select is(
  extensions.dblink_exec('slice9_clear_control', $remote$
    begin;

    update public.sync_leases
    set run_id = null,
        fencing_token = null,
        locked_until = null
    where provider = 'api-football';
    delete from public.sync_runs
    where id = 'd9900000-0000-4000-8000-000000000900';

    delete from public.audit_logs
    where actor_id = 'd9911111-1111-4111-8111-111111111111'
       or entity_id between
         'd9900000-0000-4000-8000-000000000001'::uuid and
         'd9900000-0000-4000-8000-000000000099'::uuid;
    delete from public.predictions
    where match_id = 'd9900000-0000-4000-8000-000000000001';
    delete from public.leagues
    where id = 'd9900000-0000-4000-8000-000000000010';
    delete from public.matches
    where id = 'd9900000-0000-4000-8000-000000000001';
    delete from public.sports_provider_rounds
    where season_id = 'd9900000-0000-4000-8000-000000000027';
    delete from public.teams
    where id between
      'd9900000-0000-4000-8000-000000000101'::uuid and
      'd9900000-0000-4000-8000-000000000102'::uuid;
    delete from public.seasons
    where id = 'd9900000-0000-4000-8000-000000000027';
    delete from public.competitions
    where id = 'd9900000-0000-4000-8000-000000000020';
    delete from public.system_admins
    where user_id = 'd9911111-1111-4111-8111-111111111111';
    delete from auth.users
    where id = 'd9911111-1111-4111-8111-111111111111';

    update public.sync_leases as lease
    set generation = snapshot.generation,
        run_id = snapshot.run_id,
        fencing_token = snapshot.fencing_token,
        locked_until = snapshot.locked_until,
        last_catalog_at = snapshot.last_catalog_at,
        last_targeted_at = snapshot.last_targeted_at,
        last_reconciliation_at = snapshot.last_reconciliation_at,
        last_forced_at = snapshot.last_forced_at,
        backoff_until = snapshot.backoff_until,
        updated_at = snapshot.updated_at
    from slice9_clear_lease_snapshot as snapshot
    where lease.provider = snapshot.provider;

    commit;
  $remote$),
  'COMMIT',
  'the committed fixture is removed and the original lease is restored'
);

select is(
  extensions.dblink_disconnect('slice9_clear_one'),
  'OK',
  'the first handoff connection closes'
);
select is(
  extensions.dblink_disconnect('slice9_clear_two'),
  'OK',
  'the second handoff connection closes'
);
select is(
  extensions.dblink_disconnect('slice9_clear_provider'),
  'OK',
  'the provider connection closes'
);
select is(
  extensions.dblink_disconnect('slice9_clear_locker'),
  'OK',
  'the lock-holder connection closes'
);
select is(
  extensions.dblink_disconnect('slice9_clear_revoker'),
  'OK',
  'the revocation connection closes'
);
select is(
  extensions.dblink_disconnect('slice9_clear_control'),
  'OK',
  'the control connection closes'
);

select * from finish();

rollback;
