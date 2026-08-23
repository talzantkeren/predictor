begin;

select no_plan();

select ok(
  to_regclass('public.sync_leases') is not null
  and (select relrowsecurity from pg_class where oid = 'public.sync_leases'::regclass),
  'the durable lease table exists with RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.sync_leases', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.sync_leases', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.sync_leases', 'SELECT,INSERT,UPDATE,DELETE'),
  'no Data API role has direct lease-table privileges'
);
select ok(
  exists (
    select 1 from pg_index
    where indrelid = 'public.seasons'::regclass
      and pg_get_indexdef(indexrelid) like '%external_provider%external_id%'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches'
      and column_name = 'predictions_locked_at'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches'
      and column_name = 'provider_status'
  ),
  'provider season identity, status evidence, and the irreversible prediction latch are present'
);
select ok(
  to_regclass('public.sports_provider_rounds') is not null
  and (select relrowsecurity from pg_class where oid = 'public.sports_provider_rounds'::regclass)
  and not has_table_privilege('anon', 'public.sports_provider_rounds', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.sports_provider_rounds', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.sports_provider_rounds', 'SELECT,INSERT,UPDATE,DELETE'),
  'lossless provider rounds are server-only with RLS and no direct grants'
);

select ok(
  to_regprocedure('public.claim_sports_sync(text,boolean)') is not null
  and to_regprocedure('public.apply_api_football_sync_batch(uuid,bigint,uuid,jsonb)') is not null
  and to_regprocedure('public.finalize_sports_sync(uuid,bigint,uuid,text,text,text,integer,text[],integer,integer)') is not null,
  'claim, bounded apply, and finalize RPCs exist'
);
select ok(
  (select bool_and(prosecdef and array_to_string(proconfig, ',') = 'search_path=""')
   from pg_proc
   where oid in (
     'public.claim_sports_sync(text,boolean)'::regprocedure,
     'public.apply_api_football_sync_batch(uuid,bigint,uuid,jsonb)'::regprocedure,
     'public.finalize_sports_sync(uuid,bigint,uuid,text,text,text,integer,text[],integer,integer)'::regprocedure
   )),
  'all live Sync RPCs are security definer with empty search paths'
);
select ok(
  has_function_privilege('service_role', 'public.claim_sports_sync(text,boolean)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.apply_api_football_sync_batch(uuid,bigint,uuid,jsonb)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.finalize_sports_sync(uuid,bigint,uuid,text,text,text,integer,text[],integer,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.claim_sports_sync(text,boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_sports_sync(text,boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.apply_api_football_sync_batch(uuid,bigint,uuid,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.finalize_sports_sync(uuid,bigint,uuid,text,text,text,integer,text[],integer,integer)', 'EXECUTE'),
  'live Sync RPC execution is service-role only'
);
select ok(
  position('pg_try_advisory_lock' in lower(pg_get_functiondef('public.claim_sports_sync(text,boolean)'::regprocedure))) = 0
  and position('score_match' in lower(pg_get_functiondef('public.apply_api_football_sync_batch(uuid,bigint,uuid,jsonb)'::regprocedure))) > 0
  and position('update public.predictions' in lower(pg_get_functiondef('public.apply_api_football_sync_batch(uuid,bigint,uuid,jsonb)'::regprocedure))) = 0,
  'the lease is row-based and apply delegates scoring without direct prediction writes'
);

create temp table slice7b_demo_counts as
select
  (select count(*)::bigint from public.competitions where external_provider is null) as competitions,
  (select count(*)::bigint from public.seasons where external_provider is null) as seasons,
  (select count(*)::bigint from public.teams where external_provider is null) as teams,
  (select count(*)::bigint from public.matches where external_provider is null) as matches;

set local role service_role;
select set_config('request.headers', '{}', true);
select throws_ok(
  $$select * from public.claim_sports_sync('api-football', false)$$,
  'P0001', 'FORBIDDEN',
  'claim rejects a missing trusted actor before creating a run'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);

create temp table slice7b_claim as
select * from public.claim_sports_sync('api-football', false);
select results_eq(
  $$select result_outcome, result_provider, result_sync_kind,
           result_generation > 0, result_token is not null,
           cardinality(result_fixture_ids)
    from slice7b_claim$$,
  $$values ('CLAIMED'::text, 'api-football'::text, 'catalog'::text, true, true, 0)$$,
  'the initial due plan claims one fenced catalog run'
);
select throws_ok(
  $$select * from public.claim_sports_sync('manual', false)$$,
  'P0001', 'VALIDATION_ERROR',
  'the live claim rejects a provider outside its fixed contract'
);

create temp table slice7b_concurrent as
select * from public.claim_sports_sync('api-football', true);
select results_eq(
  $$select result_outcome, result_code, result_run_id is not null
    from slice7b_concurrent$$,
  $$values ('CONCURRENT_ATTEMPT'::text, 'CONCURRENT_ATTEMPT'::text, true)$$,
  'a concurrent claim is skipped and leaves evidence without replacing the lease'
);
reset role;
select is(
  (select count(*)::integer from public.sync_runs where status = 'running' and provider = 'api-football'),
  1,
  'only one API-Football run is active'
);

create temp table slice7b_payloads (name text primary key, payload jsonb not null);
insert into slice7b_payloads values (
  'catalog',
  jsonb_build_object(
    'competition', jsonb_build_object(
      'externalId', '383', 'name', 'ליגת העל הישראלית',
      'slug', 'israeli-premier-league-api-football', 'countryCode', 'IL'
    ),
    'season', jsonb_build_object(
      'externalId', '2026', 'name', '2026/27',
      'startsOn', '2026-08-22', 'endsOn', '2027-05-31', 'isCurrent', true
    ),
    'teams', jsonb_build_array(
      jsonb_build_object('externalId', '563', 'name', 'הפועל באר שבע', 'shortName', 'הפועל באר שבע'),
      jsonb_build_object('externalId', '604', 'name', 'מכבי תל אביב', 'shortName', 'מכבי תל אביב')
    ),
    'rounds', jsonb_build_array(
      jsonb_build_object(
        'label', 'Regular Season - 1', 'roundNumber', 1, 'requiresReview', false
      ),
      jsonb_build_object(
        'label', 'Championship Round - 1', 'roundNumber', null, 'requiresReview', true
      )
    ),
    'fixtures', jsonb_build_array(
      jsonb_build_object(
        'externalId', '1901001', 'roundNumber', 1, 'roundLabel', 'Regular Season - 1',
        'kickoffAt', (clock_timestamp() + interval '1 day')::text,
        'status', 'scheduled', 'providerStatus', 'NS',
        'homeTeamExternalId', '563', 'awayTeamExternalId', '604',
        'homeScore', null, 'awayScore', null,
        'locksPredictions', false, 'resultDisposition', 'none'
      ),
      jsonb_build_object(
        'externalId', '1901002', 'roundNumber', 1, 'roundLabel', 'Regular Season - 1',
        'kickoffAt', (clock_timestamp() - interval '2 hours')::text,
        'status', 'scheduled', 'providerStatus', 'NS',
        'homeTeamExternalId', '604', 'awayTeamExternalId', '563',
        'homeScore', null, 'awayScore', null,
        'locksPredictions', false, 'resultDisposition', 'none'
      ),
      jsonb_build_object(
        'externalId', '1901003', 'roundNumber', 1, 'roundLabel', 'Regular Season - 1',
        'kickoffAt', (clock_timestamp() - interval '1 hour')::text,
        'status', 'scheduled', 'providerStatus', 'NS',
        'homeTeamExternalId', '563', 'awayTeamExternalId', '604',
        'homeScore', null, 'awayScore', null,
        'locksPredictions', false, 'resultDisposition', 'none'
      )
    )
  )
);
grant select on table slice7b_payloads to service_role;

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select throws_ok(
  $$select public.apply_api_football_sync_batch(
    extensions.gen_random_uuid(),
    (select result_generation from slice7b_claim),
    (select result_token from slice7b_claim),
    jsonb_build_object(
      'competition', null, 'season', null,
      'teams', jsonb_build_array(), 'fixtures', jsonb_build_array()
    )
  )$$,
  'P0001', 'STALE_SYNC_LEASE',
  'an unknown run ID is rejected with the stable fencing error'
);
select throws_ok(
  $$select public.apply_api_football_sync_batch(
    (select result_run_id from slice7b_claim),
    (select result_generation from slice7b_claim),
    extensions.gen_random_uuid(),
    jsonb_build_object(
      'competition', null, 'season', null,
      'teams', jsonb_build_array(), 'fixtures', jsonb_build_array()
    )
  )$$,
  'P0001', 'STALE_SYNC_LEASE',
  'a wrong apply token is rejected before mutation'
);
select throws_ok(
  $$select public.finalize_sports_sync(
    (select result_run_id from slice7b_claim),
    (select result_generation from slice7b_claim),
    extensions.gen_random_uuid(),
    'succeeded', null, null, 0, array[]::text[], null, null
  )$$,
  'P0001', 'STALE_SYNC_LEASE',
  'a wrong finalize token is rejected before terminal mutation'
);
create temp table slice7b_first_apply as
select applied.*
from slice7b_claim as claim
cross join lateral public.apply_api_football_sync_batch(
  claim.result_run_id, claim.result_generation, claim.result_token,
  (select payload from slice7b_payloads where name = 'catalog')
) as applied;
select results_eq(
  $$select result_rows_inserted, result_teams_changed,
           result_matches_changed, result_results_changed
    from slice7b_first_apply$$,
  $$values (9, 2, 3, 0)$$,
  'the first bounded catalog batch inserts provider-owned rows only'
);
reset role;

create temp table slice7b_updated_at_snapshot as
select 'competition'::text as entity_type, id, updated_at
from public.competitions where external_provider = 'api-football'
union all
select 'season', id, updated_at
from public.seasons where external_provider = 'api-football'
union all
select 'team', id, updated_at
from public.teams where external_provider = 'api-football'
union all
select 'round', id, updated_at
from public.sports_provider_rounds where provider = 'api-football'
union all
select 'match', id, updated_at
from public.matches where external_provider = 'api-football';

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
create temp table slice7b_second_apply as
select applied.*
from slice7b_claim as claim
cross join lateral public.apply_api_football_sync_batch(
  claim.result_run_id, claim.result_generation, claim.result_token,
  (select payload from slice7b_payloads where name = 'catalog')
) as applied;
select results_eq(
  $$select result_rows_inserted, result_teams_changed,
           result_matches_changed, result_results_changed
    from slice7b_second_apply$$,
  $$values (0, 0, 0, 0)$$,
  'replaying the same provider catalog is idempotent'
);
reset role;
select ok(
  not exists (
    select 1
    from slice7b_updated_at_snapshot as before
    join (
      select 'competition'::text as entity_type, id, updated_at
      from public.competitions where external_provider = 'api-football'
      union all
      select 'season', id, updated_at
      from public.seasons where external_provider = 'api-football'
      union all
      select 'team', id, updated_at
      from public.teams where external_provider = 'api-football'
      union all
      select 'round', id, updated_at
      from public.sports_provider_rounds where provider = 'api-football'
      union all
      select 'match', id, updated_at
      from public.matches where external_provider = 'api-football'
    ) as after using (entity_type, id)
    where before.updated_at is distinct from after.updated_at
  ),
  'an identical catalog retry preserves visible updated_at metadata'
);

select results_eq(
  $$select provider_label, round_number, requires_review
    from public.sports_provider_rounds order by provider_label$$,
  $$values
    ('Championship Round - 1'::text, null::smallint, true),
    ('Regular Season - 1'::text, 1::smallint, false)$$,
  'regular and future-stage round labels are stored losslessly without collision'
);

insert into slice7b_payloads values (
  'invalid-atomic',
  jsonb_build_object(
    'competition', null, 'season', null, 'teams', jsonb_build_array(),
    'fixtures', jsonb_build_array(
      jsonb_build_object(
        'externalId', '1901998', 'roundNumber', 2, 'roundLabel', 'Regular Season - 2',
        'kickoffAt', (clock_timestamp() + interval '3 days')::text,
        'status', 'scheduled', 'providerStatus', 'NS',
        'homeTeamExternalId', '563', 'awayTeamExternalId', '604',
        'homeScore', null, 'awayScore', null,
        'locksPredictions', false, 'resultDisposition', 'none'
      ),
      jsonb_build_object(
        'externalId', '1901999', 'roundNumber', 2, 'roundLabel', 'Regular Season - 2',
        'kickoffAt', (clock_timestamp() + interval '3 days')::text,
        'status', 'scheduled', 'providerStatus', 'NS',
        'homeTeamExternalId', '999999', 'awayTeamExternalId', '604',
        'homeScore', null, 'awayScore', null,
        'locksPredictions', false, 'resultDisposition', 'none'
      )
    )
  )
);
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select throws_ok(
  $$select applied.* from slice7b_claim as claim
    cross join lateral public.apply_api_football_sync_batch(
      claim.result_run_id, claim.result_generation, claim.result_token,
      (select payload from slice7b_payloads where name = 'invalid-atomic')
    ) as applied$$,
  'P0001', 'SYNC_CATALOG_MISSING',
  'a malformed second fixture rolls back the entire bounded apply batch'
);
reset role;
select is(
  (select count(*)::integer from public.matches where external_id in ('1901998', '1901999')),
  0,
  'failed apply leaves no partial provider match'
);

select results_eq(
  $$select count(*)::bigint from public.teams
    where name = 'הפועל באר שבע'$$,
  $$values (2::bigint)$$,
  'a provider team name collision does not merge with the Demo row'
);
select results_eq(
  $$select
      (select count(*)::bigint from public.competitions where external_provider is null),
      (select count(*)::bigint from public.seasons where external_provider is null),
      (select count(*)::bigint from public.teams where external_provider is null),
      (select count(*)::bigint from public.matches where external_provider is null)$$,
  $$select competitions, seasons, teams, matches from slice7b_demo_counts$$,
  'provider apply leaves every synthetic Demo catalog count unchanged'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '7b000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'slice7b-member@example.com',
  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Slice 7b member"}', now(), now()
);
insert into public.leagues (
  id, manager_id, season_id, name, status
) values (
  '7b000000-0000-4000-8000-000000000010',
  '7b000000-0000-4000-8000-000000000001',
  (select id from public.seasons where external_provider = 'api-football' and external_id = '2026'),
  'Slice 7b test league', 'active'
);
insert into public.league_scoring_rules (league_id)
values ('7b000000-0000-4000-8000-000000000010');
insert into public.league_members (league_id, user_id, approved_by)
values (
  '7b000000-0000-4000-8000-000000000010',
  '7b000000-0000-4000-8000-000000000001',
  '7b000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select * from public.save_prediction(
    '7b000000-0000-4000-8000-000000000010',
    (select id from public.matches where external_provider = 'api-football' and external_id = '1901001'),
    1, 0
  )$$,
  'a future provider fixture accepts a prediction before its lock latch is set'
);
reset role;

insert into slice7b_payloads values (
  'aet-review',
  jsonb_build_object(
    'competition', null, 'season', null, 'teams', jsonb_build_array(),
    'fixtures', jsonb_build_array(jsonb_build_object(
      'externalId', '1901001', 'roundNumber', 1, 'roundLabel', 'Regular Season - 1',
      'kickoffAt', (clock_timestamp() + interval '2 days')::text,
      'status', 'finished', 'providerStatus', 'AET',
      'homeTeamExternalId', '563', 'awayTeamExternalId', '604',
      'homeScore', null, 'awayScore', null,
      'locksPredictions', true, 'resultDisposition', 'review'
    ))
  )
);
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select lives_ok(
  $$select applied.* from slice7b_claim as claim
    cross join lateral public.apply_api_football_sync_batch(
      claim.result_run_id, claim.result_generation, claim.result_token,
      (select payload from slice7b_payloads where name = 'aet-review')
    ) as applied$$,
  'AET is persisted as review evidence without automatic scoring'
);
reset role;
select results_eq(
  $$select status::text, provider_status, home_score, away_score,
           predictions_locked_at is not null, result_version
    from public.matches
    where external_provider = 'api-football' and external_id = '1901001'$$,
  $$values ('scheduled'::text, 'AET'::text, null::smallint, null::smallint, true, 0)$$,
  'AET preserves the non-official match state, latches predictions, and stores its provider code'
);

insert into public.predictions (
  league_id, match_id, user_id, predicted_home_score, predicted_away_score
) values (
  '7b000000-0000-4000-8000-000000000010',
  (select id from public.matches where external_provider = 'api-football' and external_id = '1901002'),
  '7b000000-0000-4000-8000-000000000001', 2, 1
);

insert into slice7b_payloads values (
  'terminal',
  jsonb_build_object(
    'competition', null, 'season', null, 'teams', jsonb_build_array(),
    'fixtures', jsonb_build_array(
      jsonb_build_object(
        'externalId', '1901001', 'roundNumber', 1, 'roundLabel', 'Regular Season - 1',
        'kickoffAt', (clock_timestamp() + interval '2 days')::text,
        'status', 'postponed', 'providerStatus', 'SUSP',
        'homeTeamExternalId', '563', 'awayTeamExternalId', '604',
        'homeScore', null, 'awayScore', null,
        'locksPredictions', true, 'resultDisposition', 'none'
      ),
      jsonb_build_object(
        'externalId', '1901002', 'roundNumber', 1, 'roundLabel', 'Regular Season - 1',
        'kickoffAt', (clock_timestamp() - interval '2 hours')::text,
        'status', 'finished', 'providerStatus', 'FT',
        'homeTeamExternalId', '604', 'awayTeamExternalId', '563',
        'homeScore', 2, 'awayScore', 1,
        'locksPredictions', true, 'resultDisposition', 'official'
      ),
      jsonb_build_object(
        'externalId', '1901003', 'roundNumber', 1, 'roundLabel', 'Regular Season - 1',
        'kickoffAt', (clock_timestamp() - interval '1 hour')::text,
        'status', 'canceled', 'providerStatus', 'CANC',
        'homeTeamExternalId', '563', 'awayTeamExternalId', '604',
        'homeScore', null, 'awayScore', null,
        'locksPredictions', true, 'resultDisposition', 'none'
      )
    )
  )
);

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
create temp table slice7b_terminal_apply as
select applied.*
from slice7b_claim as claim
cross join lateral public.apply_api_football_sync_batch(
  claim.result_run_id, claim.result_generation, claim.result_token,
  (select payload from slice7b_payloads where name = 'terminal')
) as applied;
reset role;

select results_eq(
  $$select status::text, predictions_locked_at is not null
    from public.matches
    where external_provider = 'api-football' and external_id = '1901001'$$,
  $$values ('postponed'::text, true)$$,
  'SUSP moves to postponed while irreversibly latching prediction lock'
);
select results_eq(
  $$select status::text, home_score, away_score, result_version
    from public.matches
    where external_provider = 'api-football' and external_id = '1901002'$$,
  $$values ('finished'::text, 2::smallint, 1::smallint, 1)$$,
  'FT applies the official fulltime result through the existing scoring path'
);
select results_eq(
  $$select status::text, home_score, away_score, predictions_locked_at is not null
    from public.matches
    where external_provider = 'api-football' and external_id = '1901003'$$,
  $$values ('canceled'::text, null::smallint, null::smallint, true)$$,
  'a provider cancellation is terminal, scoreless, and prediction-locked'
);
select results_eq(
  $$select points, scored_result_version from public.predictions
    where match_id = (select id from public.matches where external_id = '1901002')$$,
  $$values (3::smallint, 1)$$,
  'FT deterministically scores the existing prediction'
);
select ok(
  exists (
    select 1 from public.audit_logs
    where entity_id = (select id from public.matches where external_id = '1901002')
      and metadata ->> 'source' = 'api-football'
  ),
  'the existing audit path records api-football as the source'
);

insert into slice7b_payloads values (
  'terminal-regression',
  jsonb_build_object(
    'competition', null, 'season', null, 'teams', jsonb_build_array(),
    'fixtures', jsonb_build_array(jsonb_build_object(
      'externalId', '1901002', 'roundNumber', 1, 'roundLabel', 'Regular Season - 1',
      'kickoffAt', (clock_timestamp() + interval '5 days')::text,
      'status', 'scheduled', 'providerStatus', 'NS',
      'homeTeamExternalId', '604', 'awayTeamExternalId', '563',
      'homeScore', null, 'awayScore', null,
      'locksPredictions', false, 'resultDisposition', 'none'
    ))
  )
);
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select throws_ok(
  $$select applied.* from slice7b_claim as claim
    cross join lateral public.apply_api_football_sync_batch(
      claim.result_run_id, claim.result_generation, claim.result_token,
      (select payload from slice7b_payloads where name = 'terminal-regression')
    ) as applied$$,
  'P0001', 'UNSAFE_STATUS_REGRESSION',
  'a terminal provider match cannot regress to scheduled'
);
reset role;
select results_eq(
  $$select status::text, home_score, away_score, result_version
    from public.matches where external_id = '1901002'$$,
  $$values ('finished'::text, 2::smallint, 1::smallint, 1)$$,
  'terminal regression failure leaves result and version unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.save_prediction(
    '7b000000-0000-4000-8000-000000000010',
    (select id from public.matches where external_id = '1901001'), 2, 0
  )$$,
  'P0001', 'PREDICTION_LOCKED',
  'a suspended match cannot reopen predictions after a future reschedule'
);
reset role;

select throws_ok(
  $$update public.matches set predictions_locked_at = null
    where external_provider = 'api-football' and external_id = '1901001'$$,
  'P0001', 'PREDICTIONS_ALREADY_LOCKED',
  'the database trigger rejects clearing an observed-start latch'
);

insert into slice7b_payloads values (
  'correction',
  jsonb_build_object(
    'competition', null, 'season', null, 'teams', jsonb_build_array(),
    'fixtures', jsonb_build_array(jsonb_build_object(
      'externalId', '1901002', 'roundNumber', 1, 'roundLabel', 'Regular Season - 1',
      'kickoffAt', (clock_timestamp() - interval '2 hours')::text,
      'status', 'finished', 'providerStatus', 'FT',
      'homeTeamExternalId', '604', 'awayTeamExternalId', '563',
      'homeScore', 1, 'awayScore', 1,
      'locksPredictions', true, 'resultDisposition', 'official'
    ))
  )
);
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select lives_ok(
  $$select applied.* from slice7b_claim as claim
    cross join lateral public.apply_api_football_sync_batch(
      claim.result_run_id, claim.result_generation, claim.result_token,
      (select payload from slice7b_payloads where name = 'correction')
    ) as applied$$,
  'an official correction is applied through the same fenced wrapper'
);
reset role;
select results_eq(
  $$select home_score, away_score, result_version from public.matches where external_id = '1901002'$$,
  $$values (1::smallint, 1::smallint, 2)$$,
  'the correction increments the existing result version'
);
select results_eq(
  $$select points, scored_result_version from public.predictions
    where match_id = (select id from public.matches where external_id = '1901002')$$,
  $$values (0::smallint, 2)$$,
  'the correction overwrites scoring deterministically'
);

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
create temp table slice7b_noop as
select applied.* from slice7b_claim as claim
cross join lateral public.apply_api_football_sync_batch(
  claim.result_run_id, claim.result_generation, claim.result_token,
  (select payload from slice7b_payloads where name = 'correction')
) as applied;
reset role;
select results_eq(
  $$select result_results_changed from slice7b_noop$$,
  $$values (0)$$,
  'repeating an identical official result is a no-op'
);

update public.matches set is_manually_overridden = true
where external_provider = 'api-football' and external_id = '1901002';
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
create temp table slice7b_manual_skip as
select applied.* from slice7b_claim as claim
cross join lateral public.apply_api_football_sync_batch(
  claim.result_run_id, claim.result_generation, claim.result_token,
  (select payload from slice7b_payloads where name = 'correction')
) as applied;
select results_eq(
  $$select result_manual_overrides_skipped, result_results_changed from slice7b_manual_skip$$,
  $$values (1, 0)$$,
  'manual override is a measured skip and never overwritten'
);

create temp table slice7b_finalized as
select finalized.* from slice7b_claim as claim
cross join lateral public.finalize_sports_sync(
  claim.result_run_id, claim.result_generation, claim.result_token,
  'succeeded', null, null, 3, array[]::text[], 7400, null
) as finalized;
select results_eq(
  $$select result_status::text, result_code, result_finished_at is not null
    from slice7b_finalized$$,
  $$values ('succeeded'::text, null::text, true)$$,
  'finalize atomically records a terminal successful run'
);
reset role;

update public.sync_leases
set last_catalog_at = clock_timestamp(),
    last_targeted_at = clock_timestamp(),
    last_reconciliation_at = clock_timestamp();
create temp table slice7b_run_count as select count(*)::bigint as count from public.sync_runs;
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
create temp table slice7b_not_due as
select * from public.claim_sports_sync('api-football', false);
select results_eq(
  $$select result_outcome, result_code, result_run_id from slice7b_not_due$$,
  $$values ('NOT_DUE'::text, 'NOT_DUE'::text, null::uuid)$$,
  'NOT_DUE returns without a persisted run'
);
reset role;
select is(
  (select count(*)::bigint from public.sync_runs),
  (select count from slice7b_run_count),
  'NOT_DUE does not bloat sync history'
);

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
create temp table slice7b_rate_claim as
select * from public.claim_sports_sync('api-football', true);
create temp table slice7b_rate_finalized as
select finalized.* from slice7b_rate_claim as claim
cross join lateral public.finalize_sports_sync(
  claim.result_run_id, claim.result_generation, claim.result_token,
  'failed', 'PROVIDER_RATE_LIMITED',
  'The sports provider rate limit was reached.',
  0, array[]::text[], null, 30
) as finalized;
reset role;
select results_eq(
  $$select run.status::text, run.error_code,
           lease.backoff_until > clock_timestamp()
    from slice7b_rate_claim as claim
    join public.sync_runs as run on run.id = claim.result_run_id
    cross join public.sync_leases as lease
    where lease.provider = 'api-football'$$,
  $$values ('failed'::text, 'PROVIDER_RATE_LIMITED'::text, true)$$,
  'a finalized 429 failure stores a bounded provider backoff'
);
create temp table slice7b_backoff_run_count as
select count(*)::bigint as count from public.sync_runs;
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
create temp table slice7b_backoff_claim as
select * from public.claim_sports_sync('api-football', false);
reset role;
select results_eq(
  $$select result_outcome, result_code, result_run_id
    from slice7b_backoff_claim$$,
  $$values ('NOT_DUE'::text, 'PROVIDER_BACKOFF'::text, null::uuid)$$,
  'a scheduled tick respects provider backoff without creating work'
);
select is(
  (select count(*)::bigint from public.sync_runs),
  (select count from slice7b_backoff_run_count),
  'PROVIDER_BACKOFF does not create a sync history row'
);

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select throws_ok(
  $$select public.apply_api_football_sync_batch(
    (select result_run_id from slice7b_claim),
    (select result_generation from slice7b_claim),
    (select result_token from slice7b_claim),
    jsonb_build_object('competition', null, 'season', null, 'teams', jsonb_build_array(), 'fixtures', jsonb_build_array())
  )$$,
  'P0001', 'STALE_SYNC_LEASE',
  'a finalized fencing token can never mutate again'
);
create temp table slice7b_expiring_claim as
select * from public.claim_sports_sync('api-football', true);
reset role;
update public.sync_leases set locked_until = clock_timestamp() - interval '1 second'
where provider = 'api-football';
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select throws_ok(
  $$select public.apply_api_football_sync_batch(
    (select result_run_id from slice7b_expiring_claim),
    (select result_generation from slice7b_expiring_claim),
    (select result_token from slice7b_expiring_claim),
    jsonb_build_object('competition', null, 'season', null, 'teams', jsonb_build_array(), 'fixtures', jsonb_build_array())
  )$$,
  'P0001', 'STALE_SYNC_LEASE',
  'an expired fencing token is rejected before mutation'
);
create temp table slice7b_reclaimed as
select * from public.claim_sports_sync('api-football', true);
reset role;
select results_eq(
  $$select status::text, error_code, finished_at is not null
    from public.sync_runs
    where id = (select result_run_id from slice7b_expiring_claim)$$,
  $$values ('failed'::text, 'LEASE_EXPIRED'::text, true)$$,
  'reclaim marks the abandoned running row as failed'
);
select ok(
  (select result_generation from slice7b_reclaimed)
    > (select result_generation from slice7b_expiring_claim),
  'reclaim advances the monotonic fencing generation'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7b000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.claim_sports_sync('api-football', true)$$,
  '42501', null,
  'authenticated browser callers cannot execute claim'
);
select throws_ok(
  $$select * from public.sync_leases$$,
  '42501', null,
  'authenticated browser callers cannot read the lease table'
);
reset role;

select * from finish();
rollback;
