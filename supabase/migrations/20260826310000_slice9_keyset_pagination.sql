-- Separate exact resource authorization from bounded list traversal. All
-- cursors use immutable timestamp/UUID keysets. Existing indexes cover the
-- representative MVP query shapes; this migration intentionally adds no
-- speculative index.

create function public.get_dashboard_leagues_page(
  p_cursor_created_at timestamptz default null,
  p_cursor_league_id uuid default null,
  p_page_size integer default 20
)
returns table (
  league_id uuid,
  league_name text,
  league_status public.league_status,
  league_created_at timestamptz,
  season_name text,
  viewer_role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_SIZE';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_league_id is null)
     or (
       p_cursor_created_at is not null
       and not pg_catalog.isfinite(p_cursor_created_at)
     ) then
    raise exception using errcode = '22023', message = 'INVALID_CURSOR';
  end if;

  return query
  select
    league.id,
    league.name,
    league.status,
    league.created_at,
    season.name,
    case
      when league.manager_id = v_actor_id then 'manager'::text
      else 'member'::text
    end
  from public.leagues as league
  join public.seasons as season on season.id = league.season_id
  where (
      league.manager_id = v_actor_id
      or exists (
        select 1
        from public.league_members as member
        where member.league_id = league.id
          and member.user_id = v_actor_id
          and member.status = 'active'
      )
    )
    and (
      p_cursor_created_at is null
      or (league.created_at, league.id)
        < (p_cursor_created_at, p_cursor_league_id)
    )
  order by league.created_at desc, league.id desc
  limit p_page_size + 1;
end;
$$;

create function public.get_manager_join_requests_page(
  p_league_id uuid,
  p_status public.join_request_status default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_request_id uuid default null,
  p_page_size integer default 25
)
returns table (
  request_id uuid,
  requester_display_name text,
  status public.join_request_status,
  rejection_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  decided_at timestamptz,
  proofs jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if p_league_id is null then
    raise exception using errcode = '22023', message = 'INVALID_LEAGUE';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_SIZE';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_request_id is null)
     or (
       p_cursor_created_at is not null
       and not pg_catalog.isfinite(p_cursor_created_at)
     ) then
    raise exception using errcode = '22023', message = 'INVALID_CURSOR';
  end if;

  if not exists (
    select 1
    from public.leagues as league
    where league.id = p_league_id
      and league.manager_id = v_actor_id
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    request.id,
    profile.display_name,
    request.status,
    request.rejection_reason,
    request.created_at,
    request.updated_at,
    request.decided_at,
    private.payment_proof_summaries(request.id)
  from public.join_requests as request
  join public.profiles as profile on profile.id = request.user_id
  where request.league_id = p_league_id
    and (p_status is null or request.status = p_status)
    and (
      p_cursor_created_at is null
      or (request.created_at, request.id)
        < (p_cursor_created_at, p_cursor_request_id)
    )
  order by request.created_at desc, request.id desc
  limit p_page_size + 1;
end;
$$;

create function public.get_my_join_requests_page(
  p_cursor_created_at timestamptz default null,
  p_cursor_request_id uuid default null,
  p_page_size integer default 25
)
returns table (
  request_id uuid,
  league_name text,
  status public.join_request_status,
  rejection_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  proofs jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_SIZE';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_request_id is null)
     or (
       p_cursor_created_at is not null
       and not pg_catalog.isfinite(p_cursor_created_at)
     ) then
    raise exception using errcode = '22023', message = 'INVALID_CURSOR';
  end if;

  return query
  select
    request.id,
    league.name,
    request.status,
    request.rejection_reason,
    request.created_at,
    request.updated_at,
    private.payment_proof_summaries(request.id)
  from public.join_requests as request
  join public.leagues as league on league.id = request.league_id
  where request.user_id = v_actor_id
    and (
      p_cursor_created_at is null
      or (request.created_at, request.id)
        < (p_cursor_created_at, p_cursor_request_id)
    )
  order by request.created_at desc, request.id desc
  limit p_page_size + 1;
end;
$$;

create function public.get_match_eligible_leagues_page(
  p_match_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_league_id uuid default null,
  p_page_size integer default 20
)
returns table (
  league_id uuid,
  league_name text,
  league_status public.league_status,
  league_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if p_match_id is null then
    raise exception using errcode = '22023', message = 'INVALID_MATCH';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_SIZE';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_league_id is null)
     or (
       p_cursor_created_at is not null
       and not pg_catalog.isfinite(p_cursor_created_at)
     ) then
    raise exception using errcode = '22023', message = 'INVALID_CURSOR';
  end if;

  return query
  select
    league.id,
    league.name,
    league.status,
    league.created_at
  from public.matches as match
  join public.leagues as league on league.season_id = match.season_id
  join public.league_members as member
    on member.league_id = league.id
   and member.user_id = v_actor_id
   and member.status = 'active'
  where match.id = p_match_id
    and (
      p_cursor_created_at is null
      or (league.created_at, league.id)
        > (p_cursor_created_at, p_cursor_league_id)
    )
  order by league.created_at asc, league.id asc
  limit p_page_size + 1;
end;
$$;

create function public.get_match_selection_context(p_match_id uuid)
returns table (
  match_id uuid,
  round_number smallint,
  kickoff_at timestamptz,
  predictions_locked_at timestamptz,
  match_status public.match_status,
  provider_status text,
  home_score smallint,
  away_score smallint,
  home_team_id uuid,
  home_team_name text,
  home_team_short_name text,
  away_team_id uuid,
  away_team_name text,
  away_team_short_name text,
  database_time timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if p_match_id is null then
    raise exception using errcode = '22023', message = 'INVALID_MATCH';
  end if;

  return query
  select
    match.id,
    match.round_number,
    match.kickoff_at,
    match.predictions_locked_at,
    match.status,
    match.provider_status,
    match.home_score,
    match.away_score,
    home_team.id,
    home_team.name,
    home_team.short_name,
    away_team.id,
    away_team.name,
    away_team.short_name,
    now()
  from public.matches as match
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  where match.id = p_match_id
    and exists (
      select 1
      from public.leagues as league
      join public.league_members as member
        on member.league_id = league.id
       and member.user_id = v_actor_id
       and member.status = 'active'
      where league.season_id = match.season_id
    );
end;
$$;

create function public.get_match_detail_context(
  p_match_id uuid,
  p_league_id uuid
)
returns table (
  league_id uuid,
  league_name text,
  league_status public.league_status,
  match_id uuid,
  round_number smallint,
  kickoff_at timestamptz,
  predictions_locked_at timestamptz,
  match_status public.match_status,
  provider_status text,
  home_score smallint,
  away_score smallint,
  home_team_id uuid,
  home_team_name text,
  home_team_short_name text,
  away_team_id uuid,
  away_team_name text,
  away_team_short_name text,
  database_time timestamptz,
  own_prediction_id uuid,
  own_predicted_home_score smallint,
  own_predicted_away_score smallint,
  own_predicted_outcome public.outcome,
  own_prediction_created_at timestamptz,
  own_prediction_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if p_match_id is null or p_league_id is null then
    raise exception using errcode = '22023', message = 'INVALID_RESOURCE';
  end if;

  return query
  select
    league.id,
    league.name,
    league.status,
    match.id,
    match.round_number,
    match.kickoff_at,
    match.predictions_locked_at,
    match.status,
    match.provider_status,
    match.home_score,
    match.away_score,
    home_team.id,
    home_team.name,
    home_team.short_name,
    away_team.id,
    away_team.name,
    away_team.short_name,
    now(),
    prediction.id,
    prediction.predicted_home_score,
    prediction.predicted_away_score,
    prediction.predicted_outcome,
    prediction.created_at,
    prediction.updated_at
  from public.matches as match
  join public.leagues as league
    on league.id = p_league_id
   and league.season_id = match.season_id
  join public.league_members as member
    on member.league_id = league.id
   and member.user_id = v_actor_id
   and member.status = 'active'
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  left join public.predictions as prediction
    on prediction.league_id = league.id
   and prediction.match_id = match.id
   and prediction.user_id = v_actor_id
  where match.id = p_match_id;
end;
$$;

create function public.get_revealed_predictions_page(
  p_league_id uuid,
  p_match_id uuid,
  p_cursor_created_at timestamptz default null,
  p_cursor_prediction_id uuid default null,
  p_page_size integer default 25
)
returns table (
  prediction_id uuid,
  user_id uuid,
  display_name text,
  predicted_home_score smallint,
  predicted_away_score smallint,
  predicted_outcome public.outcome,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_can_reveal boolean;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if p_league_id is null or p_match_id is null then
    raise exception using errcode = '22023', message = 'INVALID_RESOURCE';
  end if;

  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception using errcode = '22023', message = 'INVALID_PAGE_SIZE';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_prediction_id is null)
     or (
       p_cursor_created_at is not null
       and not pg_catalog.isfinite(p_cursor_created_at)
     ) then
    raise exception using errcode = '22023', message = 'INVALID_CURSOR';
  end if;

  select now() >= match.kickoff_at or match.predictions_locked_at is not null
    into v_can_reveal
  from public.matches as match
  join public.leagues as league
    on league.id = p_league_id
   and league.season_id = match.season_id
  join public.league_members as member
    on member.league_id = league.id
   and member.user_id = v_actor_id
   and member.status = 'active'
  where match.id = p_match_id;

  if v_can_reveal is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if not v_can_reveal then
    return;
  end if;

  return query
  select
    prediction.id,
    prediction.user_id,
    profile.display_name,
    prediction.predicted_home_score,
    prediction.predicted_away_score,
    prediction.predicted_outcome,
    prediction.created_at,
    prediction.updated_at
  from public.predictions as prediction
  join public.profiles as profile on profile.id = prediction.user_id
  join public.league_members as member
    on member.league_id = prediction.league_id
   and member.user_id = prediction.user_id
   and member.status = 'active'
  where prediction.league_id = p_league_id
    and prediction.match_id = p_match_id
    and (
      p_cursor_created_at is null
      or (prediction.created_at, prediction.id)
        > (p_cursor_created_at, p_cursor_prediction_id)
    )
  order by prediction.created_at asc, prediction.id asc
  limit p_page_size + 1;
end;
$$;

revoke all on function public.get_dashboard_leagues_page(
  timestamptz, uuid, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_manager_join_requests_page(
  uuid, public.join_request_status, timestamptz, uuid, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_my_join_requests_page(
  timestamptz, uuid, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_match_eligible_leagues_page(
  uuid, timestamptz, uuid, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_match_selection_context(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_match_detail_context(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_revealed_predictions_page(
  uuid, uuid, timestamptz, uuid, integer
) from public, anon, authenticated, service_role;

grant execute on function public.get_dashboard_leagues_page(
  timestamptz, uuid, integer
) to authenticated;
grant execute on function public.get_manager_join_requests_page(
  uuid, public.join_request_status, timestamptz, uuid, integer
) to authenticated;
grant execute on function public.get_my_join_requests_page(
  timestamptz, uuid, integer
) to authenticated;
grant execute on function public.get_match_eligible_leagues_page(
  uuid, timestamptz, uuid, integer
) to authenticated;
grant execute on function public.get_match_selection_context(uuid)
  to authenticated;
grant execute on function public.get_match_detail_context(uuid, uuid)
  to authenticated;
grant execute on function public.get_revealed_predictions_page(
  uuid, uuid, timestamptz, uuid, integer
) to authenticated;

-- The capped Slice 3/4 readers are removed so no caller can mistake them for
-- complete collections after the keyset replacements exist.
revoke all on function public.get_my_join_requests()
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_join_requests_v2()
  from public, anon, authenticated, service_role;
revoke all on function public.get_manager_join_requests(uuid)
  from public, anon, authenticated, service_role;
drop function public.get_my_join_requests();
drop function public.get_my_join_requests_v2();
drop function public.get_manager_join_requests(uuid);

comment on function public.get_dashboard_leagues_page(
  timestamptz, uuid, integer
) is
  'Returns one actor-derived dashboard page with manager precedence. Page size is bounded to 50.';
comment on function public.get_manager_join_requests_page(
  uuid, public.join_request_status, timestamptz, uuid, integer
) is
  'Returns one proof-safe immutable-keyset page only to the exact league manager. Page size is bounded to 50.';
comment on function public.get_my_join_requests_page(
  timestamptz, uuid, integer
) is
  'Returns one immutable-keyset page of the authenticated caller own request history. Page size is bounded to 50.';
comment on function public.get_match_eligible_leagues_page(
  uuid, timestamptz, uuid, integer
) is
  'Returns one bounded page of leagues where the caller is an exact active member and the match belongs to the same season.';
comment on function public.get_match_selection_context(uuid) is
  'Returns match facts only when the caller has at least one exact active membership in the match season.';
comment on function public.get_match_detail_context(uuid, uuid) is
  'Returns exact league/match authorization context and only the caller own prediction.';
comment on function public.get_revealed_predictions_page(
  uuid, uuid, timestamptz, uuid, integer
) is
  'Returns one bounded active-member prediction page only after the irreversible reveal boundary.';
