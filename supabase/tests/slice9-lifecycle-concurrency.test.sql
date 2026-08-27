-- Real multi-session lifecycle races. Committed dblink fixtures are required:
-- two calls in one pgTAP transaction cannot establish lock-wait behavior.
begin;

select no_plan();

create extension if not exists dblink with schema extensions;

create function pg_temp.wait_for_lock(p_backend_pid integer)
returns boolean
language plpgsql
as $$
declare
  v_attempt integer := 0;
begin
  loop
    if exists (
      select 1 from pg_catalog.pg_stat_activity as activity
      where activity.pid = p_backend_pid
        and activity.wait_event_type = 'Lock'
    ) then
      return true;
    end if;
    v_attempt := v_attempt + 1;
    if v_attempt >= 300 then return false; end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
end;
$$;

select is(
  extensions.dblink_connect(
    'lifecycle_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ), 'OK', 'the committed lifecycle fixture connection opens'
);
select is(
  extensions.dblink_connect(
    'lifecycle_locker',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ), 'OK', 'the lifecycle lock-holder connection opens'
);
select is(
  extensions.dblink_connect(
    'lifecycle_first',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ), 'OK', 'the first lifecycle caller connection opens'
);
select is(
  extensions.dblink_connect(
    'lifecycle_second',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ), 'OK', 'the second lifecycle caller connection opens'
);

select is(
  extensions.dblink_exec('lifecycle_control', $remote$
    delete from public.audit_logs
    where entity_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000499'::uuid;
    delete from public.predictions
    where league_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.payment_proofs
    where join_request_id between
      'd9800000-0000-4000-8000-000000000401'::uuid and
      'd9800000-0000-4000-8000-000000000499'::uuid;
    delete from public.join_requests
    where id between
      'd9800000-0000-4000-8000-000000000401'::uuid and
      'd9800000-0000-4000-8000-000000000499'::uuid;
    delete from public.league_members
    where league_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_match_reconciliations
    where league_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_match_snapshots
    where league_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.prize_rules
    where league_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_scoring_rules
    where league_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.leagues
    where id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.matches
    where id between
      'd9800000-0000-4000-8000-000000000201'::uuid and
      'd9800000-0000-4000-8000-000000000299'::uuid;
    delete from public.seasons
    where id between
      'd9800000-0000-4000-8000-000000000101'::uuid and
      'd9800000-0000-4000-8000-000000000199'::uuid;
    delete from auth.users
    where id between
      'd9800000-0000-4000-8000-000000000001'::uuid and
      'd9800000-0000-4000-8000-000000000099'::uuid;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    select
      '00000000-0000-0000-0000-000000000000',
      ('d9800000-0000-4000-8000-' || lpad(actor.i::text, 12, '0'))::uuid,
      'authenticated', 'authenticated',
      'lifecycle-race-' || actor.i || '@example.com',
      extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      pg_catalog.jsonb_build_object('display_name', 'Lifecycle ' || actor.i),
      now(), now()
    from pg_catalog.generate_series(1, 6) as actor(i);

    insert into public.seasons (
      id, competition_id, name, starts_on, ends_on, is_current
    ) values
      ('d9800000-0000-4000-8000-000000000101', '26000000-0000-4000-8000-000000000001', 'Lifecycle on time', '2026-01-01', '2026-12-31', false),
      ('d9800000-0000-4000-8000-000000000102', '26000000-0000-4000-8000-000000000001', 'Lifecycle delayed', '2026-01-01', '2026-12-31', false),
      ('d9800000-0000-4000-8000-000000000103', '26000000-0000-4000-8000-000000000001', 'Lifecycle boundary', '2026-01-01', '2026-12-31', false),
      ('d9800000-0000-4000-8000-000000000104', '26000000-0000-4000-8000-000000000001', 'Lifecycle completion', '2026-01-01', '2026-12-31', false);

    insert into public.matches (
      id, season_id, round_number, home_team_id, away_team_id,
      kickoff_at, status, provider_status, home_score, away_score,
      result_version
    ) values
      ('d9800000-0000-4000-8000-000000000201', 'd9800000-0000-4000-8000-000000000101', 1, '26000000-0000-4000-8000-000000000101', '26000000-0000-4000-8000-000000000102', clock_timestamp() + interval '90 seconds', 'scheduled', 'NS', null, null, 0),
      ('d9800000-0000-4000-8000-000000000202', 'd9800000-0000-4000-8000-000000000102', 1, '26000000-0000-4000-8000-000000000101', '26000000-0000-4000-8000-000000000102', clock_timestamp() + interval '1 day', 'scheduled', 'NS', null, null, 0),
      ('d9800000-0000-4000-8000-000000000203', 'd9800000-0000-4000-8000-000000000103', 1, '26000000-0000-4000-8000-000000000101', '26000000-0000-4000-8000-000000000102', clock_timestamp() + interval '1 day', 'canceled', 'CANC', null, null, 0),
      ('d9800000-0000-4000-8000-000000000204', 'd9800000-0000-4000-8000-000000000103', 2, '26000000-0000-4000-8000-000000000103', '26000000-0000-4000-8000-000000000104', clock_timestamp() + interval '2 days', 'scheduled', 'NS', null, null, 0),
      ('d9800000-0000-4000-8000-000000000205', 'd9800000-0000-4000-8000-000000000104', 1, '26000000-0000-4000-8000-000000000101', '26000000-0000-4000-8000-000000000102', clock_timestamp() - interval '2 hours', 'finished', 'FT', 1, 0, 1);

    insert into public.leagues (
      id, manager_id, season_id, name, status, activated_at
    ) values
      ('d9800000-0000-4000-8000-000000000301', 'd9800000-0000-4000-8000-000000000001', 'd9800000-0000-4000-8000-000000000101', 'On-time race', 'open', null),
      ('d9800000-0000-4000-8000-000000000302', 'd9800000-0000-4000-8000-000000000001', 'd9800000-0000-4000-8000-000000000102', 'Delayed race', 'open', null),
      ('d9800000-0000-4000-8000-000000000303', 'd9800000-0000-4000-8000-000000000001', 'd9800000-0000-4000-8000-000000000103', 'Boundary race', 'open', null),
      ('d9800000-0000-4000-8000-000000000304', 'd9800000-0000-4000-8000-000000000001', 'd9800000-0000-4000-8000-000000000104', 'Finalize race', 'active', clock_timestamp() - interval '1 day'),
      ('d9800000-0000-4000-8000-000000000305', 'd9800000-0000-4000-8000-000000000001', 'd9800000-0000-4000-8000-000000000104', 'Approve race', 'active', clock_timestamp() - interval '1 day'),
      ('d9800000-0000-4000-8000-000000000306', 'd9800000-0000-4000-8000-000000000001', 'd9800000-0000-4000-8000-000000000104', 'Reject race', 'active', clock_timestamp() - interval '1 day'),
      ('d9800000-0000-4000-8000-000000000307', 'd9800000-0000-4000-8000-000000000001', 'd9800000-0000-4000-8000-000000000104', 'Double complete race', 'active', clock_timestamp() - interval '1 day');

    insert into public.league_scoring_rules (league_id, locked_at)
    select league.id,
      case when league.status = 'active' then clock_timestamp() - interval '1 day' else null end
    from public.leagues as league
    where league.id between
      'd9800000-0000-4000-8000-000000000301' and
      'd9800000-0000-4000-8000-000000000307';

    insert into public.league_members (
      league_id, user_id, status, approved_by, approved_at
    ) values (
      'd9800000-0000-4000-8000-000000000303',
      'd9800000-0000-4000-8000-000000000002', 'active',
      'd9800000-0000-4000-8000-000000000001', clock_timestamp() - interval '1 day'
    );

    insert into public.join_requests (
      id, league_id, user_id, status, created_at, updated_at
    ) values
      ('d9800000-0000-4000-8000-000000000401', 'd9800000-0000-4000-8000-000000000304', 'd9800000-0000-4000-8000-000000000003', 'pending_proof', now(), now()),
      ('d9800000-0000-4000-8000-000000000402', 'd9800000-0000-4000-8000-000000000305', 'd9800000-0000-4000-8000-000000000004', 'pending_approval', now(), now()),
      ('d9800000-0000-4000-8000-000000000403', 'd9800000-0000-4000-8000-000000000306', 'd9800000-0000-4000-8000-000000000005', 'pending_approval', now(), now());

    insert into public.payment_proofs (
      id, join_request_id, uploaded_by, storage_path, mime_type,
      size_bytes, sha256, upload_idempotency_key, uploaded_at
    ) values
      ('d9800000-0000-4000-8000-000000000502', 'd9800000-0000-4000-8000-000000000402', 'd9800000-0000-4000-8000-000000000004', 'league/d9800000-0000-4000-8000-000000000305/request/d9800000-0000-4000-8000-000000000402/d9800000-0000-4000-8000-000000000502.webp', 'image/webp', 100, repeat('b', 64), 'd9800000-0000-4000-8000-000000000602', now()),
      ('d9800000-0000-4000-8000-000000000503', 'd9800000-0000-4000-8000-000000000403', 'd9800000-0000-4000-8000-000000000005', 'league/d9800000-0000-4000-8000-000000000306/request/d9800000-0000-4000-8000-000000000403/d9800000-0000-4000-8000-000000000503.webp', 'image/webp', 100, repeat('c', 64), 'd9800000-0000-4000-8000-000000000603', now());
  $remote$),
  'INSERT 0 2',
  'the isolated lifecycle fixtures are committed'
);

select is(
  extensions.dblink_exec('lifecycle_first', $remote$
    set statement_timeout = '10s';
    set lock_timeout = '5s';
    create function pg_temp.as_actor(p_actor uuid) returns void
    language sql as $function$
      select set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', p_actor::text, 'role', 'authenticated')::text,
        true
      )
    $function$;
    create function pg_temp.try_start(p_league uuid) returns text
    language plpgsql as $function$
    declare v record;
    begin
      perform pg_temp.as_actor('d9800000-0000-4000-8000-000000000001');
      select * into v from public.start_league(p_league);
      return 'START:' || v.result_code || ':' || v.result_changed::text;
    exception when others then return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
    create function pg_temp.try_scheduled() returns text
    language plpgsql as $function$
    declare v record;
    begin
      perform set_config('request.headers', '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}', true);
      select * into v from public.activate_due_leagues();
      return 'SCHEDULED:' || v.activated_count || ':' || v.late_count;
    exception when others then return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
    create function pg_temp.try_complete(p_league uuid) returns text
    language plpgsql as $function$
    declare v record;
    begin
      perform pg_temp.as_actor('d9800000-0000-4000-8000-000000000001');
      select * into v from public.complete_league(p_league);
      return 'COMPLETE:' || v.result_changed::text || ':' || v.result_closed_request_count;
    exception when others then return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
    create function pg_temp.try_approve(p_request uuid) returns text
    language plpgsql as $function$
    declare v record;
    begin
      perform pg_temp.as_actor('d9800000-0000-4000-8000-000000000001');
      select * into v from public.approve_join_request(p_request);
      return 'APPROVE:' || v.request_status::text;
    exception when others then return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
    create function pg_temp.try_reject(p_request uuid) returns text
    language plpgsql as $function$
    declare v record;
    begin
      perform pg_temp.as_actor('d9800000-0000-4000-8000-000000000001');
      select * into v from public.reject_join_request(p_request, 'Concurrent manager rejection');
      return 'REJECT:' || v.request_status::text;
    exception when others then return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
    create function pg_temp.try_finalize(p_request uuid) returns text
    language plpgsql as $function$
    declare v record;
    begin
      perform pg_temp.as_actor('d9800000-0000-4000-8000-000000000003');
      select * into v from public.finalize_payment_proof(
        p_request,
        'd9800000-0000-4000-8000-000000000501',
        'd9800000-0000-4000-8000-000000000601', repeat('a', 64), 100
      );
      return 'FINALIZE:' || v.status::text;
    exception when others then return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
  $remote$),
  'CREATE FUNCTION',
  'the first caller has bounded authenticated race probes'
);

select is(
  extensions.dblink_exec('lifecycle_second', $remote$
    set statement_timeout = '10s';
    set lock_timeout = '5s';
    create function pg_temp.as_actor(p_actor uuid) returns void
    language sql as $function$
      select set_config(
        'request.jwt.claims',
        jsonb_build_object('sub', p_actor::text, 'role', 'authenticated')::text,
        true
      )
    $function$;
    create function pg_temp.try_start(p_league uuid) returns text
    language plpgsql as $function$
    declare v record;
    begin
      perform pg_temp.as_actor('d9800000-0000-4000-8000-000000000001');
      select * into v from public.start_league(p_league);
      return 'START:' || v.result_code || ':' || v.result_changed::text;
    exception when others then return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
    create function pg_temp.try_scheduled() returns text
    language plpgsql as $function$
    declare v record;
    begin
      perform set_config('request.headers', '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}', true);
      select * into v from public.activate_due_leagues();
      return 'SCHEDULED:' || v.activated_count || ':' || v.late_count;
    exception when others then return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
    create function pg_temp.try_complete(p_league uuid) returns text
    language plpgsql as $function$
    declare v record;
    begin
      perform pg_temp.as_actor('d9800000-0000-4000-8000-000000000001');
      select * into v from public.complete_league(p_league);
      return 'COMPLETE:' || v.result_changed::text || ':' || v.result_closed_request_count;
    exception when others then return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
    create function pg_temp.try_approve(p_request uuid) returns text
    language plpgsql as $function$
    declare v record;
    begin
      perform pg_temp.as_actor('d9800000-0000-4000-8000-000000000001');
      select * into v from public.approve_join_request(p_request);
      return 'APPROVE:' || v.request_status::text;
    exception when others then return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
    create function pg_temp.try_reject(p_request uuid) returns text
    language plpgsql as $function$
    declare v record;
    begin
      perform pg_temp.as_actor('d9800000-0000-4000-8000-000000000001');
      select * into v from public.reject_join_request(p_request, 'Concurrent manager rejection');
      return 'REJECT:' || v.request_status::text;
    exception when others then return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
    create function pg_temp.try_finalize(p_request uuid) returns text
    language plpgsql as $function$
    declare v record;
    begin
      perform pg_temp.as_actor('d9800000-0000-4000-8000-000000000003');
      select * into v from public.finalize_payment_proof(
        p_request,
        'd9800000-0000-4000-8000-000000000501',
        'd9800000-0000-4000-8000-000000000601', repeat('a', 64), 100
      );
      return 'FINALIZE:' || v.status::text;
    exception when others then return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
  $remote$),
  'CREATE FUNCTION',
  'the second caller has matching bounded race probes'
);

create temp table lifecycle_pids as
select 'first'::text as caller, pid
from extensions.dblink('lifecycle_first', 'select pg_backend_pid()') as result(pid integer)
union all
select 'second', pid
from extensions.dblink('lifecycle_second', 'select pg_backend_pid()') as result(pid integer);

-- Manual start and the scheduled prefix begin together behind the same
-- serialization point. Whichever wins, only one transition/audit is durable.
select is(
  extensions.dblink_exec('lifecycle_locker', $remote$
    begin;
    do $block$ begin
      perform pg_advisory_xact_lock(
        2026090609,
        hashtext('d9800000-0000-4000-8000-000000000301')
      );
    end $block$;
  $remote$), 'DO', 'the activation race serialization point is held'
);
select is(
  extensions.dblink_send_query(
    'lifecycle_first',
    $$select pg_temp.try_start('d9800000-0000-4000-8000-000000000301')$$
  ), 1, 'manual activation starts concurrently'
);
select ok(
  pg_temp.wait_for_lock((select pid from lifecycle_pids where caller = 'first')),
  'manual activation waits on lifecycle serialization'
);
select is(
  extensions.dblink_send_query(
    'lifecycle_second', 'select pg_temp.try_scheduled()'
  ), 1, 'scheduled activation starts concurrently'
);
select ok(
  pg_temp.wait_for_lock((select pid from lifecycle_pids where caller = 'second')),
  'scheduled activation waits on lifecycle serialization'
);
select is(
  extensions.dblink_exec('lifecycle_locker', 'commit'),
  'COMMIT', 'the activation racers are released together'
);
create temp table activation_race_results(value text);
insert into activation_race_results
select value from extensions.dblink_get_result('lifecycle_first') as result(value text);
insert into activation_race_results
select value from extensions.dblink_get_result('lifecycle_second') as result(value text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('lifecycle_first') as drained(value text)),
  0, 'the manual activation result is fully drained'
);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('lifecycle_second') as drained(value text)),
  0, 'the scheduled activation result is fully drained'
);
select ok(
  not exists (select 1 from activation_race_results where value like 'ERROR:%'),
  'manual and scheduled activation finish without an error or deadlock'
);
select results_eq(
  $$select league.status::text, league.activated_at <= match.kickoff_at,
           scoring.locked_at is not null
    from public.leagues as league
    join public.matches as match on match.season_id = league.season_id
    join public.league_scoring_rules as scoring on scoring.league_id = league.id
    where league.id = 'd9800000-0000-4000-8000-000000000301'$$,
  $$values ('active'::text, true, true)$$,
  'the on-time race persists active and locks scoring before the boundary'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'league_activated'
     and entity_id = 'd9800000-0000-4000-8000-000000000301'),
  1,
  'the on-time race writes exactly one activation audit'
);
select ok(
  exists (
    select 1 from public.audit_logs as audit
    join public.matches as match
      on match.id = 'd9800000-0000-4000-8000-000000000201'
    where audit.entity_id = 'd9800000-0000-4000-8000-000000000301'
      and audit.action = 'league_activated'
      and audit.metadata ->> 'code' in ('MANUAL_ACTIVATION', 'ACTIVATION_FALLBACK')
      and audit.created_at <= match.kickoff_at
  ),
  'the on-time audit is not backdated and is not classified late'
);

select is(
  extensions.dblink_exec('lifecycle_control', $remote$
    update public.matches
    set kickoff_at = clock_timestamp() - interval '5 seconds'
    where id = 'd9800000-0000-4000-8000-000000000202'
  $remote$),
  'UPDATE 1',
  'the delayed-tick fixture crosses its boundary only for its own probe'
);
select results_eq(
  $$select value from extensions.dblink(
      'lifecycle_first', 'select pg_temp.try_scheduled()'
    ) as result(value text)$$,
  $$values ('SCHEDULED:1:1'::text)$$,
  'a delayed tick is recovered separately and counted late'
);
select results_eq(
  $$select league.status::text,
           league.activated_at = match.kickoff_at,
           audit.metadata ->> 'code',
           audit.created_at > league.activated_at
    from public.leagues as league
    join public.matches as match on match.season_id = league.season_id
    join public.audit_logs as audit
      on audit.entity_id = league.id and audit.action = 'league_activated'
    where league.id = 'd9800000-0000-4000-8000-000000000302'$$,
  $$values ('active'::text, true, 'ACTIVATION_PERSIST_LATE'::text, true)$$,
  'delayed persistence records the real write time and cannot satisfy the deadline'
);

select is(
  extensions.dblink_exec('lifecycle_control', $remote$
    update public.matches
    set kickoff_at = case id
      when 'd9800000-0000-4000-8000-000000000203'::uuid
        then clock_timestamp() - interval '1 hour'
      else clock_timestamp() + interval '1 hour'
    end
    where id in (
      'd9800000-0000-4000-8000-000000000203',
      'd9800000-0000-4000-8000-000000000204'
    )
  $remote$),
  'UPDATE 2',
  'the business-boundary fixture crosses its first kickoff in isolation'
);
select ok(
  (select value like 'SAVED:%' from extensions.dblink(
      'lifecycle_first',
      $remote$
        select pg_temp.as_actor('d9800000-0000-4000-8000-000000000002');
        select 'SAVED:' || prediction_id::text
        from public.save_prediction(
          'd9800000-0000-4000-8000-000000000303',
          'd9800000-0000-4000-8000-000000000204', 1, 1
        )
      $remote$
    ) as result(value text)),
  'a league-first prediction boundary applies effective-active before its child locks'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = 'd9800000-0000-4000-8000-000000000303'),
  1,
  'the effective-active boundary commits the requested future-match prediction'
);
select results_eq(
  $$select league.status::text,
           league.activated_at = first_match.kickoff_at,
           audit.metadata ->> 'origin',
           audit.metadata ->> 'code'
    from public.leagues as league
    join public.matches as first_match
      on first_match.id = 'd9800000-0000-4000-8000-000000000203'
    join public.audit_logs as audit
      on audit.entity_id = league.id and audit.action = 'league_activated'
    where league.id = 'd9800000-0000-4000-8000-000000000303'$$,
  $$values (
    'active'::text, true, 'business_boundary'::text,
    'ACTIVATION_PERSIST_LATE'::text
  )$$,
  'the delayed business boundary persists one explicit late-recovery audit'
);

-- Completion is queued before a proof finalization that already obtained an
-- upload context. Completion wins; the DB mutation rejects and the route-level
-- regression proves compensation of the derived object.
select is(
  extensions.dblink_exec('lifecycle_second', $remote$
    set request.jwt.claims =
      '{"sub":"d9800000-0000-4000-8000-000000000003","role":"authenticated"}'
  $remote$),
  'SET',
  'the upload-context caller uses the request owner session'
);
select results_eq(
  $$select request_id, status
    from extensions.dblink(
      'lifecycle_second',
      $remote$
        select request_id, status::text
        from public.get_join_request_upload_context(
          'd9800000-0000-4000-8000-000000000401'
        )
      $remote$
    ) as result(request_id uuid, status text)$$,
  $$values (
    'd9800000-0000-4000-8000-000000000401'::uuid,
    'pending_proof'::text
  )$$,
  'the upload race obtains only its pre-completion context'
);
select is(
  extensions.dblink_exec('lifecycle_locker', $remote$
    begin;
    do $block$ begin
      perform pg_advisory_xact_lock(
        2026090609,
        hashtext('d9800000-0000-4000-8000-000000000304')
      );
    end $block$;
  $remote$), 'DO', 'the finalize/completion race is held'
);
select is(
  extensions.dblink_send_query(
    'lifecycle_first',
    $$select pg_temp.try_complete('d9800000-0000-4000-8000-000000000304')$$
  ), 1, 'completion starts before finalization'
);
select ok(
  pg_temp.wait_for_lock((select pid from lifecycle_pids where caller = 'first')),
  'completion waits at the shared lifecycle point'
);
select is(
  extensions.dblink_send_query(
    'lifecycle_second',
    $$select pg_temp.try_finalize('d9800000-0000-4000-8000-000000000401')$$
  ), 1, 'proof finalization starts concurrently'
);
select ok(
  pg_temp.wait_for_lock((select pid from lifecycle_pids where caller = 'second')),
  'proof finalization waits without holding a request child lock'
);
select is(extensions.dblink_exec('lifecycle_locker', 'commit'), 'COMMIT',
  'the finalize/completion race is released');
create temp table finalize_race_results(value text);
insert into finalize_race_results
select value from extensions.dblink_get_result('lifecycle_first') as result(value text);
insert into finalize_race_results
select value from extensions.dblink_get_result('lifecycle_second') as result(value text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('lifecycle_first') as drained(value text)),
  0, 'the completion result for finalization is fully drained'
);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('lifecycle_second') as drained(value text)),
  0, 'the finalization result is fully drained'
);
select results_eq(
  $$select league.status::text, request.status::text,
           request.rejection_reason,
           (select count(*)::integer from public.payment_proofs as proof
            where proof.join_request_id = request.id)
    from public.leagues as league
    join public.join_requests as request on request.league_id = league.id
    where league.id = 'd9800000-0000-4000-8000-000000000304'$$,
  $$values ('completed'::text, 'rejected'::text, 'LEAGUE_COMPLETED'::text, 0)$$,
  'completion wins the upload/finalize race with no business proof row'
);
select ok(
  exists (select 1 from finalize_race_results where value = 'COMPLETE:true:1')
  and exists (
    select 1 from finalize_race_results
    where value = 'ERROR:P0001:REQUEST_NOT_UPLOADABLE'
  ),
  'the terminal finalization rejection is stable and deadlock-free'
);

-- Approval enters the wait queue first. It may finish, then completion freezes
-- the league without rewriting its approved history or proof.
select is(
  extensions.dblink_exec('lifecycle_locker', $remote$
    begin;
    do $block$ begin
      perform pg_advisory_xact_lock(
        2026090609,
        hashtext('d9800000-0000-4000-8000-000000000305')
      );
    end $block$;
  $remote$), 'DO', 'the approve/completion race is held'
);
select is(
  extensions.dblink_send_query(
    'lifecycle_first',
    $$select pg_temp.try_approve('d9800000-0000-4000-8000-000000000402')$$
  ), 1, 'approval starts before completion'
);
select ok(
  pg_temp.wait_for_lock((select pid from lifecycle_pids where caller = 'first')),
  'approval waits before acquiring its request child'
);
select is(
  extensions.dblink_send_query(
    'lifecycle_second',
    $$select pg_temp.try_complete('d9800000-0000-4000-8000-000000000305')$$
  ), 1, 'completion starts concurrently with approval'
);
select ok(
  pg_temp.wait_for_lock((select pid from lifecycle_pids where caller = 'second')),
  'completion waits at the same lifecycle point'
);
select is(extensions.dblink_exec('lifecycle_locker', 'commit'), 'COMMIT',
  'the approve/completion race is released');
create temp table approve_race_results(value text);
insert into approve_race_results
select value from extensions.dblink_get_result('lifecycle_first') as result(value text);
insert into approve_race_results
select value from extensions.dblink_get_result('lifecycle_second') as result(value text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('lifecycle_first') as drained(value text)),
  0, 'the approval result is fully drained'
);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('lifecycle_second') as drained(value text)),
  0, 'the completion result for approval is fully drained'
);
select results_eq(
  $$select league.status::text, request.status::text,
           member.status::text,
           (select count(*)::integer from public.payment_proofs as proof
            where proof.join_request_id = request.id)
    from public.leagues as league
    join public.join_requests as request on request.league_id = league.id
    join public.league_members as member
      on member.league_id = league.id and member.user_id = request.user_id
    where league.id = 'd9800000-0000-4000-8000-000000000305'$$,
  $$values ('completed'::text, 'approved'::text, 'active'::text, 1)$$,
  'approval-first serialization preserves membership, proof and history at completion'
);
select ok(
  exists (select 1 from approve_race_results where value = 'APPROVE:approved')
  and exists (select 1 from approve_race_results where value = 'COMPLETE:true:0'),
  'approval and completion both finish exactly once without deadlock'
);

-- Completion enters before rejection. The losing decision cannot replace the
-- stable LEAGUE_COMPLETED closure reason.
select is(
  extensions.dblink_exec('lifecycle_locker', $remote$
    begin;
    do $block$ begin
      perform pg_advisory_xact_lock(
        2026090609,
        hashtext('d9800000-0000-4000-8000-000000000306')
      );
    end $block$;
  $remote$), 'DO', 'the reject/completion race is held'
);
select is(
  extensions.dblink_send_query(
    'lifecycle_first',
    $$select pg_temp.try_complete('d9800000-0000-4000-8000-000000000306')$$
  ), 1, 'completion starts before rejection'
);
select ok(
  pg_temp.wait_for_lock((select pid from lifecycle_pids where caller = 'first')),
  'completion is first in the lifecycle wait queue'
);
select is(
  extensions.dblink_send_query(
    'lifecycle_second',
    $$select pg_temp.try_reject('d9800000-0000-4000-8000-000000000403')$$
  ), 1, 'manager rejection starts concurrently'
);
select ok(
  pg_temp.wait_for_lock((select pid from lifecycle_pids where caller = 'second')),
  'manager rejection waits without holding the request child'
);
select is(extensions.dblink_exec('lifecycle_locker', 'commit'), 'COMMIT',
  'the reject/completion race is released');
create temp table reject_race_results(value text);
insert into reject_race_results
select value from extensions.dblink_get_result('lifecycle_first') as result(value text);
insert into reject_race_results
select value from extensions.dblink_get_result('lifecycle_second') as result(value text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('lifecycle_first') as drained(value text)),
  0, 'the completion result for rejection is fully drained'
);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('lifecycle_second') as drained(value text)),
  0, 'the rejection result is fully drained'
);
select results_eq(
  $$select league.status::text, request.status::text, request.rejection_reason
    from public.leagues as league
    join public.join_requests as request on request.league_id = league.id
    where league.id = 'd9800000-0000-4000-8000-000000000306'$$,
  $$values ('completed'::text, 'rejected'::text, 'LEAGUE_COMPLETED'::text)$$,
  'completion-first serialization preserves the terminal closure reason'
);
select ok(
  exists (select 1 from reject_race_results where value = 'COMPLETE:true:1')
  and exists (
    select 1 from reject_race_results
    where value = 'ERROR:P0001:STATE_CONFLICT'
  ),
  'the losing rejection is a stable conflict rather than a lost update'
);

-- Two completion sessions race on the same active league. One freezes the
-- included set; the other observes the completed row as an idempotent replay.
select is(
  extensions.dblink_exec('lifecycle_locker', $remote$
    begin;
    do $block$ begin
      perform pg_advisory_xact_lock(
        2026090609,
        hashtext('d9800000-0000-4000-8000-000000000307')
      );
    end $block$;
  $remote$), 'DO', 'the double-completion race is held'
);
select is(
  extensions.dblink_send_query(
    'lifecycle_first',
    $$select pg_temp.try_complete('d9800000-0000-4000-8000-000000000307')$$
  ), 1, 'the first completion starts'
);
select ok(
  pg_temp.wait_for_lock((select pid from lifecycle_pids where caller = 'first')),
  'the first completion waits on lifecycle serialization'
);
select is(
  extensions.dblink_send_query(
    'lifecycle_second',
    $$select pg_temp.try_complete('d9800000-0000-4000-8000-000000000307')$$
  ), 1, 'the second completion starts'
);
select ok(
  pg_temp.wait_for_lock((select pid from lifecycle_pids where caller = 'second')),
  'the second completion waits on lifecycle serialization'
);
select is(extensions.dblink_exec('lifecycle_locker', 'commit'), 'COMMIT',
  'the double-completion race is released');
create temp table double_completion_results(value text);
insert into double_completion_results
select value from extensions.dblink_get_result('lifecycle_first') as result(value text);
insert into double_completion_results
select value from extensions.dblink_get_result('lifecycle_second') as result(value text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('lifecycle_first') as drained(value text)),
  0, 'the first completion replay result is fully drained'
);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('lifecycle_second') as drained(value text)),
  0, 'the second completion replay result is fully drained'
);
select results_eq(
  $$select value from double_completion_results order by value$$,
  $$values ('COMPLETE:false:0'::text), ('COMPLETE:true:0'::text)$$,
  'double completion has exactly one transition and one replay'
);
select is(
  (select count(*)::integer from public.league_match_snapshots
   where league_id = 'd9800000-0000-4000-8000-000000000307'),
  1,
  'double completion freezes one snapshot set'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'league_completed'
     and entity_id = 'd9800000-0000-4000-8000-000000000307'),
  1,
  'double completion writes one completion audit'
);

select is(extensions.dblink_disconnect('lifecycle_first'), 'OK',
  'the first lifecycle caller disconnects');
select is(extensions.dblink_disconnect('lifecycle_second'), 'OK',
  'the second lifecycle caller disconnects');
select is(extensions.dblink_disconnect('lifecycle_locker'), 'OK',
  'the lifecycle lock holder disconnects');

select is(
  extensions.dblink_exec('lifecycle_control', $remote$
    delete from public.audit_logs
    where entity_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000599'::uuid;
    delete from public.predictions
    where league_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.payment_proofs
    where join_request_id between
      'd9800000-0000-4000-8000-000000000401'::uuid and
      'd9800000-0000-4000-8000-000000000499'::uuid;
    delete from public.join_requests
    where id between
      'd9800000-0000-4000-8000-000000000401'::uuid and
      'd9800000-0000-4000-8000-000000000499'::uuid;
    delete from public.league_members
    where league_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_match_reconciliations
    where league_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_match_snapshots
    where league_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.prize_rules
    where league_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_scoring_rules
    where league_id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.leagues
    where id between
      'd9800000-0000-4000-8000-000000000301'::uuid and
      'd9800000-0000-4000-8000-000000000399'::uuid;
    delete from public.matches
    where id between
      'd9800000-0000-4000-8000-000000000201'::uuid and
      'd9800000-0000-4000-8000-000000000299'::uuid;
    delete from public.seasons
    where id between
      'd9800000-0000-4000-8000-000000000101'::uuid and
      'd9800000-0000-4000-8000-000000000199'::uuid;
    delete from auth.users
    where id between
      'd9800000-0000-4000-8000-000000000001'::uuid and
      'd9800000-0000-4000-8000-000000000099'::uuid;
  $remote$),
  'DELETE 6',
  'the committed lifecycle fixtures are removed'
);
select is(extensions.dblink_disconnect('lifecycle_control'), 'OK',
  'the lifecycle fixture connection disconnects');

select * from finish();
rollback;
