-- Review resolution discovers every league on the match season before scoring.
-- Serialize that discovery with league creation, just like the two catalog
-- writers, so a newly committed league cannot appear later inside score_match
-- without its league-scoped key being held.

create or replace function public.resolve_match_result_review(
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
  v_league_ids uuid[];
begin
  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  select coalesce(array_agg(league.id order by league.id), '{}'::uuid[])
    into v_league_ids
    from public.leagues as league
    join public.matches as match on match.season_id = league.season_id
    where match.id = p_match_id;

  perform private.slice9_lock_leagues(v_league_ids);

  return query
  select result.*
  from private.slice9_resolve_match_result_review_without_global_lock(
    p_match_id,
    p_result_version,
    p_selected_status,
    p_selected_home_score,
    p_selected_away_score
  ) as result;
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
  'Resolves the current durable match review after the exclusive league-registry barrier and deterministic affected-league locks, preventing a league-creation phantom during scoring.';
