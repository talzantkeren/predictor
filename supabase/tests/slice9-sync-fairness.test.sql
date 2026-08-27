begin;

select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'fa000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'sync-fairness@example.com',
  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Sync Fairness"}', now(), now()
);

insert into public.system_admins (user_id, granted_by)
values (
  'fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001'
);

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id,
  kickoff_at, status, predictions_locked_at,
  external_provider, external_id, provider_status
)
select
  ('fa100000-0000-4000-8000-' || lpad(series.i::text, 12, '0'))::uuid,
  '26000000-0000-4000-8000-000000000027',
  80 + series.i,
  '26000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000102',
  clock_timestamp() - interval '2 days' -
    make_interval(mins => series.i),
  'scheduled',
  clock_timestamp() - interval '2 days',
  'api-football',
  (8810000 + series.i)::text,
  'NS'
from generate_series(1, 25) as series(i);

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id,
  kickoff_at, status, predictions_locked_at,
  external_provider, external_id, provider_status
) values (
  'fa100000-0000-4000-8000-000000000099',
  '26000000-0000-4000-8000-000000000027',
  120,
  '26000000-0000-4000-8000-000000000103',
  '26000000-0000-4000-8000-000000000104',
  clock_timestamp() - interval '5 minutes',
  'live',
  clock_timestamp() - interval '5 minutes',
  'api-football',
  '8810099',
  '1H'
);

insert into public.sync_runs (
  id, provider, status, sync_kind, started_at, finished_at,
  lease_generation, locked_until
) values
  (
    'fa200000-0000-4000-8000-000000000001',
    'api-football', 'succeeded', 'targeted',
    clock_timestamp() - interval '3 minutes',
    clock_timestamp() - interval '3 minutes',
    9001, clock_timestamp() - interval '2 minutes'
  ),
  (
    'fa200000-0000-4000-8000-000000000002',
    'api-football', 'succeeded', 'catalog',
    clock_timestamp() - interval '2 minutes',
    clock_timestamp() - interval '2 minutes',
    9002, clock_timestamp() - interval '1 minute'
  ),
  (
    'fa200000-0000-4000-8000-000000000003',
    'api-football', 'succeeded', 'reconciliation',
    clock_timestamp() - interval '1 minute',
    clock_timestamp() - interval '1 minute',
    9003, clock_timestamp() - interval '30 seconds'
  );

update public.sync_leases
set run_id = null,
    fencing_token = null,
    locked_until = null,
    backoff_until = null,
    last_forced_at = null,
    last_targeted_at = clock_timestamp() - interval '2 minutes',
    last_catalog_at = clock_timestamp() - interval '13 hours',
    last_reconciliation_at = clock_timestamp() - interval '7 hours'
where provider = 'api-football';

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"fa000000-0000-4000-8000-000000000001"}',
  true
);
create temp table fairness_targeted as
select * from public.claim_sports_sync('api-football', false);
create temp table fairness_targeted_final as
select finalized.*
from fairness_targeted as claim
cross join lateral public.finalize_sports_sync(
  claim.result_run_id,
  claim.result_generation,
  claim.result_token,
  'succeeded', null, null,
  cardinality(claim.result_fixture_ids),
  array[]::text[], 7000, null
) as finalized;

create temp table fairness_catalog as
select * from public.claim_sports_sync('api-football', false);
create temp table fairness_catalog_final as
select finalized.*
from fairness_catalog as claim
cross join lateral public.finalize_sports_sync(
  claim.result_run_id,
  claim.result_generation,
  claim.result_token,
  'succeeded', null, null, 0, array[]::text[], 6996, null
) as finalized;

create temp table fairness_reconciliation as
select * from public.claim_sports_sync('api-football', false);
create temp table fairness_reconciliation_final as
select finalized.*
from fairness_reconciliation as claim
cross join lateral public.finalize_sports_sync(
  claim.result_run_id,
  claim.result_generation,
  claim.result_token,
  'succeeded', null, null, 0, array[]::text[], 6995, null
) as finalized;
reset role;

select results_eq(
  $$select result_sync_kind, cardinality(result_fixture_ids),
           result_fixture_ids[1],
           '8810099' = any(result_fixture_ids)
    from fairness_targeted$$,
  $$values ('targeted'::text, 20, '8810099'::text, true)$$,
  'current live is first and retained when more than twenty stale fixtures compete'
);

select results_eq(
  $$select result_sync_kind, cardinality(result_fixture_ids)
    from fairness_catalog$$,
  $$values ('catalog'::text, 0)$$,
  'overdue catalog is served on the second eligible claim despite constant targeted work'
);

select results_eq(
  $$select result_sync_kind, cardinality(result_fixture_ids)
    from fairness_reconciliation$$,
  $$values ('reconciliation'::text, 0)$$,
  'overdue reconciliation is served within the three-claim fairness bound'
);

select ok(
  (select result_generation from fairness_targeted) <
    (select result_generation from fairness_catalog)
  and (select result_generation from fairness_catalog) <
    (select result_generation from fairness_reconciliation)
  and (select result_token from fairness_targeted) <>
    (select result_token from fairness_catalog)
  and (select result_token from fairness_catalog) <>
    (select result_token from fairness_reconciliation),
  'fair rotation retains monotonic generations and unique fencing tokens'
);

select results_eq(
  $$select result_status::text from fairness_targeted_final
    union all
    select result_status::text from fairness_catalog_final
    union all
    select result_status::text from fairness_reconciliation_final$$,
  $$values ('succeeded'::text), ('succeeded'::text), ('succeeded'::text)$$,
  'each selected plan finalizes through the unchanged fenced contract'
);

create temp table fairness_run_count as
select count(*)::bigint as count from public.sync_runs;

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"fa000000-0000-4000-8000-000000000001"}',
  true
);
create temp table fairness_not_due as
select * from public.claim_sports_sync('api-football', false);
reset role;

select results_eq(
  $$select result_outcome, result_code, result_run_id
    from fairness_not_due$$,
  $$values ('NOT_DUE'::text, 'NOT_DUE'::text, null::uuid)$$,
  'a genuine no-due state returns no work plan'
);

select is(
  (select count(*)::bigint from public.sync_runs),
  (select count from fairness_run_count),
  'genuine NOT_DUE persists no run for the provider orchestrator to call'
);

update public.sync_leases
set last_targeted_at = clock_timestamp() - interval '2 minutes',
    last_catalog_at = clock_timestamp() - interval '13 hours',
    last_reconciliation_at = clock_timestamp() - interval '7 hours',
    backoff_until = clock_timestamp() + interval '5 minutes'
where provider = 'api-football';

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"fa000000-0000-4000-8000-000000000001"}',
  true
);
create temp table fairness_backoff as
select * from public.claim_sports_sync('api-football', false);
reset role;

select results_eq(
  $$select result_outcome, result_code, result_run_id
    from fairness_backoff$$,
  $$values ('NOT_DUE'::text, 'PROVIDER_BACKOFF'::text, null::uuid)$$,
  'fair selection never bypasses durable provider backoff'
);

select is(
  (select count(*)::bigint from public.sync_runs),
  (select count from fairness_run_count),
  'provider backoff also persists no run'
);

select * from finish();
rollback;
