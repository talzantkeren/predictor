begin;

select no_plan();

-- S9-DEF-002 regression suite.
--
-- Every assertion here uses real committed database sessions, because the
-- defect is invisible to a single transaction: each function used to decide a
-- time-dependent invariant from a timestamp sampled *before* the row lock that
-- serializes the decision. A contender that waited on that lock therefore acted
-- on a stale clock. The three scenarios below hold a lock across the relevant
-- boundary and prove the decision is now taken inside the critical section.

create extension if not exists dblink with schema extensions;

select is(
  extensions.dblink_connect(
    'slice9_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the serialized-time control connection opens'
);

-- The fixture is committed from a separate session so the blocked sessions can
-- see it. Kickoff is deliberately a few seconds out so a transaction can start
-- before it and commit after it.
select is(
  extensions.dblink_exec('slice9_control', $remote$
    begin;
    delete from public.audit_logs
      where entity_type = 'match_result'
        and entity_id in (
          'd9000000-0000-4000-8000-000000000001'::uuid,
          'd9000000-0000-4000-8000-000000000002'::uuid
        );
    delete from public.predictions
      where match_id in (
        'd9000000-0000-4000-8000-000000000001'::uuid,
        'd9000000-0000-4000-8000-000000000002'::uuid
      );
    delete from public.league_members
      where league_id = 'd9000000-0000-4000-8000-000000000010'::uuid;
    delete from public.league_scoring_rules
      where league_id = 'd9000000-0000-4000-8000-000000000010'::uuid;
    delete from public.leagues
      where id = 'd9000000-0000-4000-8000-000000000010'::uuid;
    delete from public.matches
      where id in (
        'd9000000-0000-4000-8000-000000000001'::uuid,
        'd9000000-0000-4000-8000-000000000002'::uuid
      );
    delete from public.sports_provider_rounds
      where season_id = 'd9000000-0000-4000-8000-000000000027'::uuid;
    delete from public.teams
      where id in (
        'd9000000-0000-4000-8000-000000000101'::uuid,
        'd9000000-0000-4000-8000-000000000102'::uuid
      );
    delete from public.seasons
      where id = 'd9000000-0000-4000-8000-000000000027'::uuid;
    delete from public.competitions
      where id = 'd9000000-0000-4000-8000-000000000020'::uuid;
    delete from auth.users
      where id in (
        'd9111111-1111-4111-8111-111111111111'::uuid,
        'd9222222-2222-4222-8222-222222222222'::uuid
      );

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
      ('00000000-0000-0000-0000-000000000000', 'd9111111-1111-4111-8111-111111111111',
       'authenticated', 'authenticated', 'slice9-time-manager@example.com',
       crypt('password123', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{"display_name":"מנהל זמן"}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', 'd9222222-2222-4222-8222-222222222222',
       'authenticated', 'authenticated', 'slice9-time-member@example.com',
       crypt('password123', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{"display_name":"חבר זמן"}', now(), now());

    insert into public.competitions (
      id, name, slug, country_code, external_provider, external_id
    ) values (
      'd9000000-0000-4000-8000-000000000020',
      'תחרות זמן מסודר', 'slice9-serialized-time', 'IL', 'api-football', '383'
    );
    insert into public.seasons (
      id, competition_id, name, starts_on, ends_on, is_current,
      external_provider, external_id
    ) values (
      'd9000000-0000-4000-8000-000000000027',
      'd9000000-0000-4000-8000-000000000020',
      '2026/27', '2026-08-22', '2027-05-31', false, 'api-football', '2026'
    );
    insert into public.teams (
      id, name, short_name, external_provider, external_id
    ) values
      ('d9000000-0000-4000-8000-000000000101', 'בית זמן', 'בית', 'api-football', '9563'),
      ('d9000000-0000-4000-8000-000000000102', 'חוץ זמן', 'חוץ', 'api-football', '9604');

    insert into public.matches (
      id, season_id, round_number, home_team_id, away_team_id,
      kickoff_at, status, external_provider, external_id, provider_status
    ) values
      ('d9000000-0000-4000-8000-000000000001',
       'd9000000-0000-4000-8000-000000000027', 1,
       'd9000000-0000-4000-8000-000000000101',
       'd9000000-0000-4000-8000-000000000102',
       clock_timestamp() + interval '1 day', 'scheduled', null, null, null),
      ('d9000000-0000-4000-8000-000000000002',
       'd9000000-0000-4000-8000-000000000027', 1,
       'd9000000-0000-4000-8000-000000000102',
       'd9000000-0000-4000-8000-000000000101',
       clock_timestamp() + interval '1 day', 'scheduled', 'api-football', '1909002', 'NS');

    insert into public.leagues (id, manager_id, season_id, name, status)
    values (
      'd9000000-0000-4000-8000-000000000010',
      'd9111111-1111-4111-8111-111111111111',
      'd9000000-0000-4000-8000-000000000027',
      'ליגת זמן מסודר Slice 9',
      'active'
    );
    insert into public.league_scoring_rules (
      league_id, exact_points, correct_outcome_points, incorrect_points
    ) values ('d9000000-0000-4000-8000-000000000010', 3, 1, 0);
    insert into public.league_members (
      league_id, user_id, status, approved_by, approved_at
    ) values
      ('d9000000-0000-4000-8000-000000000010', 'd9111111-1111-4111-8111-111111111111',
       'active', 'd9111111-1111-4111-8111-111111111111', now()),
      ('d9000000-0000-4000-8000-000000000010', 'd9222222-2222-4222-8222-222222222222',
       'active', 'd9111111-1111-4111-8111-111111111111', now());

    commit;
  $remote$),
  'COMMIT',
  'the serialized-time fixture is committed with both kickoffs far in the future'
);

-- Each scenario moves its own kickoff to a boundary a few seconds out and
-- commits it, so the contender really does start before kickoff. The boundary is
-- chosen here so the waiting loops never depend on uncommitted state.
create temp table slice9_kickoff (
  match_id uuid primary key,
  boundary timestamptz not null
);

-- ---------------------------------------------------------------------------
-- 1. save_prediction judges the kickoff deadline after the match row lock.
-- ---------------------------------------------------------------------------

select is(
  extensions.dblink_connect(
    'slice9_save',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the blocked member connection opens'
);
select is(
  extensions.dblink_exec('slice9_save', $remote$
    set statement_timeout = '30s';
    set lock_timeout = '25s';
    set role authenticated;
    set request.jwt.claims = '{"sub":"d9222222-2222-4222-8222-222222222222","role":"authenticated"}';
  $remote$),
  'SET',
  'the blocked member session receives an authenticated context'
);

insert into slice9_kickoff (match_id, boundary)
values ('d9000000-0000-4000-8000-000000000001', clock_timestamp() + interval '4 seconds');
select is(
  extensions.dblink_exec(
    'slice9_control',
    format(
      $remote$
        begin;
        update public.matches as match
        set kickoff_at = %L::timestamptz
        where match.id = 'd9000000-0000-4000-8000-000000000001'::uuid;
        commit;
      $remote$,
      (select boundary from slice9_kickoff
       where match_id = 'd9000000-0000-4000-8000-000000000001')
    )
  ),
  'COMMIT',
  'the manual match is moved to a kickoff a few seconds away'
);
select is(
  extensions.dblink_exec('slice9_control', $remote$
    begin;
    set statement_timeout = '30s';
    do $lock$
    begin
      perform 1
      from public.matches
      where id = 'd9000000-0000-4000-8000-000000000001'::uuid
      for update;
    end;
    $lock$;
  $remote$),
  'DO',
  'the control session owns the match row while kickoff is still in the future'
);

select is(
  extensions.dblink_send_query('slice9_save', $remote$
    select 'saved'::text
    from public.save_prediction(
      'd9000000-0000-4000-8000-000000000010',
      'd9000000-0000-4000-8000-000000000001',
      1, 0
    )
  $remote$),
  1,
  'the member starts saving a prediction before database kickoff'
);
select lives_ok(
  $wait$
    do $$
    declare
      v_attempt integer := 0;
    begin
      loop
        exit when extensions.dblink_is_busy('slice9_save') = 1;
        v_attempt := v_attempt + 1;
        if v_attempt >= 250 then
          raise exception 'the prediction never reached the server';
        end if;
        perform pg_catalog.pg_sleep(0.02);
      end loop;
    end;
    $$
  $wait$,
  'the prediction is in flight against the locked match row'
);
select lives_ok(
  $wait$
    do $$
    declare
      v_attempt integer := 0;
    begin
      loop
        exit when clock_timestamp() >= (
          select kickoff.boundary + interval '250 milliseconds'
          from slice9_kickoff as kickoff
          where kickoff.match_id = 'd9000000-0000-4000-8000-000000000001'::uuid
        );
        v_attempt := v_attempt + 1;
        if v_attempt >= 400 then
          raise exception 'database kickoff never passed while the row was held';
        end if;
        perform pg_catalog.pg_sleep(0.05);
      end loop;
    end;
    $$
  $wait$,
  'the control session holds the row until database kickoff has passed'
);
select is(
  extensions.dblink_is_busy('slice9_save'),
  1,
  'the prediction is still unresolved after kickoff, so it decides on the far side of the boundary'
);
select is(
  extensions.dblink_exec('slice9_control', 'commit'),
  'COMMIT',
  'the match row is released only after kickoff'
);

create temp table slice9_save_outcome (
  id integer primary key,
  result_text text,
  error_text text
);
insert into slice9_save_outcome (id, result_text)
select 1, result.value
from extensions.dblink_get_result('slice9_save', false) as result(value text);
insert into slice9_save_outcome (id, result_text)
values (1, null)
on conflict (id) do nothing;
update slice9_save_outcome
set error_text = extensions.dblink_error_message('slice9_save')
where id = 1;
select is(
  (
    select count(*)::integer
    from extensions.dblink_get_result('slice9_save', false) as drained(value text)
  ),
  0,
  'the member connection is drained after the blocked prediction resolves'
);

select ok(
  position(
    'PREDICTION_LOCKED' in (select coalesce(error_text, '') from slice9_save_outcome)
  ) > 0,
  'a prediction that waited across kickoff is rejected with PREDICTION_LOCKED'
);
select is(
  (
    select count(*)::integer
    from public.predictions
    where match_id = 'd9000000-0000-4000-8000-000000000001'::uuid
  ),
  0,
  'no prediction is stored at or after kickoff even though its transaction started earlier'
);
select is(
  extensions.dblink_disconnect('slice9_save'),
  'OK',
  'the blocked member connection closes'
);

-- ---------------------------------------------------------------------------
-- 2. The cancellation latch is decided under the match row lock, and a later
--    reactivation cannot reopen predictions that were already revealed.
-- ---------------------------------------------------------------------------

select is(
  extensions.dblink_connect(
    'slice9_sync',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the Sync worker connection opens'
);
select is(
  extensions.dblink_exec('slice9_sync', $remote$
    set statement_timeout = '30s';
    set lock_timeout = '25s';
    set role service_role;
    set request.headers = '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}';
  $remote$),
  'SET',
  'the Sync worker session receives only the fixed system-actor context'
);

create temp table slice9_lease (
  run_id uuid,
  generation bigint,
  token uuid
);
insert into slice9_lease (run_id, generation, token)
select claim.run_id, claim.generation, claim.token
from extensions.dblink(
  'slice9_sync',
  $$select result_run_id, result_generation, result_token
    from public.claim_sports_sync('api-football', true)$$
) as claim(run_id uuid, generation bigint, token uuid);
select ok(
  (select run_id is not null and token is not null from slice9_lease),
  'the Sync worker holds a fenced lease before the cancellation race'
);

insert into slice9_kickoff (match_id, boundary)
values ('d9000000-0000-4000-8000-000000000002', clock_timestamp() + interval '4 seconds');
select is(
  extensions.dblink_exec(
    'slice9_control',
    format(
      $remote$
        begin;
        update public.matches as match
        set kickoff_at = %L::timestamptz
        where match.id = 'd9000000-0000-4000-8000-000000000002'::uuid;
        commit;
      $remote$,
      (select boundary from slice9_kickoff
       where match_id = 'd9000000-0000-4000-8000-000000000002')
    )
  ),
  'COMMIT',
  'the provider match is moved to a kickoff a few seconds away'
);
select is(
  extensions.dblink_exec('slice9_control', $remote$
    begin;
    set statement_timeout = '30s';
    do $lock$
    begin
      perform 1
      from public.matches
      where id = 'd9000000-0000-4000-8000-000000000002'::uuid
      for update;
    end;
    $lock$;
  $remote$),
  'DO',
  'the control session owns the provider match while kickoff is still in the future'
);

select is(
  extensions.dblink_send_query(
    'slice9_sync',
    format(
      $$select public.apply_api_football_sync_batch(
          %L::uuid, %s, %L::uuid,
          jsonb_build_object(
            'competition', null,
            'season', null,
            'teams', jsonb_build_array(),
            'rounds', jsonb_build_array(),
            'fixtures', jsonb_build_array(
              jsonb_build_object(
                'externalId', '1909002',
                'roundNumber', 1,
                'roundLabel', 'Regular Season - 1',
                'kickoffAt', %L,
                'status', 'canceled',
                'providerStatus', 'CANC',
                'homeTeamExternalId', '9604',
                'awayTeamExternalId', '9563',
                'homeScore', null,
                'awayScore', null,
                'locksPredictions', false,
                'resultDisposition', 'none'
              )
            )
          )
        ) is not null$$,
      (select run_id from slice9_lease),
      (select generation from slice9_lease),
      (select token from slice9_lease),
      (
        select match.kickoff_at::text
        from public.matches as match
        where match.id = 'd9000000-0000-4000-8000-000000000002'::uuid
      )
    )
  ),
  1,
  'the Sync worker starts applying a cancellation before database kickoff'
);
select lives_ok(
  $wait$
    do $$
    declare
      v_attempt integer := 0;
    begin
      loop
        exit when extensions.dblink_is_busy('slice9_sync') = 1;
        v_attempt := v_attempt + 1;
        if v_attempt >= 250 then
          raise exception 'the cancellation never reached the server';
        end if;
        perform pg_catalog.pg_sleep(0.02);
      end loop;
    end;
    $$
  $wait$,
  'the cancellation is in flight against the locked provider match'
);
select lives_ok(
  $wait$
    do $$
    declare
      v_attempt integer := 0;
    begin
      loop
        exit when clock_timestamp() >= (
          select kickoff.boundary + interval '250 milliseconds'
          from slice9_kickoff as kickoff
          where kickoff.match_id = 'd9000000-0000-4000-8000-000000000002'::uuid
        );
        v_attempt := v_attempt + 1;
        if v_attempt >= 400 then
          raise exception 'database kickoff never passed while the provider row was held';
        end if;
        perform pg_catalog.pg_sleep(0.05);
      end loop;
    end;
    $$
  $wait$,
  'the control session holds the provider row until database kickoff has passed'
);
select is(
  extensions.dblink_is_busy('slice9_sync'),
  1,
  'the cancellation is still unresolved after kickoff, so it latches on the far side of the boundary'
);
select is(
  extensions.dblink_exec('slice9_control', 'commit'),
  'COMMIT',
  'the provider match row is released only after kickoff'
);

create temp table slice9_cancel_outcome (
  id integer primary key,
  result_text text,
  error_text text
);
insert into slice9_cancel_outcome (id, result_text)
select 1, result.value
from extensions.dblink_get_result('slice9_sync', false) as result(value text);
insert into slice9_cancel_outcome (id, result_text)
values (1, null)
on conflict (id) do nothing;
update slice9_cancel_outcome
set error_text = extensions.dblink_error_message('slice9_sync')
where id = 1;
select is(
  (
    select count(*)::integer
    from extensions.dblink_get_result('slice9_sync', false) as drained(value text)
  ),
  0,
  'the Sync worker connection is drained after the blocked cancellation resolves'
);

select is(
  (select error_text from slice9_cancel_outcome),
  'OK',
  'the delayed cancellation commits without a lock or fence error'
);
select is(
  (
    select match.status::text
    from public.matches as match
    where match.id = 'd9000000-0000-4000-8000-000000000002'::uuid
  ),
  'canceled',
  'the delayed cancellation is applied to the provider match'
);
select ok(
  (
    select match.predictions_locked_at is not null
    from public.matches as match
    where match.id = 'd9000000-0000-4000-8000-000000000002'::uuid
  ),
  'a cancellation observed after kickoff latches predictions even though it was decided before kickoff'
);

-- A later provider reactivation with a future kickoff must not clear the latch
-- and must not reopen predictions that were already revealed.
select lives_ok(
  $reactivate$
    select applied.value
    from extensions.dblink(
      'slice9_sync',
      format(
        $inner$select (public.apply_api_football_sync_batch(
            %L::uuid, %s, %L::uuid,
            jsonb_build_object(
              'competition', null,
              'season', null,
              'teams', jsonb_build_array(),
              'rounds', jsonb_build_array(),
              'fixtures', jsonb_build_array(
                jsonb_build_object(
                  'externalId', '1909002',
                  'roundNumber', 1,
                  'roundLabel', 'Regular Season - 1',
                  'kickoffAt', %L,
                  'status', 'scheduled',
                  'providerStatus', 'NS',
                  'homeTeamExternalId', '9604',
                  'awayTeamExternalId', '9563',
                  'homeScore', null,
                  'awayScore', null,
                  'locksPredictions', false,
                  'resultDisposition', 'none'
                )
              )
            )
          ) is not null)::text$inner$,
        (select run_id from slice9_lease),
        (select generation from slice9_lease),
        (select token from slice9_lease),
        (clock_timestamp() + interval '1 day')::text
      )
    ) as applied(value text)
  $reactivate$,
  'the provider offers a future reactivation for the latched match'
);
select ok(
  (
    select match.status = 'canceled' and match.predictions_locked_at is not null
    from public.matches as match
    where match.id = 'd9000000-0000-4000-8000-000000000002'::uuid
  ),
  'the reactivation is refused by the latch instead of reopening predictions'
);

select is(
  extensions.dblink_connect(
    'slice9_late_save',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'a post-cancellation member connection opens'
);
select is(
  extensions.dblink_exec('slice9_late_save', $remote$
    set statement_timeout = '30s';
    set role authenticated;
    set request.jwt.claims = '{"sub":"d9222222-2222-4222-8222-222222222222","role":"authenticated"}';
  $remote$),
  'SET',
  'the post-cancellation member session receives an authenticated context'
);
select throws_ok(
  $$select * from extensions.dblink(
      'slice9_late_save',
      $inner$select 'saved'::text
        from public.save_prediction(
          'd9000000-0000-4000-8000-000000000010',
          'd9000000-0000-4000-8000-000000000002',
          2, 1
        )$inner$
    ) as saved(value text)$$,
  null, null,
  'a member still cannot predict the reactivated match after the latch was set'
);
select is(
  extensions.dblink_disconnect('slice9_late_save'),
  'OK',
  'the post-cancellation member connection closes'
);

select lives_ok(
  $finalize$
    select finalized.value
    from extensions.dblink(
      'slice9_sync',
      format(
        $inner$select result_status::text
          from public.finalize_sports_sync(
            %L::uuid, %s, %L::uuid,
            'succeeded', null, null, 1, array[]::text[], null, null
          )$inner$,
        (select run_id from slice9_lease),
        (select generation from slice9_lease),
        (select token from slice9_lease)
      )
    ) as finalized(value text)
  $finalize$,
  'the cancellation run is finalized and the lease is released'
);

-- ---------------------------------------------------------------------------
-- 3. claim_sports_sync judges backoff, cooldown and the lease window from time
--    sampled after the lease row lock.
-- ---------------------------------------------------------------------------

-- The control session's update stays uncommitted while it holds the lease row,
-- so the boundary is chosen here and passed in rather than read back.
create temp table slice9_backoff (boundary timestamptz not null);
insert into slice9_backoff (boundary)
values (clock_timestamp() + interval '3 seconds');

select is(
  extensions.dblink_exec(
    'slice9_control',
    format(
      $remote$
        begin;
        set statement_timeout = '30s';
        update public.sync_leases as lease
        set backoff_until = %L::timestamptz,
            last_catalog_at = null,
            last_targeted_at = null,
            last_reconciliation_at = null,
            last_forced_at = null
        where lease.provider = 'api-football';
      $remote$,
      (select boundary from slice9_backoff)
    )
  ),
  'UPDATE 1',
  'the control session sets a backoff window that expires while it holds the lease row'
);

select is(
  extensions.dblink_send_query('slice9_sync', $remote$
    select claimed.result_outcome, claimed.result_code,
           claimed.result_locked_until - clock_timestamp() > interval '110 seconds'
    from public.claim_sports_sync('api-football', false) as claimed
  $remote$),
  1,
  'a contender starts claiming while the backoff window is still open'
);
select lives_ok(
  $wait$
    do $$
    declare
      v_attempt integer := 0;
    begin
      loop
        exit when extensions.dblink_is_busy('slice9_sync') = 1;
        v_attempt := v_attempt + 1;
        if v_attempt >= 250 then
          raise exception 'the contending claim never reached the server';
        end if;
        perform pg_catalog.pg_sleep(0.02);
      end loop;
    end;
    $$
  $wait$,
  'the contending claim is in flight against the locked lease row'
);
select lives_ok(
  $wait$
    do $$
    declare
      v_attempt integer := 0;
    begin
      loop
        exit when clock_timestamp() >= (
          select backoff.boundary + interval '250 milliseconds'
          from slice9_backoff as backoff
        );
        v_attempt := v_attempt + 1;
        if v_attempt >= 400 then
          raise exception 'the backoff window never expired while the lease row was held';
        end if;
        perform pg_catalog.pg_sleep(0.05);
      end loop;
    end;
    $$
  $wait$,
  'the control session holds the lease row until the backoff window has expired'
);
select is(
  extensions.dblink_is_busy('slice9_sync'),
  1,
  'the contending claim is still unresolved after the backoff boundary passed'
);
select is(
  extensions.dblink_exec('slice9_control', 'commit'),
  'COMMIT',
  'the lease row is released only after the backoff boundary'
);

select results_eq(
  $$select * from extensions.dblink_get_result('slice9_sync', false)
      as claimed(outcome text, code text, full_lease boolean)$$,
  $$values ('CLAIMED'::text, null::text, true)$$,
  'a claim delayed across the boundary judges fresh time and issues a full-length lease'
);
select is(
  (
    select count(*)::integer
    from extensions.dblink_get_result('slice9_sync', false) as drained(value text)
  ),
  0,
  'the Sync worker connection is drained after the contended claim resolves'
);

-- ---------------------------------------------------------------------------
-- Teardown: the fixture and the lease are committed state, so both are restored.
-- ---------------------------------------------------------------------------

select is(
  extensions.dblink_exec('slice9_control', $remote$
    begin;
    update public.sync_runs as run
    set status = 'failed',
        finished_at = clock_timestamp(),
        error_code = 'PROVIDER_UNAVAILABLE',
        error_message_safe = 'The sports provider is temporarily unavailable.'
    where run.status = 'running';
    update public.sync_leases as lease
    set run_id = null,
        fencing_token = null,
        locked_until = null,
        backoff_until = null,
        last_catalog_at = null,
        last_targeted_at = null,
        last_reconciliation_at = null,
        last_forced_at = null
    where lease.provider = 'api-football';
    delete from public.sync_runs where provider = 'api-football';
    delete from public.audit_logs
      where entity_type = 'match_result'
        and entity_id in (
          'd9000000-0000-4000-8000-000000000001'::uuid,
          'd9000000-0000-4000-8000-000000000002'::uuid
        );
    delete from public.predictions
      where match_id in (
        'd9000000-0000-4000-8000-000000000001'::uuid,
        'd9000000-0000-4000-8000-000000000002'::uuid
      );
    delete from public.league_members
      where league_id = 'd9000000-0000-4000-8000-000000000010'::uuid;
    delete from public.league_scoring_rules
      where league_id = 'd9000000-0000-4000-8000-000000000010'::uuid;
    delete from public.leagues
      where id = 'd9000000-0000-4000-8000-000000000010'::uuid;
    delete from public.matches
      where id in (
        'd9000000-0000-4000-8000-000000000001'::uuid,
        'd9000000-0000-4000-8000-000000000002'::uuid
      );
    delete from public.sports_provider_rounds
      where season_id = 'd9000000-0000-4000-8000-000000000027'::uuid;
    delete from public.teams
      where id in (
        'd9000000-0000-4000-8000-000000000101'::uuid,
        'd9000000-0000-4000-8000-000000000102'::uuid
      );
    delete from public.seasons
      where id = 'd9000000-0000-4000-8000-000000000027'::uuid;
    delete from public.competitions
      where id = 'd9000000-0000-4000-8000-000000000020'::uuid;
    delete from auth.users
      where id in (
        'd9111111-1111-4111-8111-111111111111'::uuid,
        'd9222222-2222-4222-8222-222222222222'::uuid
      );
    commit;
  $remote$),
  'COMMIT',
  'the serialized-time fixture and the shared sync lease are restored'
);
select is(
  extensions.dblink_disconnect('slice9_sync'),
  'OK',
  'the Sync worker connection closes'
);
select is(
  extensions.dblink_disconnect('slice9_control'),
  'OK',
  'the serialized-time control connection closes'
);

select * from finish();
rollback;
