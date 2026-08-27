-- Real provider/review concurrency and post-completion correction isolation.
begin;

select no_plan();

create extension if not exists dblink with schema extensions;

create function pg_temp.wait_for_review_lock(p_backend_pid integer)
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
    'review_race_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ), 'OK', 'the committed review fixture connection opens'
);
select is(
  extensions.dblink_connect(
    'review_race_locker',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ), 'OK', 'the review lock-holder connection opens'
);
select is(
  extensions.dblink_connect(
    'review_race_provider',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ), 'OK', 'the provider correction connection opens'
);
select is(
  extensions.dblink_connect(
    'review_race_resolver',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ), 'OK', 'the administrator review connection opens'
);

select is(
  extensions.dblink_exec('review_race_control', $remote$
    update public.sync_leases
    set run_id = null, fencing_token = null, locked_until = null,
        backoff_until = null, last_forced_at = null
    where provider = 'api-football';
    delete from public.sync_runs where provider = 'api-football';
    drop table if exists public.slice9_review_race_claim;
    delete from public.audit_logs
    where entity_id between
      'd9900000-0000-4000-8000-000000000201'::uuid and
      'd9900000-0000-4000-8000-000000000499'::uuid;
    delete from public.predictions
    where league_id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_match_reconciliations
    where league_id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_match_snapshots
    where league_id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_members
    where league_id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.prize_rules
    where league_id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_scoring_rules
    where league_id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.leagues
    where id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.match_result_reviews
    where match_id between
      'd9900000-0000-4000-8000-000000000201'::uuid and
      'd9900000-0000-4000-8000-000000000299'::uuid;
    delete from public.matches
    where id between
      'd9900000-0000-4000-8000-000000000201'::uuid and
      'd9900000-0000-4000-8000-000000000299'::uuid;
    delete from public.sports_provider_rounds
    where season_id = 'd9900000-0000-4000-8000-000000000101';
    delete from public.seasons
    where id = 'd9900000-0000-4000-8000-000000000101';
    delete from public.teams
    where id in (
      'd9900000-0000-4000-8000-000000000111',
      'd9900000-0000-4000-8000-000000000112'
    );
    delete from public.competitions
    where id = 'd9900000-0000-4000-8000-000000000100';
    delete from auth.users
    where id in (
      'd9900000-0000-4000-8000-000000000001',
      'd9900000-0000-4000-8000-000000000002'
    );

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values
      ('00000000-0000-0000-0000-000000000000', 'd9900000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'review-race-manager@example.com', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Review Race Manager"}', now(), now()),
      ('00000000-0000-0000-0000-000000000000', 'd9900000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'review-race-member@example.com', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Review Race Member"}', now(), now());

    insert into public.competitions (
      id, name, slug, country_code, external_provider, external_id
    ) values (
      'd9900000-0000-4000-8000-000000000100',
      'Review race competition', 'review-race-competition', 'IL',
      'api-football', '383'
    );
    insert into public.seasons (
      id, competition_id, name, starts_on, ends_on, is_current,
      external_provider, external_id
    ) values (
      'd9900000-0000-4000-8000-000000000101',
      'd9900000-0000-4000-8000-000000000100',
      'Review race season', '2026-01-01', '2026-12-31', false,
      'api-football', '2026'
    );
    insert into public.teams (
      id, name, short_name, external_provider, external_id
    ) values
      ('d9900000-0000-4000-8000-000000000111', 'Review race home', 'Race home', 'api-football', '99801'),
      ('d9900000-0000-4000-8000-000000000112', 'Review race away', 'Race away', 'api-football', '99802');
    insert into public.sports_provider_rounds (
      season_id, provider, provider_label, round_number, requires_review
    ) values (
      'd9900000-0000-4000-8000-000000000101',
      'api-football', 'Regular Season - 1', 1, false
    );
    insert into public.matches (
      id, season_id, round_number, provider_round_label,
      home_team_id, away_team_id, kickoff_at, status, provider_status,
      predictions_locked_at, external_provider, external_id,
      result_version, requires_review, review_code, review_result_version
    ) values (
      'd9900000-0000-4000-8000-000000000201',
      'd9900000-0000-4000-8000-000000000101', 1,
      'Regular Season - 1',
      'd9900000-0000-4000-8000-000000000111',
      'd9900000-0000-4000-8000-000000000112',
      '2026-08-27T08:00:00Z', 'scheduled', 'AET',
      clock_timestamp() - interval '1 hour', 'api-football', '998001',
      0, true, 'AET_REQUIRES_REVIEW', 0
    );
    insert into public.match_result_reviews (
      match_id, result_version, provider_status,
      candidate_home_score, candidate_away_score
    ) values (
      'd9900000-0000-4000-8000-000000000201', 0, 'AET', null, null
    );

    insert into public.leagues (
      id, manager_id, season_id, name, status, activated_at, completed_at
    ) values
      ('d9900000-0000-4000-8000-000000000301', 'd9900000-0000-4000-8000-000000000001', 'd9900000-0000-4000-8000-000000000101', 'Review active', 'active', now() - interval '1 day', null),
      ('d9900000-0000-4000-8000-000000000302', 'd9900000-0000-4000-8000-000000000001', 'd9900000-0000-4000-8000-000000000101', 'Review completed', 'completed', now() - interval '2 days', now() - interval '1 day'),
      ('d9900000-0000-4000-8000-000000000303', 'd9900000-0000-4000-8000-000000000001', 'd9900000-0000-4000-8000-000000000101', 'Review no predictions', 'completed', now() - interval '2 days', now() - interval '1 day'),
      ('d9900000-0000-4000-8000-000000000304', 'd9900000-0000-4000-8000-000000000001', 'd9900000-0000-4000-8000-000000000101', 'Review no snapshot', 'completed', now() - interval '2 days', now() - interval '1 day');
    insert into public.league_scoring_rules (league_id, locked_at)
    select league.id, now() - interval '2 days'
    from public.leagues as league
    where league.id between
      'd9900000-0000-4000-8000-000000000301' and
      'd9900000-0000-4000-8000-000000000304';
    insert into public.league_members (
      league_id, user_id, status, approved_by, approved_at
    ) values
      ('d9900000-0000-4000-8000-000000000301', 'd9900000-0000-4000-8000-000000000002', 'active', 'd9900000-0000-4000-8000-000000000001', now() - interval '1 day'),
      ('d9900000-0000-4000-8000-000000000302', 'd9900000-0000-4000-8000-000000000002', 'active', 'd9900000-0000-4000-8000-000000000001', now() - interval '1 day');
    insert into public.league_match_snapshots (
      league_id, match_id, completed_status, completed_home_score,
      completed_away_score, completed_result_version, completed_at
    ) values
      ('d9900000-0000-4000-8000-000000000302', 'd9900000-0000-4000-8000-000000000201', 'finished', 1, 0, 0, now() - interval '1 day'),
      ('d9900000-0000-4000-8000-000000000303', 'd9900000-0000-4000-8000-000000000201', 'finished', 1, 0, 0, now() - interval '1 day');
    insert into public.predictions (
      league_id, match_id, user_id, predicted_home_score,
      predicted_away_score, points, is_exact, is_correct_outcome,
      scored_at, scored_result_version, scored_rule_version
    ) values
      ('d9900000-0000-4000-8000-000000000301', 'd9900000-0000-4000-8000-000000000201', 'd9900000-0000-4000-8000-000000000002', 2, 1, 0, false, false, now() - interval '1 day', 0, 1),
      ('d9900000-0000-4000-8000-000000000302', 'd9900000-0000-4000-8000-000000000201', 'd9900000-0000-4000-8000-000000000002', 0, 0, 0, false, false, now() - interval '1 day', 0, 1);

    set request.headers =
      '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}';
    create table public.slice9_review_race_claim as
    select * from public.claim_sports_sync('api-football', true);
    grant select on public.slice9_review_race_claim to service_role;
  $remote$),
  'GRANT',
  'the isolated review/provider fixtures and fenced claim are committed'
);

select is(
  extensions.dblink_exec('review_race_provider', $remote$
    set statement_timeout = '10s';
    set lock_timeout = '5s';
    set role service_role;
    set request.headers =
      '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}';
    create function pg_temp.apply_fixture(
      p_external_id text,
      p_home_score integer,
      p_away_score integer,
      p_status text default 'finished',
      p_provider_status text default 'FT',
      p_disposition text default 'official'
    ) returns text
    language plpgsql
    as $function$
    declare
      v_claim record;
      v_result record;
      v_payload jsonb;
    begin
      select * into strict v_claim from public.slice9_review_race_claim;
      v_payload := jsonb_build_object(
        'competition', null,
        'season', null,
        'teams', jsonb_build_array(),
        'rounds', jsonb_build_array(),
        'fixtures', jsonb_build_array(jsonb_build_object(
          'externalId', p_external_id,
          'roundNumber', 1,
          'roundLabel', 'Regular Season - 1',
          'kickoffAt', '2026-08-27T08:00:00Z',
          'status', p_status,
          'providerStatus', p_provider_status,
          'homeTeamExternalId', '99801',
          'awayTeamExternalId', '99802',
          'homeScore', p_home_score,
          'awayScore', p_away_score,
          'locksPredictions', p_provider_status <> 'NS',
          'resultDisposition', p_disposition
        ))
      );
      select * into v_result
      from public.apply_api_football_sync_batch(
        v_claim.result_run_id, v_claim.result_generation,
        v_claim.result_token, v_payload
      );
      return 'PROVIDER:' || v_result.result_matches_changed || ':' ||
        v_result.result_results_changed;
    exception when others then
      return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end
    $function$;
  $remote$),
  'CREATE FUNCTION',
  'the provider caller has one fenced synthetic correction probe'
);

select is(
  extensions.dblink_exec('review_race_resolver', $remote$
    set statement_timeout = '10s';
    set lock_timeout = '5s';
    set role service_role;
    set request.headers =
      '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}';
    create function pg_temp.resolve_review() returns text
    language plpgsql
    as $function$
    declare v_result record;
    begin
      select * into v_result
      from public.resolve_match_result_review(
        'd9900000-0000-4000-8000-000000000201',
        0, 'finished', 2, 1
      );
      return 'RESOLVED:' || v_result.result_applied_version || ':' ||
        v_result.result_predictions_scored || ':' ||
        v_result.result_reconciliations_created;
    exception when others then
      return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end
    $function$;
  $remote$),
  'CREATE FUNCTION',
  'the resolver caller has one fixed-actor review probe'
);

create temp table review_race_pids as
select 'provider'::text as caller, pid
from extensions.dblink(
  'review_race_provider', 'select pg_backend_pid()'
) as result(pid integer)
union all
select 'resolver', pid
from extensions.dblink(
  'review_race_resolver', 'select pg_backend_pid()'
) as result(pid integer);

select is(
  extensions.dblink_exec('review_race_locker', $remote$
    begin;
    do $block$ begin perform pg_advisory_xact_lock(2026090609); end $block$;
  $remote$),
  'DO',
  'the provider/review lifecycle serialization point is held'
);
select is(
  extensions.dblink_send_query(
    'review_race_provider',
    $$select pg_temp.apply_fixture('998001', 3, 2)$$
  ),
  1,
  'the official provider correction starts while review is pending'
);
select ok(
  pg_temp.wait_for_review_lock(
    (select pid from review_race_pids where caller = 'provider')
  ),
  'the provider correction waits at lifecycle serialization'
);
select is(
  extensions.dblink_send_query(
    'review_race_resolver', 'select pg_temp.resolve_review()'
  ),
  1,
  'the administrator resolution starts concurrently'
);
select ok(
  pg_temp.wait_for_review_lock(
    (select pid from review_race_pids where caller = 'resolver')
  ),
  'the review resolution waits at the same lifecycle point'
);
select is(
  extensions.dblink_exec('review_race_locker', 'commit'),
  'COMMIT',
  'the provider/review racers are released in their wait order'
);
create temp table provider_review_results(value text);
insert into provider_review_results
select value from extensions.dblink_get_result(
  'review_race_provider'
) as result(value text);
insert into provider_review_results
select value from extensions.dblink_get_result(
  'review_race_resolver'
) as result(value text);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('review_race_provider') as drained(value text)),
  0,
  'the provider correction result is fully drained'
);
select is(
  (select count(*)::integer
   from extensions.dblink_get_result('review_race_resolver') as drained(value text)),
  0,
  'the review resolution result is fully drained'
);
select ok(
  not exists (select 1 from provider_review_results where value like 'ERROR:%'),
  'provider correction and review resolution finish without deadlock or stale overwrite'
);
select results_eq(
  $$select match.status::text, match.home_score, match.away_score,
           match.result_version, match.requires_review,
           review.disposition::text, review.provider_status,
           review.selected_home_score, review.selected_away_score,
           review.applied_result_version
    from public.matches as match
    join public.match_result_reviews as review on review.match_id = match.id
    where match.id = 'd9900000-0000-4000-8000-000000000201'$$,
  $$values (
    'finished'::text, 2::smallint, 1::smallint, 1, false,
    'resolved'::text, 'FT'::text, 2::smallint, 1::smallint, 1
  )$$,
  'the queued provider candidate is resolved once by the explicit administrator decision'
);
select results_eq(
  $$select league_id, points, is_exact, is_correct_outcome,
           scored_result_version
    from public.predictions order by league_id$$,
  $$values
    ('d9900000-0000-4000-8000-000000000301'::uuid, 3::smallint, true, true, 1),
    ('d9900000-0000-4000-8000-000000000302'::uuid, 0::smallint, false, false, 0)$$,
  'review resolution scores the active exact prediction and preserves a completed non-exact score'
);
select results_eq(
  $$select league_id, result_version, disposition::text
    from public.league_match_reconciliations
    where match_id = 'd9900000-0000-4000-8000-000000000201'
    order by league_id$$,
  $$values
    ('d9900000-0000-4000-8000-000000000302'::uuid, 1, 'pending'::text),
    ('d9900000-0000-4000-8000-000000000303'::uuid, 1, 'pending'::text)$$,
  'the mixed active/completed race queues snapshot leagues including no predictions only'
);

select results_eq(
  $query$select value from extensions.dblink(
      'review_race_provider',
      $$select pg_temp.apply_fixture('998001', 3, 2)$$
    ) as result(value text)$query$,
  $$values ('PROVIDER:0:0'::text)$$,
  'a later provider correction cannot overwrite the explicit review decision'
);
select results_eq(
  $query$select value from extensions.dblink(
      'review_race_provider',
      $$select pg_temp.apply_fixture('998001', 3, 2)$$
    ) as result(value text)$query$,
  $$values ('PROVIDER:0:0'::text)$$,
  'the identical provider correction replay is a no-op'
);
select results_eq(
  $$select match.result_version, match.home_score, match.away_score,
           active_prediction.points, active_prediction.is_exact,
           active_prediction.is_correct_outcome,
           active_prediction.scored_result_version,
           completed_prediction.points,
           completed_prediction.scored_result_version
    from public.matches as match
    join public.predictions as active_prediction
      on active_prediction.match_id = match.id
     and active_prediction.league_id = 'd9900000-0000-4000-8000-000000000301'
    join public.predictions as completed_prediction
      on completed_prediction.match_id = match.id
     and completed_prediction.league_id = 'd9900000-0000-4000-8000-000000000302'
    where match.id = 'd9900000-0000-4000-8000-000000000201'$$,
  $$values (
    1, 2::smallint, 1::smallint,
    3::smallint, true, true, 1,
    0::smallint, 0
  )$$,
  'post-resolution provider retry preserves both active decision scoring and completed points'
);
select results_eq(
  $$select league_id, completed_home_score, completed_away_score,
           completed_result_version
    from public.league_match_snapshots
    where match_id = 'd9900000-0000-4000-8000-000000000201'
    order by league_id$$,
  $$values
    ('d9900000-0000-4000-8000-000000000302'::uuid, 1::smallint, 0::smallint, 0),
    ('d9900000-0000-4000-8000-000000000303'::uuid, 1::smallint, 0::smallint, 0)$$,
  'both completed snapshots stay frozen across correction and replay'
);
select is(
  (select count(*)::integer from public.league_match_reconciliations
   where match_id = 'd9900000-0000-4000-8000-000000000201'),
  2,
  'provider replay creates no second version or duplicate completed work item'
);
select is(
  (select count(*)::integer from public.league_match_reconciliations
   where league_id = 'd9900000-0000-4000-8000-000000000304'),
  0,
  'a completed league without the frozen fixture never receives reconciliation'
);

select results_eq(
  $query$select value from extensions.dblink(
      'review_race_provider',
      $$select pg_temp.apply_fixture(
        '998002', null, null, 'scheduled', 'NS', 'none'
      )$$
    ) as result(value text)$query$,
  $$values ('PROVIDER:1:0'::text)$$,
  'provider sync may add a later fixture without mutating completed included sets'
);
select is(
  (select count(*)::integer from public.matches
   where external_provider = 'api-football'
     and external_id = '998002'),
  1,
  'the post-completion provider fixture exists in the canonical season catalog'
);
select is(
  (select count(*)::integer from public.league_match_snapshots as snapshot
   join public.matches as match on match.id = snapshot.match_id
   where match.external_provider = 'api-football'
     and match.external_id = '998002'),
  0,
  'the later fixture is absent from every frozen completed snapshot set'
);
select is(
  (select count(*)::integer from public.league_match_reconciliations as reconciliation
   join public.matches as match on match.id = reconciliation.match_id
   where match.external_provider = 'api-football'
     and match.external_id = '998002'),
  0,
  'the later fixture cannot create reconciliation without a composite snapshot parent'
);
select is(
  (select count(*)::integer from public.league_match_results
   where league_id in (
     'd9900000-0000-4000-8000-000000000302',
     'd9900000-0000-4000-8000-000000000303',
     'd9900000-0000-4000-8000-000000000304'
   )
     and id = (
       select id from public.matches
       where external_provider = 'api-football'
         and external_id = '998002'
     )),
  0,
  'completed match reads exclude the post-freeze fixture'
);

select is(extensions.dblink_disconnect('review_race_provider'), 'OK',
  'the provider correction connection disconnects');
select is(extensions.dblink_disconnect('review_race_resolver'), 'OK',
  'the review resolver connection disconnects');
select is(extensions.dblink_disconnect('review_race_locker'), 'OK',
  'the review lock holder disconnects');

select is(
  extensions.dblink_exec('review_race_control', $remote$
    delete from public.audit_logs
    where entity_id between
      'd9900000-0000-4000-8000-000000000201'::uuid and
      'd9900000-0000-4000-8000-000000000499'::uuid;
    delete from public.predictions
    where league_id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_match_reconciliations
    where league_id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_match_snapshots
    where league_id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_members
    where league_id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.prize_rules
    where league_id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_scoring_rules
    where league_id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.leagues
    where id between
      'd9900000-0000-4000-8000-000000000301'::uuid and
      'd9900000-0000-4000-8000-000000000399'::uuid;
    delete from public.match_result_reviews
    where match_id between
      'd9900000-0000-4000-8000-000000000201'::uuid and
      'd9900000-0000-4000-8000-000000000299'::uuid;
    delete from public.matches
    where season_id = 'd9900000-0000-4000-8000-000000000101';
    delete from public.sports_provider_rounds
    where season_id = 'd9900000-0000-4000-8000-000000000101';
    delete from public.seasons
    where id = 'd9900000-0000-4000-8000-000000000101';
    delete from public.teams
    where id in (
      'd9900000-0000-4000-8000-000000000111',
      'd9900000-0000-4000-8000-000000000112'
    );
    delete from public.competitions
    where id = 'd9900000-0000-4000-8000-000000000100';
    delete from auth.users
    where id in (
      'd9900000-0000-4000-8000-000000000001',
      'd9900000-0000-4000-8000-000000000002'
    );
    update public.sync_leases
    set run_id = null, fencing_token = null, locked_until = null,
        backoff_until = null, last_forced_at = null
    where provider = 'api-football';
    delete from public.sync_runs
    where id = (select result_run_id from public.slice9_review_race_claim);
    drop table public.slice9_review_race_claim;
  $remote$),
  'DROP TABLE',
  'the committed review/provider fixtures and lease are removed'
);
select is(extensions.dblink_disconnect('review_race_control'), 'OK',
  'the review fixture connection disconnects');

select * from finish();
rollback;
