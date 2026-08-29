begin;

select no_plan();

select ok(
  to_regprocedure(
    'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)'
  ) is not null
  and to_regprocedure(
    'public.reconcile_completed_league(uuid,integer,text)'
  ) is not null,
  'versioned review and completed-league reconciliation RPCs exist'
);

select ok(
  (
    select bool_and(prosecdef and proconfig @> array['search_path=""'])
    from pg_proc
    where oid in (
      'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)'::regprocedure,
      'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
    )
  ),
  'both lifecycle decisions are security definer with empty search paths'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.reconcile_completed_league(uuid,integer,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reconcile_completed_league(uuid,integer,text)',
    'EXECUTE'
  ),
  'only the fixed server gateway can execute review and reconciliation decisions'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'dd000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'review-manager@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Review Manager"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'dd000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'review-member@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Review Member"}', now(), now()
  );

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
create temp table review_sync_claim as
select * from public.claim_sports_sync('api-football', true);
reset role;
grant select on table review_sync_claim to service_role;

create temp table review_payloads (name text primary key, payload jsonb not null);
insert into review_payloads values
  (
    'catalog',
    jsonb_build_object(
      'competition', jsonb_build_object(
        'externalId', '383', 'name', 'ליגת העל הישראלית',
        'slug', 'slice9-review-api-football', 'countryCode', 'IL'
      ),
      'season', jsonb_build_object(
        'externalId', '2026', 'name', '2026/27',
        'startsOn', '2026-08-22', 'endsOn', '2027-05-31', 'isCurrent', true
      ),
      'teams', jsonb_build_array(
        jsonb_build_object(
          'externalId', '563', 'name', 'הפועל באר שבע',
          'shortName', 'הפועל באר שבע'
        ),
        jsonb_build_object(
          'externalId', '604', 'name', 'מכבי תל אביב',
          'shortName', 'מכבי תל אביב'
        )
      ),
      'rounds', jsonb_build_array(
        jsonb_build_object(
          'label', 'Regular Season - 1',
          'roundNumber', 1,
          'requiresReview', false
        )
      ),
      'fixtures', jsonb_build_array(
        jsonb_build_object(
          'externalId', '991001',
          'roundNumber', 1,
          'roundLabel', 'Regular Season - 1',
          'kickoffAt', (clock_timestamp() - interval '2 hours')::text,
          'status', 'scheduled',
          'providerStatus', 'NS',
          'homeTeamExternalId', '563',
          'awayTeamExternalId', '604',
          'homeScore', null,
          'awayScore', null,
          'locksPredictions', false,
          'resultDisposition', 'none'
        )
      )
    )
  ),
  (
    'review',
    jsonb_build_object(
      'competition', null, 'season', null,
      'teams', jsonb_build_array(), 'rounds', jsonb_build_array(),
      'fixtures', jsonb_build_array(
        jsonb_build_object(
          'externalId', '991001',
          'roundNumber', 1,
          'roundLabel', 'Regular Season - 1',
          'kickoffAt', (clock_timestamp() - interval '2 hours')::text,
          'status', 'finished',
          'providerStatus', 'AET',
          'homeTeamExternalId', '563',
          'awayTeamExternalId', '604',
          'homeScore', null,
          'awayScore', null,
          'locksPredictions', true,
          'resultDisposition', 'review'
        )
      )
    )
  ),
  (
    'official-while-pending',
    jsonb_build_object(
      'competition', null, 'season', null,
      'teams', jsonb_build_array(), 'rounds', jsonb_build_array(),
      'fixtures', jsonb_build_array(
        jsonb_build_object(
          'externalId', '991001',
          'roundNumber', 1,
          'roundLabel', 'Regular Season - 1',
          'kickoffAt', (clock_timestamp() - interval '2 hours')::text,
          'status', 'finished',
          'providerStatus', 'FT',
          'homeTeamExternalId', '563',
          'awayTeamExternalId', '604',
          'homeScore', 2,
          'awayScore', 1,
          'locksPredictions', true,
          'resultDisposition', 'official'
        )
      )
    )
  );
grant select on table review_payloads to service_role;

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select lives_ok(
  $$select applied.*
    from review_sync_claim as claim
    cross join lateral public.apply_api_football_sync_batch(
      claim.result_run_id,
      claim.result_generation,
      claim.result_token,
      (select payload from review_payloads where name = 'catalog')
    ) as applied$$,
  'the fenced provider catalog creates the review test fixture'
);
reset role;

create temp table review_resource as
select match.id as match_id
from public.matches as match
where match.external_provider = 'api-football'
  and match.external_id = '991001';
grant select on table review_resource to service_role;

insert into public.leagues (
  id, manager_id, season_id, name, status, activated_at, completed_at
)
select
  league_id,
  'dd000000-0000-4000-8000-000000000001',
  season.id,
  league_name,
  league_status::public.league_status,
  '2026-08-20T00:00:00Z',
  completed_at
from public.seasons as season
cross join (
  values
    (
      'dd000000-0000-4000-8000-000000000201'::uuid,
      'Review Active League'::text,
      'active'::text,
      null::timestamptz
    ),
    (
      'dd000000-0000-4000-8000-000000000202'::uuid,
      'Review Completed League'::text,
      'completed'::text,
      '2026-08-25T00:00:00Z'::timestamptz
    ),
    (
      'dd000000-0000-4000-8000-000000000203'::uuid,
      'Review Empty Completed League'::text,
      'completed'::text,
      '2026-08-25T00:00:00Z'::timestamptz
    )
) as fixture(league_id, league_name, league_status, completed_at)
where season.external_provider = 'api-football'
  and season.external_id = '2026';

insert into public.league_scoring_rules (league_id, locked_at)
values
  ('dd000000-0000-4000-8000-000000000201', '2026-08-20T00:00:00Z'),
  ('dd000000-0000-4000-8000-000000000202', '2026-08-20T00:00:00Z'),
  ('dd000000-0000-4000-8000-000000000203', '2026-08-20T00:00:00Z');

insert into public.league_members (league_id, user_id, approved_by)
values
  (
    'dd000000-0000-4000-8000-000000000201',
    'dd000000-0000-4000-8000-000000000002',
    'dd000000-0000-4000-8000-000000000001'
  ),
  (
    'dd000000-0000-4000-8000-000000000202',
    'dd000000-0000-4000-8000-000000000002',
    'dd000000-0000-4000-8000-000000000001'
  );

insert into public.league_match_snapshots (
  league_id, match_id, completed_status, completed_home_score,
  completed_away_score, completed_result_version, completed_at
)
select
  league.id,
  match.id,
  'finished', 1, 0, 0, league.completed_at
from public.leagues as league
cross join public.matches as match
where league.id in (
    'dd000000-0000-4000-8000-000000000202',
    'dd000000-0000-4000-8000-000000000203'
  )
  and match.external_provider = 'api-football'
  and match.external_id = '991001';

insert into public.predictions (
  league_id, match_id, user_id,
  predicted_home_score, predicted_away_score,
  points, is_exact, is_correct_outcome, scored_at,
  scored_result_version, scored_rule_version
)
select
  league_id,
  match.id,
  'dd000000-0000-4000-8000-000000000002',
  predicted_home,
  predicted_away,
  points,
  is_exact,
  is_correct,
  scored_at,
  scored_result_version,
  scored_rule_version
from public.matches as match
cross join (
  values
    (
      'dd000000-0000-4000-8000-000000000201'::uuid,
      2::smallint, 1::smallint, 0::smallint,
      null::boolean, null::boolean, null::timestamptz,
      null::integer, null::integer
    ),
    (
      'dd000000-0000-4000-8000-000000000202'::uuid,
      1::smallint, 0::smallint, 3::smallint,
      true, true, '2026-08-25T00:00:00Z'::timestamptz,
      0::integer, 1::integer
    )
) as prediction(
  league_id, predicted_home, predicted_away, points,
  is_exact, is_correct, scored_at, scored_result_version,
  scored_rule_version
)
where match.external_provider = 'api-football'
  and match.external_id = '991001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"dd000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.resolve_match_result_review(
    (select match_id from review_resource),
    0, 'finished', 2, 1
  )$$,
  '42501', null,
  'an authenticated manager cannot execute the privileged review RPC'
);
reset role;

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select lives_ok(
  $$select applied.*
    from review_sync_claim as claim
    cross join lateral public.apply_api_football_sync_batch(
      claim.result_run_id,
      claim.result_generation,
      claim.result_token,
      (select payload from review_payloads where name = 'review')
    ) as applied$$,
  'AET creates durable review work without scoring'
);
select lives_ok(
  $$select applied.*
    from review_sync_claim as claim
    cross join lateral public.apply_api_football_sync_batch(
      claim.result_run_id,
      claim.result_generation,
      claim.result_token,
      (select payload from review_payloads where name = 'review')
    ) as applied$$,
  'provider review replay is idempotent'
);
reset role;

select results_eq(
  $$select match.status::text, match.result_version, match.requires_review,
           match.review_code, match.review_result_version,
           review.disposition::text, review.provider_status
    from public.matches as match
    join public.match_result_reviews as review on review.match_id = match.id
    where match.external_id = '991001'$$,
  $$values (
    'scheduled'::text, 0, true, 'AET_REQUIRES_REVIEW'::text, 0,
    'pending'::text, 'AET'::text
  )$$,
  'AET leaves canonical result untouched and owns one current pending review'
);

select is(
  (
    select count(*)::integer
    from public.match_result_reviews as review
    join public.matches as match on match.id = review.match_id
    where match.external_id = '991001'
  ),
  1,
  'provider review replay does not duplicate versioned work'
);

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select lives_ok(
  $$select applied.*
    from review_sync_claim as claim
    cross join lateral public.apply_api_football_sync_batch(
      claim.result_run_id,
      claim.result_generation,
      claim.result_token,
      (select payload from review_payloads where name = 'official-while-pending')
    ) as applied$$,
  'an official provider correction updates only the pending candidate'
);
reset role;

select results_eq(
  $$select match.status::text, match.result_version, match.requires_review,
           review.provider_status, review.candidate_home_score,
           review.candidate_away_score
    from public.matches as match
    join public.match_result_reviews as review on review.match_id = match.id
    where match.external_id = '991001'$$,
  $$values ('scheduled'::text, 0, true, 'FT'::text, 2::smallint, 1::smallint)$$,
  'provider correction cannot outrun the current administrator review'
);

set local role service_role;
select set_config('request.headers', '{}', true);
select throws_ok(
  $$select * from public.resolve_match_result_review(
    (select match_id from review_resource),
    0, 'finished', 2, 1
  )$$,
  'P0001', 'FORBIDDEN',
  'the review RPC rejects a missing fixed system actor'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
create temp table resolved_review as
select * from public.resolve_match_result_review(
  (select match_id from review_resource),
  0, 'finished', 2, 1
);
reset role;

select results_eq(
  $$select result_review_version, result_applied_version,
           result_status::text, result_home_score, result_away_score,
           result_predictions_scored, result_reconciliations_created
    from resolved_review$$,
  $$values (0, 1, 'finished'::text, 2::smallint, 1::smallint, 1, 2)$$,
  'review resolution scores only the active league and queues both frozen leagues'
);

select results_eq(
  $$select match.status::text, match.home_score, match.away_score,
           match.result_version, match.requires_review,
           review.disposition::text, review.applied_result_version,
           review.decided_by is not null
    from public.matches as match
    join public.match_result_reviews as review on review.match_id = match.id
    where match.external_id = '991001'$$,
  $$values (
    'finished'::text, 2::smallint, 1::smallint, 1, false,
    'resolved'::text, 1, true
  )$$,
  'resolution applies the selected legal-time result and clears only its review flags'
);

select results_eq(
  $$select league_id, points, is_exact, is_correct_outcome,
           scored_result_version
    from public.predictions
    order by league_id$$,
  $$values
    ('dd000000-0000-4000-8000-000000000201'::uuid, 3::smallint, true, true, 1),
    ('dd000000-0000-4000-8000-000000000202'::uuid, 3::smallint, true, true, 0)$$,
  'automatic scoring overwrites the active league and preserves completed points'
);

select results_eq(
  $$select league_id, result_version, candidate_status::text,
           candidate_home_score, candidate_away_score, disposition::text
    from public.league_match_reconciliations
    where match_id = (select id from public.matches where external_id = '991001')
    order by league_id$$,
  $$values
    ('dd000000-0000-4000-8000-000000000202'::uuid, 1, 'finished'::text, 2::smallint, 1::smallint, 'pending'::text),
    ('dd000000-0000-4000-8000-000000000203'::uuid, 1, 'finished'::text, 2::smallint, 1::smallint, 'pending'::text)$$,
  'mixed active/completed result handling creates league-scoped reconciliation only for snapshots'
);

create temp table review_reconciliation_ids as
select league_id, id as reconciliation_id
from public.league_match_reconciliations
where match_id = (select match_id from review_resource);
grant select on table review_reconciliation_ids to service_role;

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select throws_ok(
  $$select * from public.resolve_match_result_review(
    (select match_id from review_resource),
    0, 'finished', 2, 1
  )$$,
  'P0001', 'REVIEW_STALE',
  'resolved review replay is rejected as stale'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"dd000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  $$select result_status::text, result_snapshot_count, result_changed
    from public.complete_league(
      'dd000000-0000-4000-8000-000000000201'
    )$$,
  $$values ('completed'::text, 1, true)$$,
  'a resolved review unblocks exact-manager league completion'
);
reset role;

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select throws_ok(
  $$select * from public.reconcile_completed_league(
    (
      select reconciliation_id from review_reconciliation_ids
      where league_id = 'dd000000-0000-4000-8000-000000000202'
    ),
    99,
    'apply'
  )$$,
  'P0001', 'RECONCILIATION_STALE',
  'an incorrect expected version cannot change a frozen result'
);
create temp table applied_reconciliation as
select * from public.reconcile_completed_league(
  (
    select reconciliation_id from review_reconciliation_ids
    where league_id = 'dd000000-0000-4000-8000-000000000202'
  ),
  1,
  'apply'
);
create temp table dismissed_reconciliation as
select * from public.reconcile_completed_league(
  (
    select reconciliation_id from review_reconciliation_ids
    where league_id = 'dd000000-0000-4000-8000-000000000203'
  ),
  1,
  'dismiss'
);
reset role;

select results_eq(
  $$select result_disposition::text, result_predictions_scored
    from applied_reconciliation$$,
  $$values ('applied'::text, 1)$$,
  'apply updates the one completed league and its prediction'
);
select results_eq(
  $$select snapshot.completed_home_score, snapshot.completed_away_score,
           snapshot.completed_result_version,
           prediction.points, prediction.is_exact,
           prediction.is_correct_outcome, prediction.scored_result_version
    from public.league_match_snapshots as snapshot
    join public.predictions as prediction
      on prediction.league_id = snapshot.league_id
     and prediction.match_id = snapshot.match_id
    where snapshot.league_id = 'dd000000-0000-4000-8000-000000000202'$$,
  $$values (2::smallint, 1::smallint, 1, 1::smallint, false, true, 1)$$,
  'applied reconciliation deterministically overwrites final snapshot scoring'
);
select results_eq(
  $$select result_disposition::text, result_predictions_scored
    from dismissed_reconciliation$$,
  $$values ('dismissed'::text, 0)$$,
  'dismiss closes no-prediction reconciliation without changing the snapshot'
);
select results_eq(
  $$select completed_home_score, completed_away_score, completed_result_version
    from public.league_match_snapshots
    where league_id = 'dd000000-0000-4000-8000-000000000203'$$,
  $$values (1::smallint, 0::smallint, 0)$$,
  'dismiss preserves the frozen result'
);

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select throws_ok(
  $$select * from public.reconcile_completed_league(
    (select result_reconciliation_id from applied_reconciliation),
    1,
    'apply'
  )$$,
  'P0001', 'RECONCILIATION_REPLAY',
  'applied reconciliation replay is rejected'
);
reset role;

create temp table completed_manual_input as
select
  match.id as match_id,
  match.season_id,
  match.home_team_id,
  match.away_team_id,
  match.round_number,
  match.kickoff_at
from public.matches as match
where match.external_provider = 'api-football'
  and match.external_id = '991001';
grant select on table completed_manual_input to service_role;

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select results_eq(
  $$select result_status::text, result_home_score, result_away_score,
           result_version, result_created, result_changed,
           result_manual_override
    from completed_manual_input as input
    cross join lateral public.create_or_correct_match(
      'correct', input.match_id, input.season_id,
      input.home_team_id, input.away_team_id,
      input.round_number, input.kickoff_at,
      'finished', 3, 1
    )$$,
  $$values ('finished'::text, 3::smallint, 1::smallint, 2, false, true, true)$$,
  'the existing manual editor permits only a result correction after completion'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.league_match_reconciliations
    where match_id = (select match_id from completed_manual_input)
      and result_version = 2
      and disposition = 'pending'
  ),
  3,
  'a manual correction queues every completed snapshot at the new version'
);
select results_eq(
  $$select league_id, points, scored_result_version
    from public.predictions
    order by league_id$$,
  $$values
    ('dd000000-0000-4000-8000-000000000201'::uuid, 3::smallint, 1),
    ('dd000000-0000-4000-8000-000000000202'::uuid, 1::smallint, 1)$$,
  'manual correction also preserves every completed league score until reconciliation'
);

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id,
  kickoff_at, status
)
select
  'dd000000-0000-4000-8000-000000000399',
  season.id,
  99,
  home.id,
  away.id,
  clock_timestamp() - interval '1 hour',
  'scheduled'
from public.seasons as season
join public.teams as home
  on home.external_provider = 'api-football' and home.external_id = '563'
join public.teams as away
  on away.external_provider = 'api-football' and away.external_id = '604'
where season.external_provider = 'api-football'
  and season.external_id = '2026';

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select lives_ok(
  $$select * from public.score_match(
    'dd000000-0000-4000-8000-000000000399',
    'finished', 0, 0, false, 'api-football'
  )$$,
  'a canonical result can arrive for a fixture added after completion'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.league_match_reconciliations
    where match_id = 'dd000000-0000-4000-8000-000000000399'
  ),
  0,
  'a post-completion fixture without a snapshot creates no reconciliation'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'match_result_review_resolved'
      and entity_id = (
        select id from public.matches where external_id = '991001'
      )
  )
  and exists (
    select 1 from public.audit_logs
    where action = 'league_match_reconciliation_applied'
      and entity_id = (
        select result_reconciliation_id from applied_reconciliation
      )
  )
  and exists (
    select 1 from public.audit_logs
    where action = 'league_match_reconciliation_dismissed'
      and entity_id = (
        select result_reconciliation_id from dismissed_reconciliation
      )
  ),
  'review and both reconciliation decisions have durable actor-scoped audit events'
);

select * from finish();
rollback;
