-- W1 review hardening: preserve the reveal latch for manually owned matches and
-- prevent a future provider kickoff from erasing an already elapsed boundary.

create function private.lock_api_football_cancellation_state(
  p_external_id text,
  p_incoming_kickoff_at timestamptz
)
returns table (
  result_locks_predictions boolean,
  result_latch_changed boolean
)
language plpgsql
set search_path = ''
as $$
declare
  v_match_id uuid;
  v_stored_kickoff_at timestamptz;
  v_predictions_locked_at timestamptz;
  v_is_manually_overridden boolean;
  v_match_found boolean;
  v_at timestamptz;
  v_locks_predictions boolean;
  v_latch_changed boolean := false;
begin
  select
      match.id,
      match.kickoff_at,
      match.predictions_locked_at,
      match.is_manually_overridden
    into
      v_match_id,
      v_stored_kickoff_at,
      v_predictions_locked_at,
      v_is_manually_overridden
    from public.matches as match
    where match.external_provider = 'api-football'
      and match.external_id = p_external_id
    for update;
  v_match_found := found;

  v_at := clock_timestamp();
  v_locks_predictions := v_predictions_locked_at is not null
    or (v_match_found and v_at >= v_stored_kickoff_at)
    or v_at >= p_incoming_kickoff_at;

  -- The provider apply helper intentionally skips every manually owned match.
  -- Persist only the independent reveal latch here for that case; ordinary and
  -- new provider rows still let the existing helper account for their change.
  if v_match_found
     and v_is_manually_overridden
     and v_locks_predictions
     and v_predictions_locked_at is null then
    update public.matches as match
    set predictions_locked_at = v_at,
        updated_at = v_at
    where match.id = v_match_id;
    v_latch_changed := true;
  end if;

  return query select v_locks_predictions, v_latch_changed;
end;
$$;

revoke all on function private.lock_api_football_cancellation_state(text, timestamptz)
  from public, anon, authenticated, service_role;

comment on function private.lock_api_football_cancellation_state(text, timestamptz) is
  'Locks an existing API-Football match, samples fresh wall time, derives cancellation visibility, and persists only a manual-row latch that the provider helper must otherwise skip.';

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
  v_locks_predictions boolean;
  v_latch_changed boolean;
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

    v_kickoff_at := (v_fixture ->> 'kickoffAt')::timestamptz;
    if v_fixture ->> 'providerStatus' in ('CANC', 'ABD', 'AWD', 'WO') then
      select decision.result_locks_predictions, decision.result_latch_changed
        into v_locks_predictions, v_latch_changed
      from private.lock_api_football_cancellation_state(
        v_fixture ->> 'externalId',
        v_kickoff_at
      ) as decision;
      v_fixture := jsonb_set(
        v_fixture,
        '{locksPredictions}',
        to_jsonb(v_locks_predictions)
      );
      if v_latch_changed then
        update public.sync_runs as run
        set matches_changed = run.matches_changed + 1
        where run.id = p_run_id;
        v_matches_changed := v_matches_changed + 1;
      end if;
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
         and v_at < v_match.kickoff_at
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
            predictions_locked_at = case
              when match.predictions_locked_at is not null then match.predictions_locked_at
              when v_at >= match.kickoff_at then v_at
              else null
            end,
            updated_at = case
              when match.provider_status is distinct from v_fixture ->> 'providerStatus'
                or (match.predictions_locked_at is null and v_at >= match.kickoff_at)
                then v_at
              else match.updated_at
            end
        where match.id = v_match.id
          and (
            match.provider_status is distinct from v_fixture ->> 'providerStatus'
            or (match.predictions_locked_at is null and v_at >= match.kickoff_at)
          );
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

drop function private.lock_api_football_cancellation(text, timestamptz);

comment on function public.apply_api_football_sync_batch(uuid, bigint, uuid, jsonb) is
  'Validates and fences a bounded API-Football batch, derives cancellation visibility under the match lock, preserves a manual-row latch, and reactivates only before both stored and incoming kickoff boundaries.';
