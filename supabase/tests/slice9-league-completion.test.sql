begin;

select no_plan();

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leagues'
      and column_name = 'completed_at'
      and data_type = 'timestamp with time zone'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leagues'::regclass
      and conname = 'leagues_completed_at_check'
      and contype = 'c'
      and convalidated
  ),
  'leagues persist a finite completion write time'
);

select ok(
  to_regprocedure('public.complete_league(uuid)') is not null
  and (
    select prosecdef and proconfig @> array['search_path=""']
    from pg_proc
    where oid = 'public.complete_league(uuid)'::regprocedure
  ),
  'completion is a security-definer gateway with an empty search path'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.complete_league(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.complete_league(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.complete_league(uuid)', 'EXECUTE'
  ),
  'only authenticated sessions can execute completion'
);

select ok(
  to_regclass('public.league_match_results') is not null
  and has_table_privilege(
    'authenticated', 'public.league_match_results', 'SELECT'
  )
  and not has_table_privilege(
    'anon', 'public.league_match_results', 'SELECT'
  ),
  'the final match read model is authenticated-only and RLS preserving'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'dc000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'completion-manager@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Completion Manager"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'dc000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'completion-foreign@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Completion Foreign"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'dc000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'completion-proof@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Completion Proof"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'dc000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'completion-approval@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Completion Approval"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'dc000000-0000-4000-8000-000000000005',
    'authenticated', 'authenticated', 'completion-member@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Completion Member"}', now(), now()
  );

insert into public.seasons (
  id, competition_id, name, starts_on, ends_on, is_current
)
select
  ('dc000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '26000000-0000-4000-8000-000000000001',
  'Completion Season ' || n,
  '2026-01-01', '2026-12-31', false
from generate_series(101, 107) as n;

insert into public.leagues (
  id, manager_id, season_id, name, status, activated_at
)
select
  ('dc000000-0000-4000-8000-' || lpad((100 + n)::text, 12, '0'))::uuid,
  'dc000000-0000-4000-8000-000000000001',
  ('dc000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Completion League ' || n,
  'active',
  '2026-01-01T00:00:00Z'
from generate_series(101, 107) as n;

insert into public.league_scoring_rules (league_id, locked_at)
select id, '2026-01-01T00:00:00Z'
from public.leagues
where id between
  'dc000000-0000-4000-8000-000000000201'
  and 'dc000000-0000-4000-8000-000000000207';

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at,
  status, home_score, away_score, result_version, provider_status,
  is_manually_overridden
)
values
  (
    'dc000000-0000-4000-8000-000000000301',
    'dc000000-0000-4000-8000-000000000101', 1,
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000102',
    '2026-02-01T18:00:00Z', 'finished', 2, 1, 2, 'FT', false
  ),
  (
    'dc000000-0000-4000-8000-000000000302',
    'dc000000-0000-4000-8000-000000000101', 2,
    '26000000-0000-4000-8000-000000000103',
    '26000000-0000-4000-8000-000000000104',
    '2026-02-08T18:00:00Z', 'canceled', null, null, 1, 'PST', false
  ),
  (
    'dc000000-0000-4000-8000-000000000303',
    'dc000000-0000-4000-8000-000000000102', 1,
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000103',
    '2026-03-01T18:00:00Z', 'scheduled', null, null, 0, 'NS', false
  ),
  (
    'dc000000-0000-4000-8000-000000000304',
    'dc000000-0000-4000-8000-000000000103', 1,
    '26000000-0000-4000-8000-000000000102',
    '26000000-0000-4000-8000-000000000104',
    '2026-03-08T18:00:00Z', 'finished', 1, 1, 3, 'FT', false
  ),
  (
    'dc000000-0000-4000-8000-000000000305',
    'dc000000-0000-4000-8000-000000000104', 1,
    '26000000-0000-4000-8000-000000000103',
    '26000000-0000-4000-8000-000000000105',
    '2026-03-15T18:00:00Z', 'finished', 3, 0, 1, 'AWD', false
  ),
  (
    'dc000000-0000-4000-8000-000000000306',
    'dc000000-0000-4000-8000-000000000106', 1,
    '26000000-0000-4000-8000-000000000104',
    '26000000-0000-4000-8000-000000000106',
    '2026-03-22T18:00:00Z', 'finished', 4, 2, 4, null, true
  ),
  (
    'dc000000-0000-4000-8000-000000000307',
    'dc000000-0000-4000-8000-000000000107', 1,
    '26000000-0000-4000-8000-000000000105',
    '26000000-0000-4000-8000-000000000106',
    '2026-03-29T18:00:00Z', 'finished', 0, 1, 2, 'FT', false
  );

update public.matches
set requires_review = true,
    review_code = 'EXTRA_TIME_REVIEW',
    review_result_version = 3
where id = 'dc000000-0000-4000-8000-000000000304';

insert into public.match_result_reviews (
  match_id, result_version, provider_status,
  candidate_home_score, candidate_away_score
)
values (
  'dc000000-0000-4000-8000-000000000304', 3, 'AET', 1, 1
);

insert into public.audit_logs (
  actor_id, action, entity_type, entity_id, metadata, created_at
)
values (
  'dc000000-0000-4000-8000-000000000001',
  'match_manually_corrected', 'match',
  'dc000000-0000-4000-8000-000000000306',
  '{"result_version":4}', '2026-03-22T19:00:00Z'
);

insert into public.join_requests (
  id, league_id, user_id, status, rejection_reason, decided_by, decided_at
)
values
  (
    'dc000000-0000-4000-8000-000000000401',
    'dc000000-0000-4000-8000-000000000201',
    'dc000000-0000-4000-8000-000000000003', 'pending_proof',
    null, null, null
  ),
  (
    'dc000000-0000-4000-8000-000000000402',
    'dc000000-0000-4000-8000-000000000201',
    'dc000000-0000-4000-8000-000000000004', 'pending_approval',
    null, null, null
  ),
  (
    'dc000000-0000-4000-8000-000000000403',
    'dc000000-0000-4000-8000-000000000201',
    'dc000000-0000-4000-8000-000000000005', 'approved',
    null, 'dc000000-0000-4000-8000-000000000001',
    '2026-01-02T00:00:00Z'
  ),
  (
    'dc000000-0000-4000-8000-000000000404',
    'dc000000-0000-4000-8000-000000000202',
    'dc000000-0000-4000-8000-000000000003', 'pending_approval',
    null, null, null
  );

insert into public.payment_proofs (
  id, join_request_id, uploaded_by, storage_path, size_bytes, sha256,
  upload_idempotency_key, uploaded_at
)
values (
  'dc000000-0000-4000-8000-000000000501',
  'dc000000-0000-4000-8000-000000000402',
  'dc000000-0000-4000-8000-000000000004',
  'league/dc000000-0000-4000-8000-000000000201/request/dc000000-0000-4000-8000-000000000402/dc000000-0000-4000-8000-000000000501.webp',
  321, repeat('a', 64),
  'dc000000-0000-4000-8000-000000000601',
  '2026-01-03T00:00:00Z'
);

insert into public.league_members (
  league_id, user_id, approved_by, approved_at
)
values (
  'dc000000-0000-4000-8000-000000000201',
  'dc000000-0000-4000-8000-000000000005',
  'dc000000-0000-4000-8000-000000000001',
  '2026-01-02T00:00:00Z'
);

insert into public.predictions (
  league_id, match_id, user_id,
  predicted_home_score, predicted_away_score,
  points, is_exact, is_correct_outcome, scored_at,
  scored_result_version, scored_rule_version
)
values
  (
    'dc000000-0000-4000-8000-000000000201',
    'dc000000-0000-4000-8000-000000000301',
    'dc000000-0000-4000-8000-000000000005',
    2, 1, 3, true, true, '2026-02-01T20:00:00Z', 2, 1
  ),
  (
    'dc000000-0000-4000-8000-000000000207',
    'dc000000-0000-4000-8000-000000000307',
    'dc000000-0000-4000-8000-000000000005',
    1, 0, 0, null, null, null, null, null
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"dc000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.complete_league(
    'dc000000-0000-4000-8000-000000000201'
  )$$,
  'P0001', 'LEAGUE_NOT_FOUND',
  'a foreign actor receives the same opaque completion denial as a missing ID'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"dc000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.complete_league(
    'dc000000-0000-4000-8000-000000000202'
  )$$,
  'P0001', 'LEAGUE_NOT_COMPLETABLE',
  'a scheduled match blocks completion'
);
reset role;

select results_eq(
  $$select status::text,
           (select count(*)::integer from public.league_match_snapshots
             where league_id = league.id),
           (select status::text from public.join_requests
             where id = 'dc000000-0000-4000-8000-000000000404')
    from public.leagues as league
    where id = 'dc000000-0000-4000-8000-000000000202'$$,
  $$values ('active'::text, 0, 'pending_approval'::text)$$,
  'failed terminal validation rolls back snapshots and pending-request closure'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"dc000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.complete_league(
    'dc000000-0000-4000-8000-000000000203'
  )$$,
  'P0001', 'LEAGUE_NOT_COMPLETABLE',
  'an unresolved versioned result review blocks completion'
);
select throws_ok(
  $$select * from public.complete_league(
    'dc000000-0000-4000-8000-000000000204'
  )$$,
  'P0001', 'LEAGUE_NOT_COMPLETABLE',
  'an unknown provider terminal result without an admin/manual decision blocks completion'
);
select throws_ok(
  $$select * from public.complete_league(
    'dc000000-0000-4000-8000-000000000205'
  )$$,
  'P0001', 'LEAGUE_NOT_COMPLETABLE',
  'a league with no included matches cannot complete'
);
select throws_ok(
  $$select * from public.complete_league(
    'dc000000-0000-4000-8000-000000000207'
  )$$,
  'P0001', 'LEAGUE_NOT_COMPLETABLE',
  'stale or absent scoring metadata blocks completion'
);
select results_eq(
  $$select result_status::text, result_snapshot_count, result_closed_request_count,
           result_changed
    from public.complete_league(
      'dc000000-0000-4000-8000-000000000206'
    )$$,
  $$values ('completed'::text, 1, 0, true)$$,
  'a matching versioned manual terminal decision is accepted'
);

create temp table completion_result as
select *
from public.complete_league('dc000000-0000-4000-8000-000000000201');

select results_eq(
  $$select result_league_id, result_status::text,
           result_completed_at is not null,
           result_snapshot_count, result_closed_request_count, result_changed
    from completion_result$$,
  $$values (
    'dc000000-0000-4000-8000-000000000201'::uuid,
    'completed'::text, true, 2, 2, true
  )$$,
  'the exact manager completes the terminal scored league atomically'
);
reset role;

select results_eq(
  $$select snapshot.match_id, snapshot.completed_status::text,
           snapshot.completed_home_score, snapshot.completed_away_score,
           snapshot.completed_result_version,
           snapshot.completed_at = league.completed_at
    from public.league_match_snapshots as snapshot
    join public.leagues as league on league.id = snapshot.league_id
    where snapshot.league_id = 'dc000000-0000-4000-8000-000000000201'
    order by snapshot.match_id$$,
  $$values
    ('dc000000-0000-4000-8000-000000000301'::uuid, 'finished'::text, 2::smallint, 1::smallint, 2, true),
    ('dc000000-0000-4000-8000-000000000302'::uuid, 'canceled'::text, null::smallint, null::smallint, 1, true)$$,
  'completion freezes the full season set and one database write time'
);

select results_eq(
  $$select id, status::text, rejection_reason, decided_by,
           decided_at = (select completed_at from public.leagues
             where id = 'dc000000-0000-4000-8000-000000000201')
    from public.join_requests
    where id in (
      'dc000000-0000-4000-8000-000000000401',
      'dc000000-0000-4000-8000-000000000402'
    )
    order by id$$,
  $$values
    ('dc000000-0000-4000-8000-000000000401'::uuid, 'rejected'::text, 'LEAGUE_COMPLETED'::text, 'dc000000-0000-4000-8000-000000000001'::uuid, true),
    ('dc000000-0000-4000-8000-000000000402'::uuid, 'rejected'::text, 'LEAGUE_COMPLETED'::text, 'dc000000-0000-4000-8000-000000000001'::uuid, true)$$,
  'both open join-request states close with the required stable reason and actor'
);

select results_eq(
  $$select request.status::text, member.status::text,
           proof.storage_path, proof.deleted_at
    from public.join_requests as request
    join public.league_members as member
      on member.league_id = request.league_id
     and member.user_id = request.user_id
    cross join public.payment_proofs as proof
    where request.id = 'dc000000-0000-4000-8000-000000000403'
      and proof.id = 'dc000000-0000-4000-8000-000000000501'$$,
  $$values (
    'approved'::text, 'active'::text,
    'league/dc000000-0000-4000-8000-000000000201/request/dc000000-0000-4000-8000-000000000402/dc000000-0000-4000-8000-000000000501.webp'::text,
    null::timestamptz
  )$$,
  'completion preserves approved membership history and private proof metadata'
);

select results_eq(
  $$select action, count(*)::bigint
    from public.audit_logs
    where entity_id in (
      'dc000000-0000-4000-8000-000000000201',
      'dc000000-0000-4000-8000-000000000401',
      'dc000000-0000-4000-8000-000000000402'
    )
      and action in ('league_completed', 'join_request_closed_league_completed')
    group by action
    order by action$$,
  $$values
    ('join_request_closed_league_completed'::text, 2::bigint),
    ('league_completed'::text, 1::bigint)$$,
  'completion audits the league transition and every automatic request decision'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"dc000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  $$select result_status::text, result_snapshot_count,
           result_closed_request_count, result_changed
    from public.complete_league(
      'dc000000-0000-4000-8000-000000000201'
    )$$,
  $$values ('completed'::text, 2, 0, false)$$,
  'completion replay is an idempotent no-op'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where action = 'league_completed'
      and entity_id = 'dc000000-0000-4000-8000-000000000201'
  ),
  1,
  'completion replay does not duplicate its audit event'
);

update public.matches
set home_score = 0,
    away_score = 0,
    result_version = 3
where id = 'dc000000-0000-4000-8000-000000000301';

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status
)
values (
  'dc000000-0000-4000-8000-000000000399',
  'dc000000-0000-4000-8000-000000000101', 99,
  '26000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000106',
  '2026-12-01T18:00:00Z', 'scheduled'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"dc000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);
select results_eq(
  $$select id, status::text, home_score, away_score
    from public.league_match_results
    where league_id = 'dc000000-0000-4000-8000-000000000201'
    order by id$$,
  $$values
    ('dc000000-0000-4000-8000-000000000301'::uuid, 'finished'::text, 2::smallint, 1::smallint),
    ('dc000000-0000-4000-8000-000000000302'::uuid, 'canceled'::text, null::smallint, null::smallint)$$,
  'completed match lists use only the frozen set and ignore mutable canonical results'
);
select results_eq(
  $$select match_status::text, home_score, away_score
    from public.get_match_detail_context(
      'dc000000-0000-4000-8000-000000000301',
      'dc000000-0000-4000-8000-000000000201'
    )$$,
  $$values ('finished'::text, 2::smallint, 1::smallint)$$,
  'completed match detail uses the frozen snapshot result'
);
select is(
  (
    select count(*)::integer
    from public.get_match_detail_context(
      'dc000000-0000-4000-8000-000000000399',
      'dc000000-0000-4000-8000-000000000201'
    )
  ),
  0,
  'completed match detail excludes a post-completion season fixture'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.payment_proofs
    where id = 'dc000000-0000-4000-8000-000000000501'
  ),
  1,
  'completion never deletes proof history'
);

select * from finish();
rollback;
