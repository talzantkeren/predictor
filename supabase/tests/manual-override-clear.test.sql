begin;

select no_plan();

select ok(
  to_regprocedure('public.clear_manual_match_override(uuid)') is not null,
  'the narrow manual-override handoff RPC exists'
);
select ok(
  (
    select routine.prosecdef
      and array_to_string(routine.proconfig, ',') = 'search_path=""'
    from pg_proc as routine
    where routine.oid = 'public.clear_manual_match_override(uuid)'::regprocedure
  ),
  'the handoff RPC is security definer with an empty search path'
);
select ok(
  has_function_privilege(
    'service_role', 'public.clear_manual_match_override(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.clear_manual_match_override(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.clear_manual_match_override(uuid)', 'EXECUTE'
  )
  and not exists (
    select 1
    from pg_proc as routine
    cross join lateral aclexplode(
      coalesce(routine.proacl, acldefault('f', routine.proowner))
    ) as privilege
    where routine.oid = 'public.clear_manual_match_override(uuid)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'only service_role can execute the handoff RPC'
);
select ok(
  position(
    'update public.predictions'
    in lower(pg_get_functiondef(
      'public.clear_manual_match_override(uuid)'::regprocedure
    ))
  ) = 0
  and position(
    'score_match'
    in lower(pg_get_functiondef(
      'public.clear_manual_match_override(uuid)'::regprocedure
    ))
  ) = 0,
  'the handoff boundary cannot rewrite predictions or invoke scoring'
);

select ok(
  position(
    'pg_advisory_xact_lock(2026090609);'
    in lower(pg_get_functiondef(
      'public.clear_manual_match_override(uuid)'::regprocedure
    ))
  ) > 0
  and position(
    'pg_advisory_xact_lock(2026090609);'
    in lower(pg_get_functiondef(
      'public.clear_manual_match_override(uuid)'::regprocedure
    ))
  ) < position(
    'private.slice9_clear_manual_match_override_without_registry_barrier'
    in lower(pg_get_functiondef(
      'public.clear_manual_match_override(uuid)'::regprocedure
    ))
  )
  and lower(pg_get_functiondef(
    'private.slice9_clear_manual_match_override_without_registry_barrier(uuid)'::regprocedure
  )) !~ 'pg_advisory_xact_lock\([[:space:]]*2026090609[[:space:]]*\)'
  and not has_function_privilege(
    'service_role',
    'private.slice9_clear_manual_match_override_without_registry_barrier(uuid)',
    'EXECUTE'
  ),
  'the public handoff owns the registry barrier while its existing mutation delegate remains private and barrier-free'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'd9811111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'slice9-clear-admin@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Slice 9 Clear Admin"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd9822222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', 'slice9-clear-user@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Slice 9 Clear User"}', now(), now()
  );

insert into public.system_admins (user_id, granted_by)
values (
  'd9811111-1111-4111-8111-111111111111',
  'd9811111-1111-4111-8111-111111111111'
);

insert into public.competitions (
  id, name, slug, country_code, external_provider, external_id
) values (
  'd9800000-0000-4000-8000-000000000020',
  'Slice 9 clear competition', 'slice9-clear', 'IL', 'api-football', '383'
);
insert into public.seasons (
  id, competition_id, name, starts_on, ends_on, is_current,
  external_provider, external_id
) values
  (
    'd9800000-0000-4000-8000-000000000027',
    'd9800000-0000-4000-8000-000000000020',
    '2038/39', '2038-07-01', '2039-06-30', false,
    'api-football', '2026'
  ),
  (
    'd9800000-0000-4000-8000-000000000028',
    'd9800000-0000-4000-8000-000000000020',
    '2039/40', '2039-07-01', '2040-06-30', false,
    null, null
  );
insert into public.teams (
  id, name, short_name, external_provider, external_id
) values
  (
    'd9800000-0000-4000-8000-000000000101',
    'Slice 9 clear home', 'Clear home', 'api-football', '9980081'
  ),
  (
    'd9800000-0000-4000-8000-000000000102',
    'Slice 9 clear away', 'Clear away', 'api-football', '9980082'
  );

insert into public.matches (
  id, season_id, round_number, provider_round_label, provider_status,
  home_team_id, away_team_id, kickoff_at, status, home_score, away_score,
  result_version, is_manually_overridden, predictions_locked_at,
  external_provider, external_id, created_at, updated_at
) values
  (
    'd9800000-0000-4000-8000-000000000001',
    'd9800000-0000-4000-8000-000000000027',
    4, 'Regular Season - 4', 'FT',
    'd9800000-0000-4000-8000-000000000101',
    'd9800000-0000-4000-8000-000000000102',
    '2026-08-15T17:00:00Z', 'finished', 2, 1,
    7, true, '2026-08-15T17:00:00Z',
    'api-football', '9980083',
    '2026-08-01T00:00:00Z', '2026-08-16T00:00:00Z'
  ),
  (
    'd9800000-0000-4000-8000-000000000002',
    'd9800000-0000-4000-8000-000000000027',
    5, null, null,
    'd9800000-0000-4000-8000-000000000101',
    'd9800000-0000-4000-8000-000000000102',
    '2099-08-20T17:00:00Z', 'scheduled', null, null,
    0, true, null, null, null, now(), now()
  ),
  (
    'd9800000-0000-4000-8000-000000000003',
    'd9800000-0000-4000-8000-000000000027',
    5, 'Regular Season - 5', 'NS',
    'd9800000-0000-4000-8000-000000000101',
    'd9800000-0000-4000-8000-000000000102',
    '2099-08-21T17:00:00Z', 'scheduled', null, null,
    0, true, null, 'another-provider', '9980084', now(), now()
  ),
  (
    'd9800000-0000-4000-8000-000000000004',
    'd9800000-0000-4000-8000-000000000027',
    5, 'Regular Season - 5', 'NS',
    'd9800000-0000-4000-8000-000000000101',
    'd9800000-0000-4000-8000-000000000102',
    '2099-08-22T17:00:00Z', 'scheduled', null, null,
    0, true, null, 'api-football', 'not-an-id', now(), now()
  );

insert into public.leagues (
  id, manager_id, season_id, name, status
) values
  (
    'd9800000-0000-4000-8000-000000000010',
    'd9811111-1111-4111-8111-111111111111',
    'd9800000-0000-4000-8000-000000000027',
    'Slice 9 clear open league', 'open'
  ),
  (
    'd9800000-0000-4000-8000-000000000011',
    'd9811111-1111-4111-8111-111111111111',
    'd9800000-0000-4000-8000-000000000027',
    'Slice 9 clear completed league', 'completed'
  ),
  (
    'd9800000-0000-4000-8000-000000000012',
    'd9822222-2222-4222-8222-222222222222',
    'd9800000-0000-4000-8000-000000000028',
    'Slice 9 foreign manager league', 'open'
  );
insert into public.league_scoring_rules (
  league_id, exact_points, correct_outcome_points, incorrect_points, version,
  locked_at
) values (
  'd9800000-0000-4000-8000-000000000010', 3, 1, 0, 4,
  '2026-08-15T17:00:00Z'
);
insert into public.predictions (
  id, league_id, match_id, user_id,
  predicted_home_score, predicted_away_score,
  points, is_exact, is_correct_outcome, scored_at,
  scored_result_version, scored_rule_version, created_at, updated_at
) values (
  'd9800000-0000-4000-8000-000000000201',
  'd9800000-0000-4000-8000-000000000010',
  'd9800000-0000-4000-8000-000000000001',
  'd9822222-2222-4222-8222-222222222222',
  2, 1, 3, true, true, '2026-08-15T19:00:00Z', 7, 4,
  '2026-08-10T00:00:00Z', '2026-08-15T19:00:00Z'
);

set local role service_role;
select set_config('request.headers', '{}', true);
select throws_ok(
  $$select * from public.clear_manual_match_override(
    'd9800000-0000-4000-8000-000000000001'
  )$$,
  'P0001', 'FORBIDDEN',
  'a missing fixed actor cannot clear provider ownership'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"not-a-uuid"}',
  true
);
select throws_ok(
  $$select * from public.clear_manual_match_override(
    'd9800000-0000-4000-8000-000000000001'
  )$$,
  'P0001', 'FORBIDDEN',
  'a malformed fixed actor cannot clear provider ownership'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9822222-2222-4222-8222-222222222222"}',
  true
);
select throws_ok(
  $$select * from public.clear_manual_match_override(
    'd9800000-0000-4000-8000-000000000001'
  )$$,
  'P0001', 'FORBIDDEN',
  'a manager of another league and season cannot clear provider ownership'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select * from public.clear_manual_match_override(
    'd9800000-0000-4000-8000-000000000001'
  )$$,
  '42501', null,
  'an authenticated browser caller cannot execute the handoff RPC'
);
reset role;

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9811111-1111-4111-8111-111111111111"}',
  true
);
select throws_ok(
  $$select * from public.clear_manual_match_override(null)$$,
  'P0001', 'VALIDATION_ERROR',
  'a null match identifier is rejected'
);
select throws_ok(
  $$select * from public.clear_manual_match_override(
    'd9800000-0000-4000-8000-000000000099'
  )$$,
  'P0001', 'MATCH_NOT_FOUND',
  'a missing match is rejected opaquely'
);
select throws_ok(
  $$select * from public.clear_manual_match_override(
    'd9800000-0000-4000-8000-000000000002'
  )$$,
  'P0001', 'MATCH_PROVIDER_OWNERSHIP_REQUIRED',
  'a Manual-only match has no provider ownership to restore'
);
select throws_ok(
  $$select * from public.clear_manual_match_override(
    'd9800000-0000-4000-8000-000000000003'
  )$$,
  'P0001', 'MATCH_PROVIDER_OWNERSHIP_REQUIRED',
  'a non-API-Football provider cannot use this handoff boundary'
);
select throws_ok(
  $$select * from public.clear_manual_match_override(
    'd9800000-0000-4000-8000-000000000004'
  )$$,
  'P0001', 'MATCH_PROVIDER_OWNERSHIP_REQUIRED',
  'a malformed API-Football external identity cannot be handed off'
);
select throws_ok(
  $$select * from public.clear_manual_match_override(
    'd9800000-0000-4000-8000-000000000001'
  )$$,
  'P0001', 'COMPLETED_RECONCILIATION_REQUIRED',
  'a first clear fails closed while the season has a completed league'
);
reset role;

update public.leagues
set status = 'archived'
where id = 'd9800000-0000-4000-8000-000000000011';
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9811111-1111-4111-8111-111111111111"}',
  true
);
select throws_ok(
  $$select * from public.clear_manual_match_override(
    'd9800000-0000-4000-8000-000000000001'
  )$$,
  'P0001', 'COMPLETED_RECONCILIATION_REQUIRED',
  'a first clear also fails closed while the season has an archived league'
);
reset role;

select ok(
  (
    select match.is_manually_overridden
    from public.matches as match
    where match.id = 'd9800000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.audit_logs as audit
    where audit.action = 'match_manual_override_cleared'
      and audit.entity_id = 'd9800000-0000-4000-8000-000000000001'
  ),
  'all failed handoffs preserve ownership and create no audit'
);

delete from public.leagues
where id = 'd9800000-0000-4000-8000-000000000011';

create temp table slice9_clear_match_before as
select
  to_jsonb(match) - 'is_manually_overridden' - 'updated_at' as preserved,
  match.updated_at
from public.matches as match
where match.id = 'd9800000-0000-4000-8000-000000000001';
create temp table slice9_clear_predictions_before as
select jsonb_agg(to_jsonb(prediction) order by prediction.id) as preserved
from public.predictions as prediction
where prediction.match_id = 'd9800000-0000-4000-8000-000000000001';

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9811111-1111-4111-8111-111111111111"}',
  true
);
create temp table slice9_clear_first_result as
select * from public.clear_manual_match_override(
  'd9800000-0000-4000-8000-000000000001'
);
reset role;

select results_eq(
  $$select
      result_match_id,
      result_status::text,
      result_home_score,
      result_away_score,
      result_version,
      result_external_provider,
      result_cleared,
      result_manual_override
    from slice9_clear_first_result$$,
  $$values (
    'd9800000-0000-4000-8000-000000000001'::uuid,
    'finished'::text,
    2::smallint,
    1::smallint,
    7,
    'api-football'::text,
    true,
    false
  )$$,
  'the first clear returns the preserved typed result and cleared ownership'
);
select ok(
  (
    select not match.is_manually_overridden
      and match.updated_at > before.updated_at
      and to_jsonb(match) - 'is_manually_overridden' - 'updated_at'
        = before.preserved
    from public.matches as match
    cross join slice9_clear_match_before as before
    where match.id = 'd9800000-0000-4000-8000-000000000001'
  ),
  'the match changes only its manual flag and updated timestamp'
);
select results_eq(
  $$select jsonb_agg(to_jsonb(prediction) order by prediction.id)
    from public.predictions as prediction
    where prediction.match_id = 'd9800000-0000-4000-8000-000000000001'$$,
  $$select preserved from slice9_clear_predictions_before$$,
  'the current prediction and every scoring field remain byte-for-byte unchanged'
);
select results_eq(
  $$select
      audit.actor_id,
      audit.action,
      audit.entity_type,
      audit.entity_id,
      audit.metadata
    from public.audit_logs as audit
    where audit.action = 'match_manual_override_cleared'
      and audit.entity_id = 'd9800000-0000-4000-8000-000000000001'$$,
  $$values (
    'd9811111-1111-4111-8111-111111111111'::uuid,
    'match_manual_override_cleared'::text,
    'match'::text,
    'd9800000-0000-4000-8000-000000000001'::uuid,
    jsonb_build_object(
      'source', 'system-admin',
      'provider', 'api-football',
      'external_id', '9980083',
      'status', 'finished',
      'home_score', 2,
      'away_score', 1,
      'result_version', 7,
      'predictions_locked_at', '2026-08-15T17:00:00Z'::timestamptz,
      'result_preserved', true,
      'predictions_preserved', true
    )
  )$$,
  'one bounded audit records the actor, provider identity, and preserved result'
);

create temp table slice9_clear_after_first as
select match.updated_at
from public.matches as match
where match.id = 'd9800000-0000-4000-8000-000000000001';

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9811111-1111-4111-8111-111111111111"}',
  true
);
create temp table slice9_clear_replay_result as
select * from public.clear_manual_match_override(
  'd9800000-0000-4000-8000-000000000001'
);
reset role;

select results_eq(
  $$select
      result_cleared,
      result_manual_override,
      result_status::text,
      result_home_score,
      result_away_score,
      result_version,
      result_external_provider
    from slice9_clear_replay_result$$,
  $$values (
    false, false, 'finished'::text, 2::smallint, 1::smallint, 7,
    'api-football'::text
  )$$,
  'replay returns the same provider result as a typed no-op'
);
select ok(
  (
    select match.updated_at = first.updated_at
    from public.matches as match
    cross join slice9_clear_after_first as first
    where match.id = 'd9800000-0000-4000-8000-000000000001'
  )
  and (
    select count(*) = 1
    from public.audit_logs as audit
    where audit.action = 'match_manual_override_cleared'
      and audit.entity_id = 'd9800000-0000-4000-8000-000000000001'
  ),
  'replay moves neither updated_at nor the audit count'
);
select results_eq(
  $$select jsonb_agg(to_jsonb(prediction) order by prediction.id)
    from public.predictions as prediction
    where prediction.match_id = 'd9800000-0000-4000-8000-000000000001'$$,
  $$select preserved from slice9_clear_predictions_before$$,
  'replay also leaves all prediction bytes unchanged'
);

select * from finish();

rollback;
