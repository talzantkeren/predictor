-- Slice 7b: API-Football provider-owned catalog, durable lease/fencing,
-- bounded atomic apply, and an irreversible prediction-lock latch.

comment on type public.sync_status is
  'Sync lifecycle states for terminal manual attempts and durable live-provider lease runs.';

alter table public.seasons
  add column external_provider text,
  add column external_id text,
  add constraint seasons_external_identity_check check (
    (external_provider is null and external_id is null)
    or (external_provider is not null and external_id is not null)
  );

create unique index seasons_external_identity_key
  on public.seasons (external_provider, external_id)
  where external_provider is not null and external_id is not null;

create table public.sports_provider_rounds (
  id uuid primary key default extensions.gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  provider text not null,
  provider_label text not null,
  round_number smallint,
  requires_review boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_provider_rounds_provider_check check (provider = 'api-football'),
  constraint sports_provider_rounds_label_check check (
    provider_label = btrim(provider_label)
    and char_length(provider_label) between 1 and 100
  ),
  constraint sports_provider_rounds_number_check check (
    round_number is null or round_number > 0
  ),
  constraint sports_provider_rounds_review_shape_check check (
    (requires_review and round_number is null)
    or (not requires_review and round_number is not null)
  ),
  constraint sports_provider_rounds_identity_key unique (
    season_id, provider, provider_label
  )
);

create index sports_provider_rounds_review_idx
  on public.sports_provider_rounds (season_id, requires_review)
  where requires_review;

comment on table public.sports_provider_rounds is
  'Lossless provider round/stage catalog. Unknown stage labels remain review-only and never receive an invented UI round number.';

alter table public.sports_provider_rounds enable row level security;
revoke all on table public.sports_provider_rounds
  from public, anon, authenticated, service_role;

alter table public.matches
  add column provider_round_label text,
  add column provider_status text,
  add column predictions_locked_at timestamptz,
  add constraint matches_provider_round_label_check check (
    provider_round_label is null
    or (
      provider_round_label = btrim(provider_round_label)
      and char_length(provider_round_label) between 1 and 100
    )
  ),
  add constraint matches_provider_status_check check (
    provider_status is null
    or (
      provider_status = btrim(provider_status)
      and char_length(provider_status) between 1 and 10
      and provider_status ~ '^[A-Z0-9]+$'
    )
  );

comment on column public.matches.provider_round_label is
  'Exact provider round/stage label. round_number remains the compatible UI grouping key.';
comment on column public.matches.provider_status is
  'Last validated provider status code, including review-only terminal codes that are not automatic official results.';
comment on column public.matches.predictions_locked_at is
  'Irreversible provider-observed start latch. Once set, automatic schedule changes cannot reopen predictions.';

create function private.prevent_prediction_lock_reopen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.predictions_locked_at is not null
     and new.predictions_locked_at is null then
    raise exception using errcode = 'P0001', message = 'PREDICTIONS_ALREADY_LOCKED';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_prediction_lock_reopen()
  from public, anon, authenticated, service_role;

create trigger matches_prevent_prediction_lock_reopen
before update of predictions_locked_at on public.matches
for each row execute function private.prevent_prediction_lock_reopen();

alter table public.sync_runs
  add column sync_kind text not null default 'manual',
  add column lease_generation bigint,
  add column locked_until timestamptz,
  add column rows_inserted integer not null default 0,
  add column teams_changed integer not null default 0,
  add column manual_overrides_skipped integer not null default 0,
  add column quota_remaining integer,
  add column operator_notes text[] not null default '{}'::text[],
  add constraint sync_runs_sync_kind_check check (
    sync_kind in ('manual', 'catalog', 'targeted', 'reconciliation')
  ),
  add constraint sync_runs_lease_metadata_check check (
    (provider = 'api-football' and status = 'running'
      and lease_generation is not null and locked_until is not null)
    or status <> 'running'
  ),
  add constraint sync_runs_extended_counts_check check (
    rows_inserted >= 0
    and teams_changed >= 0
    and manual_overrides_skipped >= 0
    and (quota_remaining is null or quota_remaining >= 0)
  ),
  add constraint sync_runs_operator_notes_check check (
    cardinality(operator_notes) <= 100
  );

comment on table public.sync_runs is
  'Append-only operational history for authorized manual attempts and fenced API-Football runs.';

comment on column public.sync_runs.sync_kind is
  'Bounded work plan selected by the database due planner.';
comment on column public.sync_runs.operator_notes is
  'Sanitized bounded operational codes only; never raw provider payloads or headers.';

create table public.sync_leases (
  provider text primary key,
  generation bigint not null default 0,
  run_id uuid references public.sync_runs(id) on delete restrict,
  fencing_token uuid,
  locked_until timestamptz,
  last_catalog_at timestamptz,
  last_targeted_at timestamptz,
  last_reconciliation_at timestamptz,
  backoff_until timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  constraint sync_leases_provider_check check (provider = 'api-football'),
  constraint sync_leases_generation_check check (generation >= 0),
  constraint sync_leases_active_shape_check check (
    (run_id is null and fencing_token is null and locked_until is null)
    or (run_id is not null and fencing_token is not null and locked_until is not null)
  )
);

comment on table public.sync_leases is
  'Server-only durable row lease. The monotonic generation and random token fence stale workers across Data API requests.';

alter table public.sync_leases enable row level security;
revoke all on table public.sync_leases
  from public, anon, authenticated, service_role;

insert into public.sync_leases (provider) values ('api-football');

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

  if not found or v_match_season_id is distinct from v_league_season_id then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if v_predictions_locked_at is not null
     or v_match_status not in ('scheduled', 'postponed')
     or now() >= v_kickoff_at then
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
  'Creates or replaces the caller prediction only before database kickoff and before the irreversible provider-observed lock latch.';

drop policy predictions_authorized_read on public.predictions;
create policy predictions_authorized_read
  on public.predictions for select to authenticated
  using (
    private.is_active_league_member(league_id)
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.matches as match
        where match.id = match_id
          and (now() >= match.kickoff_at or match.predictions_locked_at is not null)
      )
    )
  );

create function public.claim_sports_sync(
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

  if v_lease.backoff_until is not null and v_lease.backoff_until > v_at and not p_force then
    return query select
      'NOT_DUE'::text, null::uuid, p_provider, null::text,
      null::bigint, null::uuid, null::timestamptz, '{}'::text[],
      'PROVIDER_BACKOFF'::text;
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
  'Atomically authenticates the server actor, reclaims expired work, selects bounded due work, and issues a 120-second monotonic fencing lease. It performs no provider I/O.';

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

revoke all on function public.apply_api_football_sync_batch(uuid, bigint, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_api_football_sync_batch(uuid, bigint, uuid, jsonb)
  to service_role;

comment on function public.apply_api_football_sync_batch(uuid, bigint, uuid, jsonb) is
  'Validates one bounded API-Football batch, fences it at transaction start and end, mutates provider-owned rows only, preserves manual overrides, and invokes score_match atomically for terminal results.';

create function public.finalize_sports_sync(
  p_run_id uuid,
  p_generation bigint,
  p_token uuid,
  p_status text,
  p_error_code text,
  p_error_message_safe text,
  p_fixtures_seen integer,
  p_operator_notes text[],
  p_quota_remaining integer,
  p_retry_after_seconds integer default null
)
returns table (
  result_run_id uuid,
  result_status public.sync_status,
  result_code text,
  result_finished_at timestamptz
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

  if p_run_id is null or p_generation is null or p_generation < 1 or p_token is null
     or p_status not in ('succeeded', 'failed')
     or p_fixtures_seen is null or p_fixtures_seen < 0
     or p_fixtures_seen > 1000
     or p_operator_notes is null or cardinality(p_operator_notes) > 100
     or exists (
       select 1 from unnest(p_operator_notes) as note
       where note is null or char_length(note) not between 2 and 100
         or note !~ '^[A-Z0-9_:-]+$'
     )
     or (p_quota_remaining is not null and p_quota_remaining < 0)
     or (p_retry_after_seconds is not null and p_retry_after_seconds not between 0 and 3600)
     or (p_status = 'succeeded' and (p_error_code is not null or p_error_message_safe is not null))
     or (p_status = 'failed' and (
       p_error_code is null or p_error_code !~ '^[A-Z][A-Z0-9_]{1,63}$'
       or p_error_message_safe is null
       or p_error_message_safe <> btrim(p_error_message_safe)
       or char_length(p_error_message_safe) not between 1 and 500
     )) then
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

  update public.sync_runs as run
  set status = p_status::public.sync_status,
      finished_at = v_at,
      fixtures_seen = p_fixtures_seen,
      error_code = p_error_code,
      error_message_safe = p_error_message_safe,
      quota_remaining = p_quota_remaining,
      operator_notes = array(
        select distinct note
        from unnest(run.operator_notes || p_operator_notes) as note
        order by note
        limit 100
      )
  where run.id = p_run_id;

  update public.sync_leases as lease
  set run_id = null,
      fencing_token = null,
      locked_until = null,
      last_catalog_at = case
        when p_status = 'succeeded' and v_run.sync_kind = 'catalog' then v_at
        else lease.last_catalog_at
      end,
      last_targeted_at = case
        when p_status = 'succeeded' and v_run.sync_kind = 'targeted' then v_at
        else lease.last_targeted_at
      end,
      last_reconciliation_at = case
        when p_status = 'succeeded' and v_run.sync_kind = 'reconciliation' then v_at
        else lease.last_reconciliation_at
      end,
      backoff_until = case
        when p_status = 'failed' and p_error_code = 'PROVIDER_RATE_LIMITED'
          then v_at + make_interval(secs => coalesce(p_retry_after_seconds, 60))
        when p_status = 'succeeded' then null
        else lease.backoff_until
      end,
      updated_at = v_at
  where lease.provider = 'api-football';

  if clock_timestamp() >= v_lease.locked_until then
    raise exception using errcode = 'P0001', message = 'STALE_SYNC_LEASE';
  end if;

  return query select
    p_run_id, p_status::public.sync_status, p_error_code, v_at;
end;
$$;

revoke all on function public.finalize_sports_sync(
  uuid, bigint, uuid, text, text, text, integer, text[], integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_sports_sync(
  uuid, bigint, uuid, text, text, text, integer, text[], integer, integer
) to service_role;

comment on function public.finalize_sports_sync(
  uuid, bigint, uuid, text, text, text, integer, text[], integer, integer
) is
  'Fenced terminal transition for an API-Football run. Updates due/backoff metadata and releases the lease atomically.';

create or replace view public.league_leaderboard
with (security_invoker = true)
as
with member_totals as (
  select
    member.league_id,
    member.user_id,
    coalesce(profile.display_name, 'משתתף') as display_name,
    coalesce(sum(prediction.points) filter (
      where match.kickoff_at <= now() or match.predictions_locked_at is not null
    ), 0)::bigint as total_points,
    count(prediction.id) filter (
      where (match.kickoff_at <= now() or match.predictions_locked_at is not null)
        and prediction.is_correct_outcome is true
    )::bigint as correct_outcomes,
    count(prediction.id) filter (
      where (match.kickoff_at <= now() or match.predictions_locked_at is not null)
        and prediction.is_exact is true
    )::bigint as exact_scores,
    count(prediction.id) filter (
      where match.kickoff_at <= now() or match.predictions_locked_at is not null
    )::bigint as predictions_submitted
  from public.league_members as member
  left join public.profiles as profile on profile.id = member.user_id
  left join public.predictions as prediction
    on prediction.league_id = member.league_id and prediction.user_id = member.user_id
  left join public.matches as match on match.id = prediction.match_id
  where member.status = 'active'
  group by member.league_id, member.user_id, profile.display_name
)
select
  totals.league_id, totals.user_id, totals.display_name,
  totals.total_points, totals.correct_outcomes, totals.exact_scores,
  totals.predictions_submitted,
  rank() over (
    partition by totals.league_id
    order by totals.total_points desc, totals.correct_outcomes desc
  ) as rank
from member_totals as totals;

revoke all on table public.league_leaderboard
  from public, anon, authenticated, service_role;
grant select on table public.league_leaderboard to authenticated;

comment on view public.league_leaderboard is
  'RLS-preserving active-member standings. Provider-observed lock latches prevent schedule corrections from hiding already revealed predictions.';
