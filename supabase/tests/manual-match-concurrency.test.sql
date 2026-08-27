begin;

select no_plan();

create extension if not exists dblink with schema extensions;

create temp table slice9_concurrency_payload as
select jsonb_build_object(
  'catalogId', 'manual-catalog-v1',
  'competitionId', '26000000-0000-4000-8000-000000000001',
  'seasonId', '26000000-0000-4000-8000-000000000027',
  'teams', (
    select jsonb_agg(
      jsonb_build_object(
        'id', team.id,
        'name', team.name,
        'shortName', team.short_name
      ) order by team.id
    )
    from public.teams as team
    where team.id between
      '26000000-0000-4000-8000-000000000101'::uuid and
      '26000000-0000-4000-8000-000000000106'::uuid
  ),
  'matches', (
    select jsonb_agg(
      jsonb_build_object(
        'id', match.id,
        'seasonId', match.season_id,
        'roundNumber', match.round_number,
        'homeTeamId', match.home_team_id,
        'awayTeamId', match.away_team_id,
        'kickoffAt', to_char(
          match.kickoff_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'status', match.status,
        'homeScore', match.home_score,
        'awayScore', match.away_score
      ) order by match.id
    )
    from public.matches as match
    where match.id between
      '26000000-0000-4000-8000-000000000201'::uuid and
      '26000000-0000-4000-8000-000000000205'::uuid
  )
) as payload;

select is(
  extensions.dblink_connect(
    'slice9_manual_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the lifecycle control connection opens'
);
select is(
  extensions.dblink_connect(
    'slice9_manual_locker',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the lifecycle lock-holder connection opens'
);
select is(
  extensions.dblink_connect(
    'slice9_manual_caller',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the Manual caller connection opens'
);

select is(
  extensions.dblink_exec('slice9_manual_control', $remote$
    delete from public.leagues
    where id = 'd9400000-0000-4000-8000-000000000401';
    delete from public.matches
    where id = 'd9400000-0000-4000-8000-000000000301';
    insert into public.leagues (
      id, manager_id, season_id, name, status
    ) values (
      'd9400000-0000-4000-8000-000000000401',
      '70000000-0000-4000-8000-000000000007',
      '26000000-0000-4000-8000-000000000027',
      'Manual lifecycle race fixture', 'open'
    );
  $remote$),
  'INSERT 0 1',
  'the disposable open league fixture is committed'
);
select is(
  extensions.dblink_exec('slice9_manual_caller', $remote$
    set role service_role;
    set request.headers =
      '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}';
    create function pg_temp.try_manual_create()
    returns text
    language plpgsql
    as $function$
    begin
      perform * from public.create_or_correct_match(
        'create', 'd9400000-0000-4000-8000-000000000301',
        '26000000-0000-4000-8000-000000000027',
        '26000000-0000-4000-8000-000000000101',
        '26000000-0000-4000-8000-000000000102',
        9, '2099-10-17T16:00:00Z', 'scheduled', null, null
      );
      return 'NO_ERROR';
    exception when raise_exception then
      return sqlerrm;
    end;
    $function$;
  $remote$),
  'CREATE FUNCTION',
  'the isolated service caller has the fixed actor and safe error probe'
);
select is(
  extensions.dblink_exec('slice9_manual_locker', $remote$
    begin;
    update public.leagues
    set status = 'completed'
    where id = 'd9400000-0000-4000-8000-000000000401';
  $remote$),
  'UPDATE 1',
  'completion owns the league row before Manual create starts'
);
select is(
  extensions.dblink_send_query(
    'slice9_manual_caller',
    'select pg_temp.try_manual_create()'
  ),
  1,
  'Manual create starts concurrently with completion'
);
select pg_sleep(0.1);
select is(
  extensions.dblink_is_busy('slice9_manual_caller'),
  1,
  'Manual create waits behind the canonical league lock'
);
select is(
  extensions.dblink_exec('slice9_manual_locker', 'commit'),
  'COMMIT',
  'completion commits before Manual create re-evaluates state'
);
create temp table slice9_create_race_result as
select result.*
from extensions.dblink_get_result('slice9_manual_caller') as result(
  error_code text
);
select is(
  (select error_code from slice9_create_race_result),
  'COMPLETED_RECONCILIATION_REQUIRED',
  'the completion winner makes concurrent create fail closed'
);
select is(
  (select count(*)::integer from public.matches
   where id = 'd9400000-0000-4000-8000-000000000301'),
  0,
  'the losing create leaves no fixture behind'
);
select is(
  extensions.dblink_disconnect('slice9_manual_caller'),
  'OK',
  'the completed create probe connection closes'
);
select is(
  extensions.dblink_connect(
    'slice9_manual_caller',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'a fresh Manual caller connection opens for the catalog race'
);
select is(
  extensions.dblink_exec('slice9_manual_control', $remote$
    update public.leagues
    set status = 'open'
    where id = 'd9400000-0000-4000-8000-000000000401';
    delete from public.matches
    where id = '26000000-0000-4000-8000-000000000205';
  $remote$),
  'DELETE 1',
  'the catalog race begins with one committed missing fixture'
);
select is(
  extensions.dblink_exec('slice9_manual_locker', $remote$
    begin;
    update public.leagues
    set status = 'completed'
    where id = 'd9400000-0000-4000-8000-000000000401';
  $remote$),
  'UPDATE 1',
  'completion again owns the league row before import starts'
);
select is(
  extensions.dblink_send_query(
    'slice9_manual_caller',
    format(
      $remote$
        select result_run_id, result_status::text, result_code
        from private.slice9_apply_manual_fixture_catalog_core(
          %L::jsonb,
          '70000000-0000-4000-8000-000000000007'::uuid,
          '2026-08-01T00:00:00Z'::timestamptz
        )
      $remote$,
      (select payload::text from slice9_concurrency_payload)
    )
  ),
  1,
  'the fixed-time owner-only full catalog core starts concurrently with completion'
);
select pg_sleep(0.1);
select is(
  extensions.dblink_is_busy('slice9_manual_caller'),
  1,
  'the full catalog core also waits behind the league lock'
);
select is(
  extensions.dblink_exec('slice9_manual_locker', 'commit'),
  'COMMIT',
  'completion commits before catalog preflight resumes'
);
create temp table slice9_catalog_race_result as
select result.*
from extensions.dblink_get_result('slice9_manual_caller') as result(
  run_id uuid,
  status text,
  result_code text
);
select results_eq(
  $$select status, result_code from slice9_catalog_race_result$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text)$$,
  'the completed-season importer records one terminal conflict'
);
select results_eq(
  $$select run.provider, run.sync_kind::text, run.status::text,
           run.error_code, run.rows_inserted, run.teams_changed,
           run.matches_changed, run.finished_at is not null
    from public.sync_runs as run
    where run.id = (select run_id from slice9_catalog_race_result)$$,
  $$values ('manual'::text, 'manual'::text, 'failed'::text,
            'MANUAL_CATALOG_CONFLICT'::text, 0, 0, 0, true)$$,
  'the lock-wait loser persists exactly one matching failed Manual run'
);
select is(
  (select count(*)::integer from public.matches
   where id = '26000000-0000-4000-8000-000000000205'),
  0,
  'the losing import does not fill the missing fixture'
);
select is(
  extensions.dblink_disconnect('slice9_manual_caller'),
  'OK',
  'the completed catalog probe connection closes'
);
select is(
  extensions.dblink_connect(
    'slice9_manual_caller',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'a fresh Manual caller connection opens for catalog restoration'
);
select is(
  extensions.dblink_exec('slice9_manual_caller', $remote$
    set role service_role;
    set request.headers =
      '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}';
  $remote$),
  'SET',
  'the restoration caller receives the fixed system actor'
);

select is(
  extensions.dblink_exec('slice9_manual_control', $remote$
    delete from public.leagues
    where id = 'd9400000-0000-4000-8000-000000000401';
  $remote$),
  'DELETE 1',
  'the disposable lifecycle fixture is removed before catalog restoration'
);
create temp table slice9_restore_result as
select result.*
from extensions.dblink(
  'slice9_manual_caller',
  format(
    $remote$
      select result_run_id, result_status::text, result_code,
             result_rows_inserted, result_teams_changed,
             result_matches_changed
      from public.apply_manual_fixture_catalog(%L::jsonb)
    $remote$,
    (select payload::text from slice9_concurrency_payload)
  )
  ) as result(
    run_id uuid,
    status text,
    result_code text,
    rows_inserted integer,
    teams_changed integer,
    matches_changed integer
  );
select ok(
  (
    select
      (
        status = 'succeeded'
        and result_code = 'MANUAL_APPLIED'
        and rows_inserted = 1
        and teams_changed = 0
        and matches_changed = 1
      ) or (
        status = 'failed'
        and result_code = 'MANUAL_CATALOG_CONFLICT'
        and rows_inserted = 0
        and teams_changed = 0
        and matches_changed = 0
      )
    from slice9_restore_result
  ),
  'actual-clock restoration returns only a coherent apply or conflict outcome'
);
select ok(
  (
    select
      run.status::text = result.status
      and run.rows_inserted = result.rows_inserted
      and run.teams_changed = result.teams_changed
      and run.matches_changed = result.matches_changed
      and run.finished_at is not null
      and case
        when result.status = 'succeeded' then run.error_code is null
        else run.error_code = 'MANUAL_CATALOG_CONFLICT'
      end
    from slice9_restore_result as result
    join public.sync_runs as run on run.id = result.run_id
  ),
  'actual-clock restoration records one matching terminal run'
);
select is(
  (select count(*)::integer from public.matches
   where id = '26000000-0000-4000-8000-000000000205'),
  (select case when result_code = 'MANUAL_APPLIED' then 1 else 0 end
   from slice9_restore_result),
  'actual-clock restoration either inserts the full leaf or leaves it absent'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied'
     and actor_id = '70000000-0000-4000-8000-000000000007'),
  (select case when result_code = 'MANUAL_APPLIED' then 1 else 0 end
   from slice9_restore_result),
  'actual-clock restoration writes a business audit only for a real insert'
);
select ok(
  extensions.dblink_exec('slice9_manual_control', $remote$
    insert into public.matches (
      id, season_id, round_number, home_team_id, away_team_id,
      kickoff_at, status
    ) values (
      '26000000-0000-4000-8000-000000000205',
      '26000000-0000-4000-8000-000000000027', 2,
      '26000000-0000-4000-8000-000000000102',
      '26000000-0000-4000-8000-000000000105',
      '2026-10-24T18:30:00Z'::timestamptz, 'canceled'
    ) on conflict (id) do nothing;
  $remote$) in ('INSERT 0 0', 'INSERT 0 1'),
  'owner-side cleanup restores the disposable catalog leaf idempotently'
);
select is(
  (select count(*)::integer from public.matches
   where id = '26000000-0000-4000-8000-000000000205'),
  1,
  'owner-side cleanup leaves the exact disposable leaf restored'
);
select is(
  extensions.dblink_exec(
    'slice9_manual_control',
    format(
      $cleanup$
        delete from public.audit_logs
        where action = 'manual_catalog_applied'
          and actor_id = '70000000-0000-4000-8000-000000000007';
        delete from public.sync_runs
        where id in (%L::uuid, %L::uuid);
      $cleanup$,
      (select run_id from slice9_catalog_race_result),
      (select run_id from slice9_restore_result)
    )
  ),
  'DELETE 2',
  'the committed race evidence is removed from the disposable database'
);

select is(
  extensions.dblink_disconnect('slice9_manual_control'),
  'OK',
  'the lifecycle control connection closes'
);
select is(
  extensions.dblink_disconnect('slice9_manual_locker'),
  'OK',
  'the lifecycle lock-holder connection closes'
);
select is(
  extensions.dblink_disconnect('slice9_manual_caller'),
  'OK',
  'the Manual caller connection closes'
);

select * from finish();
rollback;
