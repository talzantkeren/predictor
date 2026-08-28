-- Every service-role scoring writer must revalidate and retain its trusted
-- actor after any registry/league advisory wait and before entering the
-- mutation delegate. A concurrent revocation then either commits first and
-- makes this call fail closed, or waits until the authorized transaction ends.

create function private.slice9_retain_system_actor_from_request()
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := private.slice9_system_actor_from_request();

  perform administrator.user_id
  from public.system_admins as administrator
  where administrator.user_id = v_actor_id
  for key share;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  return v_actor_id;
end;
$$;

revoke all on function private.slice9_retain_system_actor_from_request()
  from public, anon, authenticated, service_role;

comment on function private.slice9_retain_system_actor_from_request() is
  'Revalidates the fixed request actor after lock waits and retains its system_admins row with FOR KEY SHARE through transaction end. It has no Data API grant.';

create or replace function public.score_match(
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
  perform private.slice9_retain_system_actor_from_request();

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
  'Service-only scoring boundary: validates the actor, takes registry and deterministic league locks, revalidates and retains the actor, then delegates terminal scoring or safe reactivation.';

create or replace function public.create_or_correct_match(
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
  v_league_ids uuid[];
begin
  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  select coalesce(
      array_agg(league.id order by league.id),
      '{}'::uuid[]
    )
    into v_league_ids
    from public.leagues as league
    where league.season_id = p_season_id
       or league.season_id = (
         select match.season_id
         from public.matches as match
         where match.id = p_match_id
       );

  perform private.slice9_lock_leagues(v_league_ids);
  perform private.slice9_retain_system_actor_from_request();

  return query
  select result.*
  from private.slice9_create_or_correct_match_with_global_lock(
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
  ) as result;
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
  'Creates or corrects one Manual match after registry and affected-league locks, then retains the revalidated system actor before the existing mutation delegate.';

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
  perform private.slice9_retain_system_actor_from_request();

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
  'Resolves a durable result review after registry and deterministic league locks, then retains the revalidated system actor before the existing review mutation delegate.';
