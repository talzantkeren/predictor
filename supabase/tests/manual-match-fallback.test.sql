begin;

select no_plan();

select ok(
  to_regprocedure('public.record_sync_attempt()') is null,
  'the obsolete skipped Manual RPC is removed'
);
select ok(
  to_regprocedure('public.apply_manual_fixture_catalog(jsonb)') is not null
  and to_regprocedure(
    'public.create_or_correct_match(text,uuid,uuid,uuid,uuid,numeric,timestamptz,public.match_status,numeric,numeric)'
  ) is not null,
  'the bounded catalog and narrow match mutation RPCs exist'
);
select ok(
  (
    select bool_and(prosecdef and array_to_string(proconfig, ',') = 'search_path=""')
    from pg_proc
    where oid in (
      'public.apply_manual_fixture_catalog(jsonb)'::regprocedure,
      'public.create_or_correct_match(text,uuid,uuid,uuid,uuid,numeric,timestamptz,public.match_status,numeric,numeric)'::regprocedure
    )
  ),
  'both Manual RPCs are security definer with an empty search path'
);
select ok(
  has_function_privilege(
    'service_role', 'public.apply_manual_fixture_catalog(jsonb)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.create_or_correct_match(text,uuid,uuid,uuid,uuid,numeric,timestamptz,public.match_status,numeric,numeric)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.apply_manual_fixture_catalog(jsonb)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.apply_manual_fixture_catalog(jsonb)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.create_or_correct_match(text,uuid,uuid,uuid,uuid,numeric,timestamptz,public.match_status,numeric,numeric)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.create_or_correct_match(text,uuid,uuid,uuid,uuid,numeric,timestamptz,public.match_status,numeric,numeric)',
    'EXECUTE'
  ),
  'only service_role can execute either Manual mutation RPC'
);
select ok(
  not has_function_privilege(
    'service_role', 'private.slice9_system_actor_from_request()', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'private.slice9_system_actor_from_request()', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'private.slice9_system_actor_from_request()', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'private.slice9_manual_fixture_insert_is_safe(public.match_status,timestamptz,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.slice9_manual_fixture_insert_is_safe(public.match_status,timestamptz,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'private.slice9_manual_fixture_insert_is_safe(public.match_status,timestamptz,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'private.slice9_apply_manual_fixture_catalog_core(jsonb,uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.slice9_apply_manual_fixture_catalog_core(jsonb,uuid,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'private.slice9_apply_manual_fixture_catalog_core(jsonb,uuid,timestamptz)',
    'EXECUTE'
  )
  and not exists (
    select 1
    from pg_proc as routine
    cross join lateral aclexplode(
      coalesce(routine.proacl, acldefault('f', routine.proowner))
    ) as privilege
    where routine.oid in (
      'private.slice9_manual_fixture_insert_is_safe(public.match_status,timestamptz,timestamptz)'::regprocedure,
      'private.slice9_apply_manual_fixture_catalog_core(jsonb,uuid,timestamptz)'::regprocedure
    )
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'private Manual helpers have no PUBLIC or Data API execution grant'
);
select results_eq(
  $$select private.slice9_manual_fixture_insert_is_safe(status, kickoff_at, at)
    from (
      values
        ('scheduled'::public.match_status, '2026-10-17T16:00:00Z'::timestamptz, '2026-10-17T15:59:59Z'::timestamptz),
        ('scheduled'::public.match_status, '2026-10-17T16:00:00Z'::timestamptz, '2026-10-17T16:00:00Z'::timestamptz),
        ('postponed'::public.match_status, '2026-10-24T16:00:00Z'::timestamptz, '2026-11-01T00:00:00Z'::timestamptz),
        ('canceled'::public.match_status, '2026-10-24T18:30:00Z'::timestamptz, '2026-10-24T18:29:59Z'::timestamptz),
        ('canceled'::public.match_status, '2026-10-24T18:30:00Z'::timestamptz, '2026-10-24T18:30:00Z'::timestamptz),
        ('finished'::public.match_status, '2026-10-17T16:00:00Z'::timestamptz, '2026-10-17T15:00:00Z'::timestamptz)
    ) as fixture(status, kickoff_at, at)$$,
  $$values (true), (false), (false), (true), (false), (false)$$,
  'explicit-time predicate deterministically rejects past or terminal fixture recreation'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'd9300000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'slice9-manual-admin@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Slice 9 Manual Admin"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd9300000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'slice9-manual-user@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Slice 9 Manual User"}', now(), now()
  );
insert into public.system_admins (user_id, granted_by)
values (
  'd9300000-0000-4000-8000-000000000001',
  'd9300000-0000-4000-8000-000000000001'
);

create temp table slice9_manual_payload as
select $payload$
{
  "catalogId": "manual-catalog-v1",
  "competitionId": "26000000-0000-4000-8000-000000000001",
  "seasonId": "26000000-0000-4000-8000-000000000027",
  "teams": [
    {"id":"26000000-0000-4000-8000-000000000101","name":"הפועל תל אביב","shortName":"הפועל תל אביב"},
    {"id":"26000000-0000-4000-8000-000000000102","name":"מכבי תל אביב","shortName":"מכבי תל אביב"},
    {"id":"26000000-0000-4000-8000-000000000103","name":"בית״ר ירושלים","shortName":"בית״ר"},
    {"id":"26000000-0000-4000-8000-000000000104","name":"הפועל חיפה","shortName":"הפועל חיפה"},
    {"id":"26000000-0000-4000-8000-000000000105","name":"מ.ס. אשדוד","shortName":"אשדוד"},
    {"id":"26000000-0000-4000-8000-000000000106","name":"הפועל באר שבע","shortName":"באר שבע"}
  ],
  "matches": [
    {"id":"26000000-0000-4000-8000-000000000201","seasonId":"26000000-0000-4000-8000-000000000027","roundNumber":1,"homeTeamId":"26000000-0000-4000-8000-000000000101","awayTeamId":"26000000-0000-4000-8000-000000000102","kickoffAt":"2026-10-17T16:00:00.000Z","status":"scheduled","homeScore":null,"awayScore":null},
    {"id":"26000000-0000-4000-8000-000000000202","seasonId":"26000000-0000-4000-8000-000000000027","roundNumber":1,"homeTeamId":"26000000-0000-4000-8000-000000000103","awayTeamId":"26000000-0000-4000-8000-000000000104","kickoffAt":"2026-10-17T18:30:00.000Z","status":"scheduled","homeScore":null,"awayScore":null},
    {"id":"26000000-0000-4000-8000-000000000203","seasonId":"26000000-0000-4000-8000-000000000027","roundNumber":1,"homeTeamId":"26000000-0000-4000-8000-000000000105","awayTeamId":"26000000-0000-4000-8000-000000000106","kickoffAt":"2026-10-18T17:00:00.000Z","status":"scheduled","homeScore":null,"awayScore":null},
    {"id":"26000000-0000-4000-8000-000000000204","seasonId":"26000000-0000-4000-8000-000000000027","roundNumber":2,"homeTeamId":"26000000-0000-4000-8000-000000000101","awayTeamId":"26000000-0000-4000-8000-000000000103","kickoffAt":"2026-10-24T16:00:00.000Z","status":"postponed","homeScore":null,"awayScore":null},
    {"id":"26000000-0000-4000-8000-000000000205","seasonId":"26000000-0000-4000-8000-000000000027","roundNumber":2,"homeTeamId":"26000000-0000-4000-8000-000000000102","awayTeamId":"26000000-0000-4000-8000-000000000105","kickoffAt":"2026-10-24T18:30:00.000Z","status":"canceled","homeScore":null,"awayScore":null}
  ]
}
$payload$::jsonb as payload;
grant select on table slice9_manual_payload to service_role;

create temp table slice9_unauthorized_counts as
select
  (select count(*)::bigint from public.sync_runs) as runs,
  (select count(*)::bigint from public.audit_logs) as audits,
  (select count(*)::bigint from public.matches) as matches;

select throws_ok(
  $$select * from private.slice9_apply_manual_fixture_catalog_core(
    (select payload from slice9_manual_payload),
    'd9300000-0000-4000-8000-000000000002'::uuid,
    '2026-08-01T00:00:00Z'::timestamptz
  )$$,
  'P0001', 'FORBIDDEN',
  'the owner-only full core independently revalidates its actor'
);

set local role service_role;
select set_config('request.headers', '{}', true);
select throws_ok(
  $$select * from public.apply_manual_fixture_catalog(
    (select payload from slice9_manual_payload)
  )$$,
  'P0001', 'FORBIDDEN',
  'a missing fixed actor is rejected before catalog mutation'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"not-a-uuid"}',
  true
);
select throws_ok(
  $$select * from public.apply_manual_fixture_catalog(
    (select payload from slice9_manual_payload)
  )$$,
  'P0001', 'FORBIDDEN',
  'a malformed fixed actor is rejected before catalog mutation'
);
reset role;

delete from public.system_admins
where user_id = 'd9300000-0000-4000-8000-000000000001';
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select * from public.apply_manual_fixture_catalog(
    (select payload from slice9_manual_payload)
  )$$,
  'P0001', 'FORBIDDEN',
  'an actor removed after its grant is rejected before catalog mutation'
);
reset role;

insert into public.system_admins (user_id, granted_by)
values (
  'd9300000-0000-4000-8000-000000000001',
  'd9300000-0000-4000-8000-000000000001'
);
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'create', 'd9300000-0000-4000-8000-000000000301',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000102',
    3, clock_timestamp() + interval '30 days', 'scheduled', null, null
  )$$,
  'P0001', 'FORBIDDEN',
  'an ordinary fixed actor cannot create a match'
);
reset role;
select results_eq(
  $$select
      (select count(*) from public.sync_runs),
      (select count(*) from public.audit_logs),
      (select count(*) from public.matches)$$,
  $$select runs, audits, matches from slice9_unauthorized_counts$$,
  'rejected actors create no run, audit, or match row'
);

set local role authenticated;
select throws_ok(
  $$select * from public.apply_manual_fixture_catalog('{}'::jsonb)$$,
  '42501', null,
  'authenticated callers cannot execute the Manual catalog RPC directly'
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'create', gen_random_uuid(),
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000102',
    3, clock_timestamp() + interval '30 days', 'scheduled', null, null
  )$$,
  '42501', null,
  'authenticated callers cannot execute match creation directly'
);
reset role;

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
create temp table slice9_initial_replay as
select * from public.apply_manual_fixture_catalog(
  (select payload from slice9_manual_payload)
);
reset role;
select results_eq(
  $$select result_status::text, result_code, result_rows_inserted,
           result_teams_changed, result_matches_changed
    from slice9_initial_replay$$,
  $$values ('succeeded'::text, 'MANUAL_NO_CHANGE'::text, 0, 0, 0)$$,
  'the already-seeded exact catalog records a typed no-change terminal result'
);
select results_eq(
  $$select status::text, error_code, finished_at is not null
    from public.sync_runs
    where id = (select result_run_id from slice9_initial_replay)$$,
  $$values ('succeeded'::text, null::text, true)$$,
  'a successful Manual result keeps persisted error metadata null'
);

delete from public.matches
where id = '26000000-0000-4000-8000-000000000203';
delete from public.teams
where id = '26000000-0000-4000-8000-000000000106';
insert into public.teams (id, name, short_name)
values (
  'd9300000-0000-4000-8000-000000000909',
  'הפועל באר שבע',
  'שם זהה שאינו מפתח'
);

create temp table slice9_core_attempt_baseline as
select
  (select count(*)::integer from public.sync_runs) as runs,
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied') as audits;

select throws_ok(
  $$select * from private.slice9_apply_manual_fixture_catalog_core(
    (select payload from slice9_manual_payload),
    'd9300000-0000-4000-8000-000000000001'::uuid,
    'infinity'::timestamptz
  )$$,
  'P0001', 'VALIDATION_ERROR',
  'owner-only full core rejects non-finite explicit decision time'
);
select results_eq(
  $$select
      (select count(*)::integer from public.sync_runs),
      (select count(*)::integer from public.audit_logs
       where action = 'manual_catalog_applied')$$,
  $$select runs, audits from slice9_core_attempt_baseline$$,
  'invalid owner-only test time creates no terminal run or business audit'
);

create temp table slice9_deterministic_core_conflict as
select * from private.slice9_apply_manual_fixture_catalog_core(
  (select payload from slice9_manual_payload),
  'd9300000-0000-4000-8000-000000000001'::uuid,
  '2026-11-01T00:00:00Z'::timestamptz
);
select results_eq(
  $$select result_status::text, result_code, result_rows_inserted,
           result_teams_changed, result_matches_changed
    from slice9_deterministic_core_conflict$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text, 0, 0, 0)$$,
  'owner-only full core deterministically rejects a missing historical fixture'
);
select results_eq(
  $$select status::text, error_code, rows_inserted, teams_changed,
           matches_changed, finished_at is not null
    from public.sync_runs
    where id = (
      select result_run_id from slice9_deterministic_core_conflict
    )$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text,
            0, 0, 0, true)$$,
  'deterministic historical conflict records one matching terminal run'
);
select results_eq(
  $$select
      count(*) filter (
        where id = '26000000-0000-4000-8000-000000000106'
      )::integer,
      (select count(*)::integer from public.matches
       where id = '26000000-0000-4000-8000-000000000203')
    from public.teams$$,
  $$values (0, 0)$$,
  'deterministic historical conflict inserts no partial team or match row'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied'),
  (select audits from slice9_core_attempt_baseline),
  'deterministic historical conflict creates no business audit'
);

create temp table slice9_deterministic_core_apply as
select * from private.slice9_apply_manual_fixture_catalog_core(
  (select payload from slice9_manual_payload),
  'd9300000-0000-4000-8000-000000000001'::uuid,
  '2026-08-01T00:00:00Z'::timestamptz
);
select results_eq(
  $$select result_status::text, result_code, result_rows_inserted,
           result_teams_changed, result_matches_changed
    from slice9_deterministic_core_apply$$,
  $$values ('succeeded'::text, 'MANUAL_APPLIED'::text, 2, 1, 1)$$,
  'owner-only full core deterministically proves the safe apply path'
);
select results_eq(
  $$select status::text, error_code, rows_inserted, teams_changed,
           matches_changed, finished_at is not null
    from public.sync_runs
    where id = (select result_run_id from slice9_deterministic_core_apply)$$,
  $$values ('succeeded'::text, null::text, 2, 1, 1, true)$$,
  'deterministic safe apply records one matching terminal run'
);
select results_eq(
  $$select status::text, predictions_locked_at, external_provider, external_id
    from public.matches
    where id = '26000000-0000-4000-8000-000000000203'$$,
  $$values ('scheduled'::text, null::timestamptz, null::text, null::text)$$,
  'deterministic full apply inserts the exact safe pre-kickoff fixture state'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied'),
  (select audits + 1 from slice9_core_attempt_baseline),
  'deterministic full apply records one business audit'
);
delete from public.matches
where id = '26000000-0000-4000-8000-000000000203';
delete from public.teams
where id = '26000000-0000-4000-8000-000000000106';

create temp table slice9_public_apply_baseline as
select count(*)::integer as audits
from public.audit_logs
where action = 'manual_catalog_applied';

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
create temp table slice9_first_apply as
select * from public.apply_manual_fixture_catalog(
  (select payload from slice9_manual_payload)
);
reset role;

create temp table slice9_first_apply_observation as
select
  (select count(*)::integer from public.teams
   where id = '26000000-0000-4000-8000-000000000106') as teams,
  (select count(*)::integer from public.matches
   where id = '26000000-0000-4000-8000-000000000203') as matches,
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied') as audits;

-- Owner-side fixture restoration is intentionally not a production clock
-- seam. The full core's insert path is proven above at a fixed safe time.
insert into public.teams (id, name, short_name)
values (
  '26000000-0000-4000-8000-000000000106',
  'הפועל באר שבע',
  'באר שבע'
)
on conflict (id) do nothing;
insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status
) values (
  '26000000-0000-4000-8000-000000000203',
  '26000000-0000-4000-8000-000000000027', 1,
  '26000000-0000-4000-8000-000000000105',
  '26000000-0000-4000-8000-000000000106',
  '2026-10-18T17:00:00Z'::timestamptz, 'scheduled'
)
on conflict (id) do nothing;

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
create temp table slice9_second_replay as
select * from public.apply_manual_fixture_catalog(
  (select payload from slice9_manual_payload)
);
reset role;
select ok(
  (
    select
      (
        result_status = 'succeeded'
        and result_code = 'MANUAL_APPLIED'
        and result_rows_inserted = 2
        and result_teams_changed = 1
        and result_matches_changed = 1
      ) or (
        result_status = 'failed'
        and result_code = 'MANUAL_CATALOG_CONFLICT'
        and result_rows_inserted = 0
        and result_teams_changed = 0
        and result_matches_changed = 0
      )
    from slice9_first_apply
  ),
  'actual-clock public import returns only a coherent apply or conflict outcome'
);
select ok(
  (
    select
      run.status = result.result_status
      and run.provider = 'manual'
      and run.sync_kind = 'manual'
      and run.rows_inserted = result.result_rows_inserted
      and run.teams_changed = result.result_teams_changed
      and run.matches_changed = result.result_matches_changed
      and run.finished_at is not null
      and case
        when result.result_status = 'succeeded' then run.error_code is null
        else run.error_code = 'MANUAL_CATALOG_CONFLICT'
      end
    from slice9_first_apply as result
    join public.sync_runs as run on run.id = result.result_run_id
  ),
  'actual-clock public import persists one matching terminal run'
);
select ok(
  (
    select case
      when result.result_code = 'MANUAL_APPLIED' then
        observation.teams = 1
        and observation.matches = 1
        and observation.audits = baseline.audits + 1
      else
        observation.teams = 0
        and observation.matches = 0
        and observation.audits = baseline.audits
    end
    from slice9_first_apply as result
    cross join slice9_first_apply_observation as observation
    cross join slice9_public_apply_baseline as baseline
  ),
  'actual-clock conflict is atomic while a safe apply inserts both leaves and one audit'
);
select results_eq(
  $$select result_code, result_rows_inserted, result_teams_changed,
           result_matches_changed from slice9_second_replay$$,
  $$values ('MANUAL_NO_CHANGE'::text, 0, 0, 0)$$,
  'identical replay creates no duplicate catalog row'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied'
     and entity_id = '26000000-0000-4000-8000-000000000027'),
  (select baseline.audits
          + case when result.result_code = 'MANUAL_APPLIED' then 1 else 0 end
   from slice9_first_apply as result
   cross join slice9_public_apply_baseline as baseline),
  'only a real public catalog mutation creates one business audit event'
);
create temp table slice9_catalog_audit_baseline as
select count(*)::integer as audits
from public.audit_logs
where action = 'manual_catalog_applied';
select is(
  (select count(*)::integer from public.teams
   where name = 'הפועל באר שבע'),
  2,
  'display name is never used as an identity or merge key'
);
select results_eq(
  $$select id::text, status::text,
           to_char(kickoff_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
    from public.matches
    where id between
      '26000000-0000-4000-8000-000000000201'::uuid and
      '26000000-0000-4000-8000-000000000205'::uuid
    order by id$$,
  $$values
    ('26000000-0000-4000-8000-000000000201', 'scheduled', '2026-10-17 16:00'),
    ('26000000-0000-4000-8000-000000000202', 'scheduled', '2026-10-17 18:30'),
    ('26000000-0000-4000-8000-000000000203', 'scheduled', '2026-10-18 17:00'),
    ('26000000-0000-4000-8000-000000000204', 'postponed', '2026-10-24 16:00'),
    ('26000000-0000-4000-8000-000000000205', 'canceled', '2026-10-24 18:30')$$,
  'database catalog UUIDs, statuses, and UTC kickoffs retain exact seed parity'
);
select ok(
  not exists (
    select 1 from public.matches
    where id between
      '26000000-0000-4000-8000-000000000201'::uuid and
      '26000000-0000-4000-8000-000000000205'::uuid
      and (external_provider is not null or external_id is not null)
  ),
  'Manual catalog rows remain without provider identity'
);
select results_eq(
  $$select external_provider, external_id
    from public.competitions
    where id = '26000000-0000-4000-8000-000000000001'$$,
  $$values (null::text, null::text)$$,
  'the canonical Manual competition also has no provider identity'
);
select is(
  (
    select jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'shortName', short_name,
        'logoUrl', logo_url,
        'externalProvider', external_provider,
        'externalId', external_id
      ) order by id
    )
    from public.teams
    where id between
      '26000000-0000-4000-8000-000000000101'::uuid and
      '26000000-0000-4000-8000-000000000106'::uuid
  ),
  '[
    {"id":"26000000-0000-4000-8000-000000000101","name":"הפועל תל אביב","shortName":"הפועל תל אביב","logoUrl":null,"externalProvider":null,"externalId":null},
    {"id":"26000000-0000-4000-8000-000000000102","name":"מכבי תל אביב","shortName":"מכבי תל אביב","logoUrl":null,"externalProvider":null,"externalId":null},
    {"id":"26000000-0000-4000-8000-000000000103","name":"בית״ר ירושלים","shortName":"בית״ר","logoUrl":null,"externalProvider":null,"externalId":null},
    {"id":"26000000-0000-4000-8000-000000000104","name":"הפועל חיפה","shortName":"הפועל חיפה","logoUrl":null,"externalProvider":null,"externalId":null},
    {"id":"26000000-0000-4000-8000-000000000105","name":"מ.ס. אשדוד","shortName":"אשדוד","logoUrl":null,"externalProvider":null,"externalId":null},
    {"id":"26000000-0000-4000-8000-000000000106","name":"הפועל באר שבע","shortName":"באר שבע","logoUrl":null,"externalProvider":null,"externalId":null}
  ]'::jsonb,
  'all six team identity and ownership fields match manual-catalog-v1 exactly'
);
select is(
  (
    select jsonb_agg(
      jsonb_build_object(
        'id', id,
        'seasonId', season_id,
        'roundNumber', round_number,
        'homeTeamId', home_team_id,
        'awayTeamId', away_team_id,
        'kickoffUtc', to_char(kickoff_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
        'status', status,
        'homeScore', home_score,
        'awayScore', away_score,
        'resultVersion', result_version,
        'manualOverride', is_manually_overridden,
        'providerRoundLabel', provider_round_label,
        'providerStatus', provider_status,
        'predictionsLockedAt', predictions_locked_at,
        'externalProvider', external_provider,
        'externalId', external_id
      ) order by id
    )
    from public.matches
    where id between
      '26000000-0000-4000-8000-000000000201'::uuid and
      '26000000-0000-4000-8000-000000000205'::uuid
  ),
  '[
    {"id":"26000000-0000-4000-8000-000000000201","seasonId":"26000000-0000-4000-8000-000000000027","roundNumber":1,"homeTeamId":"26000000-0000-4000-8000-000000000101","awayTeamId":"26000000-0000-4000-8000-000000000102","kickoffUtc":"2026-10-17 16:00","status":"scheduled","homeScore":null,"awayScore":null,"resultVersion":0,"manualOverride":false,"providerRoundLabel":null,"providerStatus":null,"predictionsLockedAt":null,"externalProvider":null,"externalId":null},
    {"id":"26000000-0000-4000-8000-000000000202","seasonId":"26000000-0000-4000-8000-000000000027","roundNumber":1,"homeTeamId":"26000000-0000-4000-8000-000000000103","awayTeamId":"26000000-0000-4000-8000-000000000104","kickoffUtc":"2026-10-17 18:30","status":"scheduled","homeScore":null,"awayScore":null,"resultVersion":0,"manualOverride":false,"providerRoundLabel":null,"providerStatus":null,"predictionsLockedAt":null,"externalProvider":null,"externalId":null},
    {"id":"26000000-0000-4000-8000-000000000203","seasonId":"26000000-0000-4000-8000-000000000027","roundNumber":1,"homeTeamId":"26000000-0000-4000-8000-000000000105","awayTeamId":"26000000-0000-4000-8000-000000000106","kickoffUtc":"2026-10-18 17:00","status":"scheduled","homeScore":null,"awayScore":null,"resultVersion":0,"manualOverride":false,"providerRoundLabel":null,"providerStatus":null,"predictionsLockedAt":null,"externalProvider":null,"externalId":null},
    {"id":"26000000-0000-4000-8000-000000000204","seasonId":"26000000-0000-4000-8000-000000000027","roundNumber":2,"homeTeamId":"26000000-0000-4000-8000-000000000101","awayTeamId":"26000000-0000-4000-8000-000000000103","kickoffUtc":"2026-10-24 16:00","status":"postponed","homeScore":null,"awayScore":null,"resultVersion":0,"manualOverride":false,"providerRoundLabel":null,"providerStatus":null,"predictionsLockedAt":null,"externalProvider":null,"externalId":null},
    {"id":"26000000-0000-4000-8000-000000000205","seasonId":"26000000-0000-4000-8000-000000000027","roundNumber":2,"homeTeamId":"26000000-0000-4000-8000-000000000102","awayTeamId":"26000000-0000-4000-8000-000000000105","kickoffUtc":"2026-10-24 18:30","status":"canceled","homeScore":null,"awayScore":null,"resultVersion":0,"manualOverride":false,"providerRoundLabel":null,"providerStatus":null,"predictionsLockedAt":null,"externalProvider":null,"externalId":null}
  ]'::jsonb,
  'all five match identity, status, result, latch, and ownership fields match exactly'
);

insert into public.leagues (
  id, manager_id, season_id, name, status
) values (
  'd9300000-0000-4000-8000-000000000400',
  'd9300000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000027',
  'Exact catalog prediction replay', 'open'
);
insert into public.predictions (
  league_id, match_id, user_id, predicted_home_score, predicted_away_score
) values (
  'd9300000-0000-4000-8000-000000000400',
  '26000000-0000-4000-8000-000000000201',
  'd9300000-0000-4000-8000-000000000001', 1, 0
);
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
create temp table slice9_prediction_replay as
select * from public.apply_manual_fixture_catalog(
  (select payload from slice9_manual_payload)
);
reset role;
select results_eq(
  $$select result_status::text, result_code, result_rows_inserted
    from slice9_prediction_replay$$,
  $$values ('succeeded'::text, 'MANUAL_NO_CHANGE'::text, 0)$$,
  'an exact catalog replay remains a safe no-op when a prediction exists'
);
select results_eq(
  $$select status::text, error_code, finished_at is not null
    from public.sync_runs
    where id = (select result_run_id from slice9_prediction_replay)$$,
  $$values ('succeeded'::text, null::text, true)$$,
  'prediction-present replay records exactly one successful terminal run'
);
select is(
  (select count(*)::integer from public.predictions
   where league_id = 'd9300000-0000-4000-8000-000000000400'
     and match_id = '26000000-0000-4000-8000-000000000201'),
  1,
  'prediction-present replay leaves the existing prediction unchanged'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied'),
  (select audits from slice9_catalog_audit_baseline),
  'prediction-present no-change replay creates no business audit'
);
delete from public.predictions
where league_id = 'd9300000-0000-4000-8000-000000000400';
delete from public.leagues
where id = 'd9300000-0000-4000-8000-000000000400';

update public.teams
set short_name = null
where id = '26000000-0000-4000-8000-000000000103';
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
create temp table slice9_null_short_name_conflict as
select * from public.apply_manual_fixture_catalog(
  (select payload from slice9_manual_payload)
);
reset role;
select results_eq(
  $$select result_status::text, result_code, result_rows_inserted
    from slice9_null_short_name_conflict$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text, 0)$$,
  'a null short name on a fixed-ID team is a null-safe catalog conflict'
);
select results_eq(
  $$select status::text, error_code, finished_at is not null
    from public.sync_runs
    where id = (select result_run_id from slice9_null_short_name_conflict)$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text, true)$$,
  'the null short-name conflict records exactly one failed terminal run'
);
select is(
  (select short_name from public.teams
   where id = '26000000-0000-4000-8000-000000000103'),
  null::text,
  'the null short-name conflict never repairs or overwrites stored data'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied'),
  (select audits from slice9_catalog_audit_baseline),
  'the null short-name conflict creates no business audit'
);
update public.teams
set short_name = 'בית״ר'
where id = '26000000-0000-4000-8000-000000000103';

update public.matches
set round_number = 9
where id = '26000000-0000-4000-8000-000000000202';
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
create temp table slice9_conflict as
select * from public.apply_manual_fixture_catalog(
  (select payload from slice9_manual_payload)
);
reset role;
select results_eq(
  $$select result_status::text, result_code, result_rows_inserted
    from slice9_conflict$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text, 0)$$,
  'a nonidentical replay returns one typed terminal conflict'
);
select is(
  (select round_number from public.matches
   where id = '26000000-0000-4000-8000-000000000202'),
  9::smallint,
  'conflicting replay does not overwrite stored data'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied'),
  (select audits from slice9_catalog_audit_baseline),
  'conflicting replay does not create a business audit'
);
update public.matches set round_number = 1
where id = '26000000-0000-4000-8000-000000000202';

update public.matches
set status = 'live'
where id = '26000000-0000-4000-8000-000000000201';
delete from public.matches
where id = '26000000-0000-4000-8000-000000000205';
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
create temp table slice9_status_drift_conflict as
select * from public.apply_manual_fixture_catalog(
  (select payload from slice9_manual_payload)
);
reset role;
select results_eq(
  $$select result_status::text, result_code, result_rows_inserted
    from slice9_status_drift_conflict$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text, 0)$$,
  'status drift plus a different missing leaf returns an atomic conflict'
);
select results_eq(
  $$select status::text, error_code, finished_at is not null
    from public.sync_runs
    where id = (select result_run_id from slice9_status_drift_conflict)$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text, true)$$,
  'status drift plus a missing leaf records one failed terminal run'
);
select is(
  (select status::text from public.matches
   where id = '26000000-0000-4000-8000-000000000201'),
  'live'::text,
  'status drift conflict never overwrites the existing fixture'
);
select is(
  (select count(*)::integer from public.matches
   where id = '26000000-0000-4000-8000-000000000205'),
  0,
  'status drift conflict leaves the different canonical leaf absent'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied'),
  (select audits from slice9_catalog_audit_baseline),
  'status drift plus a missing leaf creates no business audit'
);
update public.matches
set status = 'scheduled'
where id = '26000000-0000-4000-8000-000000000201';
insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status
) values (
  '26000000-0000-4000-8000-000000000205',
  '26000000-0000-4000-8000-000000000027', 2,
  '26000000-0000-4000-8000-000000000102',
  '26000000-0000-4000-8000-000000000105',
  '2026-10-24T18:30:00Z'::timestamptz, 'canceled'
);

update public.matches
set external_provider = 'api-football', external_id = 'fixed-id-conflict'
where id = '26000000-0000-4000-8000-000000000202';
delete from public.matches
where id = '26000000-0000-4000-8000-000000000205';
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
create temp table slice9_provider_conflict as
select * from public.apply_manual_fixture_catalog(
  (select payload from slice9_manual_payload)
);
reset role;
select is(
  (select result_code from slice9_provider_conflict),
  'MANUAL_CATALOG_CONFLICT',
  'a provider-owned fixed-ID row is rejected rather than overwritten'
);
select results_eq(
  $$select external_provider, external_id from public.matches
    where id = '26000000-0000-4000-8000-000000000202'$$,
  $$values ('api-football'::text, 'fixed-id-conflict'::text)$$,
  'provider identity survives the catalog conflict atomically'
);
select results_eq(
  $$select status::text, error_code, finished_at is not null
    from public.sync_runs
    where id = (select result_run_id from slice9_provider_conflict)$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text, true)$$,
  'provider drift plus a missing leaf records one failed terminal run'
);
select is(
  (select count(*)::integer from public.matches
   where id = '26000000-0000-4000-8000-000000000205'),
  0,
  'provider drift makes the import atomic and leaves a different leaf absent'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied'),
  (select audits from slice9_catalog_audit_baseline),
  'provider drift plus a missing leaf creates no business audit'
);
insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status
) values (
  '26000000-0000-4000-8000-000000000205',
  '26000000-0000-4000-8000-000000000027', 2,
  '26000000-0000-4000-8000-000000000102',
  '26000000-0000-4000-8000-000000000105',
  '2026-10-24T18:30:00Z'::timestamptz, 'canceled'
);
select is(
  (
    select count(*)::integer
    from public.sync_runs
    where id in (
      (select result_run_id from slice9_initial_replay),
      (select result_run_id from slice9_deterministic_core_conflict),
      (select result_run_id from slice9_deterministic_core_apply),
      (select result_run_id from slice9_first_apply),
      (select result_run_id from slice9_second_replay),
      (select result_run_id from slice9_prediction_replay),
      (select result_run_id from slice9_null_short_name_conflict),
      (select result_run_id from slice9_conflict),
      (select result_run_id from slice9_status_drift_conflict),
      (select result_run_id from slice9_provider_conflict)
    )
      and finished_at is not null
      and status in ('succeeded', 'failed')
  ),
  10,
  'each valid bounded catalog invocation writes exactly one terminal run'
);
update public.matches set external_provider = null, external_id = null
where id = '26000000-0000-4000-8000-000000000202';

create temp table slice9_match_inputs as
select
  date_trunc('minute', clock_timestamp() + interval '30 days') as future_kickoff,
  date_trunc('minute', clock_timestamp() - interval '30 minutes') as past_kickoff;
grant select on table slice9_match_inputs to service_role;

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
create temp table slice9_created_match as
select * from public.create_or_correct_match(
  'create', 'd9300000-0000-4000-8000-000000000301',
  '26000000-0000-4000-8000-000000000027',
  '26000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000102',
  3, (select future_kickoff from slice9_match_inputs),
  'scheduled', null, null
);
create temp table slice9_created_replay as
select * from public.create_or_correct_match(
  'create', 'd9300000-0000-4000-8000-000000000301',
  '26000000-0000-4000-8000-000000000027',
  '26000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000102',
  3, (select future_kickoff from slice9_match_inputs),
  'scheduled', null, null
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'create', 'd9300000-0000-4000-8000-000000000301',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000102',
    4, (select future_kickoff from slice9_match_inputs),
    'scheduled', null, null
  )$$,
  'P0001', 'MANUAL_MATCH_CONFLICT',
  'the same create UUID with a different payload fails closed'
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    null, 'd9300000-0000-4000-8000-000000000399',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000102',
    3, (select future_kickoff from slice9_match_inputs),
    'scheduled', null, null
  )$$,
  'P0001', 'VALIDATION_ERROR',
  'a null operation is rejected at the database boundary'
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'create', 'd9300000-0000-4000-8000-000000000396',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000102',
    3, 'infinity'::timestamptz,
    'scheduled', null, null
  )$$,
  'P0001', 'VALIDATION_ERROR',
  'positive-infinity kickoff is rejected at the database boundary'
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'create', 'd9300000-0000-4000-8000-000000000395',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000102',
    3, '-infinity'::timestamptz,
    'scheduled', null, null
  )$$,
  'P0001', 'VALIDATION_ERROR',
  'negative-infinity kickoff is rejected at the database boundary'
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'create', 'd9300000-0000-4000-8000-000000000398',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000102',
    3, (select future_kickoff from slice9_match_inputs),
    'finished', 1, 0
  )$$,
  'P0001', 'MATCH_NOT_STARTED',
  'a finished match is rejected before database kickoff'
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'create', 'd9300000-0000-4000-8000-000000000397',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000101',
    'd9300000-0000-4000-8000-000000000999',
    3, (select future_kickoff from slice9_match_inputs),
    'scheduled', null, null
  )$$,
  'P0001', 'MATCH_NOT_FOUND',
  'create accepts only existing season and team identifiers'
);
create temp table slice9_past_finished as
select * from public.create_or_correct_match(
  'create', 'd9300000-0000-4000-8000-000000000302',
  '26000000-0000-4000-8000-000000000027',
  '26000000-0000-4000-8000-000000000103',
  '26000000-0000-4000-8000-000000000104',
  3, (select past_kickoff from slice9_match_inputs),
  'finished', 2, 1
);
reset role;
select is(
  (select count(*)::integer from public.matches
   where id in (
     'd9300000-0000-4000-8000-000000000395',
     'd9300000-0000-4000-8000-000000000396'
   )),
  0,
  'non-finite kickoff rejection creates no match row'
);
select results_eq(
  $$select result_created, result_changed, result_manual_override
    from slice9_created_match$$,
  $$values (true, true, true)$$,
  'create persists explicit Manual ownership'
);
select results_eq(
  $$select result_created, result_changed, result_manual_override
    from slice9_created_replay$$,
  $$values (false, false, true)$$,
  'identical create replay is idempotent'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'match_manually_created'
     and entity_id = 'd9300000-0000-4000-8000-000000000301'),
  1,
  'create replay and conflicting replay do not duplicate the audit event'
);
select results_eq(
  $$select status::text, home_score, away_score, result_version,
           is_manually_overridden, external_provider, external_id
    from public.matches
    where id = 'd9300000-0000-4000-8000-000000000302'$$,
  $$values ('finished'::text, 2::smallint, 1::smallint, 1, true,
            null::text, null::text)$$,
  'a valid post-kickoff Manual result has no provider identity'
);
select results_eq(
  $$select metadata
    from public.audit_logs
    where action = 'match_manually_created'
      and entity_id = 'd9300000-0000-4000-8000-000000000302'$$,
  $$select jsonb_build_object(
      'source', 'manual-match',
      'season_id', '26000000-0000-4000-8000-000000000027'::uuid,
      'home_team_id', '26000000-0000-4000-8000-000000000103'::uuid,
      'away_team_id', '26000000-0000-4000-8000-000000000104'::uuid,
      'round_number', 3::smallint,
      'kickoff_at', (select past_kickoff from slice9_match_inputs),
      'status', 'finished'::public.match_status,
      'home_score', 2::smallint,
      'away_score', 1::smallint,
      'result_version', 1
    )$$,
  'finished-create audit preserves the complete accepted Manual payload'
);

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status
) values
  (
    'd9300000-0000-4000-8000-000000000308',
    '26000000-0000-4000-8000-000000000027', 3,
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000102',
    (select past_kickoff from slice9_match_inputs), 'scheduled'
  ),
  (
    'd9300000-0000-4000-8000-000000000309',
    '26000000-0000-4000-8000-000000000027', 3,
    '26000000-0000-4000-8000-000000000103',
    '26000000-0000-4000-8000-000000000104',
    (select past_kickoff from slice9_match_inputs), 'scheduled'
  );
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
create temp table slice9_terminal_latch_only as
select * from public.create_or_correct_match(
  'correct', 'd9300000-0000-4000-8000-000000000308',
  '26000000-0000-4000-8000-000000000027',
  '26000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000102',
  3, (select past_kickoff from slice9_match_inputs),
  'finished', 3, 2
);
create temp table slice9_terminal_definition_change as
select * from public.create_or_correct_match(
  'correct', 'd9300000-0000-4000-8000-000000000309',
  '26000000-0000-4000-8000-000000000027',
  '26000000-0000-4000-8000-000000000103',
  '26000000-0000-4000-8000-000000000104',
  4, (select past_kickoff from slice9_match_inputs),
  'finished', 1, 0
);
reset role;
select results_eq(
  $$select result_status::text, result_home_score, result_away_score,
           result_changed
    from slice9_terminal_latch_only$$,
  $$values ('finished'::text, 3::smallint, 2::smallint, true)$$,
  'terminal correction establishes the latch and applies the result'
);
select results_eq(
  $$select action
    from public.audit_logs
    where entity_id = 'd9300000-0000-4000-8000-000000000308'
    order by id$$,
  $$values ('match_result_applied'::text)$$,
  'latch-only terminal correction emits only the canonical result audit'
);
select results_eq(
  $$select metadata
    from public.audit_logs
    where action = 'match_definition_corrected'
      and entity_id = 'd9300000-0000-4000-8000-000000000309'$$,
  $$select jsonb_build_object(
      'source', 'manual-match',
      'provider_identity_preserved', false,
      'old', jsonb_build_object(
        'season_id', '26000000-0000-4000-8000-000000000027'::uuid,
        'home_team_id', '26000000-0000-4000-8000-000000000103'::uuid,
        'away_team_id', '26000000-0000-4000-8000-000000000104'::uuid,
        'round_number', 3::smallint,
        'kickoff_at', (select past_kickoff from slice9_match_inputs),
        'status', 'scheduled'::public.match_status,
        'home_score', null,
        'away_score', null
      ),
      'new', jsonb_build_object(
        'season_id', '26000000-0000-4000-8000-000000000027'::uuid,
        'home_team_id', '26000000-0000-4000-8000-000000000103'::uuid,
        'away_team_id', '26000000-0000-4000-8000-000000000104'::uuid,
        'round_number', 4::smallint,
        'kickoff_at', (select past_kickoff from slice9_match_inputs),
        'status', 'finished'::public.match_status,
        'home_score', 1::smallint,
        'away_score', 0::smallint
      )
    )$$,
  'terminal definition audit records bounded old/new definition and result inputs'
);

-- A prediction and an irreversible latch independently block identity edits.
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
select * from public.create_or_correct_match(
  'create', 'd9300000-0000-4000-8000-000000000303',
  '26000000-0000-4000-8000-000000000027',
  '26000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000102',
  3, (select future_kickoff from slice9_match_inputs),
  'scheduled', null, null
);
select * from public.create_or_correct_match(
  'create', 'd9300000-0000-4000-8000-000000000304',
  '26000000-0000-4000-8000-000000000027',
  '26000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000102',
  3, (select future_kickoff from slice9_match_inputs),
  'scheduled', null, null
);
reset role;
insert into public.leagues (
  id, manager_id, season_id, name, status
) values (
  'd9300000-0000-4000-8000-000000000401',
  'd9300000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000027',
  'Prediction identity guard', 'open'
);
insert into public.predictions (
  league_id, match_id, user_id, predicted_home_score, predicted_away_score
) values (
  'd9300000-0000-4000-8000-000000000401',
  'd9300000-0000-4000-8000-000000000303',
  'd9300000-0000-4000-8000-000000000001', 1, 0
);
update public.matches
set predictions_locked_at = clock_timestamp()
where id = 'd9300000-0000-4000-8000-000000000304';

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'correct', 'd9300000-0000-4000-8000-000000000303',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000103',
    '26000000-0000-4000-8000-000000000102',
    3, (select future_kickoff from slice9_match_inputs),
    'scheduled', null, null
  )$$,
  'P0001', 'MATCH_IDENTITY_LOCKED',
  'an existing prediction blocks team identity correction'
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'correct', 'd9300000-0000-4000-8000-000000000304',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000103',
    3, (select future_kickoff from slice9_match_inputs),
    'scheduled', null, null
  )$$,
  'P0001', 'MATCH_IDENTITY_LOCKED',
  'the irreversible latch independently blocks team identity correction'
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'correct', 'd9300000-0000-4000-8000-000000000304',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000102',
    3, (select future_kickoff from slice9_match_inputs),
    'postponed', null, null
  )$$,
  'P0001', 'UNSAFE_STATUS_REGRESSION',
  'a latch also blocks regression to a future unscored status'
);
reset role;
select ok(
  (select predictions_locked_at is not null from public.matches
   where id = 'd9300000-0000-4000-8000-000000000304'),
  'failed corrections never clear the irreversible latch'
);

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at,
  status, external_provider, external_id
) values (
  'd9300000-0000-4000-8000-000000000305',
  '26000000-0000-4000-8000-000000000027', 3,
  '26000000-0000-4000-8000-000000000103',
  '26000000-0000-4000-8000-000000000104',
  (select future_kickoff from slice9_match_inputs),
  'scheduled', 'api-football', 'slice9-provider-305'
);
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
create temp table slice9_provider_correction as
select * from public.create_or_correct_match(
  'correct', 'd9300000-0000-4000-8000-000000000305',
  '26000000-0000-4000-8000-000000000027',
  '26000000-0000-4000-8000-000000000103',
  '26000000-0000-4000-8000-000000000104',
  4, (select future_kickoff from slice9_match_inputs),
  'scheduled', null, null
);
create temp table slice9_provider_correction_replay as
select * from public.create_or_correct_match(
  'correct', 'd9300000-0000-4000-8000-000000000305',
  '26000000-0000-4000-8000-000000000027',
  '26000000-0000-4000-8000-000000000103',
  '26000000-0000-4000-8000-000000000104',
  4, (select future_kickoff from slice9_match_inputs),
  'scheduled', null, null
);
reset role;
select results_eq(
  $$select external_provider, external_id, round_number,
           is_manually_overridden
    from public.matches
    where id = 'd9300000-0000-4000-8000-000000000305'$$,
  $$values ('api-football'::text, 'slice9-provider-305'::text,
            4::smallint, true)$$,
  'provider-owned correction preserves provider identity and marks Manual ownership'
);
select results_eq(
  $$select result_changed from slice9_provider_correction
    union all
    select result_changed from slice9_provider_correction_replay$$,
  $$values (true), (false)$$,
  'correction changes once and identical replay is a no-op'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'match_manually_corrected'
     and entity_id = 'd9300000-0000-4000-8000-000000000305'),
  1,
  'identical correction replay does not duplicate its audit event'
);
select results_eq(
  $$select metadata
    from public.audit_logs
    where action = 'match_manually_corrected'
      and entity_id = 'd9300000-0000-4000-8000-000000000305'$$,
  $$select jsonb_build_object(
      'source', 'manual-match',
      'provider_identity_preserved', true,
      'old', jsonb_build_object(
        'season_id', '26000000-0000-4000-8000-000000000027'::uuid,
        'home_team_id', '26000000-0000-4000-8000-000000000103'::uuid,
        'away_team_id', '26000000-0000-4000-8000-000000000104'::uuid,
        'round_number', 3::smallint,
        'kickoff_at', (select future_kickoff from slice9_match_inputs),
        'status', 'scheduled'::public.match_status,
        'home_score', null,
        'away_score', null
      ),
      'new', jsonb_build_object(
        'season_id', '26000000-0000-4000-8000-000000000027'::uuid,
        'home_team_id', '26000000-0000-4000-8000-000000000103'::uuid,
        'away_team_id', '26000000-0000-4000-8000-000000000104'::uuid,
        'round_number', 4::smallint,
        'kickoff_at', (select future_kickoff from slice9_match_inputs),
        'status', 'scheduled'::public.match_status,
        'home_score', null,
        'away_score', null
      ),
      'result_invalidated', false,
      'predictions_reset', 0
    )$$,
  'provider-owned nonterminal correction audit records bounded old/new payloads'
);

insert into public.leagues (
  id, manager_id, season_id, name, status
) values (
  'd9300000-0000-4000-8000-000000000402',
  'd9300000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000027',
  'Completed correction guard', 'completed'
);
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'create', 'd9300000-0000-4000-8000-000000000306',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000103',
    '26000000-0000-4000-8000-000000000104',
    5, (select future_kickoff from slice9_match_inputs),
    'scheduled', null, null
  )$$,
  'P0001', 'COMPLETED_RECONCILIATION_REQUIRED',
  'new fixtures cannot silently enter a completed season before frozen snapshots'
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'correct', 'd9300000-0000-4000-8000-000000000305',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000103',
    '26000000-0000-4000-8000-000000000104',
    5, (select future_kickoff from slice9_match_inputs),
    'scheduled', null, null
  )$$,
  'P0001', 'COMPLETED_RECONCILIATION_REQUIRED',
  'completed-league correction fails closed pending S9-REQ-001 review'
);
reset role;
select is(
  (select round_number from public.matches
   where id = 'd9300000-0000-4000-8000-000000000305'),
  4::smallint,
  'completed-league refusal leaves the match unchanged'
);

delete from public.matches
where id = '26000000-0000-4000-8000-000000000205';
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
create temp table slice9_completed_catalog_conflict as
select * from public.apply_manual_fixture_catalog(
  (select payload from slice9_manual_payload)
);
reset role;
select results_eq(
  $$select result_status::text, result_code, result_rows_inserted
    from slice9_completed_catalog_conflict$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text, 0)$$,
  'Manual import cannot add a missing fixture to a completed season'
);
select results_eq(
  $$select status::text, error_code, finished_at is not null
    from public.sync_runs
    where id = (select result_run_id from slice9_completed_catalog_conflict)$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text, true)$$,
  'completed-season catalog refusal records one failed terminal run'
);
select is(
  (select count(*)::integer from public.matches
   where id = '26000000-0000-4000-8000-000000000205'),
  0,
  'completed-season import failure leaves the missing fixture absent'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied'),
  (select audits from slice9_catalog_audit_baseline),
  'completed-season import failure creates no business audit'
);

update public.leagues
set status = 'archived'
where id = 'd9300000-0000-4000-8000-000000000402';
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'create', 'd9300000-0000-4000-8000-000000000307',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000103',
    '26000000-0000-4000-8000-000000000104',
    5, (select future_kickoff from slice9_match_inputs),
    'scheduled', null, null
  )$$,
  'P0001', 'COMPLETED_RECONCILIATION_REQUIRED',
  'new fixtures cannot enter an archived season'
);
select throws_ok(
  $$select * from public.create_or_correct_match(
    'correct', 'd9300000-0000-4000-8000-000000000305',
    '26000000-0000-4000-8000-000000000027',
    '26000000-0000-4000-8000-000000000103',
    '26000000-0000-4000-8000-000000000104',
    5, (select future_kickoff from slice9_match_inputs),
    'scheduled', null, null
  )$$,
  'P0001', 'COMPLETED_RECONCILIATION_REQUIRED',
  'archived-league correction remains read-only'
);
create temp table slice9_archived_catalog_conflict as
select * from public.apply_manual_fixture_catalog(
  (select payload from slice9_manual_payload)
);
reset role;
select is(
  (select count(*)::integer from public.matches
   where id = 'd9300000-0000-4000-8000-000000000307'),
  0,
  'archived-season create refusal leaves no match row'
);
select results_eq(
  $$select round_number, is_manually_overridden
    from public.matches
    where id = 'd9300000-0000-4000-8000-000000000305'$$,
  $$values (4::smallint, true)$$,
  'archived-season correction refusal leaves the existing match unchanged'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'match_manually_corrected'
     and entity_id = 'd9300000-0000-4000-8000-000000000305'),
  1,
  'archived create/correct refusals add no business audit'
);
select results_eq(
  $$select result_status::text, result_code, result_rows_inserted
    from slice9_archived_catalog_conflict$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text, 0)$$,
  'Manual import cannot add a missing fixture to an archived season'
);
select results_eq(
  $$select status::text, error_code, finished_at is not null
    from public.sync_runs
    where id = (select result_run_id from slice9_archived_catalog_conflict)$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text, true)$$,
  'archived-season catalog refusal records one failed terminal run'
);
select is(
  (select count(*)::integer from public.matches
   where id = '26000000-0000-4000-8000-000000000205'),
  0,
  'archived-season import failure leaves the missing fixture absent'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied'),
  (select audits from slice9_catalog_audit_baseline),
  'archived-season import failure creates no business audit'
);

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status
) values (
  '26000000-0000-4000-8000-000000000205',
  '26000000-0000-4000-8000-000000000027', 2,
  '26000000-0000-4000-8000-000000000102',
  '26000000-0000-4000-8000-000000000105',
  '2026-10-24T18:30:00Z'::timestamptz, 'canceled'
);
update public.leagues
set status = 'open'
where id = 'd9300000-0000-4000-8000-000000000402';
update public.matches
set predictions_locked_at = '2026-08-27T00:00:00Z'::timestamptz
where id = '26000000-0000-4000-8000-000000000204';
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"d9300000-0000-4000-8000-000000000001"}',
  true
);
create temp table slice9_catalog_latch_conflict as
select * from public.apply_manual_fixture_catalog(
  (select payload from slice9_manual_payload)
);
reset role;
select results_eq(
  $$select result_status::text, result_code, result_rows_inserted
    from slice9_catalog_latch_conflict$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text, 0)$$,
  'a fixed-ID catalog latch returns a typed conflict'
);
select results_eq(
  $$select status::text, error_code, finished_at is not null
    from public.sync_runs
    where id = (select result_run_id from slice9_catalog_latch_conflict)$$,
  $$values ('failed'::text, 'MANUAL_CATALOG_CONFLICT'::text, true)$$,
  'the catalog latch conflict records exactly one failed terminal run'
);
select results_eq(
  $$select predictions_locked_at, status::text, result_version
    from public.matches
    where id = '26000000-0000-4000-8000-000000000204'$$,
  $$values ('2026-08-27T00:00:00Z'::timestamptz, 'postponed'::text, 0)$$,
  'the catalog latch conflict leaves the fixed-ID match unchanged'
);
select is(
  (select count(*)::integer from public.matches
   where id = '26000000-0000-4000-8000-000000000205'),
  1,
  'the latch conflict cannot mask a missing catalog leaf or insert data'
);
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'manual_catalog_applied'),
  (select audits from slice9_catalog_audit_baseline),
  'the catalog latch conflict creates no business audit'
);

select * from finish();
rollback;
