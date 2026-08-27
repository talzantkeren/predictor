-- Real committed dblink sessions are intentional: one pgTAP transaction or a
-- mocked clock cannot reproduce a waiter crossing a database-time boundary.
-- If this file is interrupted before cleanup, reset disposable Local Supabase
-- before trusting later counts.

begin;

select no_plan();

create extension if not exists dblink with schema extensions;

select ok(
  lower(pg_get_functiondef(
    'public.save_prediction(uuid,uuid,numeric,numeric)'::regprocedure
  )) ~ 'pg_advisory_xact_lock\([[:space:]]*2026090609[[:space:]]*,[[:space:]]*pg_catalog\.hashtext\(p_league_id::text\)'
  and position(
    'for update'
    in lower(pg_get_functiondef('public.save_prediction(uuid,uuid,numeric,numeric)'::regprocedure))
  ) > 0
  and position(
    'private.slice9_save_prediction_without_league_lock'
    in lower(pg_get_functiondef('public.save_prediction(uuid,uuid,numeric,numeric)'::regprocedure))
  ) > 0
  and position(
    'clock_timestamp()'
    in lower(pg_get_functiondef(
      'private.slice9_save_prediction_without_league_lock(uuid,uuid,numeric,numeric)'::regprocedure
    ))
  ) > position(
    'for update'
    in lower(pg_get_functiondef(
      'private.slice9_save_prediction_without_league_lock(uuid,uuid,numeric,numeric)'::regprocedure
    ))
  ),
  'save_prediction locks league first and its delegate samples wall-clock time only after child locking begins'
);
select ok(
  position(
    'v_decision_at := clock_timestamp()'
    in lower(pg_get_functiondef('public.claim_sports_sync(text,boolean)'::regprocedure))
  ) > position(
    'for update'
    in lower(pg_get_functiondef('public.claim_sports_sync(text,boolean)'::regprocedure))
  )
  and position(
    'v_issued_at + interval ''120 seconds'''
    in lower(pg_get_functiondef('public.claim_sports_sync(text,boolean)'::regprocedure))
  ) > 0,
  'claim_sports_sync decides after the lease lock and measures a full lease from issuance'
);
select ok(
  to_regprocedure('private.lock_api_football_cancellation_state(text,timestamp with time zone)') is not null
  and not has_function_privilege(
    'service_role',
    'private.lock_api_football_cancellation_state(text,timestamp with time zone)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.lock_api_football_cancellation_state(text,timestamp with time zone)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'private.lock_api_football_cancellation_state(text,timestamp with time zone)',
    'EXECUTE'
  ),
  'the match-locking cancellation helper is inaccessible to all Data API roles'
);

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

create function pg_temp.wait_until_after(p_boundary timestamptz)
returns void
language plpgsql
as $$
begin
  if p_boundary > clock_timestamp() + interval '8 seconds' then
    raise exception 'test boundary is unexpectedly far in the future';
  end if;
  while clock_timestamp() <= p_boundary + interval '100 milliseconds' loop
    perform pg_catalog.pg_sleep(0.01);
  end loop;
end;
$$;

select is(
  extensions.dblink_connect(
    'slice9_time_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the committed fixture/control connection opens'
);
select is(
  extensions.dblink_connect(
    'slice9_time_locker',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the row-lock holder connection opens'
);
select is(
  extensions.dblink_connect(
    'slice9_time_worker',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the asynchronous worker connection opens'
);
select is(
  extensions.dblink_connect(
    'slice9_time_admin',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the independent system-admin connection opens'
);

select is(
  extensions.dblink_exec('slice9_time_worker', $remote$
    set statement_timeout = '15s';
    set lock_timeout = '10s';
  $remote$),
  'SET',
  'the worker has bounded deadlock and lock-wait detection'
);
select is(
  extensions.dblink_exec('slice9_time_admin', $remote$
    set statement_timeout = '15s';
    set lock_timeout = '10s';
    set role service_role;
    set request.headers = '{"x-predictor-system-actor":"f9111111-1111-4111-8111-111111111111"}';
  $remote$),
  'SET',
  'the admin connection receives only the fixed system actor context'
);

select is(
  extensions.dblink_exec('slice9_time_control', $remote$
    begin;

    create temp table slice9_time_lease_snapshot
      on commit preserve rows
      as select * from public.sync_leases where provider = 'api-football';
    create temp table slice9_time_created_runs (
      run_id uuid primary key
    ) on commit preserve rows;

    update public.sync_leases
    set run_id = null,
        fencing_token = null,
        locked_until = null,
        last_catalog_at = null,
        last_targeted_at = null,
        last_reconciliation_at = null,
        last_forced_at = null,
        backoff_until = null,
        updated_at = clock_timestamp()
    where provider = 'api-football';

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
      (
        '00000000-0000-0000-0000-000000000000',
        'f9111111-1111-4111-8111-111111111111',
        'authenticated', 'authenticated', 'slice9-time-admin@example.com',
        crypt(extensions.gen_random_uuid()::text, gen_salt('bf')), clock_timestamp(),
        '{"provider":"email","providers":["email"]}',
        '{"display_name":"מנהלת זמן מסד"}', clock_timestamp(), clock_timestamp()
      ),
      (
        '00000000-0000-0000-0000-000000000000',
        'f9222222-2222-4222-8222-222222222222',
        'authenticated', 'authenticated', 'slice9-time-member@example.com',
        crypt(extensions.gen_random_uuid()::text, gen_salt('bf')), clock_timestamp(),
        '{"provider":"email","providers":["email"]}',
        '{"display_name":"חברת זמן מסד"}', clock_timestamp(), clock_timestamp()
      );

    insert into public.competitions (
      id, name, slug, country_code, external_provider, external_id
    ) values (
      'f9000000-0000-4000-8000-000000000020',
      'תחרות זמן מסד', 'slice9-time', 'IL', 'api-football', '383'
    );
    insert into public.seasons (
      id, competition_id, name, starts_on, ends_on, is_current,
      external_provider, external_id
    ) values (
      'f9000000-0000-4000-8000-000000000027',
      'f9000000-0000-4000-8000-000000000020',
      '2031/32', '2031-07-01', '2032-06-30', false,
      'api-football', '2026'
    );
    insert into public.teams (
      id, name, short_name, external_provider, external_id
    ) values
      (
        'f9000000-0000-4000-8000-000000000101',
        'בית זמן מסד', 'בית זמן', 'api-football', '990911'
      ),
      (
        'f9000000-0000-4000-8000-000000000102',
        'חוץ זמן מסד', 'חוץ זמן', 'api-football', '990912'
      );
    insert into public.matches (
      id, season_id, round_number, provider_round_label, provider_status,
      home_team_id, away_team_id, kickoff_at, status,
      external_provider, external_id
    ) values
      (
        'f9000000-0000-4000-8000-000000000001',
        'f9000000-0000-4000-8000-000000000027',
        1, null, null,
        'f9000000-0000-4000-8000-000000000101',
        'f9000000-0000-4000-8000-000000000102',
        clock_timestamp() + interval '1 day', 'scheduled', null, null
      ),
      (
        'f9000000-0000-4000-8000-000000000002',
        'f9000000-0000-4000-8000-000000000027',
        1, 'Round 1', 'NS',
        'f9000000-0000-4000-8000-000000000101',
        'f9000000-0000-4000-8000-000000000102',
        clock_timestamp() + interval '1 day', 'scheduled',
        'api-football', '990901'
      ),
      (
        'f9000000-0000-4000-8000-000000000003',
        'f9000000-0000-4000-8000-000000000027',
        1, 'Round 1', 'CANC',
        'f9000000-0000-4000-8000-000000000101',
        'f9000000-0000-4000-8000-000000000102',
        clock_timestamp() + interval '1 day', 'canceled',
        'api-football', '990902'
      ),
      (
        'f9000000-0000-4000-8000-000000000004',
        'f9000000-0000-4000-8000-000000000027',
        1, 'Round 1', 'NS',
        'f9000000-0000-4000-8000-000000000101',
        'f9000000-0000-4000-8000-000000000102',
        clock_timestamp() + interval '1 day', 'scheduled',
        'api-football', '990903'
      ),
      (
        'f9000000-0000-4000-8000-000000000005',
        'f9000000-0000-4000-8000-000000000027',
        1, 'Round 1', 'NS',
        'f9000000-0000-4000-8000-000000000101',
        'f9000000-0000-4000-8000-000000000102',
        clock_timestamp() - interval '1 minute', 'scheduled',
        'api-football', '990904'
      );
    insert into public.leagues (
      id, manager_id, season_id, name, status
    ) values (
      'f9000000-0000-4000-8000-000000000010',
      'f9111111-1111-4111-8111-111111111111',
      'f9000000-0000-4000-8000-000000000027',
      'ליגת זמן מסד', 'active'
    );
    insert into public.league_scoring_rules (
      league_id, exact_points, correct_outcome_points, incorrect_points
    ) values ('f9000000-0000-4000-8000-000000000010', 3, 1, 0);
    insert into public.league_members (
      league_id, user_id, status, approved_by, approved_at
    ) values
      (
        'f9000000-0000-4000-8000-000000000010',
        'f9111111-1111-4111-8111-111111111111', 'active',
        'f9111111-1111-4111-8111-111111111111', clock_timestamp()
      ),
      (
        'f9000000-0000-4000-8000-000000000010',
        'f9222222-2222-4222-8222-222222222222', 'active',
        'f9111111-1111-4111-8111-111111111111', clock_timestamp()
      );
    insert into public.system_admins (user_id, granted_by)
    values (
      'f9111111-1111-4111-8111-111111111111',
      'f9111111-1111-4111-8111-111111111111'
    );

    commit;
  $remote$),
  'COMMIT',
  'committed cross-session fixtures and the original lease snapshot are installed'
);

create temp table slice9_time_worker_backend as
select backend.pid
from extensions.dblink(
  'slice9_time_worker',
  'select pg_catalog.pg_backend_pid()'
) as backend(pid integer);
create temp table slice9_time_admin_backend as
select backend.pid
from extensions.dblink(
  'slice9_time_admin',
  'select pg_catalog.pg_backend_pid()'
) as backend(pid integer);

-- A transaction begins before kickoff, blocks on the match, and may resume only
-- after the authoritative wall-clock boundary has passed.
select is(
  extensions.dblink_exec('slice9_time_worker', $remote$
    reset role;
    set role authenticated;
    set request.jwt.claims = '{"sub":"f9222222-2222-4222-8222-222222222222","role":"authenticated"}';
  $remote$),
  'SET',
  'the prediction worker has the active member session'
);
select is(extensions.dblink_exec('slice9_time_locker', 'begin'), 'BEGIN', 'prediction lock holder begins');
select is(
  extensions.dblink_exec('slice9_time_locker', $remote$
    update public.matches
    set kickoff_at = clock_timestamp() + interval '3 seconds',
        status = 'scheduled',
        predictions_locked_at = null
    where id = 'f9000000-0000-4000-8000-000000000001'
  $remote$),
  'UPDATE 1',
  'the holder establishes and owns the near kickoff row'
);
create temp table slice9_prediction_boundary as
select boundary.kickoff_at
from extensions.dblink(
  'slice9_time_locker',
  $$select kickoff_at from public.matches
    where id = 'f9000000-0000-4000-8000-000000000001'$$
) as boundary(kickoff_at timestamptz);
select ok(
  clock_timestamp() < (select kickoff_at from slice9_prediction_boundary),
  'the prediction call is dispatched before kickoff'
);
select is(
  extensions.dblink_send_query('slice9_time_worker', $remote$
    select prediction_id::text
    from public.save_prediction(
      'f9000000-0000-4000-8000-000000000010',
      'f9000000-0000-4000-8000-000000000001',
      2, 1
    )
  $remote$),
  1,
  'save_prediction starts asynchronously before kickoff'
);
select ok(
  pg_temp.wait_for_remote_lock((select pid from slice9_time_worker_backend))
  and clock_timestamp() < (select kickoff_at from slice9_prediction_boundary),
  'save_prediction is observed waiting on the match while kickoff is still future'
);
select lives_ok(
  format(
    'select pg_temp.wait_until_after(%L::timestamptz)',
    (select kickoff_at from slice9_prediction_boundary)
  ),
  'database wall time crosses kickoff while the save remains blocked'
);
select is(
  extensions.dblink_exec('slice9_time_locker', 'commit'),
  'COMMIT',
  'the match row is released only after kickoff'
);
create temp table slice9_prediction_result (
  result_text text,
  error_text text
);
insert into slice9_prediction_result (result_text)
select result.value
from extensions.dblink_get_result('slice9_time_worker', false) as result(value text);
insert into slice9_prediction_result (result_text, error_text)
select null, null
where not exists (select 1 from slice9_prediction_result);
update slice9_prediction_result
set error_text = extensions.dblink_error_message('slice9_time_worker');
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_time_worker', false) as drained(value text)),
  0,
  'the asynchronous prediction protocol is fully drained'
);
select ok(
  (select position('PREDICTION_LOCKED' in coalesce(error_text, '')) > 0
     from slice9_prediction_result)
  and not exists (
    select 1 from slice9_prediction_result
    where lower(coalesce(error_text, '')) like '%deadlock%'
       or lower(coalesce(error_text, '')) like '%lock timeout%'
       or lower(coalesce(error_text, '')) like '%statement timeout%'
  ),
  'the pre-kickoff waiter is rejected after kickoff without deadlock or timeout'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = 'f9000000-0000-4000-8000-000000000010'
     and match_id = 'f9000000-0000-4000-8000-000000000001'
     and user_id = 'f9222222-2222-4222-8222-222222222222'),
  0,
  'the rejected late commit writes no prediction'
);

-- Claim a fenced run, then make its cancellation wait across kickoff. The
-- incoming provider kickoff remains future so only the locked persisted row can
-- prove whether the elapsed boundary was sampled freshly.
create temp table slice9_apply_claim as
select claim.*
from extensions.dblink(
  'slice9_time_admin',
  $$select result_outcome, result_run_id, result_generation, result_token
    from public.claim_sports_sync('api-football', true)$$
) as claim(
  outcome text,
  run_id uuid,
  generation bigint,
  token uuid
);
select results_eq(
  $$select outcome, run_id is not null, generation > 0, token is not null
    from slice9_apply_claim$$,
  $$values ('CLAIMED'::text, true, true, true)$$,
  'a valid fenced run is available for the cancellation race'
);
select is(
  extensions.dblink_exec('slice9_time_worker', $remote$
    reset role;
    set role service_role;
    set request.headers = '{"x-predictor-system-actor":"f9111111-1111-4111-8111-111111111111"}';
  $remote$),
  'SET',
  'the apply worker has the fixed server actor context'
);
select is(extensions.dblink_exec('slice9_time_locker', 'begin'), 'BEGIN', 'cancellation lock holder begins');
select is(
  extensions.dblink_exec('slice9_time_locker', $remote$
    update public.matches
    set kickoff_at = clock_timestamp() + interval '3 seconds',
        status = 'scheduled',
        provider_status = 'NS',
        home_score = null,
        away_score = null,
        predictions_locked_at = null,
        is_manually_overridden = false
    where id = 'f9000000-0000-4000-8000-000000000002'
  $remote$),
  'UPDATE 1',
  'the holder owns the provider match through its near kickoff'
);
create temp table slice9_cancellation_boundary as
select boundary.kickoff_at
from extensions.dblink(
  'slice9_time_locker',
  $$select kickoff_at from public.matches
    where id = 'f9000000-0000-4000-8000-000000000002'$$
) as boundary(kickoff_at timestamptz);
select ok(
  clock_timestamp() < (select kickoff_at from slice9_cancellation_boundary),
  'the cancellation apply is dispatched before persisted kickoff'
);
select is(
  extensions.dblink_send_query(
    'slice9_time_worker',
    format($remote$
      select concat_ws(',',
        result_matches_changed::text,
        result_results_changed::text,
        result_manual_overrides_skipped::text
      )
      from public.apply_api_football_sync_batch(
        %L::uuid, %s, %L::uuid,
        jsonb_build_object(
          'competition', null,
          'season', null,
          'teams', jsonb_build_array(),
          'rounds', jsonb_build_array(),
          'fixtures', jsonb_build_array(jsonb_build_object(
            'externalId', '990901',
            'roundNumber', 1,
            'roundLabel', 'Round 1',
            'providerStatus', 'CANC',
            'homeTeamExternalId', '990911',
            'awayTeamExternalId', '990912',
            'kickoffAt', (clock_timestamp() + interval '10 minutes')::text,
            'status', 'canceled',
            'resultDisposition', 'none',
            'locksPredictions', false,
            'homeScore', null,
            'awayScore', null
          ))
        )
      )
    $remote$,
      (select run_id from slice9_apply_claim),
      (select generation from slice9_apply_claim),
      (select token from slice9_apply_claim)
    )
  ),
  1,
  'provider cancellation starts asynchronously before kickoff'
);
select ok(
  pg_temp.wait_for_remote_lock((select pid from slice9_time_worker_backend))
  and clock_timestamp() < (select kickoff_at from slice9_cancellation_boundary),
  'the cancellation is observed waiting on the locked match before kickoff'
);
select lives_ok(
  format(
    'select pg_temp.wait_until_after(%L::timestamptz)',
    (select kickoff_at from slice9_cancellation_boundary)
  ),
  'database wall time crosses kickoff while cancellation remains blocked'
);
select is(
  extensions.dblink_exec('slice9_time_locker', 'commit'),
  'COMMIT',
  'the cancellation row is released only after kickoff'
);
create temp table slice9_cancellation_result (
  result_text text,
  error_text text
);
insert into slice9_cancellation_result (result_text)
select result.value
from extensions.dblink_get_result('slice9_time_worker', false) as result(value text);
insert into slice9_cancellation_result (result_text, error_text)
select null, null
where not exists (select 1 from slice9_cancellation_result);
update slice9_cancellation_result
set error_text = extensions.dblink_error_message('slice9_time_worker');
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_time_worker', false) as drained(value text)),
  0,
  'the asynchronous cancellation protocol is fully drained'
);
select ok(
  (select error_text = 'OK' and result_text is not null
   from slice9_cancellation_result)
  and not exists (
    select 1 from slice9_cancellation_result
    where lower(coalesce(error_text, '')) like '%deadlock%'
       or lower(coalesce(error_text, '')) like '%lock timeout%'
       or lower(coalesce(error_text, '')) like '%statement timeout%'
  ),
  'post-wait cancellation succeeds without deadlock or timeout'
);
select ok(
  exists (
    select 1
    from public.matches as match
    cross join slice9_cancellation_boundary as boundary
    where match.id = 'f9000000-0000-4000-8000-000000000002'
      and match.status = 'canceled'
      and match.predictions_locked_at is not null
      and match.predictions_locked_at >= boundary.kickoff_at
  ),
  'cancellation that resumes after persisted kickoff sets the irreversible latch'
);
create temp table slice9_cancellation_latch as
select predictions_locked_at
from public.matches
where id = 'f9000000-0000-4000-8000-000000000002';

create temp table slice9_reactivation_result as
select applied.value
from extensions.dblink(
  'slice9_time_worker',
  format($remote$
    select concat_ws(',', result_matches_changed::text, result_results_changed::text)
    from public.apply_api_football_sync_batch(
      %L::uuid, %s, %L::uuid,
      jsonb_build_object(
        'competition', null,
        'season', null,
        'teams', jsonb_build_array(),
        'rounds', jsonb_build_array(),
        'fixtures', jsonb_build_array(jsonb_build_object(
          'externalId', '990901',
          'roundNumber', 1,
          'roundLabel', 'Round 1',
          'providerStatus', 'NS',
          'homeTeamExternalId', '990911',
          'awayTeamExternalId', '990912',
          'kickoffAt', (clock_timestamp() + interval '10 minutes')::text,
          'status', 'scheduled',
          'resultDisposition', 'none',
          'locksPredictions', false,
          'homeScore', null,
          'awayScore', null
        ))
      )
    )
  $remote$,
    (select run_id from slice9_apply_claim),
    (select generation from slice9_apply_claim),
    (select token from slice9_apply_claim)
  )
) as applied(value text);
select ok(
  exists (
    select 1
    from public.matches as match
    cross join slice9_cancellation_latch as latch
    where match.id = 'f9000000-0000-4000-8000-000000000002'
      and match.status = 'canceled'
      and match.predictions_locked_at = latch.predictions_locked_at
  ),
  'a future provider kickoff cannot reactivate or clear the elapsed cancellation latch'
);

select is(
  extensions.dblink_exec('slice9_time_worker', $remote$
    reset role;
    set role authenticated;
    set request.jwt.claims = '{"sub":"f9222222-2222-4222-8222-222222222222","role":"authenticated"}';
  $remote$),
  'SET',
  'the member context is restored for the reopen probe'
);
select is(
  extensions.dblink_send_query('slice9_time_worker', $remote$
    select prediction_id::text
    from public.save_prediction(
      'f9000000-0000-4000-8000-000000000010',
      'f9000000-0000-4000-8000-000000000002',
      1, 1
    )
  $remote$),
  1,
  'a member attempts to save after the future reactivation payload'
);
create temp table slice9_reopen_prediction_result (
  result_text text,
  error_text text
);
insert into slice9_reopen_prediction_result (result_text)
select result.value
from extensions.dblink_get_result('slice9_time_worker', false) as result(value text);
insert into slice9_reopen_prediction_result (result_text, error_text)
select null, null
where not exists (select 1 from slice9_reopen_prediction_result);
update slice9_reopen_prediction_result
set error_text = extensions.dblink_error_message('slice9_time_worker');
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_time_worker', false) as drained(value text)),
  0,
  'the asynchronous reopen probe protocol is fully drained'
);
select ok(
  (select position('PREDICTION_LOCKED' in coalesce(error_text, '')) > 0
   from slice9_reopen_prediction_result),
  'the attempted reschedule never reopens prediction writes'
);

select is(
  extensions.dblink_exec('slice9_time_worker', $remote$
    reset role;
    set role service_role;
    set request.headers = '{"x-predictor-system-actor":"f9111111-1111-4111-8111-111111111111"}';
  $remote$),
  'SET',
  'the system actor context is restored for remaining provider probes'
);

-- Hold the audit actor only after fixtures exist, then overlap the production
-- apply path (lease -> run -> match) with save_prediction (league -> member ->
-- match). Releasing the artificial audit wait exposes any later match -> league
-- inversion as a real PostgreSQL deadlock rather than a static-definition guess.
select is(
  extensions.dblink_exec('slice9_time_control', $remote$
    begin;
    set local statement_timeout = '15s';
    do $lock$
    begin
      perform 1
      from auth.users
      where id = 'f9111111-1111-4111-8111-111111111111'::uuid
      for update;
    end;
    $lock$;
  $remote$),
  'DO',
  'the control session holds the audit actor for the apply/save lock-order probe'
);
select is(
  extensions.dblink_send_query(
    'slice9_time_worker',
    format($remote$
      select concat_ws(',',
        result_matches_changed::text,
        result_results_changed::text
      )
      from public.apply_api_football_sync_batch(
        %L::uuid, %s, %L::uuid,
        jsonb_build_object(
          'competition', null,
          'season', null,
          'teams', jsonb_build_array(),
          'rounds', jsonb_build_array(),
          'fixtures', jsonb_build_array(jsonb_build_object(
            'externalId', '990904',
            'roundNumber', 1,
            'roundLabel', 'Round 1',
            'providerStatus', 'FT',
            'homeTeamExternalId', '990911',
            'awayTeamExternalId', '990912',
            'kickoffAt', (clock_timestamp() - interval '1 minute')::text,
            'status', 'finished',
            'resultDisposition', 'official',
            'locksPredictions', true,
            'homeScore', 2,
            'awayScore', 1
          ))
        )
      )
    $remote$,
      (select run_id from slice9_apply_claim),
      (select generation from slice9_apply_claim),
      (select token from slice9_apply_claim)
    )
  ),
  1,
  'the fenced provider apply starts asynchronously'
);
select ok(
  pg_temp.wait_for_remote_lock((select pid from slice9_time_worker_backend)),
  'provider apply owns the match before reaching the controlled audit wait'
);
select lives_ok(
  $probe$
    select extensions.dblink_exec('slice9_time_locker', $remote$
      begin;
      do $locks$
      begin
        perform 1
        from public.leagues
        where id = 'f9000000-0000-4000-8000-000000000010'::uuid
        for update nowait;

        perform 1
        from public.league_members
        where league_id = 'f9000000-0000-4000-8000-000000000010'::uuid
          and user_id = 'f9222222-2222-4222-8222-222222222222'::uuid
        for update nowait;
      end;
      $locks$;
    $remote$)
  $probe$,
  'league and member prefix rows remain independently lockable while apply owns the match'
);
select is(
  extensions.dblink_exec('slice9_time_locker', 'rollback'),
  'ROLLBACK',
  'the independent prefix-lock probe releases both rows before prediction save'
);
select is(
  extensions.dblink_exec('slice9_time_admin', $remote$
    reset role;
    set role authenticated;
    set request.jwt.claims = '{"sub":"f9222222-2222-4222-8222-222222222222","role":"authenticated"}';
  $remote$),
  'SET',
  'the second production operation receives the active member session'
);
select is(
  extensions.dblink_send_query('slice9_time_admin', $remote$
    select prediction_id::text
    from public.save_prediction(
      'f9000000-0000-4000-8000-000000000010',
      'f9000000-0000-4000-8000-000000000005',
      1, 0
    )
  $remote$),
  1,
  'save_prediction starts while provider apply owns the same match'
);
select ok(
  pg_temp.wait_for_remote_lock((select pid from slice9_time_admin_backend)),
  'save_prediction holds its canonical prefix locks while waiting on the match'
);
select is(
  extensions.dblink_exec('slice9_time_control', 'commit'),
  'COMMIT',
  'releasing the audit actor lets apply and then prediction save resolve'
);

create temp table slice9_lock_order_results (
  operation text primary key,
  result_text text,
  error_text text
);
insert into slice9_lock_order_results (operation, result_text)
select 'apply', result.value
from extensions.dblink_get_result('slice9_time_worker', false) as result(value text);
insert into slice9_lock_order_results (operation, error_text)
values ('apply', null)
on conflict (operation) do nothing;
update slice9_lock_order_results
set error_text = extensions.dblink_error_message('slice9_time_worker')
where operation = 'apply';
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_time_worker', false) as drained(value text)),
  0,
  'the asynchronous apply protocol is fully drained'
);

insert into slice9_lock_order_results (operation, result_text)
select 'save', result.value
from extensions.dblink_get_result('slice9_time_admin', false) as result(value text);
insert into slice9_lock_order_results (operation, error_text)
values ('save', null)
on conflict (operation) do nothing;
update slice9_lock_order_results
set error_text = extensions.dblink_error_message('slice9_time_admin')
where operation = 'save';
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_time_admin', false) as drained(value text)),
  0,
  'the asynchronous save protocol is fully drained'
);
select ok(
  (select error_text = 'OK' and result_text is not null
   from slice9_lock_order_results where operation = 'apply')
  and not exists (
    select 1 from slice9_lock_order_results
    where lower(coalesce(error_text, '')) like '%deadlock%'
       or lower(coalesce(error_text, '')) like '%lock timeout%'
       or lower(coalesce(error_text, '')) like '%statement timeout%'
  ),
  'provider apply completes without a deadlock or bounded-wait failure'
);
select ok(
  (select position('PREDICTION_LOCKED' in coalesce(error_text, '')) > 0
   from slice9_lock_order_results where operation = 'save')
  and not exists (
    select 1 from slice9_lock_order_results
    where lower(coalesce(error_text, '')) like '%deadlock%'
       or lower(coalesce(error_text, '')) like '%lock timeout%'
       or lower(coalesce(error_text, '')) like '%statement timeout%'
  ),
  'the overlapping save observes the finished match instead of deadlocking'
);
select results_eq(
  $$select status::text, home_score, away_score, result_version,
           predictions_locked_at is not null
    from public.matches
    where id = 'f9000000-0000-4000-8000-000000000005'$$,
  $$values ('finished'::text, 2::smallint, 1::smallint, 1, true)$$,
  'the overlapping provider result commits exactly once with its reveal latch'
);
select is(
  extensions.dblink_exec('slice9_time_admin', $remote$
    reset role;
    set role service_role;
    reset request.jwt.claims;
    set request.headers = '{"x-predictor-system-actor":"f9111111-1111-4111-8111-111111111111"}';
  $remote$),
  'SET',
  'the admin connection restores its fixed server actor context'
);

-- An early cancellation may have no latch. Once its original kickoff passes, a
-- future reschedule must preserve the elapsed boundary and persist the latch.
select is(
  extensions.dblink_exec('slice9_time_control', $remote$
    update public.matches
    set status = 'canceled',
        provider_status = 'CANC',
        kickoff_at = clock_timestamp() - interval '1 second',
        home_score = null,
        away_score = null,
        predictions_locked_at = null,
        is_manually_overridden = false
    where id = 'f9000000-0000-4000-8000-000000000003'
  $remote$),
  'UPDATE 1',
  'the fixture represents an early cancellation whose original kickoff elapsed'
);
create temp table slice9_elapsed_reactivation_result as
select applied.value
from extensions.dblink(
  'slice9_time_worker',
  format($remote$
    select concat_ws(',', result_matches_changed::text, result_results_changed::text)
    from public.apply_api_football_sync_batch(
      %L::uuid, %s, %L::uuid,
      jsonb_build_object(
        'competition', null,
        'season', null,
        'teams', jsonb_build_array(),
        'rounds', jsonb_build_array(),
        'fixtures', jsonb_build_array(jsonb_build_object(
          'externalId', '990902',
          'roundNumber', 1,
          'roundLabel', 'Round 1',
          'providerStatus', 'NS',
          'homeTeamExternalId', '990911',
          'awayTeamExternalId', '990912',
          'kickoffAt', (clock_timestamp() + interval '10 minutes')::text,
          'status', 'scheduled',
          'resultDisposition', 'none',
          'locksPredictions', false,
          'homeScore', null,
          'awayScore', null
        ))
      )
    )
  $remote$,
    (select run_id from slice9_apply_claim),
    (select generation from slice9_apply_claim),
    (select token from slice9_apply_claim)
  )
) as applied(value text);
select ok(
  exists (
    select 1 from public.matches
    where id = 'f9000000-0000-4000-8000-000000000003'
      and status = 'canceled'
      and kickoff_at < clock_timestamp()
      and predictions_locked_at is not null
  ),
  'elapsed original kickoff blocks future reactivation and becomes durably latched'
);

-- Provider ownership cannot overwrite a manual result, but the independent
-- reveal latch must still be preserved after kickoff.
select is(
  extensions.dblink_exec('slice9_time_control', $remote$
    update public.matches
    set status = 'finished',
        provider_status = 'FT',
        kickoff_at = clock_timestamp() - interval '1 minute',
        home_score = 2,
        away_score = 1,
        predictions_locked_at = null,
        is_manually_overridden = true
    where id = 'f9000000-0000-4000-8000-000000000004'
  $remote$),
  'UPDATE 1',
  'the provider row is manually owned with an elapsed kickoff and no prior latch'
);
create temp table slice9_manual_cancellation_result as
select applied.*
from extensions.dblink(
  'slice9_time_worker',
  format($remote$
    select result_matches_changed, result_manual_overrides_skipped
    from public.apply_api_football_sync_batch(
      %L::uuid, %s, %L::uuid,
      jsonb_build_object(
        'competition', null,
        'season', null,
        'teams', jsonb_build_array(),
        'rounds', jsonb_build_array(),
        'fixtures', jsonb_build_array(jsonb_build_object(
          'externalId', '990903',
          'roundNumber', 1,
          'roundLabel', 'Round 1',
          'providerStatus', 'CANC',
          'homeTeamExternalId', '990911',
          'awayTeamExternalId', '990912',
          'kickoffAt', (clock_timestamp() + interval '10 minutes')::text,
          'status', 'canceled',
          'resultDisposition', 'none',
          'locksPredictions', false,
          'homeScore', null,
          'awayScore', null
        ))
      )
    )
  $remote$,
    (select run_id from slice9_apply_claim),
    (select generation from slice9_apply_claim),
    (select token from slice9_apply_claim)
  )
) as applied(matches_changed integer, manual_skipped integer);
select results_eq(
  $$select matches_changed, manual_skipped from slice9_manual_cancellation_result$$,
  $$values (1, 1)$$,
  'manual ownership skips the provider result while accounting for one new latch'
);
select ok(
  exists (
    select 1 from public.matches
    where id = 'f9000000-0000-4000-8000-000000000004'
      and status = 'finished'
      and home_score = 2
      and away_score = 1
      and is_manually_overridden
      and predictions_locked_at is not null
  ),
  'post-kickoff provider cancellation preserves a manual result and its reveal latch'
);

select lives_ok(
  format($sql$
    select *
    from extensions.dblink(
      'slice9_time_admin',
      %L
    ) as finalized(status text)
  $sql$,
    format($remote$
      select result_status::text
      from public.finalize_sports_sync(
        %L::uuid, %s, %L::uuid,
        'succeeded', null, null, 5, array[]::text[], null, null
      )
    $remote$,
      (select run_id from slice9_apply_claim),
      (select generation from slice9_apply_claim),
      (select token from slice9_apply_claim)
    )
  ),
  'the cancellation regression run finalizes exactly once'
);

-- A non-forced claim begins before reconciliation is due, waits on the lease,
-- and must reevaluate due work after serialization.
select is(extensions.dblink_exec('slice9_time_locker', 'begin'), 'BEGIN', 'due-boundary lease holder begins');
select is(
  extensions.dblink_exec('slice9_time_locker', $remote$
    update public.sync_leases
    set run_id = null,
        fencing_token = null,
        locked_until = null,
        last_catalog_at = clock_timestamp(),
        last_targeted_at = clock_timestamp(),
        last_reconciliation_at = clock_timestamp() - interval '5 hours 59 minutes 57 seconds',
        last_forced_at = null,
        backoff_until = null,
        updated_at = clock_timestamp()
    where provider = 'api-football'
  $remote$),
  'UPDATE 1',
  'reconciliation becomes due while another session owns the lease row'
);
create temp table slice9_due_boundary as
select boundary.due_at
from extensions.dblink(
  'slice9_time_locker',
  $$select last_reconciliation_at + interval '6 hours'
    from public.sync_leases where provider = 'api-football'$$
) as boundary(due_at timestamptz);
select is(
  extensions.dblink_send_query('slice9_time_worker', $remote$
    select result_outcome, result_run_id, result_sync_kind,
           result_generation, result_token, result_locked_until, result_code
    from public.claim_sports_sync('api-football', false)
  $remote$),
  1,
  'the reconciliation claimant starts before it is due'
);
select ok(
  pg_temp.wait_for_remote_lock((select pid from slice9_time_worker_backend))
  and clock_timestamp() < (select due_at from slice9_due_boundary),
  'the due claimant is observed waiting before the due boundary'
);
select lives_ok(
  format(
    'select pg_temp.wait_until_after(%L::timestamptz)',
    (select due_at from slice9_due_boundary)
  ),
  'database wall time crosses the due boundary while claim is blocked'
);
select is(extensions.dblink_exec('slice9_time_locker', 'commit'), 'COMMIT', 'the due lease row is released');
create temp table slice9_due_claim (
  outcome text,
  run_id uuid,
  sync_kind text,
  generation bigint,
  token uuid,
  locked_until timestamptz,
  code text,
  error_text text
);
insert into slice9_due_claim (
  outcome, run_id, sync_kind, generation, token, locked_until, code
)
select result.*
from extensions.dblink_get_result('slice9_time_worker', false) as result(
  outcome text,
  run_id uuid,
  sync_kind text,
  generation bigint,
  token uuid,
  locked_until timestamptz,
  code text
);
insert into slice9_due_claim
select null, null, null, null, null, null, null, null
where not exists (select 1 from slice9_due_claim);
update slice9_due_claim
set error_text = extensions.dblink_error_message('slice9_time_worker');
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_time_worker', false) as drained(value text)),
  0,
  'the asynchronous due-claim protocol is fully drained'
);
select results_eq(
  $$select outcome, sync_kind, code, run_id is not null,
           error_text = 'OK'
    from slice9_due_claim$$,
  $$values ('CLAIMED'::text, 'reconciliation'::text, null::text, true, true)$$,
  'the delayed claim uses fresh time and admits the newly due reconciliation'
);
select ok(
  exists (
    select 1
    from public.sync_runs as run
    cross join slice9_due_claim as claim
    cross join slice9_due_boundary as boundary
    where run.id = claim.run_id
      and run.started_at > boundary.due_at
      and run.locked_until - run.started_at = interval '120 seconds'
      and claim.locked_until = run.locked_until
  ),
  'the due claim starts after serialization and receives exactly 120 seconds'
);
select lives_ok(
  format($sql$
    select * from extensions.dblink('slice9_time_admin', %L)
      as finalized(status text)
  $sql$,
    format($remote$
      select result_status::text
      from public.finalize_sports_sync(
        %L::uuid, %s, %L::uuid,
        'succeeded', null, null, 0, array[]::text[], null, null
      )
    $remote$,
      (select run_id from slice9_due_claim),
      (select generation from slice9_due_claim),
      (select token from slice9_due_claim)
    )
  ),
  'the due-boundary claim finalizes and releases its fence'
);

-- A forced claim that starts during cooldown must be admitted if the cooldown
-- expires while it waits for the serialized row.
select is(extensions.dblink_exec('slice9_time_locker', 'begin'), 'BEGIN', 'cooldown lease holder begins');
select is(
  extensions.dblink_exec('slice9_time_locker', $remote$
    update public.sync_leases
    set run_id = null,
        fencing_token = null,
        locked_until = null,
        last_forced_at = clock_timestamp() - interval '57 seconds',
        backoff_until = null,
        updated_at = clock_timestamp()
    where provider = 'api-football'
  $remote$),
  'UPDATE 1',
  'the forced cooldown expires while the lease row is held'
);
create temp table slice9_cooldown_boundary as
select boundary.due_at
from extensions.dblink(
  'slice9_time_locker',
  $$select last_forced_at + interval '1 minute'
    from public.sync_leases where provider = 'api-football'$$
) as boundary(due_at timestamptz);
select is(
  extensions.dblink_send_query('slice9_time_worker', $remote$
    select result_outcome, result_run_id, result_sync_kind,
           result_generation, result_token, result_locked_until, result_code
    from public.claim_sports_sync('api-football', true)
  $remote$),
  1,
  'the forced claimant starts during cooldown'
);
select ok(
  pg_temp.wait_for_remote_lock((select pid from slice9_time_worker_backend))
  and clock_timestamp() < (select due_at from slice9_cooldown_boundary),
  'the forced claimant is observed waiting before cooldown expiry'
);
select lives_ok(
  format(
    'select pg_temp.wait_until_after(%L::timestamptz)',
    (select due_at from slice9_cooldown_boundary)
  ),
  'database wall time crosses forced cooldown while claim is blocked'
);
select is(extensions.dblink_exec('slice9_time_locker', 'commit'), 'COMMIT', 'the cooldown lease row is released');
create temp table slice9_cooldown_claim (
  outcome text,
  run_id uuid,
  sync_kind text,
  generation bigint,
  token uuid,
  locked_until timestamptz,
  code text,
  error_text text
);
insert into slice9_cooldown_claim (
  outcome, run_id, sync_kind, generation, token, locked_until, code
)
select result.*
from extensions.dblink_get_result('slice9_time_worker', false) as result(
  outcome text,
  run_id uuid,
  sync_kind text,
  generation bigint,
  token uuid,
  locked_until timestamptz,
  code text
);
insert into slice9_cooldown_claim
select null, null, null, null, null, null, null, null
where not exists (select 1 from slice9_cooldown_claim);
update slice9_cooldown_claim
set error_text = extensions.dblink_error_message('slice9_time_worker');
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_time_worker', false) as drained(value text)),
  0,
  'the asynchronous cooldown-claim protocol is fully drained'
);
select results_eq(
  $$select outcome, sync_kind, code, run_id is not null, error_text = 'OK'
    from slice9_cooldown_claim$$,
  $$values ('CLAIMED'::text, 'catalog'::text, null::text, true, true)$$,
  'the delayed forced claim is admitted after fresh cooldown evaluation'
);
select ok(
  exists (
    select 1 from public.sync_runs as run
    join slice9_cooldown_claim as claim on claim.run_id = run.id
    where run.locked_until - run.started_at = interval '120 seconds'
      and claim.locked_until = run.locked_until
  ),
  'the post-cooldown run receives the full lease duration'
);
select lives_ok(
  format($sql$
    select * from extensions.dblink('slice9_time_admin', %L)
      as finalized(status text)
  $sql$,
    format($remote$
      select result_status::text
      from public.finalize_sports_sync(
        %L::uuid, %s, %L::uuid,
        'succeeded', null, null, 0, array[]::text[], null, null
      )
    $remote$,
      (select run_id from slice9_cooldown_claim),
      (select generation from slice9_cooldown_claim),
      (select token from slice9_cooldown_claim)
    )
  ),
  'the cooldown-boundary claim finalizes and releases its fence'
);

-- Provider backoff is another due boundary evaluated from the same serialized
-- sample. A force flag never bypasses it, but an expired backoff must not linger.
select is(extensions.dblink_exec('slice9_time_locker', 'begin'), 'BEGIN', 'backoff lease holder begins');
select is(
  extensions.dblink_exec('slice9_time_locker', $remote$
    update public.sync_leases
    set run_id = null,
        fencing_token = null,
        locked_until = null,
        last_forced_at = null,
        backoff_until = clock_timestamp() + interval '3 seconds',
        updated_at = clock_timestamp()
    where provider = 'api-football'
  $remote$),
  'UPDATE 1',
  'provider backoff expires while the lease row is held'
);
create temp table slice9_backoff_boundary as
select boundary.due_at
from extensions.dblink(
  'slice9_time_locker',
  $$select backoff_until from public.sync_leases
    where provider = 'api-football'$$
) as boundary(due_at timestamptz);
select is(
  extensions.dblink_send_query('slice9_time_worker', $remote$
    select result_outcome, result_run_id, result_sync_kind,
           result_generation, result_token, result_locked_until, result_code
    from public.claim_sports_sync('api-football', true)
  $remote$),
  1,
  'the forced claimant starts while provider backoff is active'
);
select ok(
  pg_temp.wait_for_remote_lock((select pid from slice9_time_worker_backend))
  and clock_timestamp() < (select due_at from slice9_backoff_boundary),
  'the claimant is observed waiting before backoff expiry'
);
select lives_ok(
  format(
    'select pg_temp.wait_until_after(%L::timestamptz)',
    (select due_at from slice9_backoff_boundary)
  ),
  'database wall time crosses provider backoff while claim is blocked'
);
select is(extensions.dblink_exec('slice9_time_locker', 'commit'), 'COMMIT', 'the backoff lease row is released');
create temp table slice9_backoff_claim (
  outcome text,
  run_id uuid,
  sync_kind text,
  generation bigint,
  token uuid,
  locked_until timestamptz,
  code text,
  error_text text
);
insert into slice9_backoff_claim (
  outcome, run_id, sync_kind, generation, token, locked_until, code
)
select result.*
from extensions.dblink_get_result('slice9_time_worker', false) as result(
  outcome text,
  run_id uuid,
  sync_kind text,
  generation bigint,
  token uuid,
  locked_until timestamptz,
  code text
);
insert into slice9_backoff_claim
select null, null, null, null, null, null, null, null
where not exists (select 1 from slice9_backoff_claim);
update slice9_backoff_claim
set error_text = extensions.dblink_error_message('slice9_time_worker');
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_time_worker', false) as drained(value text)),
  0,
  'the asynchronous backoff-claim protocol is fully drained'
);
select results_eq(
  $$select outcome, sync_kind, code, run_id is not null, error_text = 'OK'
    from slice9_backoff_claim$$,
  $$values ('CLAIMED'::text, 'catalog'::text, null::text, true, true)$$,
  'the delayed claim admits work after fresh backoff evaluation'
);
select ok(
  exists (
    select 1 from public.sync_runs as run
    join slice9_backoff_claim as claim on claim.run_id = run.id
    where run.locked_until - run.started_at = interval '120 seconds'
  ),
  'the post-backoff run receives the full lease duration'
);
select lives_ok(
  format($sql$
    select * from extensions.dblink('slice9_time_admin', %L)
      as finalized(status text)
  $sql$,
    format($remote$
      select result_status::text
      from public.finalize_sports_sync(
        %L::uuid, %s, %L::uuid,
        'succeeded', null, null, 0, array[]::text[], null, null
      )
    $remote$,
      (select run_id from slice9_backoff_claim),
      (select generation from slice9_backoff_claim),
      (select token from slice9_backoff_claim)
    )
  ),
  'the backoff-boundary claim finalizes and releases its fence'
);

-- An already eligible forced claim still needs a fresh issuance sample. Holding
-- the singleton lease for three seconds proves started_at is not the claimant's
-- transaction start and that essentially the full 120-second lease remains when
-- the call returns.
select is(extensions.dblink_exec('slice9_time_locker', 'begin'), 'BEGIN', 'issuance lease holder begins');
select is(
  extensions.dblink_exec('slice9_time_locker', $remote$
    update public.sync_leases
    set run_id = null,
        fencing_token = null,
        locked_until = null,
        last_forced_at = null,
        backoff_until = null,
        updated_at = clock_timestamp()
    where provider = 'api-football'
  $remote$),
  'UPDATE 1',
  'an immediately eligible lease is held before claim issuance'
);
create temp table slice9_eligible_boundary as
select boundary.release_after
from extensions.dblink(
  'slice9_time_locker',
  $$select clock_timestamp() + interval '3 seconds'$$
) as boundary(release_after timestamptz);
select ok(
  clock_timestamp() < (select release_after from slice9_eligible_boundary),
  'the full-lease claimant is dispatched before the controlled release boundary'
);
select is(
  extensions.dblink_send_query('slice9_time_worker', $remote$
    select result_outcome, result_run_id, result_sync_kind,
           result_generation, result_token, result_locked_until, result_code
    from public.claim_sports_sync('api-football', true)
  $remote$),
  1,
  'the already eligible forced claimant starts asynchronously'
);
select ok(
  pg_temp.wait_for_remote_lock((select pid from slice9_time_worker_backend))
  and clock_timestamp() < (select release_after from slice9_eligible_boundary),
  'the eligible claimant is observed waiting before the release boundary'
);
select lives_ok(
  format(
    'select pg_temp.wait_until_after(%L::timestamptz)',
    (select release_after from slice9_eligible_boundary)
  ),
  'the claim remains blocked for three seconds despite already being eligible'
);
select is(
  extensions.dblink_exec('slice9_time_locker', 'commit'),
  'COMMIT',
  'the eligible lease row is released only after the controlled boundary'
);
create temp table slice9_eligible_claim (
  outcome text,
  run_id uuid,
  sync_kind text,
  generation bigint,
  token uuid,
  locked_until timestamptz,
  code text,
  error_text text
);
insert into slice9_eligible_claim (
  outcome, run_id, sync_kind, generation, token, locked_until, code
)
select result.*
from extensions.dblink_get_result('slice9_time_worker', false) as result(
  outcome text,
  run_id uuid,
  sync_kind text,
  generation bigint,
  token uuid,
  locked_until timestamptz,
  code text
);
insert into slice9_eligible_claim
select null, null, null, null, null, null, null, null
where not exists (select 1 from slice9_eligible_claim);
update slice9_eligible_claim
set error_text = extensions.dblink_error_message('slice9_time_worker');
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_time_worker', false) as drained(value text)),
  0,
  'the asynchronous full-lease claim protocol is fully drained'
);
select results_eq(
  $$select outcome, sync_kind, code, run_id is not null, error_text = 'OK'
    from slice9_eligible_claim$$,
  $$values ('CLAIMED'::text, 'catalog'::text, null::text, true, true)$$,
  'the delayed but already eligible claim is issued successfully'
);
select ok(
  exists (
    select 1
    from public.sync_runs as run
    join slice9_eligible_claim as claim on claim.run_id = run.id
    cross join slice9_eligible_boundary as boundary
    where run.started_at > boundary.release_after
      and run.locked_until - run.started_at = interval '120 seconds'
      and claim.locked_until = run.locked_until
  ),
  'claim issuance occurs after lock release and stores exactly 120 seconds'
);
select ok(
  exists (
    select 1
    from public.sync_runs as run
    join slice9_eligible_claim as claim on claim.run_id = run.id
    where run.locked_until - clock_timestamp() > interval '118 seconds'
      and run.locked_until - clock_timestamp() <= interval '120 seconds'
  ),
  'more than 118 seconds of the new lease remain after the delayed claim returns'
);
select lives_ok(
  format($sql$
    select * from extensions.dblink('slice9_time_admin', %L)
      as finalized(status text)
  $sql$,
    format($remote$
      select result_status::text
      from public.finalize_sports_sync(
        %L::uuid, %s, %L::uuid,
        'succeeded', null, null, 0, array[]::text[], null, null
      )
    $remote$,
      (select run_id from slice9_eligible_claim),
      (select generation from slice9_eligible_claim),
      (select token from slice9_eligible_claim)
    )
  ),
  'the delayed full-duration claim finalizes and releases its fence'
);

-- Finally, a claimant starts while another run's lease is active, waits, and
-- crosses expiry. Fresh evaluation must reclaim instead of recording a stale
-- concurrent attempt.
select is(extensions.dblink_exec('slice9_time_locker', 'begin'), 'BEGIN', 'expiry lease holder begins');
select is(
  extensions.dblink_exec('slice9_time_locker', $remote$
    do $setup$
    declare
      v_generation bigint;
      v_expiry timestamptz := clock_timestamp() + interval '3 seconds';
    begin
      select generation + 1 into strict v_generation
      from public.sync_leases
      where provider = 'api-football'
      for update;

      insert into public.sync_runs (
        id, provider, status, sync_kind, started_at,
        lease_generation, locked_until
      ) values (
        'f9999999-9999-4999-8999-999999999901',
        'api-football', 'running', 'catalog',
        clock_timestamp() - interval '1 minute',
        v_generation, v_expiry
      );

      update public.sync_leases
      set generation = v_generation,
          run_id = 'f9999999-9999-4999-8999-999999999901',
          fencing_token = 'f9888888-8888-4888-8888-888888888888',
          locked_until = v_expiry,
          last_forced_at = null,
          backoff_until = null,
          updated_at = clock_timestamp()
      where provider = 'api-football';
    end;
    $setup$;
  $remote$),
  'DO',
  'an active synthetic run expires while its lease row is held'
);
create temp table slice9_expiry_boundary as
select boundary.locked_until, boundary.generation
from extensions.dblink(
  'slice9_time_locker',
  $$select locked_until, generation from public.sync_leases
    where provider = 'api-football'$$
) as boundary(locked_until timestamptz, generation bigint);
select is(
  extensions.dblink_send_query('slice9_time_worker', $remote$
    select result_outcome, result_run_id, result_sync_kind,
           result_generation, result_token, result_locked_until, result_code
    from public.claim_sports_sync('api-football', true)
  $remote$),
  1,
  'the competing claimant starts before the active lease expires'
);
select ok(
  pg_temp.wait_for_remote_lock((select pid from slice9_time_worker_backend))
  and clock_timestamp() < (select locked_until from slice9_expiry_boundary),
  'the competing claimant is observed waiting before lease expiry'
);
select lives_ok(
  format(
    'select pg_temp.wait_until_after(%L::timestamptz)',
    (select locked_until from slice9_expiry_boundary)
  ),
  'database wall time crosses active lease expiry while claim is blocked'
);
select is(extensions.dblink_exec('slice9_time_locker', 'commit'), 'COMMIT', 'the expired lease row is released');
create temp table slice9_expiry_claim (
  outcome text,
  run_id uuid,
  sync_kind text,
  generation bigint,
  token uuid,
  locked_until timestamptz,
  code text,
  error_text text
);
insert into slice9_expiry_claim (
  outcome, run_id, sync_kind, generation, token, locked_until, code
)
select result.*
from extensions.dblink_get_result('slice9_time_worker', false) as result(
  outcome text,
  run_id uuid,
  sync_kind text,
  generation bigint,
  token uuid,
  locked_until timestamptz,
  code text
);
insert into slice9_expiry_claim
select null, null, null, null, null, null, null, null
where not exists (select 1 from slice9_expiry_claim);
update slice9_expiry_claim
set error_text = extensions.dblink_error_message('slice9_time_worker');
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('slice9_time_worker', false) as drained(value text)),
  0,
  'the asynchronous expiry-claim protocol is fully drained'
);
select results_eq(
  $$select outcome, sync_kind, code, run_id is not null,
           generation > (select generation from slice9_expiry_boundary),
           error_text = 'OK'
    from slice9_expiry_claim$$,
  $$values ('CLAIMED'::text, 'catalog'::text, null::text, true, true, true)$$,
  'the delayed claimant reclaims the expired lease using fresh serialized time'
);
select results_eq(
  $$select status::text, error_code, finished_at is not null
    from public.sync_runs
    where id = 'f9999999-9999-4999-8999-999999999901'$$,
  $$values ('failed'::text, 'LEASE_EXPIRED'::text, true)$$,
  'the abandoned run is terminally marked LEASE_EXPIRED'
);
select ok(
  exists (
    select 1 from public.sync_runs as run
    join slice9_expiry_claim as claim on claim.run_id = run.id
    where run.locked_until - run.started_at = interval '120 seconds'
      and run.started_at > (select locked_until from slice9_expiry_boundary)
  )
  and not exists (
    select 1 from slice9_expiry_claim
    where lower(coalesce(error_text, '')) like '%deadlock%'
       or lower(coalesce(error_text, '')) like '%lock timeout%'
       or lower(coalesce(error_text, '')) like '%statement timeout%'
  ),
  'the replacement lease is full length and every real wait avoided deadlock/timeout'
);
select lives_ok(
  format($sql$
    select * from extensions.dblink('slice9_time_admin', %L)
      as finalized(status text)
  $sql$,
    format($remote$
      select result_status::text
      from public.finalize_sports_sync(
        %L::uuid, %s, %L::uuid,
        'succeeded', null, null, 0, array[]::text[], null, null
      )
    $remote$,
      (select run_id from slice9_expiry_claim),
      (select generation from slice9_expiry_claim),
      (select token from slice9_expiry_claim)
    )
  ),
  'the replacement claim finalizes and releases its fence'
);

-- Remote commits bypass this file's outer rollback. Restore the exact singleton
-- lease state and remove only deterministic fixtures and runs from this test.
select is(
  extensions.dblink_exec(
    'slice9_time_control',
    format($remote$
      insert into slice9_time_created_runs (run_id) values
        (%L::uuid),
        (%L::uuid),
        (%L::uuid),
        (%L::uuid),
        (%L::uuid),
        (%L::uuid),
        ('f9999999-9999-4999-8999-999999999901'::uuid)
      on conflict (run_id) do nothing
    $remote$,
      (select run_id from slice9_apply_claim),
      (select run_id from slice9_due_claim),
      (select run_id from slice9_cooldown_claim),
      (select run_id from slice9_backoff_claim),
      (select run_id from slice9_eligible_claim),
      (select run_id from slice9_expiry_claim)
    )
  ),
  'INSERT 0 7',
  'cleanup records only the seven committed run identifiers created by this test'
);
select is(
  extensions.dblink_exec('slice9_time_control', $remote$
    begin;

    update public.sync_leases
    set run_id = null,
        fencing_token = null,
        locked_until = null,
        updated_at = clock_timestamp()
    where provider = 'api-football';

    delete from public.sync_runs
    where id in (select run_id from slice9_time_created_runs);

    update public.sync_leases as lease
    set generation = snapshot.generation,
        run_id = snapshot.run_id,
        fencing_token = snapshot.fencing_token,
        locked_until = snapshot.locked_until,
        last_catalog_at = snapshot.last_catalog_at,
        last_targeted_at = snapshot.last_targeted_at,
        last_reconciliation_at = snapshot.last_reconciliation_at,
        backoff_until = snapshot.backoff_until,
        last_forced_at = snapshot.last_forced_at,
        updated_at = snapshot.updated_at
    from slice9_time_lease_snapshot as snapshot
    where lease.provider = snapshot.provider;

    delete from public.audit_logs
    where actor_id = 'f9111111-1111-4111-8111-111111111111'
       or entity_id in (
         'f9000000-0000-4000-8000-000000000001',
         'f9000000-0000-4000-8000-000000000002',
         'f9000000-0000-4000-8000-000000000003',
         'f9000000-0000-4000-8000-000000000004',
         'f9000000-0000-4000-8000-000000000005',
         'f9000000-0000-4000-8000-000000000010'
       );
    delete from public.predictions
    where league_id = 'f9000000-0000-4000-8000-000000000010';
    delete from public.system_admins
    where user_id = 'f9111111-1111-4111-8111-111111111111';
    delete from public.league_members
    where league_id = 'f9000000-0000-4000-8000-000000000010';
    delete from public.league_scoring_rules
    where league_id = 'f9000000-0000-4000-8000-000000000010';
    delete from public.leagues
    where id = 'f9000000-0000-4000-8000-000000000010';
    delete from public.matches
    where id in (
      'f9000000-0000-4000-8000-000000000001',
      'f9000000-0000-4000-8000-000000000002',
      'f9000000-0000-4000-8000-000000000003',
      'f9000000-0000-4000-8000-000000000004',
      'f9000000-0000-4000-8000-000000000005'
    );
    delete from public.teams
    where id in (
      'f9000000-0000-4000-8000-000000000101',
      'f9000000-0000-4000-8000-000000000102'
    );
    delete from public.seasons
    where id = 'f9000000-0000-4000-8000-000000000027';
    delete from public.competitions
    where id = 'f9000000-0000-4000-8000-000000000020';
    delete from auth.users
    where id in (
      'f9111111-1111-4111-8111-111111111111',
      'f9222222-2222-4222-8222-222222222222'
    );

    commit;
  $remote$),
  'COMMIT',
  'all committed W1 fixtures are removed and the original lease row is restored'
);

select is(extensions.dblink_disconnect('slice9_time_admin'), 'OK', 'admin connection closes');
select is(extensions.dblink_disconnect('slice9_time_worker'), 'OK', 'worker connection closes');
select is(extensions.dblink_disconnect('slice9_time_locker'), 'OK', 'locker connection closes');
select is(extensions.dblink_disconnect('slice9_time_control'), 'OK', 'control connection closes');

select * from finish();
rollback;
