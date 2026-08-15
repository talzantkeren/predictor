-- Slice 5 follow-up: completed and archived leagues are read-only for predictions.
-- Lock the league row so a concurrent lifecycle transition and prediction save
-- are decided atomically without weakening the existing kickoff lock.

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

  select match.season_id, match.status, match.kickoff_at
    into v_match_season_id, v_match_status, v_kickoff_at
    from public.matches as match
    where match.id = p_match_id
    for update;

  if not found or v_match_season_id is distinct from v_league_season_id then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if v_match_status not in ('scheduled', 'postponed')
     or now() >= v_kickoff_at then
    raise exception using errcode = 'P0001', message = 'PREDICTION_LOCKED';
  end if;

  return query
  insert into public.predictions as prediction (
    league_id,
    match_id,
    user_id,
    predicted_home_score,
    predicted_away_score
  )
  values (
    p_league_id,
    p_match_id,
    v_actor_id,
    p_predicted_home_score::smallint,
    p_predicted_away_score::smallint
  )
  on conflict on constraint predictions_league_match_user_key do update
  set predicted_home_score = excluded.predicted_home_score,
      predicted_away_score = excluded.predicted_away_score
  returning
    prediction.id,
    prediction.league_id,
    prediction.match_id,
    prediction.predicted_home_score,
    prediction.predicted_away_score,
    prediction.predicted_outcome,
    prediction.created_at,
    prediction.updated_at;
end;
$$;

revoke all on function public.save_prediction(uuid, uuid, numeric, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.save_prediction(uuid, uuid, numeric, numeric)
  to authenticated;

comment on function public.save_prediction(uuid, uuid, numeric, numeric) is
  'Creates or replaces the caller prediction only while active membership, writable league lifecycle, season, match status, and database-time checks hold.';
