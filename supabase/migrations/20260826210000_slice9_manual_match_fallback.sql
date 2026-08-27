-- Slice 9 DEF-003: make the deterministic Manual catalog persistable and add
-- one narrow system-administrator boundary for creating/correcting matches.
-- Browser roles keep read-only catalog grants; both mutations remain behind
-- the fixed server-only system-actor gateway.

-- The Slice 7 placeholder could only write skipped/MANUAL_PROVIDER. Once the
-- real bounded persistence boundary exists, retaining that callable would
-- leave two contradictory Manual entry points.
drop function public.record_sync_attempt();

create function private.slice9_system_actor_from_request()
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_text text;
  v_headers jsonb := '{}'::jsonb;
begin
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
     or v_actor_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
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

  return v_actor_id;
end;
$$;

revoke all on function private.slice9_system_actor_from_request()
  from public, anon, authenticated, service_role;

comment on function private.slice9_system_actor_from_request() is
  'Returns the fixed server-supplied system actor only while that principal remains in system_admins. It has no Data API grant.';

create function private.slice9_manual_fixture_insert_is_safe(
  p_status public.match_status,
  p_kickoff_at timestamptz,
  p_at timestamptz
)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select
    pg_catalog.isfinite(p_kickoff_at)
    and pg_catalog.isfinite(p_at)
    and p_status in ('scheduled', 'postponed', 'canceled')
    and p_at < p_kickoff_at;
$$;

revoke all on function private.slice9_manual_fixture_insert_is_safe(
  public.match_status, timestamptz, timestamptz
) from public, anon, authenticated, service_role;

comment on function private.slice9_manual_fixture_insert_is_safe(
  public.match_status, timestamptz, timestamptz
) is
  'Pure explicit-time predicate used by the bounded Manual catalog to reject recreation of past fixtures without an irreversible latch.';

create function private.slice9_apply_manual_fixture_catalog_core(
  p_payload jsonb,
  p_actor_id uuid,
  p_explicit_decision_at timestamptz
)
returns table (
  result_run_id uuid,
  result_status public.sync_status,
  result_code text,
  result_started_at timestamptz,
  result_finished_at timestamptz,
  result_rows_inserted integer,
  result_teams_changed integer,
  result_matches_changed integer
)
language plpgsql
set search_path = ''
as $$
declare
  v_started_at timestamptz;
  v_mutation_at timestamptz;
  v_finished_at timestamptz;
  v_expected jsonb;
  v_run_id uuid := extensions.gen_random_uuid();
  v_teams_changed integer := 0;
  v_matches_changed integer := 0;
  v_row_count integer := 0;
  v_conflict boolean := false;
begin
  if p_actor_id is null or not exists (
    select 1
    from public.system_admins as administrator
    where administrator.user_id = p_actor_id
  ) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if p_explicit_decision_at is not null
     and not pg_catalog.isfinite(p_explicit_decision_at) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  -- This path performs no I/O and is deliberately serialized as one short
  -- transaction. It must never become a session lock or an external queue.
  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  -- Revalidate and retain the trusted actor through the transaction after a
  -- possible advisory-lock wait. A concurrent grant removal must finish first
  -- or wait until this invocation has completed.
  perform administrator.user_id
  from public.system_admins as administrator
  where administrator.user_id = p_actor_id
  for key share;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  -- Lifecycle owns leagues before matches. Lock every affected league in
  -- UUID order first, then the catalog teams and matches deterministically.
  -- This keeps completion and Manual import on one global lock order.
  perform league.id
  from public.leagues as league
  where league.season_id = '26000000-0000-4000-8000-000000000027'::uuid
  order by league.id
  for update;

  perform team.id
  from public.teams as team
  where team.id in (
    '26000000-0000-4000-8000-000000000101'::uuid,
    '26000000-0000-4000-8000-000000000102'::uuid,
    '26000000-0000-4000-8000-000000000103'::uuid,
    '26000000-0000-4000-8000-000000000104'::uuid,
    '26000000-0000-4000-8000-000000000105'::uuid,
    '26000000-0000-4000-8000-000000000106'::uuid
  )
  order by team.id
  for update;

  perform match.id
  from public.matches as match
  where match.id in (
    '26000000-0000-4000-8000-000000000201'::uuid,
    '26000000-0000-4000-8000-000000000202'::uuid,
    '26000000-0000-4000-8000-000000000203'::uuid,
    '26000000-0000-4000-8000-000000000204'::uuid,
    '26000000-0000-4000-8000-000000000205'::uuid
  )
  order by match.id
  for update;

  -- This timestamp is observability metadata only. Mutation safety takes a
  -- second fresh database timestamp after the bounded preflight below.
  v_started_at := clock_timestamp();

  v_expected := jsonb_build_object(
    'catalogId', 'manual-catalog-v1',
    'competitionId', '26000000-0000-4000-8000-000000000001',
    'seasonId', '26000000-0000-4000-8000-000000000027',
    'teams', jsonb_build_array(
      jsonb_build_object(
        'id', '26000000-0000-4000-8000-000000000101',
        'name', 'הפועל תל אביב', 'shortName', 'הפועל תל אביב'
      ),
      jsonb_build_object(
        'id', '26000000-0000-4000-8000-000000000102',
        'name', 'מכבי תל אביב', 'shortName', 'מכבי תל אביב'
      ),
      jsonb_build_object(
        'id', '26000000-0000-4000-8000-000000000103',
        'name', 'בית״ר ירושלים', 'shortName', 'בית״ר'
      ),
      jsonb_build_object(
        'id', '26000000-0000-4000-8000-000000000104',
        'name', 'הפועל חיפה', 'shortName', 'הפועל חיפה'
      ),
      jsonb_build_object(
        'id', '26000000-0000-4000-8000-000000000105',
        'name', 'מ.ס. אשדוד', 'shortName', 'אשדוד'
      ),
      jsonb_build_object(
        'id', '26000000-0000-4000-8000-000000000106',
        'name', 'הפועל באר שבע', 'shortName', 'באר שבע'
      )
    ),
    'matches', jsonb_build_array(
      jsonb_build_object(
        'id', '26000000-0000-4000-8000-000000000201',
        'seasonId', '26000000-0000-4000-8000-000000000027',
        'roundNumber', 1,
        'homeTeamId', '26000000-0000-4000-8000-000000000101',
        'awayTeamId', '26000000-0000-4000-8000-000000000102',
        'kickoffAt', '2026-10-17T16:00:00.000Z',
        'status', 'scheduled', 'homeScore', null, 'awayScore', null
      ),
      jsonb_build_object(
        'id', '26000000-0000-4000-8000-000000000202',
        'seasonId', '26000000-0000-4000-8000-000000000027',
        'roundNumber', 1,
        'homeTeamId', '26000000-0000-4000-8000-000000000103',
        'awayTeamId', '26000000-0000-4000-8000-000000000104',
        'kickoffAt', '2026-10-17T18:30:00.000Z',
        'status', 'scheduled', 'homeScore', null, 'awayScore', null
      ),
      jsonb_build_object(
        'id', '26000000-0000-4000-8000-000000000203',
        'seasonId', '26000000-0000-4000-8000-000000000027',
        'roundNumber', 1,
        'homeTeamId', '26000000-0000-4000-8000-000000000105',
        'awayTeamId', '26000000-0000-4000-8000-000000000106',
        'kickoffAt', '2026-10-18T17:00:00.000Z',
        'status', 'scheduled', 'homeScore', null, 'awayScore', null
      ),
      jsonb_build_object(
        'id', '26000000-0000-4000-8000-000000000204',
        'seasonId', '26000000-0000-4000-8000-000000000027',
        'roundNumber', 2,
        'homeTeamId', '26000000-0000-4000-8000-000000000101',
        'awayTeamId', '26000000-0000-4000-8000-000000000103',
        'kickoffAt', '2026-10-24T16:00:00.000Z',
        'status', 'postponed', 'homeScore', null, 'awayScore', null
      ),
      jsonb_build_object(
        'id', '26000000-0000-4000-8000-000000000205',
        'seasonId', '26000000-0000-4000-8000-000000000027',
        'roundNumber', 2,
        'homeTeamId', '26000000-0000-4000-8000-000000000102',
        'awayTeamId', '26000000-0000-4000-8000-000000000105',
        'kickoffAt', '2026-10-24T18:30:00.000Z',
        'status', 'canceled', 'homeScore', null, 'awayScore', null
      )
    )
  );

  if p_payload is distinct from v_expected then
    v_conflict := true;
  end if;

  if not v_conflict and not exists (
    select 1
    from public.competitions as competition
    where competition.id = '26000000-0000-4000-8000-000000000001'::uuid
      and competition.external_provider is null
      and competition.external_id is null
  ) then
    v_conflict := true;
  end if;

  if not v_conflict and not exists (
    select 1
    from public.seasons as season
    where season.id = '26000000-0000-4000-8000-000000000027'::uuid
      and season.competition_id = '26000000-0000-4000-8000-000000000001'::uuid
      and season.external_provider is null
      and season.external_id is null
  ) then
    v_conflict := true;
  end if;

  if not v_conflict and exists (
    select 1
    from public.teams as team
    where team.id in (
      '26000000-0000-4000-8000-000000000101'::uuid,
      '26000000-0000-4000-8000-000000000102'::uuid,
      '26000000-0000-4000-8000-000000000103'::uuid,
      '26000000-0000-4000-8000-000000000104'::uuid,
      '26000000-0000-4000-8000-000000000105'::uuid,
      '26000000-0000-4000-8000-000000000106'::uuid
    )
      and not (
        exists (
          select 1
          from (
            values
              ('26000000-0000-4000-8000-000000000101'::uuid, 'הפועל תל אביב'::text, 'הפועל תל אביב'::text),
              ('26000000-0000-4000-8000-000000000102'::uuid, 'מכבי תל אביב'::text, 'מכבי תל אביב'::text),
              ('26000000-0000-4000-8000-000000000103'::uuid, 'בית״ר ירושלים'::text, 'בית״ר'::text),
              ('26000000-0000-4000-8000-000000000104'::uuid, 'הפועל חיפה'::text, 'הפועל חיפה'::text),
              ('26000000-0000-4000-8000-000000000105'::uuid, 'מ.ס. אשדוד'::text, 'אשדוד'::text),
              ('26000000-0000-4000-8000-000000000106'::uuid, 'הפועל באר שבע'::text, 'באר שבע'::text)
          ) as expected_team(id, name, short_name)
          where expected_team.id = team.id
            and team.name is not distinct from expected_team.name
            and team.short_name is not distinct from expected_team.short_name
        )
        and team.logo_url is null
        and team.external_provider is null
        and team.external_id is null
      )
  ) then
    v_conflict := true;
  end if;

  -- Before S9-REQ-001 freezes the included match set, an import may replay an
  -- exact terminal-season catalog but must never fill a missing team/match.
  if not v_conflict
     and exists (
       select 1 from public.leagues as league
       where league.season_id = '26000000-0000-4000-8000-000000000027'::uuid
         and league.status in ('completed', 'archived')
     )
     and (
       (
         select count(*) from public.teams as team
         where team.id in (
           '26000000-0000-4000-8000-000000000101'::uuid,
           '26000000-0000-4000-8000-000000000102'::uuid,
           '26000000-0000-4000-8000-000000000103'::uuid,
           '26000000-0000-4000-8000-000000000104'::uuid,
           '26000000-0000-4000-8000-000000000105'::uuid,
           '26000000-0000-4000-8000-000000000106'::uuid
         )
       ) <> 6
       or (
         select count(*) from public.matches as match
         where match.id in (
           '26000000-0000-4000-8000-000000000201'::uuid,
           '26000000-0000-4000-8000-000000000202'::uuid,
           '26000000-0000-4000-8000-000000000203'::uuid,
           '26000000-0000-4000-8000-000000000204'::uuid,
           '26000000-0000-4000-8000-000000000205'::uuid
         )
       ) <> 5
     ) then
    v_conflict := true;
  end if;

  if not v_conflict and exists (
    select 1
    from public.matches as match
    where match.id in (
      '26000000-0000-4000-8000-000000000201'::uuid,
      '26000000-0000-4000-8000-000000000202'::uuid,
      '26000000-0000-4000-8000-000000000203'::uuid,
      '26000000-0000-4000-8000-000000000204'::uuid,
      '26000000-0000-4000-8000-000000000205'::uuid
    )
      and not (
        (match.id, match.round_number, match.home_team_id, match.away_team_id, match.kickoff_at, match.status) in (
          ('26000000-0000-4000-8000-000000000201'::uuid, 1::smallint, '26000000-0000-4000-8000-000000000101'::uuid, '26000000-0000-4000-8000-000000000102'::uuid, '2026-10-17T16:00:00Z'::timestamptz, 'scheduled'::public.match_status),
          ('26000000-0000-4000-8000-000000000202'::uuid, 1::smallint, '26000000-0000-4000-8000-000000000103'::uuid, '26000000-0000-4000-8000-000000000104'::uuid, '2026-10-17T18:30:00Z'::timestamptz, 'scheduled'::public.match_status),
          ('26000000-0000-4000-8000-000000000203'::uuid, 1::smallint, '26000000-0000-4000-8000-000000000105'::uuid, '26000000-0000-4000-8000-000000000106'::uuid, '2026-10-18T17:00:00Z'::timestamptz, 'scheduled'::public.match_status),
          ('26000000-0000-4000-8000-000000000204'::uuid, 2::smallint, '26000000-0000-4000-8000-000000000101'::uuid, '26000000-0000-4000-8000-000000000103'::uuid, '2026-10-24T16:00:00Z'::timestamptz, 'postponed'::public.match_status),
          ('26000000-0000-4000-8000-000000000205'::uuid, 2::smallint, '26000000-0000-4000-8000-000000000102'::uuid, '26000000-0000-4000-8000-000000000105'::uuid, '2026-10-24T18:30:00Z'::timestamptz, 'canceled'::public.match_status)
        )
        and match.season_id = '26000000-0000-4000-8000-000000000027'::uuid
        and match.home_score is null
        and match.away_score is null
        and match.result_version = 0
        and not match.is_manually_overridden
        and match.provider_round_label is null
        and match.provider_status is null
        and match.predictions_locked_at is null
        and match.external_provider is null
        and match.external_id is null
      )
  ) then
    v_conflict := true;
  end if;

  -- Production calls sample fresh database time immediately before the
  -- terminal branch. Only the owner-only core accepts a finite explicit time,
  -- preserving permanent deterministic pgTAP coverage without a public clock.
  v_mutation_at := coalesce(p_explicit_decision_at, clock_timestamp());
  if not v_conflict and exists (
    select 1
    from (
      values
        ('26000000-0000-4000-8000-000000000201'::uuid, 'scheduled'::public.match_status, '2026-10-17T16:00:00Z'::timestamptz),
        ('26000000-0000-4000-8000-000000000202'::uuid, 'scheduled'::public.match_status, '2026-10-17T18:30:00Z'::timestamptz),
        ('26000000-0000-4000-8000-000000000203'::uuid, 'scheduled'::public.match_status, '2026-10-18T17:00:00Z'::timestamptz),
        ('26000000-0000-4000-8000-000000000204'::uuid, 'postponed'::public.match_status, '2026-10-24T16:00:00Z'::timestamptz),
        ('26000000-0000-4000-8000-000000000205'::uuid, 'canceled'::public.match_status, '2026-10-24T18:30:00Z'::timestamptz)
    ) as expected_match(id, status, kickoff_at)
    left join public.matches as match on match.id = expected_match.id
    where match.id is null
      and not private.slice9_manual_fixture_insert_is_safe(
        expected_match.status,
        expected_match.kickoff_at,
        v_mutation_at
      )
  ) then
    v_conflict := true;
  end if;

  if v_conflict then
    v_finished_at := greatest(v_started_at, clock_timestamp());

    insert into public.sync_runs (
      id, provider, status, sync_kind, started_at, finished_at,
      fixtures_seen, rows_inserted, teams_changed, matches_changed,
      results_changed, manual_overrides_skipped, operator_notes,
      error_code, error_message_safe
    ) values (
      v_run_id, 'manual', 'failed', 'manual', v_started_at, v_finished_at,
      5, 0, 0, 0, 0, 0, '{}'::text[],
      'MANUAL_CATALOG_CONFLICT',
      'The deterministic Manual catalog conflicts with stored data.'
    );

    return query select
      v_run_id, 'failed'::public.sync_status, 'MANUAL_CATALOG_CONFLICT'::text,
      v_started_at, v_finished_at, 0, 0, 0;
    return;
  end if;

  insert into public.teams (id, name, short_name)
  values
    ('26000000-0000-4000-8000-000000000101', 'הפועל תל אביב', 'הפועל תל אביב'),
    ('26000000-0000-4000-8000-000000000102', 'מכבי תל אביב', 'מכבי תל אביב'),
    ('26000000-0000-4000-8000-000000000103', 'בית״ר ירושלים', 'בית״ר'),
    ('26000000-0000-4000-8000-000000000104', 'הפועל חיפה', 'הפועל חיפה'),
    ('26000000-0000-4000-8000-000000000105', 'מ.ס. אשדוד', 'אשדוד'),
    ('26000000-0000-4000-8000-000000000106', 'הפועל באר שבע', 'באר שבע')
  on conflict (id) do nothing;
  get diagnostics v_teams_changed = row_count;

  insert into public.matches (
    id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status
  ) values
    ('26000000-0000-4000-8000-000000000201', '26000000-0000-4000-8000-000000000027', 1, '26000000-0000-4000-8000-000000000101', '26000000-0000-4000-8000-000000000102', '2026-10-17T16:00:00Z', 'scheduled'),
    ('26000000-0000-4000-8000-000000000202', '26000000-0000-4000-8000-000000000027', 1, '26000000-0000-4000-8000-000000000103', '26000000-0000-4000-8000-000000000104', '2026-10-17T18:30:00Z', 'scheduled'),
    ('26000000-0000-4000-8000-000000000203', '26000000-0000-4000-8000-000000000027', 1, '26000000-0000-4000-8000-000000000105', '26000000-0000-4000-8000-000000000106', '2026-10-18T17:00:00Z', 'scheduled'),
    ('26000000-0000-4000-8000-000000000204', '26000000-0000-4000-8000-000000000027', 2, '26000000-0000-4000-8000-000000000101', '26000000-0000-4000-8000-000000000103', '2026-10-24T16:00:00Z', 'postponed'),
    ('26000000-0000-4000-8000-000000000205', '26000000-0000-4000-8000-000000000027', 2, '26000000-0000-4000-8000-000000000102', '26000000-0000-4000-8000-000000000105', '2026-10-24T18:30:00Z', 'canceled')
  on conflict (id) do nothing;
  get diagnostics v_matches_changed = row_count;

  v_row_count := v_teams_changed + v_matches_changed;

  if v_row_count > 0 then
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, metadata
    ) values (
      p_actor_id,
      'manual_catalog_applied',
      'sports_catalog',
      '26000000-0000-4000-8000-000000000027'::uuid,
      jsonb_build_object(
        'catalog_id', 'manual-catalog-v1',
        'teams_inserted', v_teams_changed,
        'matches_inserted', v_matches_changed
      )
    );
  end if;

  v_finished_at := greatest(v_started_at, clock_timestamp());

  insert into public.sync_runs (
    id, provider, status, sync_kind, started_at, finished_at,
    fixtures_seen, rows_inserted, teams_changed, matches_changed,
    results_changed, manual_overrides_skipped, operator_notes,
    error_code, error_message_safe
  ) values (
    v_run_id, 'manual', 'succeeded', 'manual', v_started_at, v_finished_at,
    5, v_row_count, v_teams_changed, v_matches_changed,
    0, 0, '{}'::text[], null, null
  );

  return query select
    v_run_id,
    'succeeded'::public.sync_status,
    case when v_row_count > 0 then 'MANUAL_APPLIED' else 'MANUAL_NO_CHANGE' end,
    v_started_at,
    v_finished_at,
    v_row_count,
    v_teams_changed,
    v_matches_changed;
end;
$$;

revoke all on function private.slice9_apply_manual_fixture_catalog_core(
  jsonb, uuid, timestamptz
) from public, anon, authenticated, service_role;

comment on function private.slice9_apply_manual_fixture_catalog_core(
  jsonb, uuid, timestamptz
) is
  'Owner-only full Manual catalog transaction. It revalidates the actor, owns lifecycle locks/preflight/run/audit/inserts, and accepts finite explicit decision time only for deterministic database tests.';

create function public.apply_manual_fixture_catalog(p_payload jsonb)
returns table (
  result_run_id uuid,
  result_status public.sync_status,
  result_code text,
  result_started_at timestamptz,
  result_finished_at timestamptz,
  result_rows_inserted integer,
  result_teams_changed integer,
  result_matches_changed integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := private.slice9_system_actor_from_request();

  return query
  select result.*
  from private.slice9_apply_manual_fixture_catalog_core(
    p_payload,
    v_actor_id,
    null::timestamptz
  ) as result;
end;
$$;

revoke all on function public.apply_manual_fixture_catalog(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_manual_fixture_catalog(jsonb)
  to service_role;

comment on function public.apply_manual_fixture_catalog(jsonb) is
  'Validates the exact bounded manual-catalog-v1 manifest, preflights ID-based conflicts, inserts only missing synthetic rows, and records exactly one terminal sync run without display-name merging or provider identity.';

create function public.create_or_correct_match(
  p_operation text,
  p_match_id uuid,
  p_season_id uuid,
  p_home_team_id uuid,
  p_away_team_id uuid,
  p_round_number numeric,
  p_kickoff_at timestamptz,
  p_status public.match_status,
  p_home_score numeric,
  p_away_score numeric
)
returns table (
  result_match_id uuid,
  result_status public.match_status,
  result_home_score smallint,
  result_away_score smallint,
  result_version integer,
  result_created boolean,
  result_changed boolean,
  result_manual_override boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_match public.matches%rowtype;
  v_scored record;
  v_at timestamptz;
  v_home_score smallint;
  v_away_score smallint;
  v_has_prediction boolean;
  v_identity_changed boolean;
  v_definition_changed boolean;
  v_metadata_changed boolean;
  v_result_invalidated boolean;
  v_effectively_locked boolean;
  v_target_latch timestamptz;
  v_predictions_reset integer := 0;
  v_row_count integer := 0;
  v_changed boolean := false;
  v_exists boolean := false;
  v_snapshot_exists boolean := false;
  v_match_season_snapshot uuid;
begin
  v_actor_id := private.slice9_system_actor_from_request();

  if p_operation is null
     or p_operation not in ('create', 'correct')
     or p_match_id is null
     or p_season_id is null
     or p_home_team_id is null
     or p_away_team_id is null
     or p_home_team_id = p_away_team_id
     or p_round_number is null
     or p_round_number <> trunc(p_round_number)
     or p_round_number not between 1 and 1000
     or p_kickoff_at is null
     or not pg_catalog.isfinite(p_kickoff_at)
     or p_status is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  if p_status = 'finished' then
    if p_home_score is null
       or p_away_score is null
       or p_home_score <> trunc(p_home_score)
       or p_away_score <> trunc(p_away_score)
       or p_home_score not between 0 and 30
       or p_away_score not between 0 and 30 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
    end if;
    v_home_score := p_home_score::smallint;
    v_away_score := p_away_score::smallint;
  elsif p_home_score is not null or p_away_score is not null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  if not exists (
    select 1 from public.seasons as season where season.id = p_season_id
  ) or not exists (
    select 1 from public.teams as team where team.id = p_home_team_id
  ) or not exists (
    select 1 from public.teams as team where team.id = p_away_team_id
  ) then
    raise exception using errcode = 'P0001', message = 'MATCH_NOT_FOUND';
  end if;

  select match.season_id into v_match_season_snapshot
  from public.matches as match
  where match.id = p_match_id;
  v_snapshot_exists := found;

  perform league.id
  from public.leagues as league
  where league.season_id = p_season_id
     or league.season_id = v_match_season_snapshot
  order by league.id
  for update;

  select match.* into v_match
  from public.matches as match
  where match.id = p_match_id
  for update;
  v_exists := found;
  if v_exists is distinct from v_snapshot_exists
     or (
       v_exists
       and v_match.season_id is distinct from v_match_season_snapshot
     ) then
    raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
  end if;
  v_at := clock_timestamp();

  if p_operation = 'create' then
    if v_exists then
      if v_match.external_provider is null
         and v_match.external_id is null
         and v_match.season_id = p_season_id
         and v_match.round_number = p_round_number::smallint
         and v_match.home_team_id = p_home_team_id
         and v_match.away_team_id = p_away_team_id
         and v_match.kickoff_at = p_kickoff_at
         and v_match.status = p_status
         and v_match.home_score is not distinct from v_home_score
         and v_match.away_score is not distinct from v_away_score
         and v_match.is_manually_overridden then
        return query select
          v_match.id, v_match.status, v_match.home_score, v_match.away_score,
          v_match.result_version, false, false, true;
        return;
      end if;
      raise exception using errcode = 'P0001', message = 'MANUAL_MATCH_CONFLICT';
    end if;

    -- Frozen completion snapshots arrive in S9-REQ-001. Until then, adding a
    -- fixture to a completed/archived season would silently change its set.
    if exists (
      select 1 from public.leagues as league
      where league.season_id = p_season_id
        and league.status in ('completed', 'archived')
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'COMPLETED_RECONCILIATION_REQUIRED';
    end if;

    if p_status in ('scheduled', 'postponed') and v_at >= p_kickoff_at then
      raise exception using errcode = 'P0001', message = 'UNSAFE_STATUS_REGRESSION';
    end if;
    if p_status in ('live', 'finished') and v_at < p_kickoff_at then
      raise exception using errcode = 'P0001', message = 'MATCH_NOT_STARTED';
    end if;

    v_target_latch := case
      when p_status in ('live', 'finished') then v_at
      when p_status = 'canceled' and v_at >= p_kickoff_at then v_at
      else null
    end;

    insert into public.matches (
      id, season_id, round_number, home_team_id, away_team_id, kickoff_at,
      status, home_score, away_score, result_version,
      is_manually_overridden, predictions_locked_at
    ) values (
      p_match_id, p_season_id, p_round_number::smallint,
      p_home_team_id, p_away_team_id, p_kickoff_at,
      p_status, v_home_score, v_away_score,
      case when p_status in ('finished', 'canceled') then 1 else 0 end,
      true, v_target_latch
    ) returning * into v_match;

    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, metadata
    ) values (
      v_actor_id, 'match_manually_created', 'match', p_match_id,
      jsonb_build_object(
        'source', 'manual-match',
        'season_id', p_season_id,
        'home_team_id', p_home_team_id,
        'away_team_id', p_away_team_id,
        'round_number', p_round_number::smallint,
        'kickoff_at', p_kickoff_at,
        'status', p_status,
        'home_score', v_home_score,
        'away_score', v_away_score,
        'result_version', v_match.result_version
      )
    );

    return query select
      v_match.id, v_match.status, v_match.home_score, v_match.away_score,
      v_match.result_version, true, true, true;
    return;
  end if;

  if not v_exists then
    raise exception using errcode = 'P0001', message = 'MATCH_NOT_FOUND';
  end if;

  if v_match.season_id = p_season_id
     and v_match.round_number = p_round_number::smallint
     and v_match.home_team_id = p_home_team_id
     and v_match.away_team_id = p_away_team_id
     and v_match.kickoff_at = p_kickoff_at
     and v_match.status = p_status
     and v_match.home_score is not distinct from v_home_score
     and v_match.away_score is not distinct from v_away_score
     and v_match.is_manually_overridden then
    return query select
      v_match.id, v_match.status, v_match.home_score, v_match.away_score,
      v_match.result_version, false, false, true;
    return;
  end if;

  -- Until the Slice 9 lifecycle/reconciliation migration is installed, fail
  -- closed rather than silently mutating any terminal league.
  if exists (
    select 1 from public.leagues as league
    where league.season_id in (v_match.season_id, p_season_id)
      and league.status in ('completed', 'archived')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COMPLETED_RECONCILIATION_REQUIRED';
  end if;

  v_effectively_locked :=
    v_match.predictions_locked_at is not null or v_at >= v_match.kickoff_at;
  v_identity_changed :=
    v_match.season_id is distinct from p_season_id
    or v_match.home_team_id is distinct from p_home_team_id
    or v_match.away_team_id is distinct from p_away_team_id;
  select exists (
    select 1 from public.predictions as prediction
    where prediction.match_id = p_match_id
  ) into v_has_prediction;

  if v_identity_changed and (v_has_prediction or v_effectively_locked) then
    raise exception using errcode = 'P0001', message = 'MATCH_IDENTITY_LOCKED';
  end if;
  if v_match.kickoff_at is distinct from p_kickoff_at
     and v_effectively_locked then
    raise exception using errcode = 'P0001', message = 'UNSAFE_STATUS_REGRESSION';
  end if;
  if p_status in ('scheduled', 'postponed')
     and (v_at >= p_kickoff_at or v_effectively_locked) then
    raise exception using errcode = 'P0001', message = 'UNSAFE_STATUS_REGRESSION';
  end if;
  if p_status in ('live', 'finished') and v_at < p_kickoff_at then
    raise exception using errcode = 'P0001', message = 'MATCH_NOT_STARTED';
  end if;

  v_target_latch := v_match.predictions_locked_at;
  if v_target_latch is null and (
    p_status in ('live', 'finished')
    or (p_status = 'canceled' and (v_effectively_locked or v_at >= p_kickoff_at))
  ) then
    v_target_latch := v_at;
  end if;

  v_definition_changed :=
    v_match.season_id is distinct from p_season_id
    or v_match.round_number is distinct from p_round_number::smallint
    or v_match.home_team_id is distinct from p_home_team_id
    or v_match.away_team_id is distinct from p_away_team_id
    or v_match.kickoff_at is distinct from p_kickoff_at;
  v_metadata_changed :=
    v_definition_changed
    or v_match.predictions_locked_at is distinct from v_target_latch;

  if v_metadata_changed then
    update public.matches as match
    set season_id = p_season_id,
        round_number = p_round_number::smallint,
        home_team_id = p_home_team_id,
        away_team_id = p_away_team_id,
        kickoff_at = p_kickoff_at,
        predictions_locked_at = v_target_latch,
        updated_at = v_at
    where match.id = p_match_id;
    v_changed := true;
  end if;

  if p_status in ('finished', 'canceled') then
    select * into strict v_scored
    from private.score_match(
      p_match_id,
      p_status,
      v_home_score,
      v_away_score,
      true,
      'manual-match'
    );
    v_changed := v_changed
      or v_scored.result_changed
      or not v_match.is_manually_overridden
      or v_scored.predictions_scored > 0;

    if v_definition_changed then
      insert into public.audit_logs (
        actor_id, action, entity_type, entity_id, metadata
      ) values (
        v_actor_id, 'match_definition_corrected', 'match', p_match_id,
        jsonb_build_object(
          'source', 'manual-match',
          'provider_identity_preserved', v_match.external_provider is not null,
          'old', jsonb_build_object(
            'season_id', v_match.season_id,
            'home_team_id', v_match.home_team_id,
            'away_team_id', v_match.away_team_id,
            'round_number', v_match.round_number,
            'kickoff_at', v_match.kickoff_at,
            'status', v_match.status,
            'home_score', v_match.home_score,
            'away_score', v_match.away_score
          ),
          'new', jsonb_build_object(
            'season_id', p_season_id,
            'home_team_id', p_home_team_id,
            'away_team_id', p_away_team_id,
            'round_number', p_round_number::smallint,
            'kickoff_at', p_kickoff_at,
            'status', p_status,
            'home_score', v_home_score,
            'away_score', v_away_score
          )
        )
      );
    end if;

    return query select
      p_match_id, v_scored.result_status, v_scored.result_home_score,
      v_scored.result_away_score, v_scored.result_version,
      false, v_changed, true;
    return;
  end if;

  v_result_invalidated :=
    v_match.status in ('finished', 'canceled')
    or v_match.home_score is not null
    or v_match.away_score is not null;

  update public.matches as match
  set status = p_status,
      home_score = null,
      away_score = null,
      result_version = match.result_version + case when v_result_invalidated then 1 else 0 end,
      is_manually_overridden = true,
      predictions_locked_at = v_target_latch,
      updated_at = v_at
  where match.id = p_match_id
    and (
      match.status is distinct from p_status
      or match.home_score is not null
      or match.away_score is not null
      or not match.is_manually_overridden
      or match.predictions_locked_at is distinct from v_target_latch
    );
  get diagnostics v_row_count = row_count;
  v_changed := v_changed or v_row_count > 0;

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
  v_changed := v_changed or v_predictions_reset > 0;

  if v_changed then
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, metadata
    ) values (
      v_actor_id, 'match_manually_corrected', 'match', p_match_id,
      jsonb_build_object(
        'source', 'manual-match',
        'provider_identity_preserved', v_match.external_provider is not null,
        'old', jsonb_build_object(
          'season_id', v_match.season_id,
          'home_team_id', v_match.home_team_id,
          'away_team_id', v_match.away_team_id,
          'round_number', v_match.round_number,
          'kickoff_at', v_match.kickoff_at,
          'status', v_match.status,
          'home_score', v_match.home_score,
          'away_score', v_match.away_score
        ),
        'new', jsonb_build_object(
          'season_id', p_season_id,
          'home_team_id', p_home_team_id,
          'away_team_id', p_away_team_id,
          'round_number', p_round_number::smallint,
          'kickoff_at', p_kickoff_at,
          'status', p_status,
          'home_score', null,
          'away_score', null
        ),
        'result_invalidated', v_result_invalidated,
        'predictions_reset', v_predictions_reset
      )
    );
  end if;

  select match.* into strict v_match
  from public.matches as match
  where match.id = p_match_id;

  return query select
    v_match.id, v_match.status, v_match.home_score, v_match.away_score,
    v_match.result_version, false, v_changed, v_match.is_manually_overridden;
end;
$$;

revoke all on function public.create_or_correct_match(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) from public, anon, authenticated, service_role;
grant execute on function public.create_or_correct_match(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) to service_role;

comment on function public.create_or_correct_match(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) is
  'Creates or corrects one match for a verified system actor using existing catalog IDs, DB-time transition guards, immutable provider identity, canonical terminal scoring, explicit manual ownership, and idempotent create replay.';
