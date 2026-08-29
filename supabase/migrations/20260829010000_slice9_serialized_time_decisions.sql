-- Slice 9 / S9-DEF-002: take every time-dependent invariant inside the critical
-- section that serializes it.
--
-- Three functions decided a time-dependent invariant from a timestamp sampled
-- before the row lock that serializes the decision:
--
--   * public.save_prediction judged the kickoff deadline with transaction-stable
--     now(), so a transaction that started before kickoff and then waited on the
--     match row lock still stored a prediction after kickoff.
--   * public.apply_api_football_sync_batch derived the irreversible cancellation
--     latch from an unlocked pre-read of the match row, so a cancellation
--     observed after kickoff could commit without the latch and let a later
--     reactivation reopen predictions that were already revealed.
--   * public.claim_sports_sync sampled clock_timestamp() in its declare block,
--     before locking the sync lease, so a contender that waited on the lease
--     lock judged due/cooldown state from a stale time and issued a lease that
--     was already shortened or expired.
--
-- Signatures, grants and return shapes are unchanged; only the point at which
-- database time is sampled moves.

create or replace function public.save_prediction(
  p_league_id uuid,
  p_match_id uuid,
  p_predicted_home_score numeric,
  p_predicted_away_score numeric
)
returns table (
  prediction_id uuid,
  league_id uuid,
  match_id uuid,
  predicted_home_score smallint,
  predicted_away_score smallint,
  predicted_outcome public.outcome,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_member_status public.member_status;
  v_league_season_id uuid;
  v_league_status public.league_status;
  v_match_season_id uuid;
  v_match_status public.match_status;
  v_kickoff_at timestamptz;
  v_predictions_locked_at timestamptz;
  v_at timestamptz;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if p_predicted_home_score is null
     or p_predicted_away_score is null
     or p_predicted_home_score <> trunc(p_predicted_home_score)
     or p_predicted_away_score <> trunc(p_predicted_away_score)
     or not (p_predicted_home_score between 0 and 30)
     or not (p_predicted_away_score between 0 and 30) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select league.season_id, league.status
    into v_league_season_id, v_league_status
    from public.leagues as league
    where league.id = p_league_id
    for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select member.status
    into v_member_status
    from public.league_members as member
    where member.league_id = p_league_id
      and member.user_id = v_actor_id
    for update;

  if not found
     or v_member_status <> 'active'
     or not private.is_active_league_member(p_league_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if v_league_status in ('completed', 'archived') then
    raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
  end if;

  select match.season_id, match.status, match.kickoff_at, match.predictions_locked_at
    into v_match_season_id, v_match_status, v_kickoff_at, v_predictions_locked_at
    from public.matches as match
    where match.id = p_match_id
    for update;
  v_at := clock_timestamp();

  if not found or v_match_season_id is distinct from v_league_season_id then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if v_predictions_locked_at is not null
     or v_match_status not in ('scheduled', 'postponed')
     or v_at >= v_kickoff_at then
    raise exception using errcode = 'P0001', message = 'PREDICTION_LOCKED';
  end if;

  return query
  insert into public.predictions as prediction (
    league_id, match_id, user_id, predicted_home_score, predicted_away_score
  ) values (
    p_league_id, p_match_id, v_actor_id,
    p_predicted_home_score::smallint, p_predicted_away_score::smallint
  )
  on conflict on constraint predictions_league_match_user_key do update
  set predicted_home_score = excluded.predicted_home_score,
      predicted_away_score = excluded.predicted_away_score
  returning
    prediction.id, prediction.league_id, prediction.match_id,
    prediction.predicted_home_score, prediction.predicted_away_score,
    prediction.predicted_outcome, prediction.created_at, prediction.updated_at;
end;
$$;

revoke all on function public.save_prediction(uuid, uuid, numeric, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.save_prediction(uuid, uuid, numeric, numeric)
  to authenticated;

comment on function public.save_prediction(uuid, uuid, numeric, numeric) is
  'Creates or replaces the caller prediction only before database kickoff and before the irreversible provider-observed lock latch. The kickoff deadline is sampled from wall-clock database time after the match row lock.';

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
  v_at timestamptz;
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
  v_at := clock_timestamp();

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
  'Atomically authenticates the server actor, enforces backoff and forced-run cooldown, excludes durable review fixtures, and issues a fenced lease without provider I/O. Due, cooldown and lease windows are judged from wall-clock database time sampled after the lease row lock.';

create or replace function private.apply_api_football_sync_batch(
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
  v_actor_id uuid;
  v_actor_text text;
  v_headers jsonb := '{}'::jsonb;
  v_lease public.sync_leases%rowtype;
  v_run public.sync_runs%rowtype;
  v_at timestamptz;
  v_rows_inserted integer := 0;
  v_teams_changed integer := 0;
  v_matches_changed integer := 0;
  v_results_changed integer := 0;
  v_manual_skipped integer := 0;
  v_competition_id uuid;
  v_season_id uuid;
  v_home_team_id uuid;
  v_away_team_id uuid;
  v_match public.matches%rowtype;
  v_existing_id uuid;
  v_team jsonb;
  v_round jsonb;
  v_fixture jsonb;
  v_status public.match_status;
  v_kickoff_at timestamptz;
  v_locks_predictions boolean;
  v_result_disposition text;
  v_home_score smallint;
  v_away_score smallint;
  v_result_changed boolean;
  v_metadata_changed boolean;
  v_match_existed boolean;
  v_fixture_at timestamptz;
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

  if p_run_id is null or p_generation is null or p_generation < 1
     or p_token is null or p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(coalesce(p_payload -> 'teams', 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payload -> 'rounds', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payload -> 'fixtures', 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_payload -> 'teams') > 20
     or jsonb_array_length(coalesce(p_payload -> 'rounds', '[]'::jsonb)) > 100
     or jsonb_array_length(p_payload -> 'fixtures') > 50 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select lease.* into strict v_lease
    from public.sync_leases as lease
    where lease.provider = 'api-football'
    for update;
  select run.* into v_run
    from public.sync_runs as run
    where run.id = p_run_id
    for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'STALE_SYNC_LEASE';
  end if;
  v_at := clock_timestamp();

  if v_run.provider <> 'api-football' or v_run.status <> 'running'
     or v_lease.run_id is distinct from p_run_id
     or v_lease.generation is distinct from p_generation
     or v_lease.fencing_token is distinct from p_token
     or v_lease.locked_until is null or v_lease.locked_until <= v_at then
    raise exception using errcode = 'P0001', message = 'STALE_SYNC_LEASE';
  end if;

  if p_payload -> 'competition' is not null
     and p_payload -> 'competition' <> 'null'::jsonb then
    if jsonb_typeof(p_payload -> 'competition') <> 'object'
       or p_payload #>> '{competition,externalId}' <> '383'
       or coalesce(p_payload #>> '{competition,name}', '') <> btrim(coalesce(p_payload #>> '{competition,name}', ''))
       or char_length(coalesce(p_payload #>> '{competition,name}', '')) not between 2 and 100
       or coalesce(p_payload #>> '{competition,slug}', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
       or coalesce(p_payload #>> '{competition,countryCode}', '') !~ '^[A-Z]{2}$' then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
    end if;

    select competition.id into v_existing_id
      from public.competitions as competition
      where competition.external_provider = 'api-football'
        and competition.external_id = '383';
    if v_existing_id is null then v_rows_inserted := v_rows_inserted + 1; end if;

    insert into public.competitions as competition (
      name, slug, country_code, external_provider, external_id, updated_at
    ) values (
      p_payload #>> '{competition,name}',
      p_payload #>> '{competition,slug}',
      p_payload #>> '{competition,countryCode}',
      'api-football', '383', v_at
    )
    on conflict (external_provider, external_id)
      where external_provider is not null and external_id is not null
    do update set
      name = excluded.name,
      country_code = excluded.country_code,
      updated_at = case
        when competition.name is distinct from excluded.name
          or competition.country_code is distinct from excluded.country_code
          then excluded.updated_at
        else competition.updated_at
      end
    returning competition.id into v_competition_id;
  else
    select competition.id into v_competition_id
      from public.competitions as competition
      where competition.external_provider = 'api-football'
        and competition.external_id = '383';
  end if;

  if p_payload -> 'season' is not null and p_payload -> 'season' <> 'null'::jsonb then
    if v_competition_id is null
       or jsonb_typeof(p_payload -> 'season') <> 'object'
       or p_payload #>> '{season,externalId}' <> '2026'
       or char_length(coalesce(p_payload #>> '{season,name}', '')) not between 2 and 30
       or coalesce(p_payload #>> '{season,isCurrent}', '') not in ('true', 'false') then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
    end if;

    select season.id into v_existing_id
      from public.seasons as season
      where season.external_provider = 'api-football'
        and season.external_id = '2026';
    if v_existing_id is null then v_rows_inserted := v_rows_inserted + 1; end if;

    insert into public.seasons as season (
      competition_id, name, starts_on, ends_on, is_current,
      external_provider, external_id, updated_at
    ) values (
      v_competition_id,
      p_payload #>> '{season,name}',
      (p_payload #>> '{season,startsOn}')::date,
      (p_payload #>> '{season,endsOn}')::date,
      (p_payload #>> '{season,isCurrent}')::boolean,
      'api-football', '2026', v_at
    )
    on conflict (external_provider, external_id)
      where external_provider is not null and external_id is not null
    do update set
      competition_id = excluded.competition_id,
      name = excluded.name,
      starts_on = excluded.starts_on,
      ends_on = excluded.ends_on,
      is_current = excluded.is_current,
      updated_at = case
        when season.competition_id is distinct from excluded.competition_id
          or season.name is distinct from excluded.name
          or season.starts_on is distinct from excluded.starts_on
          or season.ends_on is distinct from excluded.ends_on
          or season.is_current is distinct from excluded.is_current
          then excluded.updated_at
        else season.updated_at
      end
    returning season.id into v_season_id;
  else
    select season.id into v_season_id
      from public.seasons as season
      where season.external_provider = 'api-football'
        and season.external_id = '2026';
  end if;

  for v_team in select value from jsonb_array_elements(p_payload -> 'teams') loop
    if jsonb_typeof(v_team) <> 'object'
       or coalesce(v_team ->> 'externalId', '') !~ '^[1-9][0-9]*$'
       or char_length(coalesce(v_team ->> 'name', '')) not between 2 and 100
       or coalesce(v_team ->> 'name', '') <> btrim(coalesce(v_team ->> 'name', ''))
       or char_length(coalesce(v_team ->> 'shortName', '')) not between 2 and 30 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
    end if;

    select team.id into v_existing_id
      from public.teams as team
      where team.external_provider = 'api-football'
        and team.external_id = v_team ->> 'externalId';
    if v_existing_id is null then
      v_rows_inserted := v_rows_inserted + 1;
      v_teams_changed := v_teams_changed + 1;
    elsif exists (
      select 1 from public.teams as team
      where team.id = v_existing_id
        and (team.name is distinct from v_team ->> 'name'
          or team.short_name is distinct from v_team ->> 'shortName')
    ) then
      v_teams_changed := v_teams_changed + 1;
    end if;

    insert into public.teams as team (
      name, short_name, external_provider, external_id, updated_at
    ) values (
      v_team ->> 'name', v_team ->> 'shortName',
      'api-football', v_team ->> 'externalId', v_at
    )
    on conflict (external_provider, external_id)
      where external_provider is not null and external_id is not null
    do update set
      name = excluded.name,
      short_name = excluded.short_name,
      updated_at = case
        when team.name is distinct from excluded.name
          or team.short_name is distinct from excluded.short_name
          then excluded.updated_at
        else team.updated_at
      end;
  end loop;

  if jsonb_array_length(coalesce(p_payload -> 'rounds', '[]'::jsonb)) > 0
     and v_season_id is null then
    raise exception using errcode = 'P0001', message = 'SYNC_CATALOG_MISSING';
  end if;

  for v_round in
    select value from jsonb_array_elements(coalesce(p_payload -> 'rounds', '[]'::jsonb))
  loop
    if jsonb_typeof(v_round) <> 'object'
       or char_length(coalesce(v_round ->> 'label', '')) not between 1 and 100
       or coalesce(v_round ->> 'label', '') <> btrim(coalesce(v_round ->> 'label', ''))
       or coalesce(v_round ->> 'requiresReview', '') not in ('true', 'false')
       or (
         (v_round ->> 'requiresReview')::boolean
         and v_round -> 'roundNumber' is distinct from 'null'::jsonb
       )
       or (
         not (v_round ->> 'requiresReview')::boolean
         and (
           jsonb_typeof(v_round -> 'roundNumber') is distinct from 'number'
           or (v_round ->> 'roundNumber')::numeric <> trunc((v_round ->> 'roundNumber')::numeric)
           or (v_round ->> 'roundNumber')::numeric not between 1 and 32767
         )
       ) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
    end if;

    select round.id into v_existing_id
      from public.sports_provider_rounds as round
      where round.season_id = v_season_id
        and round.provider = 'api-football'
        and round.provider_label = v_round ->> 'label';
    if v_existing_id is null then v_rows_inserted := v_rows_inserted + 1; end if;

    insert into public.sports_provider_rounds as round (
      season_id, provider, provider_label, round_number,
      requires_review, updated_at
    ) values (
      v_season_id,
      'api-football',
      v_round ->> 'label',
      case when (v_round ->> 'requiresReview')::boolean
        then null
        else (v_round ->> 'roundNumber')::smallint
      end,
      (v_round ->> 'requiresReview')::boolean,
      v_at
    )
    on conflict on constraint sports_provider_rounds_identity_key do update
    set round_number = excluded.round_number,
        requires_review = excluded.requires_review,
        updated_at = case
          when round.round_number is distinct from excluded.round_number
            or round.requires_review is distinct from excluded.requires_review
            then excluded.updated_at
          else round.updated_at
        end;
  end loop;

  if jsonb_array_length(p_payload -> 'fixtures') > 0 and v_season_id is null then
    raise exception using errcode = 'P0001', message = 'SYNC_CATALOG_MISSING';
  end if;

  for v_fixture in select value from jsonb_array_elements(p_payload -> 'fixtures') loop
    v_metadata_changed := false;
    v_match_existed := false;
    if jsonb_typeof(v_fixture) <> 'object'
       or coalesce(v_fixture ->> 'externalId', '') !~ '^[1-9][0-9]*$'
       or coalesce(v_fixture ->> 'homeTeamExternalId', '') !~ '^[1-9][0-9]*$'
       or coalesce(v_fixture ->> 'awayTeamExternalId', '') !~ '^[1-9][0-9]*$'
       or v_fixture ->> 'homeTeamExternalId' = v_fixture ->> 'awayTeamExternalId'
       or coalesce(v_fixture ->> 'roundNumber', '') !~ '^[1-9][0-9]*$'
       or (v_fixture ->> 'roundNumber')::integer > 32767
       or char_length(coalesce(v_fixture ->> 'roundLabel', '')) not between 1 and 100
       or coalesce(v_fixture ->> 'providerStatus', '') !~ '^[A-Z0-9]{1,10}$'
       or coalesce(v_fixture ->> 'status', '') not in ('scheduled', 'live', 'postponed', 'finished', 'canceled')
       or coalesce(v_fixture ->> 'resultDisposition', '') not in ('none', 'official', 'review')
       or coalesce(v_fixture ->> 'locksPredictions', '') not in ('true', 'false') then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
    end if;

    v_status := (v_fixture ->> 'status')::public.match_status;
    v_kickoff_at := (v_fixture ->> 'kickoffAt')::timestamptz;
    v_locks_predictions := (v_fixture ->> 'locksPredictions')::boolean;
    v_result_disposition := v_fixture ->> 'resultDisposition';

    if v_status = 'finished' and v_result_disposition = 'official' then
      if jsonb_typeof(v_fixture -> 'homeScore') is distinct from 'number'
         or jsonb_typeof(v_fixture -> 'awayScore') is distinct from 'number'
         or (v_fixture ->> 'homeScore')::numeric <> trunc((v_fixture ->> 'homeScore')::numeric)
         or (v_fixture ->> 'awayScore')::numeric <> trunc((v_fixture ->> 'awayScore')::numeric)
         or (v_fixture ->> 'homeScore')::numeric not between 0 and 30
         or (v_fixture ->> 'awayScore')::numeric not between 0 and 30 then
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
      v_home_score := (v_fixture ->> 'homeScore')::smallint;
      v_away_score := (v_fixture ->> 'awayScore')::smallint;
    elsif v_status = 'finished' and v_result_disposition = 'review' then
      if not v_locks_predictions
         or v_fixture -> 'homeScore' is distinct from 'null'::jsonb
         or v_fixture -> 'awayScore' is distinct from 'null'::jsonb then
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
      v_home_score := null;
      v_away_score := null;
    else
      if v_result_disposition <> 'none'
         or v_fixture -> 'homeScore' is distinct from 'null'::jsonb
         or v_fixture -> 'awayScore' is distinct from 'null'::jsonb then
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;
      v_home_score := null;
      v_away_score := null;
    end if;

    select team.id into v_home_team_id
      from public.teams as team
      where team.external_provider = 'api-football'
        and team.external_id = v_fixture ->> 'homeTeamExternalId';
    select team.id into v_away_team_id
      from public.teams as team
      where team.external_provider = 'api-football'
        and team.external_id = v_fixture ->> 'awayTeamExternalId';
    if v_home_team_id is null or v_away_team_id is null then
      raise exception using errcode = 'P0001', message = 'SYNC_CATALOG_MISSING';
    end if;

    select match.* into v_match
      from public.matches as match
      where match.external_provider = 'api-football'
        and match.external_id = v_fixture ->> 'externalId'
      for update;
    v_match_existed := found;
    v_fixture_at := clock_timestamp();

    -- The cancellation latch is an invariant, so it is decided here, inside the
    -- critical section that already holds the match row lock, from wall-clock
    -- database time rather than from an unlocked pre-read.
    if v_status = 'canceled' then
      v_locks_predictions :=
        (v_match_existed and v_match.predictions_locked_at is not null)
        or v_fixture_at >= coalesce(v_match.kickoff_at, v_kickoff_at)
        or v_fixture_at >= v_kickoff_at;
    end if;

    if v_match_existed and v_match.is_manually_overridden then
      v_manual_skipped := v_manual_skipped + 1;
      continue;
    end if;

    if v_match_existed and (
      (v_match.status in ('finished', 'canceled') and v_status not in ('finished', 'canceled'))
      or (v_match.status = 'live' and v_status = 'scheduled')
    ) then
      raise exception using errcode = 'P0001', message = 'UNSAFE_STATUS_REGRESSION';
    end if;

    if not v_match_existed then
      insert into public.matches (
        season_id, round_number, provider_round_label,
        provider_status,
        home_team_id, away_team_id, kickoff_at, status,
        predictions_locked_at, external_provider, external_id, updated_at
      ) values (
        v_season_id, (v_fixture ->> 'roundNumber')::smallint,
        v_fixture ->> 'roundLabel', v_fixture ->> 'providerStatus',
        v_home_team_id, v_away_team_id,
        v_kickoff_at,
        case
          when v_status in ('finished', 'canceled') then 'scheduled'::public.match_status
          else v_status
        end,
        case when v_locks_predictions then v_at else null end,
        'api-football', v_fixture ->> 'externalId', v_at
      ) returning * into v_match;
      v_rows_inserted := v_rows_inserted + 1;
      v_matches_changed := v_matches_changed + 1;
    else
      v_metadata_changed :=
        v_match.season_id is distinct from v_season_id
        or v_match.round_number is distinct from (v_fixture ->> 'roundNumber')::smallint
        or v_match.provider_round_label is distinct from v_fixture ->> 'roundLabel'
        or v_match.provider_status is distinct from v_fixture ->> 'providerStatus'
        or v_match.home_team_id is distinct from v_home_team_id
        or v_match.away_team_id is distinct from v_away_team_id
        or v_match.kickoff_at is distinct from v_kickoff_at
        or (v_status not in ('finished', 'canceled') and v_match.status is distinct from v_status)
        or (v_locks_predictions and v_match.predictions_locked_at is null);

      update public.matches as match
      set season_id = v_season_id,
          round_number = (v_fixture ->> 'roundNumber')::smallint,
          provider_round_label = v_fixture ->> 'roundLabel',
          provider_status = v_fixture ->> 'providerStatus',
          home_team_id = v_home_team_id,
          away_team_id = v_away_team_id,
          kickoff_at = v_kickoff_at,
          status = case
            when v_status in ('finished', 'canceled') then match.status
            else v_status
          end,
          home_score = case
            when v_status in ('finished', 'canceled') then match.home_score
            else null
          end,
          away_score = case
            when v_status in ('finished', 'canceled') then match.away_score
            else null
          end,
          predictions_locked_at = case
            when match.predictions_locked_at is not null then match.predictions_locked_at
            when v_locks_predictions then v_at
            else null
          end,
          updated_at = case when v_metadata_changed then v_at else match.updated_at end
      where match.id = v_match.id;
      if v_metadata_changed then v_matches_changed := v_matches_changed + 1; end if;
    end if;

    if (v_status = 'finished' and v_result_disposition = 'official')
       or v_status = 'canceled' then
      select scored.result_changed into v_result_changed
      from public.score_match(
        v_match.id,
        v_status,
        v_home_score,
        v_away_score,
        false,
        'api-football'
      ) as scored;
      if v_result_changed then
        v_results_changed := v_results_changed + 1;
        if v_match_existed and not v_metadata_changed then
          v_matches_changed := v_matches_changed + 1;
        end if;
      end if;
    end if;
  end loop;

  if clock_timestamp() >= v_lease.locked_until then
    raise exception using errcode = 'P0001', message = 'STALE_SYNC_LEASE';
  end if;

  update public.sync_runs as run
  set rows_inserted = run.rows_inserted + v_rows_inserted,
      teams_changed = run.teams_changed + v_teams_changed,
      matches_changed = run.matches_changed + v_matches_changed,
      results_changed = run.results_changed + v_results_changed,
      manual_overrides_skipped = run.manual_overrides_skipped + v_manual_skipped
  where run.id = p_run_id;

  return query select
    v_rows_inserted, v_teams_changed, v_matches_changed,
    v_results_changed, v_manual_skipped;
end;
$$;

revoke all on function private.apply_api_football_sync_batch(uuid, bigint, uuid, jsonb)
  from public, anon, authenticated, service_role;

comment on function private.apply_api_football_sync_batch(uuid, bigint, uuid, jsonb) is
  'Validated and fenced API-Football batch writer. Derives the irreversible cancellation latch under the match row lock from wall-clock database time.';

create or replace function public.apply_api_football_sync_batch(
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
    -- The cancellation latch used to be derived here from an unlocked read.
    -- private.apply_api_football_sync_batch now derives it under the match row
    -- lock, so this wrapper no longer pre-reads the row or pre-decides the latch.
    v_kickoff_at := (v_fixture ->> 'kickoffAt')::timestamptz;

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
  'Validates and fences a bounded API-Football batch, isolates unsafe fixture regressions, delegates the cancellation latch to the locked private writer, and safely reactivates only unlatched future cancellations.';
