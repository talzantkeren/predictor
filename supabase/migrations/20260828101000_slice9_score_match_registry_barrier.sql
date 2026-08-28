-- The service-role scoring RPC remains a documented system-operation boundary.
-- Put the same registry -> discovery -> league-key prefix in front of it as the
-- other catalog-adjacent result writers, so direct RPC use cannot score a
-- league that appears in a later READ COMMITTED snapshot without its key.

alter function public.score_match(
  uuid, public.match_status, numeric, numeric, boolean, text
) rename to slice9_score_match_without_registry_barrier;

alter function public.slice9_score_match_without_registry_barrier(
  uuid, public.match_status, numeric, numeric, boolean, text
) set schema private;

revoke all on function private.slice9_score_match_without_registry_barrier(
  uuid, public.match_status, numeric, numeric, boolean, text
) from public, anon, authenticated, service_role;

comment on function private.slice9_score_match_without_registry_barrier(
  uuid, public.match_status, numeric, numeric, boolean, text
) is
  'Existing authorized terminal/reactivation implementation behind the public registry-and-league-lock wrapper. It has no Data API grant and revalidates the system actor.';

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
  v_league_ids uuid[];
begin
  perform private.slice9_system_actor_from_request();
  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  select coalesce(array_agg(league.id order by league.id), '{}'::uuid[])
    into v_league_ids
    from public.leagues as league
    join public.matches as match on match.season_id = league.season_id
    where match.id = p_match_id;

  perform private.slice9_lock_leagues(v_league_ids);

  return query
  select result.*
  from private.slice9_score_match_without_registry_barrier(
    p_match_id,
    p_status,
    p_home_score,
    p_away_score,
    p_is_manual_override,
    p_source
  ) as result;
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
  'Service-only scoring boundary: validates the system actor, takes the exclusive league registry barrier, discovers every affected league, locks their deterministic advisory keys, then delegates terminal scoring or safe reactivation.';
