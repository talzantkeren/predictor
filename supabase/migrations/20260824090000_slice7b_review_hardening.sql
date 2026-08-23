-- Slice 7b review hardening. Keep the already-applied migration immutable and
-- narrow the provider path around product visibility, recovery, and isolation.

alter table public.sync_leases
  add column last_forced_at timestamptz;

comment on column public.sync_leases.last_forced_at is
  'Database timestamp of the latest admitted forced claim; enforces the durable one-minute operator cooldown.';

-- Preserve the proven terminal scoring implementation behind a private helper.
-- The public boundary below adds only the narrowly authorized reactivation path.
alter function public.score_match(
  uuid, public.match_status, numeric, numeric, boolean, text
) set schema private;

revoke all on function private.score_match(
  uuid, public.match_status, numeric, numeric, boolean, text
) from public, anon, authenticated, service_role;

create function public.score_match(
  p_match_id uuid,
  p_status public.match_status,
  p_home_score numeric,
  p_away_score numeric,
  p_is_manual_override boolean,
  p_source text
)
returns table (
  result_match_id uuid,
  result_status public.match_status,
  result_home_score smallint,
  result_away_score smallint,
  result_version integer,
  result_changed boolean,
  predictions_scored integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_text text;
  v_headers jsonb := '{}'::jsonb;
  v_match public.matches%rowtype;
  v_at timestamptz;
  v_result_version integer;
  v_predictions_reset integer := 0;
begin
  if p_status in ('finished', 'canceled') then
    return query
    select *
    from private.score_match(
      p_match_id,
      p_status,
      p_home_score,
      p_away_score,
      p_is_manual_override,
      p_source
    );
    return;
  end if;

  begin
    v_headers := coalesce(
      nullif(current_setting('request.headers', true), ''),
      '{}'
    )::jsonb;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end;

  v_actor_text := v_headers ->> 'x-predictor-system-actor';
  if v_actor_text is null
     or v_actor_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  v_actor_id := v_actor_text::uuid;
  if not exists (
    select 1
    from public.system_admins as administrator
    where administrator.user_id = v_actor_id
  ) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if p_status not in ('scheduled', 'postponed')
     or p_home_score is not null
     or p_away_score is not null
     or p_is_manual_override is distinct from false
     or p_source is distinct from 'api-football' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select match.* into v_match
    from public.matches as match
    where match.id = p_match_id
    for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'MATCH_NOT_FOUND';
  end if;

  v_at := clock_timestamp();
  if v_match.status <> 'canceled'
     or v_match.predictions_locked_at is not null
     or v_match.is_manually_overridden
     or v_at >= v_match.kickoff_at then
    raise exception using errcode = 'P0001', message = 'UNSAFE_STATUS_REGRESSION';
  end if;

  v_result_version := v_match.result_version + 1;
  update public.matches as match
  set status = p_status,
      home_score = null,
      away_score = null,
      result_version = v_result_version,
      is_manually_overridden = false,
      updated_at = v_at
  where match.id = p_match_id;

  update public.predictions as prediction
  set points = 0,
      is_exact = null,
      is_correct_outcome = null,
      scored_at = null,
      scored_result_version = null,
      scored_rule_version = null
  where prediction.match_id = p_match_id
    and (
      prediction.points <> 0
      or prediction.is_exact is not null
      or prediction.is_correct_outcome is not null
      or prediction.scored_at is not null
      or prediction.scored_result_version is not null
      or prediction.scored_rule_version is not null
    );
  get diagnostics v_predictions_reset = row_count;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata
  ) values (
    v_actor_id,
    'match_result_reactivated',
    'match_result',
    p_match_id,
    jsonb_build_object(
      'source', p_source,
      'status', p_status,
      'result_version', v_result_version,
      'result_changed', true,
      'manual_override', false,
      'predictions_reset', v_predictions_reset
    )
  );

  return query select
    p_match_id,
    p_status,
    null::smallint,
    null::smallint,
    v_result_version,
    true,
    v_predictions_reset;
end;
$$;

revoke all on function public.score_match(
  uuid, public.match_status, numeric, numeric, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.score_match(
  uuid, public.match_status, numeric, numeric, boolean, text
) to service_role;

comment on function public.score_match(
  uuid, public.match_status, numeric, numeric, boolean, text
) is
  'Atomically applies terminal results or narrowly reactivates an unlatched future API-Football cancellation while resetting all scoring metadata.';

create or replace function public.claim_sports_sync(
  p_provider text,
  p_force boolean default false
)
returns table (
  result_outcome text,
  result_run_id uuid,
  result_provider text,
  result_sync_kind text,
  result_generation bigint,
  result_token uuid,
  result_locked_until timestamptz,
  result_fixture_ids text[],
  result_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_text text;
  v_headers jsonb := '{}'::jsonb;
  v_lease public.sync_leases%rowtype;
  v_at timestamptz := clock_timestamp();
  v_kind text;
  v_fixture_ids text[] := '{}'::text[];
  v_run_id uuid;
  v_token uuid;
  v_locked_until timestamptz;
begin
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end;

  v_actor_text := v_headers ->> 'x-predictor-system-actor';
  if v_actor_text is null
     or v_actor_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  v_actor_id := v_actor_text::uuid;
  if not exists (
    select 1 from public.system_admins as administrator
    where administrator.user_id = v_actor_id
  ) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if p_provider is distinct from 'api-football' or p_force is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select lease.* into strict v_lease
    from public.sync_leases as lease
    where lease.provider = p_provider
    for update;

  if v_lease.run_id is not null and v_lease.locked_until > v_at then
    insert into public.sync_runs (
      provider, status, sync_kind, started_at, finished_at, error_code
    ) values (
      p_provider, 'skipped',
      coalesce((select run.sync_kind from public.sync_runs as run where run.id = v_lease.run_id), 'targeted'),
      v_at, v_at, 'CONCURRENT_ATTEMPT'
    ) returning id into v_run_id;

    return query select
      'CONCURRENT_ATTEMPT'::text, v_run_id, p_provider,
      null::text, null::bigint, null::uuid, null::timestamptz,
      '{}'::text[], 'CONCURRENT_ATTEMPT'::text;
    return;
  end if;

  if v_lease.run_id is not null then
    update public.sync_runs as run
    set status = 'failed',
        finished_at = v_at,
        error_code = 'LEASE_EXPIRED',
        error_message_safe = 'The previous Sync worker did not finish before its lease expired.'
    where run.id = v_lease.run_id and run.status = 'running';

    update public.sync_leases as lease
    set run_id = null, fencing_token = null, locked_until = null, updated_at = v_at
    where lease.provider = p_provider;
    v_lease.run_id := null;
    v_lease.fencing_token := null;
    v_lease.locked_until := null;
  end if;

  if v_lease.backoff_until is not null and v_lease.backoff_until > v_at then
    return query select
      'NOT_DUE'::text, null::uuid, p_provider, null::text,
      null::bigint, null::uuid, null::timestamptz, '{}'::text[],
      'PROVIDER_BACKOFF'::text;
    return;
  end if;

  if p_force
     and v_lease.last_forced_at is not null
     and v_lease.last_forced_at > v_at - interval '1 minute' then
    return query select
      'NOT_DUE'::text, null::uuid, p_provider, null::text,
      null::bigint, null::uuid, null::timestamptz, '{}'::text[],
      'FORCE_COOLDOWN'::text;
    return;
  end if;

  select coalesce(array_agg(candidate.external_id order by candidate.kickoff_at), '{}'::text[])
    into v_fixture_ids
  from (
    select match.external_id, match.kickoff_at
    from public.matches as match
    where match.external_provider = 'api-football'
      and match.external_id is not null
      and match.status in ('scheduled', 'postponed', 'live')
      and coalesce(match.provider_status, '') not in ('AET', 'PEN')
      and (
        match.status = 'live'
        or match.predictions_locked_at is not null
        or match.kickoff_at between v_at - interval '30 minutes' and v_at + interval '3 hours'
      )
    order by match.kickoff_at
    limit 20
  ) as candidate;

  if p_force then
    v_kind := 'catalog';
    v_fixture_ids := '{}'::text[];
  elsif cardinality(v_fixture_ids) > 0
     and (v_lease.last_targeted_at is null or v_lease.last_targeted_at <= v_at - interval '1 minute') then
    v_kind := 'targeted';
  elsif v_lease.last_catalog_at is null
     or v_lease.last_catalog_at <= v_at - interval '12 hours' then
    v_kind := 'catalog';
    v_fixture_ids := '{}'::text[];
  elsif v_lease.last_reconciliation_at is null
     or v_lease.last_reconciliation_at <= v_at - interval '6 hours' then
    v_kind := 'reconciliation';
    v_fixture_ids := '{}'::text[];
  else
    return query select
      'NOT_DUE'::text, null::uuid, p_provider, null::text,
      null::bigint, null::uuid, null::timestamptz, '{}'::text[],
      'NOT_DUE'::text;
    return;
  end if;

  v_run_id := extensions.gen_random_uuid();
  v_token := extensions.gen_random_uuid();
  v_locked_until := v_at + interval '120 seconds';
  v_lease.generation := v_lease.generation + 1;

  insert into public.sync_runs (
    id, provider, status, sync_kind, started_at,
    lease_generation, locked_until
  ) values (
    v_run_id, p_provider, 'running', v_kind, v_at,
    v_lease.generation, v_locked_until
  );

  update public.sync_leases as lease
  set generation = v_lease.generation,
      run_id = v_run_id,
      fencing_token = v_token,
      locked_until = v_locked_until,
      last_forced_at = case when p_force then v_at else lease.last_forced_at end,
      updated_at = v_at
  where lease.provider = p_provider;

  return query select
    'CLAIMED'::text, v_run_id, p_provider, v_kind,
    v_lease.generation, v_token, v_locked_until, v_fixture_ids,
    null::text;
end;
$$;

revoke all on function public.claim_sports_sync(text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_sports_sync(text, boolean)
  to service_role;

comment on function public.claim_sports_sync(text, boolean) is
  'Atomically authenticates the server actor, enforces backoff and forced-run cooldown, excludes durable review fixtures, and issues a fenced lease without provider I/O.';

-- Keep the original validated batch implementation private. The public wrapper
-- isolates each fixture so one unsafe regression cannot roll back valid peers.
alter function public.apply_api_football_sync_batch(uuid, bigint, uuid, jsonb)
  set schema private;

revoke all on function private.apply_api_football_sync_batch(uuid, bigint, uuid, jsonb)
  from public, anon, authenticated, service_role;

create function public.apply_api_football_sync_batch(
  p_run_id uuid,
  p_generation bigint,
  p_token uuid,
  p_payload jsonb
)
returns table (
  result_rows_inserted integer,
  result_teams_changed integer,
  result_matches_changed integer,
  result_results_changed integer,
  result_manual_overrides_skipped integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fixture jsonb;
  v_fixture_payload jsonb;
  v_match public.matches%rowtype;
  v_applied record;
  v_at timestamptz;
  v_kickoff_at timestamptz;
  v_season_id uuid;
  v_home_team_id uuid;
  v_away_team_id uuid;
  v_rows_inserted integer := 0;
  v_teams_changed integer := 0;
  v_matches_changed integer := 0;
  v_results_changed integer := 0;
  v_manual_skipped integer := 0;
  v_row_changed integer := 0;
  v_note text;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(coalesce(p_payload -> 'fixtures', 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_payload -> 'fixtures') > 50 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select * into strict v_applied
  from private.apply_api_football_sync_batch(
    p_run_id,
    p_generation,
    p_token,
    jsonb_set(p_payload, '{fixtures}', '[]'::jsonb)
  );
  v_rows_inserted := v_rows_inserted + v_applied.result_rows_inserted;
  v_teams_changed := v_teams_changed + v_applied.result_teams_changed;
  v_matches_changed := v_matches_changed + v_applied.result_matches_changed;
  v_results_changed := v_results_changed + v_applied.result_results_changed;
  v_manual_skipped := v_manual_skipped + v_applied.result_manual_overrides_skipped;

  for v_fixture in select value from jsonb_array_elements(p_payload -> 'fixtures') loop
    if char_length(coalesce(v_fixture ->> 'externalId', '')) > 20 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
    end if;
    select match.* into v_match
      from public.matches as match
      where match.external_provider = 'api-football'
        and match.external_id = v_fixture ->> 'externalId';

    v_kickoff_at := (v_fixture ->> 'kickoffAt')::timestamptz;
    if v_fixture ->> 'providerStatus' in ('CANC', 'ABD', 'AWD', 'WO') then
      v_fixture := jsonb_set(
        v_fixture,
        '{locksPredictions}',
        to_jsonb(
          (v_match.predictions_locked_at is not null)
          or clock_timestamp() >= coalesce(v_match.kickoff_at, v_kickoff_at)
          or clock_timestamp() >= v_kickoff_at
        )
      );
    end if;

    v_fixture_payload := jsonb_build_object(
      'competition', null,
      'season', null,
      'teams', jsonb_build_array(),
      'rounds', jsonb_build_array(),
      'fixtures', jsonb_build_array(v_fixture)
    );

    begin
      select * into strict v_applied
      from private.apply_api_football_sync_batch(
        p_run_id, p_generation, p_token, v_fixture_payload
      );
      v_rows_inserted := v_rows_inserted + v_applied.result_rows_inserted;
      v_teams_changed := v_teams_changed + v_applied.result_teams_changed;
      v_matches_changed := v_matches_changed + v_applied.result_matches_changed;
      v_results_changed := v_results_changed + v_applied.result_results_changed;
      v_manual_skipped := v_manual_skipped + v_applied.result_manual_overrides_skipped;
    exception when raise_exception then
      if sqlerrm <> 'UNSAFE_STATUS_REGRESSION' then
        raise;
      end if;

      select match.* into strict v_match
        from public.matches as match
        where match.external_provider = 'api-football'
          and match.external_id = v_fixture ->> 'externalId'
        for update;
      v_at := clock_timestamp();

      if v_match.status = 'canceled'
         and v_fixture ->> 'status' in ('scheduled', 'postponed')
         and v_match.predictions_locked_at is null
         and not v_match.is_manually_overridden
         and v_at < v_kickoff_at then
        select season.id into strict v_season_id
          from public.seasons as season
          where season.external_provider = 'api-football'
            and season.external_id = '2026';
        select team.id into strict v_home_team_id
          from public.teams as team
          where team.external_provider = 'api-football'
            and team.external_id = v_fixture ->> 'homeTeamExternalId';
        select team.id into strict v_away_team_id
          from public.teams as team
          where team.external_provider = 'api-football'
            and team.external_id = v_fixture ->> 'awayTeamExternalId';

        update public.matches as match
        set season_id = v_season_id,
            round_number = (v_fixture ->> 'roundNumber')::smallint,
            provider_round_label = v_fixture ->> 'roundLabel',
            provider_status = v_fixture ->> 'providerStatus',
            home_team_id = v_home_team_id,
            away_team_id = v_away_team_id,
            kickoff_at = v_kickoff_at,
            updated_at = v_at
        where match.id = v_match.id;

        perform *
        from public.score_match(
          v_match.id,
          (v_fixture ->> 'status')::public.match_status,
          null,
          null,
          false,
          'api-football'
        );

        update public.sync_runs as run
        set matches_changed = run.matches_changed + 1,
            results_changed = run.results_changed + 1
        where run.id = p_run_id;
        v_matches_changed := v_matches_changed + 1;
        v_results_changed := v_results_changed + 1;
      else
        update public.matches as match
        set provider_status = v_fixture ->> 'providerStatus',
            updated_at = case
              when match.provider_status is distinct from v_fixture ->> 'providerStatus'
                then v_at
              else match.updated_at
            end
        where match.id = v_match.id
          and match.provider_status is distinct from v_fixture ->> 'providerStatus';
        get diagnostics v_row_changed = row_count;

        v_note := 'UNSAFE_STATUS_REGRESSION:' || (v_fixture ->> 'externalId');
        update public.sync_runs as run
        set matches_changed = run.matches_changed + v_row_changed,
            operator_notes = array[v_note] || array(
              select existing.note
              from (
                select distinct unnest(coalesce(run.operator_notes, '{}'::text[])) as note
              ) as existing
              where existing.note <> v_note
              order by existing.note
              limit 99
            )
        where run.id = p_run_id;
        v_matches_changed := v_matches_changed + v_row_changed;
      end if;
    end;
  end loop;

  -- Re-check the fence at the end of the wrapper transaction as well.
  select * into strict v_applied
  from private.apply_api_football_sync_batch(
    p_run_id,
    p_generation,
    p_token,
    jsonb_build_object(
      'competition', null,
      'season', null,
      'teams', jsonb_build_array(),
      'rounds', jsonb_build_array(),
      'fixtures', jsonb_build_array()
    )
  );

  return query select
    v_rows_inserted,
    v_teams_changed,
    v_matches_changed,
    v_results_changed,
    v_manual_skipped;
end;
$$;

revoke all on function public.apply_api_football_sync_batch(uuid, bigint, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_api_football_sync_batch(uuid, bigint, uuid, jsonb)
  to service_role;

comment on function public.apply_api_football_sync_batch(uuid, bigint, uuid, jsonb) is
  'Validates and fences a bounded API-Football batch, isolates unsafe fixture regressions, derives cancellation visibility from database time, and safely reactivates only unlatched future cancellations.';
