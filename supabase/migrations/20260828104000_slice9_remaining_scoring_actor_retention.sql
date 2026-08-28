-- Complete the post-wait actor-retention contract for the two remaining
-- service-role scoring writers. Revocation must either commit before the
-- retained check and make the call fail closed, or wait for the authorized
-- writer transaction to finish.

create or replace function public.reconcile_completed_league(
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
  v_league_id uuid;
  v_match_id uuid;
begin
  perform private.slice9_system_actor_from_request();

  if p_reconciliation_id is null
     or p_expected_result_version is null
     or p_expected_result_version < 0
     or p_decision is null
     or p_decision not in ('apply', 'dismiss') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select reconciliation.league_id into v_league_id
  from public.league_match_reconciliations as reconciliation
  where reconciliation.id = p_reconciliation_id;
  if not found then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  perform private.slice9_lock_leagues(array[v_league_id]);
  perform private.slice9_retain_system_actor_from_request();

  select reconciliation.match_id into v_match_id
  from public.league_match_reconciliations as reconciliation
  join public.leagues as league on league.id = reconciliation.league_id
  where reconciliation.id = p_reconciliation_id
    and league.id = v_league_id
  for update of league;
  if not found then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  perform match.id
  from public.matches as match
  where match.id = v_match_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  perform snapshot.match_id
  from public.league_match_snapshots as snapshot
  where snapshot.league_id = v_league_id
    and snapshot.match_id = v_match_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  perform reconciliation.id
  from public.league_match_reconciliations as reconciliation
  where reconciliation.id = p_reconciliation_id
    and reconciliation.league_id = v_league_id
    and reconciliation.match_id = v_match_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  return query
  select result.*
  from private.slice9_reconcile_completed_league_without_global_lock(
    p_reconciliation_id, p_expected_result_version, p_decision
  ) as result;
end;
$$;

revoke all on function public.reconcile_completed_league(uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_completed_league(uuid, integer, text)
  to service_role;

comment on function public.reconcile_completed_league(uuid, integer, text) is
  'Reconciles one frozen-league result after the exact league lock, then revalidates and retains the system actor before lock-bound re-verification and mutation.';

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
  v_league_ids uuid[];
begin
  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  select coalesce(
      array_agg(distinct affected.league_id order by affected.league_id),
      '{}'::uuid[]
    )
    into v_league_ids
    from (
      select league.id as league_id
      from public.leagues as league
      join public.seasons as season on season.id = league.season_id
      where season.external_provider = 'api-football'
        and season.external_id = '2026'
      union
      select league.id
      from jsonb_array_elements(
        case
          when jsonb_typeof(p_payload -> 'fixtures') = 'array'
            then p_payload -> 'fixtures'
          else '[]'::jsonb
        end
      ) as fixture(value)
      join public.matches as match
        on match.external_provider = 'api-football'
       and match.external_id = fixture.value ->> 'externalId'
      join public.leagues as league on league.season_id = match.season_id
    ) as affected;

  perform private.slice9_lock_leagues(v_league_ids);
  perform private.slice9_retain_system_actor_from_request();

  return query
  select result.*
  from private.slice9_apply_api_football_sync_batch_with_global_lock(
    p_run_id, p_generation, p_token, p_payload
  ) as result;
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
  'Applies one fenced provider batch after registry and deterministic league locks, then revalidates and retains the system actor through every catalog, result, scoring, and audit write.';
