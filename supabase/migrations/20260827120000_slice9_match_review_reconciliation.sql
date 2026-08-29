-- Slice 9 lifecycle review and reconciliation. All canonical result writers
-- share one scorer: active leagues are overwritten deterministically while a
-- completed snapshot receives durable, explicit reconciliation work.

create or replace function private.score_match(
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
  v_request_headers jsonb := '{}'::jsonb;
  v_match public.matches%rowtype;
  v_result_home_score smallint;
  v_result_away_score smallint;
  v_result_changed boolean;
  v_override_changed boolean;
  v_result_version integer;
  v_scored_count integer := 0;
  v_at timestamptz;
begin
  begin
    v_request_headers := coalesce(
      nullif(current_setting('request.headers', true), ''),
      '{}'
    )::jsonb;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end;

  v_actor_text := v_request_headers ->> 'x-predictor-system-actor';
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

  if p_status is null
     or p_status not in ('finished', 'canceled')
     or p_is_manual_override is null
     or p_source is null
     or p_source <> btrim(p_source)
     or char_length(p_source) not between 2 and 50
     or p_source !~ '^[a-z][a-z0-9_-]+$' then
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
    v_result_home_score := p_home_score::smallint;
    v_result_away_score := p_away_score::smallint;
  elsif p_home_score is not null or p_away_score is not null then
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
  if p_status = 'finished' and v_at < v_match.kickoff_at then
    raise exception using errcode = 'P0001', message = 'MATCH_NOT_STARTED';
  end if;

  v_result_changed :=
    v_match.status is distinct from p_status
    or v_match.home_score is distinct from v_result_home_score
    or v_match.away_score is distinct from v_result_away_score;
  v_override_changed :=
    v_match.is_manually_overridden is distinct from p_is_manual_override;
  v_result_version := v_match.result_version
    + case when v_result_changed then 1 else 0 end;

  if v_result_changed or v_override_changed then
    update public.matches as match
    set status = p_status,
        home_score = v_result_home_score,
        away_score = v_result_away_score,
        result_version = v_result_version,
        is_manually_overridden = p_is_manual_override,
        updated_at = v_at
    where match.id = p_match_id;
  end if;

  if exists (
    select 1
    from public.predictions as prediction
    join public.leagues as league on league.id = prediction.league_id
    left join public.league_scoring_rules as rules
      on rules.league_id = prediction.league_id
    where prediction.match_id = p_match_id
      and league.status not in ('completed', 'archived')
      and rules.league_id is null
  ) then
    raise exception using errcode = 'P0001', message = 'SCORING_RULES_MISSING';
  end if;

  with calculated_scores as (
    select
      prediction.id,
      case
        when p_status = 'canceled' then 0::smallint
        when prediction.predicted_home_score = v_result_home_score
         and prediction.predicted_away_score = v_result_away_score
          then rules.exact_points
        when prediction.predicted_outcome = case
          when v_result_home_score > v_result_away_score
            then 'HOME'::public.outcome
          when v_result_home_score < v_result_away_score
            then 'AWAY'::public.outcome
          else 'DRAW'::public.outcome
        end then rules.correct_outcome_points
        else rules.incorrect_points
      end as calculated_points,
      case
        when p_status = 'canceled' then false
        else prediction.predicted_home_score = v_result_home_score
          and prediction.predicted_away_score = v_result_away_score
      end as calculated_exact,
      case
        when p_status = 'canceled' then false
        else prediction.predicted_outcome = case
          when v_result_home_score > v_result_away_score
            then 'HOME'::public.outcome
          when v_result_home_score < v_result_away_score
            then 'AWAY'::public.outcome
          else 'DRAW'::public.outcome
        end
      end as calculated_correct_outcome,
      rules.version as rule_version
    from public.predictions as prediction
    join public.leagues as league
      on league.id = prediction.league_id
     and league.status not in ('completed', 'archived')
    join public.league_scoring_rules as rules
      on rules.league_id = prediction.league_id
    where prediction.match_id = p_match_id
  )
  update public.predictions as prediction
  set points = calculated.calculated_points,
      is_exact = calculated.calculated_exact,
      is_correct_outcome = calculated.calculated_correct_outcome,
      scored_at = v_at,
      scored_result_version = v_result_version,
      scored_rule_version = calculated.rule_version
  from calculated_scores as calculated
  where prediction.id = calculated.id
    and (
      prediction.points is distinct from calculated.calculated_points
      or prediction.is_exact is distinct from calculated.calculated_exact
      or prediction.is_correct_outcome is distinct from calculated.calculated_correct_outcome
      or prediction.scored_result_version is distinct from v_result_version
      or prediction.scored_rule_version is distinct from calculated.rule_version
      or prediction.scored_at is null
    );
  get diagnostics v_scored_count = row_count;

  if v_result_changed then
    perform snapshot.league_id
    from public.league_match_snapshots as snapshot
    where snapshot.match_id = p_match_id
    order by snapshot.league_id, snapshot.match_id
    for update;

    insert into public.league_match_reconciliations (
      league_id,
      match_id,
      result_version,
      candidate_status,
      candidate_home_score,
      candidate_away_score,
      created_by,
      created_at
    )
    select
      snapshot.league_id,
      p_match_id,
      v_result_version,
      p_status,
      v_result_home_score,
      v_result_away_score,
      v_actor_id,
      v_at
    from public.league_match_snapshots as snapshot
    join public.leagues as league on league.id = snapshot.league_id
    where snapshot.match_id = p_match_id
      and league.status in ('completed', 'archived')
      and snapshot.completed_result_version < v_result_version
    order by snapshot.league_id, snapshot.match_id
    on conflict on constraint league_match_reconciliations_result_key
      do nothing;
  end if;

  if v_result_changed or v_override_changed or v_scored_count > 0 then
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, metadata, created_at
    ) values (
      v_actor_id,
      case
        when p_status = 'canceled' and v_result_changed
          then 'match_result_canceled'
        when v_result_changed and v_match.result_version > 0
          then 'match_result_corrected'
        when v_result_changed then 'match_result_applied'
        when v_override_changed then 'match_override_changed'
        else 'match_scoring_recomputed'
      end,
      'match_result',
      p_match_id,
      jsonb_build_object(
        'source', p_source,
        'status', p_status,
        'home_score', v_result_home_score,
        'away_score', v_result_away_score,
        'result_version', v_result_version,
        'result_changed', v_result_changed,
        'manual_override', p_is_manual_override,
        'predictions_scored', v_scored_count
      ),
      v_at
    );
  end if;

  return query select
    p_match_id,
    p_status,
    v_result_home_score,
    v_result_away_score,
    v_result_version,
    v_result_changed,
    v_scored_count;
end;
$$;

revoke all on function private.score_match(
  uuid, public.match_status, numeric, numeric, boolean, text
) from public, anon, authenticated, service_role;

-- Preserve the existing full manual editor for non-completed seasons, while
-- adding the one allowed completed-season branch: same-match result correction.
alter function public.create_or_correct_match(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) set schema private;

alter function private.create_or_correct_match(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) rename to slice9_create_or_correct_match_noncompleted;

revoke all on function private.slice9_create_or_correct_match_noncompleted(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) from public, anon, authenticated, service_role;

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
  v_actor_id uuid := private.slice9_system_actor_from_request();
  v_match public.matches%rowtype;
  v_scored record;
  v_at timestamptz;
begin
  if p_operation = 'correct'
     and p_match_id is not null
     and exists (
       select 1
       from public.matches as match
       join public.leagues as league on league.season_id = match.season_id
       where match.id = p_match_id
         and league.status in ('completed', 'archived')
     ) then
    if p_season_id is null
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

    if p_status not in ('finished', 'canceled') then
      raise exception using
        errcode = 'P0001', message = 'COMPLETED_RECONCILIATION_REQUIRED';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(2026090609);

    perform league.id
    from public.leagues as league
    join public.matches as match on match.season_id = league.season_id
    where match.id = p_match_id
    order by league.id
    for update of league;

    select match.* into v_match
    from public.matches as match
    where match.id = p_match_id
    for update;
    if not found
       or v_match.season_id is distinct from p_season_id
       or v_match.home_team_id is distinct from p_home_team_id
       or v_match.away_team_id is distinct from p_away_team_id
       or v_match.round_number is distinct from p_round_number::smallint
       or v_match.kickoff_at is distinct from p_kickoff_at then
      raise exception using
        errcode = 'P0001', message = 'COMPLETED_RECONCILIATION_REQUIRED';
    end if;

    select * into strict v_scored
    from private.score_match(
      p_match_id,
      p_status,
      p_home_score,
      p_away_score,
      true,
      'manual-match'
    );
    v_at := clock_timestamp();

    if v_scored.result_changed then
      insert into public.audit_logs (
        actor_id, action, entity_type, entity_id, metadata, created_at
      ) values (
        v_actor_id,
        'match_manually_corrected',
        'match',
        p_match_id,
        jsonb_build_object(
          'source', 'manual-match',
          'status', p_status,
          'home_score', v_scored.result_home_score,
          'away_score', v_scored.result_away_score,
          'result_version', v_scored.result_version,
          'completed_reconciliation_required', true
        ),
        v_at
      );
    end if;

    return query select
      p_match_id,
      v_scored.result_status,
      v_scored.result_home_score,
      v_scored.result_away_score,
      v_scored.result_version,
      false,
      v_scored.result_changed,
      true;
    return;
  end if;

  return query
  select *
  from private.slice9_create_or_correct_match_noncompleted(
    p_operation,
    p_match_id,
    p_season_id,
    p_home_team_id,
    p_away_team_id,
    p_round_number,
    p_kickoff_at,
    p_status,
    p_home_score,
    p_away_score
  );
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
  'Existing system-admin manual editor plus a completed-season result-only branch that queues explicit frozen-league reconciliation and never silently rewrites final points.';

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
  v_filtered_fixtures jsonb := '[]'::jsonb;
  v_existing public.matches%rowtype;
  v_match public.matches%rowtype;
  v_applied record;
  v_review public.match_result_reviews%rowtype;
  v_at timestamptz;
  v_special_changes integer := 0;
  v_row_changes integer := 0;
  v_home_score smallint;
  v_away_score smallint;
begin
  -- score_match remains delegated to the private apply core for ordinary
  -- fixtures; this wrapper only quarantines versioned review candidates.
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(coalesce(p_payload -> 'fixtures', 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_payload -> 'fixtures') > 50 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  -- A provider correction cannot outrun a pending administrator review. Such
  -- fixtures are withheld from the legacy apply core and update only the
  -- durable candidate owned by the current review version.
  for v_fixture in
    select value from jsonb_array_elements(p_payload -> 'fixtures')
  loop
    if char_length(coalesce(v_fixture ->> 'externalId', '')) not between 1 and 20
       or coalesce(v_fixture ->> 'externalId', '') !~ '^[1-9][0-9]*$'
       or coalesce(v_fixture ->> 'providerStatus', '') !~ '^[A-Z0-9]{1,10}$'
       or coalesce(v_fixture ->> 'resultDisposition', '')
         not in ('none', 'official', 'review')
       or coalesce(v_fixture ->> 'status', '')
         not in ('scheduled', 'live', 'finished', 'postponed', 'canceled')
       or jsonb_typeof(coalesce(v_fixture -> 'locksPredictions', 'null'::jsonb))
         <> 'boolean' then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
    end if;

    select match.* into v_existing
    from public.matches as match
    where match.external_provider = 'api-football'
      and match.external_id = v_fixture ->> 'externalId';

    if found
       and v_existing.requires_review
       and v_fixture ->> 'resultDisposition' in ('official', 'review') then
      if v_fixture ->> 'resultDisposition' = 'official' then
        if (v_fixture ->> 'homeScore') is null
           or (v_fixture ->> 'awayScore') is null
           or (v_fixture ->> 'homeScore') !~ '^(0|[1-9][0-9]?)$'
           or (v_fixture ->> 'awayScore') !~ '^(0|[1-9][0-9]?)$'
           or (v_fixture ->> 'homeScore')::integer not between 0 and 30
           or (v_fixture ->> 'awayScore')::integer not between 0 and 30 then
          raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
        end if;
      end if;
    else
      v_filtered_fixtures := v_filtered_fixtures || jsonb_build_array(v_fixture);
    end if;
  end loop;

  select * into strict v_applied
  from private.slice9_apply_api_football_sync_batch_unserialized(
    p_run_id,
    p_generation,
    p_token,
    jsonb_set(p_payload, '{fixtures}', v_filtered_fixtures)
  );

  for v_fixture in
    select value from jsonb_array_elements(p_payload -> 'fixtures')
  loop
    select match.* into v_match
    from public.matches as match
    where match.external_provider = 'api-football'
      and match.external_id = v_fixture ->> 'externalId'
    for update;
    if not found then
      continue;
    end if;

    if v_match.requires_review then
      select review.* into v_review
      from public.match_result_reviews as review
      where review.match_id = v_match.id
        and review.result_version = v_match.review_result_version
      for update;
      if not found
         or v_review.disposition <> 'pending'
         or v_match.review_result_version <> v_match.result_version then
        raise exception using errcode = 'P0001', message = 'REVIEW_STATE_CONFLICT';
      end if;

      if v_fixture ->> 'resultDisposition' in ('official', 'review') then
        v_home_score := case
          when (v_fixture ->> 'homeScore') ~ '^(0|[1-9][0-9]?)$'
            and (v_fixture ->> 'homeScore')::integer between 0 and 30
            then (v_fixture ->> 'homeScore')::smallint
          else null
        end;
        v_away_score := case
          when (v_fixture ->> 'awayScore') ~ '^(0|[1-9][0-9]?)$'
            and (v_fixture ->> 'awayScore')::integer between 0 and 30
            then (v_fixture ->> 'awayScore')::smallint
          else null
        end;

        update public.match_result_reviews as review
        set provider_status = v_fixture ->> 'providerStatus',
            candidate_home_score = case
              when v_home_score is not null and v_away_score is not null
                then v_home_score
              else review.candidate_home_score
            end,
            candidate_away_score = case
              when v_home_score is not null and v_away_score is not null
                then v_away_score
              else review.candidate_away_score
            end
        where review.match_id = v_match.id
          and review.result_version = v_match.review_result_version;
      end if;

      v_at := clock_timestamp();
      update public.matches as match
      set provider_status = v_fixture ->> 'providerStatus',
          predictions_locked_at = case
            when match.predictions_locked_at is not null
              then match.predictions_locked_at
            when (v_fixture ->> 'locksPredictions')::boolean then v_at
            else null
          end,
          updated_at = case
            when match.provider_status is distinct from v_fixture ->> 'providerStatus'
              or (
                match.predictions_locked_at is null
                and (v_fixture ->> 'locksPredictions')::boolean
              ) then v_at
            else match.updated_at
          end
      where match.id = v_match.id
        and (
          match.provider_status is distinct from v_fixture ->> 'providerStatus'
          or (
            match.predictions_locked_at is null
            and (v_fixture ->> 'locksPredictions')::boolean
          )
        );
      get diagnostics v_row_changes = row_count;
      v_special_changes := v_special_changes + v_row_changes;
    elsif v_fixture ->> 'resultDisposition' = 'review' then
      if v_fixture ->> 'providerStatus' not in ('AET', 'PEN') then
        raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
      end if;

      insert into public.match_result_reviews (
        match_id,
        result_version,
        provider_status,
        candidate_home_score,
        candidate_away_score
      ) values (
        v_match.id,
        v_match.result_version,
        v_fixture ->> 'providerStatus',
        null,
        null
      )
      on conflict (match_id, result_version) do nothing;

      update public.matches as match
      set requires_review = true,
          review_code = (v_fixture ->> 'providerStatus') || '_REQUIRES_REVIEW',
          review_result_version = v_match.result_version,
          updated_at = clock_timestamp()
      where match.id = v_match.id
        and not match.requires_review;
      get diagnostics v_row_changes = row_count;
      v_special_changes := v_special_changes + v_row_changes;
    end if;
  end loop;

  if v_special_changes > 0 then
    update public.sync_runs as run
    set matches_changed = run.matches_changed + v_special_changes
    where run.id = p_run_id;
  end if;

  return query select
    v_applied.result_rows_inserted,
    v_applied.result_teams_changed,
    v_applied.result_matches_changed + v_special_changes,
    v_applied.result_results_changed,
    v_applied.result_manual_overrides_skipped;
end;
$$;

revoke all on function public.apply_api_football_sync_batch(
  uuid, bigint, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_api_football_sync_batch(
  uuid, bigint, uuid, jsonb
) to service_role;

comment on function public.apply_api_football_sync_batch(
  uuid, bigint, uuid, jsonb
) is
  'Serialized provider apply that persists AET/PEN as versioned review work and prevents provider correction/replay from outrunning a pending review.';

create function public.resolve_match_result_review(
  p_match_id uuid,
  p_result_version integer,
  p_selected_status public.match_status,
  p_selected_home_score numeric,
  p_selected_away_score numeric
)
returns table (
  result_match_id uuid,
  result_review_version integer,
  result_applied_version integer,
  result_status public.match_status,
  result_home_score smallint,
  result_away_score smallint,
  result_predictions_scored integer,
  result_reconciliations_created integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.slice9_system_actor_from_request();
  v_match public.matches%rowtype;
  v_review public.match_result_reviews%rowtype;
  v_scored record;
  v_at timestamptz;
  v_reconciliation_count integer := 0;
begin
  if p_match_id is null
     or p_result_version is null
     or p_result_version < 0
     or p_selected_status not in ('finished', 'canceled') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  if p_selected_status = 'finished' then
    if p_selected_home_score is null
       or p_selected_away_score is null
       or p_selected_home_score <> trunc(p_selected_home_score)
       or p_selected_away_score <> trunc(p_selected_away_score)
       or p_selected_home_score not between 0 and 30
       or p_selected_away_score not between 0 and 30 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
    end if;
  elsif p_selected_home_score is not null or p_selected_away_score is not null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  select match.* into v_match
  from public.matches as match
  where match.id = p_match_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REVIEW_NOT_FOUND';
  end if;

  select review.* into v_review
  from public.match_result_reviews as review
  where review.match_id = p_match_id
    and review.result_version = p_result_version
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REVIEW_NOT_FOUND';
  end if;

  if v_review.disposition <> 'pending'
     or not v_match.requires_review
     or v_match.review_result_version is distinct from p_result_version
     or v_match.result_version is distinct from p_result_version then
    raise exception using errcode = 'P0001', message = 'REVIEW_STALE';
  end if;

  select count(*)::integer into v_reconciliation_count
  from public.league_match_snapshots as snapshot
  where snapshot.match_id = p_match_id;

  select * into strict v_scored
  from private.score_match(
    p_match_id,
    p_selected_status,
    p_selected_home_score,
    p_selected_away_score,
    true,
    'result-review'
  );
  v_at := clock_timestamp();

  update public.match_result_reviews as review
  set disposition = 'resolved',
      selected_status = p_selected_status,
      selected_home_score = v_scored.result_home_score,
      selected_away_score = v_scored.result_away_score,
      applied_result_version = v_scored.result_version,
      decided_by = v_actor_id,
      decided_at = v_at
  where review.match_id = p_match_id
    and review.result_version = p_result_version;

  update public.matches as match
  set requires_review = false,
      review_code = null,
      review_result_version = null,
      updated_at = v_at
  where match.id = p_match_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_actor_id,
    'match_result_review_resolved',
    'match_result_review',
    p_match_id,
    jsonb_build_object(
      'review_result_version', p_result_version,
      'applied_result_version', v_scored.result_version,
      'selected_status', p_selected_status,
      'selected_home_score', v_scored.result_home_score,
      'selected_away_score', v_scored.result_away_score,
      'predictions_scored', v_scored.predictions_scored,
      'reconciliations_created', v_reconciliation_count
    ),
    v_at
  );

  -- A resolved review is an explicit system-admin manual result decision. The
  -- established completion gate recognizes this existing audit vocabulary.
  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_actor_id,
    'match_manually_corrected',
    'match',
    p_match_id,
    jsonb_build_object(
      'source', 'result-review',
      'review_result_version', p_result_version,
      'result_version', v_scored.result_version,
      'status', p_selected_status
    ),
    v_at
  );

  return query select
    p_match_id,
    p_result_version,
    v_scored.result_version,
    v_scored.result_status,
    v_scored.result_home_score,
    v_scored.result_away_score,
    v_scored.predictions_scored,
    v_reconciliation_count;
end;
$$;

revoke all on function public.resolve_match_result_review(
  uuid, integer, public.match_status, numeric, numeric
) from public, anon, authenticated, service_role;
grant execute on function public.resolve_match_result_review(
  uuid, integer, public.match_status, numeric, numeric
) to service_role;

comment on function public.resolve_match_result_review(
  uuid, integer, public.match_status, numeric, numeric
) is
  'Fixed-system-admin current-version review decision. Resolves match and review atomically, scores only non-completed leagues, and queues completed snapshots for explicit reconciliation.';

create function public.reconcile_completed_league(
  p_reconciliation_id uuid,
  p_expected_result_version integer,
  p_decision text
)
returns table (
  result_reconciliation_id uuid,
  result_league_id uuid,
  result_match_id uuid,
  result_version integer,
  result_disposition public.league_match_reconciliation_disposition,
  result_predictions_scored integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.slice9_system_actor_from_request();
  v_discovered public.league_match_reconciliations%rowtype;
  v_reconciliation public.league_match_reconciliations%rowtype;
  v_match public.matches%rowtype;
  v_snapshot public.league_match_snapshots%rowtype;
  v_at timestamptz;
  v_scored_count integer := 0;
begin
  if p_reconciliation_id is null
     or p_expected_result_version is null
     or p_expected_result_version < 0
     or p_decision not in ('apply', 'dismiss') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  select reconciliation.* into v_discovered
  from public.league_match_reconciliations as reconciliation
  where reconciliation.id = p_reconciliation_id;
  if not found then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  select match.* into v_match
  from public.matches as match
  where match.id = v_discovered.match_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  select snapshot.* into v_snapshot
  from public.league_match_snapshots as snapshot
  where snapshot.league_id = v_discovered.league_id
    and snapshot.match_id = v_discovered.match_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  select reconciliation.* into v_reconciliation
  from public.league_match_reconciliations as reconciliation
  where reconciliation.id = p_reconciliation_id
  for update;
  if not found
     or v_reconciliation.league_id is distinct from v_discovered.league_id
     or v_reconciliation.match_id is distinct from v_discovered.match_id then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  if v_reconciliation.disposition <> 'pending' then
    raise exception using errcode = 'P0001', message = 'RECONCILIATION_REPLAY';
  end if;
  if v_reconciliation.result_version <> p_expected_result_version
     or (
       p_decision = 'apply'
       and (
         v_snapshot.completed_result_version >= v_reconciliation.result_version
         or
         v_match.result_version <> v_reconciliation.result_version
         or v_match.status is distinct from v_reconciliation.candidate_status
         or v_match.home_score is distinct from v_reconciliation.candidate_home_score
         or v_match.away_score is distinct from v_reconciliation.candidate_away_score
       )
     ) then
    raise exception using errcode = 'P0001', message = 'RECONCILIATION_STALE';
  end if;

  v_at := clock_timestamp();
  if p_decision = 'apply' then
    update public.league_match_snapshots as snapshot
    set completed_status = v_reconciliation.candidate_status,
        completed_home_score = v_reconciliation.candidate_home_score,
        completed_away_score = v_reconciliation.candidate_away_score,
        completed_result_version = v_reconciliation.result_version
    where snapshot.league_id = v_reconciliation.league_id
      and snapshot.match_id = v_reconciliation.match_id;

    with calculated_scores as (
      select
        prediction.id,
        case
          when v_reconciliation.candidate_status = 'canceled' then 0::smallint
          when prediction.predicted_home_score = v_reconciliation.candidate_home_score
           and prediction.predicted_away_score = v_reconciliation.candidate_away_score
            then rules.exact_points
          when prediction.predicted_outcome = case
            when v_reconciliation.candidate_home_score > v_reconciliation.candidate_away_score
              then 'HOME'::public.outcome
            when v_reconciliation.candidate_home_score < v_reconciliation.candidate_away_score
              then 'AWAY'::public.outcome
            else 'DRAW'::public.outcome
          end then rules.correct_outcome_points
          else rules.incorrect_points
        end as calculated_points,
        case
          when v_reconciliation.candidate_status = 'canceled' then false
          else prediction.predicted_home_score = v_reconciliation.candidate_home_score
            and prediction.predicted_away_score = v_reconciliation.candidate_away_score
        end as calculated_exact,
        case
          when v_reconciliation.candidate_status = 'canceled' then false
          else prediction.predicted_outcome = case
            when v_reconciliation.candidate_home_score > v_reconciliation.candidate_away_score
              then 'HOME'::public.outcome
            when v_reconciliation.candidate_home_score < v_reconciliation.candidate_away_score
              then 'AWAY'::public.outcome
            else 'DRAW'::public.outcome
          end
        end as calculated_correct_outcome,
        rules.version as rule_version
      from public.predictions as prediction
      join public.league_scoring_rules as rules
        on rules.league_id = prediction.league_id
      where prediction.league_id = v_reconciliation.league_id
        and prediction.match_id = v_reconciliation.match_id
    )
    update public.predictions as prediction
    set points = calculated.calculated_points,
        is_exact = calculated.calculated_exact,
        is_correct_outcome = calculated.calculated_correct_outcome,
        scored_at = v_at,
        scored_result_version = v_reconciliation.result_version,
        scored_rule_version = calculated.rule_version
    from calculated_scores as calculated
    where prediction.id = calculated.id
      and (
        prediction.points is distinct from calculated.calculated_points
        or prediction.is_exact is distinct from calculated.calculated_exact
        or prediction.is_correct_outcome is distinct from calculated.calculated_correct_outcome
        or prediction.scored_result_version is distinct from v_reconciliation.result_version
        or prediction.scored_rule_version is distinct from calculated.rule_version
        or prediction.scored_at is null
      );
    get diagnostics v_scored_count = row_count;
  end if;

  update public.league_match_reconciliations as reconciliation
  set disposition = case
        when p_decision = 'apply'
          then 'applied'::public.league_match_reconciliation_disposition
        else 'dismissed'::public.league_match_reconciliation_disposition
      end,
      decided_by = v_actor_id,
      decided_at = v_at
  where reconciliation.id = p_reconciliation_id
  returning * into v_reconciliation;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_actor_id,
    case
      when p_decision = 'apply'
        then 'league_match_reconciliation_applied'
      else 'league_match_reconciliation_dismissed'
    end,
    'league_match_reconciliation',
    p_reconciliation_id,
    jsonb_build_object(
      'league_id', v_reconciliation.league_id,
      'match_id', v_reconciliation.match_id,
      'result_version', v_reconciliation.result_version,
      'predictions_scored', v_scored_count
    ),
    v_at
  );

  return query select
    v_reconciliation.id,
    v_reconciliation.league_id,
    v_reconciliation.match_id,
    v_reconciliation.result_version,
    v_reconciliation.disposition,
    v_scored_count;
end;
$$;

revoke all on function public.reconcile_completed_league(
  uuid, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.reconcile_completed_league(
  uuid, integer, text
) to service_role;

comment on function public.reconcile_completed_league(
  uuid, integer, text
) is
  'Fixed-system-admin versioned apply/dismiss decision for one frozen league-match result. Apply overwrites only that snapshot and league scoring; replay, stale, foreign and missing work fail closed.';
