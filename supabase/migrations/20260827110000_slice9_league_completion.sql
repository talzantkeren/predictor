-- Slice 9 lifecycle completion: terminal gate, frozen included set, and
-- atomic closure of both still-open join-request states.

alter table public.leagues
  add column completed_at timestamptz,
  add constraint leagues_completed_at_check check (
    completed_at is null or isfinite(completed_at)
  );

comment on column public.leagues.completed_at is
  'Fresh database write time of the single successful completion transition.';

create function public.complete_league(p_league_id uuid)
returns table (
  result_league_id uuid,
  result_status public.league_status,
  result_completed_at timestamptz,
  result_snapshot_count integer,
  result_closed_request_count integer,
  result_changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_league public.leagues%rowtype;
  v_scoring public.league_scoring_rules%rowtype;
  v_at timestamptz;
  v_match_count integer;
  v_snapshot_count integer := 0;
  v_closed_request_count integer := 0;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if p_league_id is null then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  -- Canonical parent lock. Foreign managers and missing IDs share one opaque
  -- result before any child row is acquired.
  select league.*
    into v_league
    from public.leagues as league
    where league.id = p_league_id
      and league.manager_id = v_actor_id
    for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_FOUND';
  end if;

  if v_league.status = 'completed' then
    select count(*)::integer
      into v_snapshot_count
      from public.league_match_snapshots as snapshot
      where snapshot.league_id = v_league.id;

    return query select
      v_league.id,
      v_league.status,
      v_league.completed_at,
      v_snapshot_count,
      0,
      false;
    return;
  end if;

  if v_league.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_COMPLETABLE';
  end if;

  select scoring.*
    into v_scoring
    from public.league_scoring_rules as scoring
    where scoring.league_id = v_league.id
    for update;

  if not found or v_scoring.locked_at is null then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_COMPLETABLE';
  end if;

  -- Acquire every populated child level in the canonical global order.
  perform request.id
    from public.join_requests as request
    where request.league_id = v_league.id
    order by request.id
    for update;

  perform proof.id
    from public.payment_proofs as proof
    join public.join_requests as request on request.id = proof.join_request_id
    where request.league_id = v_league.id
    order by proof.id
    for update of proof;

  perform member.id
    from public.league_members as member
    where member.league_id = v_league.id
    order by member.id
    for update;

  perform match.id
    from public.matches as match
    where match.season_id = v_league.season_id
    order by match.id
    for update;

  perform review.match_id
    from public.match_result_reviews as review
    join public.matches as match on match.id = review.match_id
    where match.season_id = v_league.season_id
    order by review.match_id, review.result_version
    for update of review;

  v_at := clock_timestamp();

  select count(*)::integer
    into v_match_count
    from public.matches as match
    where match.season_id = v_league.season_id;

  if v_match_count = 0
     or exists (
       select 1
       from public.matches as match
       where match.season_id = v_league.season_id
         and (
           match.status not in ('finished', 'canceled')
           or match.requires_review
           or exists (
             select 1
             from public.match_result_reviews as review
             where review.match_id = match.id
               and review.disposition = 'pending'
           )
           or (
             match.status = 'finished'
             and match.provider_status is distinct from 'FT'
             and not (
               match.is_manually_overridden
               and exists (
                 select 1
                 from public.audit_logs as audit
                 where audit.entity_id = match.id
                   and audit.entity_type = 'match'
                   and audit.action in (
                     'match_manually_created',
                     'match_manually_corrected'
                   )
                   and audit.metadata ->> 'result_version' =
                     match.result_version::text
               )
             )
           )
         )
     )
     or exists (
       select 1
       from public.predictions as prediction
       join public.matches as match on match.id = prediction.match_id
       where prediction.league_id = v_league.id
         and match.season_id = v_league.season_id
         and (
           prediction.scored_result_version is distinct from match.result_version
           or prediction.scored_rule_version is distinct from v_scoring.version
           or prediction.points is null
           or prediction.is_exact is null
           or prediction.is_correct_outcome is null
         )
     ) then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_COMPLETABLE';
  end if;

  insert into public.league_match_snapshots (
    league_id,
    match_id,
    completed_status,
    completed_home_score,
    completed_away_score,
    completed_result_version,
    completed_at
  )
  select
    v_league.id,
    match.id,
    match.status,
    match.home_score,
    match.away_score,
    match.result_version,
    v_at
  from public.matches as match
  where match.season_id = v_league.season_id
  order by match.id;
  get diagnostics v_snapshot_count = row_count;

  with closed_request as (
    update public.join_requests as request
    set status = 'rejected',
        rejection_reason = 'LEAGUE_COMPLETED',
        decided_by = v_actor_id,
        decided_at = v_at
    where request.league_id = v_league.id
      and request.status in ('pending_proof', 'pending_approval')
    returning request.id, request.user_id
  )
  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  )
  select
    v_actor_id,
    'join_request_closed_league_completed',
    'join_request',
    closed_request.id,
    jsonb_build_object(
      'league_id', v_league.id,
      'reason', 'LEAGUE_COMPLETED',
      'request_user_id', closed_request.user_id
    ),
    v_at
  from closed_request
  order by closed_request.id;
  get diagnostics v_closed_request_count = row_count;

  update public.leagues as league
  set status = 'completed',
      completed_at = v_at
  where league.id = v_league.id;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  ) values (
    v_actor_id,
    'league_completed',
    'league',
    v_league.id,
    jsonb_build_object(
      'snapshot_count', v_snapshot_count,
      'closed_request_count', v_closed_request_count,
      'scoring_rule_version', v_scoring.version
    ),
    v_at
  );

  return query select
    v_league.id,
    'completed'::public.league_status,
    v_at,
    v_snapshot_count,
    v_closed_request_count,
    true;
end;
$$;

revoke all on function public.complete_league(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_league(uuid) to authenticated;

comment on function public.complete_league(uuid) is
  'Exact-manager atomic completion: terminal/resolved/scored gate, full season snapshot freeze, both pending join states closed with LEAGUE_COMPLETED, preserved proof/member history, and one idempotent league audit.';

create view public.league_match_results
with (security_invoker = true)
as
select
  league.id as league_id,
  match.id as id,
  match.round_number,
  match.kickoff_at,
  match.predictions_locked_at,
  case
    when league.status = 'completed'
      then snapshot.completed_status
    else match.status
  end as status,
  case
    when league.status = 'completed' then null::text
    else match.provider_status
  end as provider_status,
  case
    when league.status = 'completed'
      then snapshot.completed_home_score
    else match.home_score
  end as home_score,
  case
    when league.status = 'completed'
      then snapshot.completed_away_score
    else match.away_score
  end as away_score,
  match.home_team_id,
  home_team.name as home_team_name,
  home_team.short_name as home_team_short_name,
  match.away_team_id,
  away_team.name as away_team_name,
  away_team.short_name as away_team_short_name
from public.leagues as league
join public.matches as match on match.season_id = league.season_id
join public.teams as home_team on home_team.id = match.home_team_id
join public.teams as away_team on away_team.id = match.away_team_id
left join public.league_match_snapshots as snapshot
  on snapshot.league_id = league.id
 and snapshot.match_id = match.id
where league.status <> 'completed' or snapshot.match_id is not null;

revoke all on table public.league_match_results
  from public, anon, authenticated, service_role;
grant select on table public.league_match_results to authenticated;

comment on view public.league_match_results is
  'RLS-preserving league match read model. Completed leagues expose only their frozen included set and snapshot terminal result; mutable canonical results remain visible only before completion.';

create or replace function public.get_match_detail_context(
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
    case
      when league.status = 'completed'
        then snapshot.completed_status
      else match.status
    end,
    case
      when league.status = 'completed' then null::text
      else match.provider_status
    end,
    case
      when league.status = 'completed'
        then snapshot.completed_home_score
      else match.home_score
    end,
    case
      when league.status = 'completed'
        then snapshot.completed_away_score
      else match.away_score
    end,
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
  left join public.league_match_snapshots as snapshot
    on snapshot.league_id = league.id
   and snapshot.match_id = match.id
  left join public.predictions as prediction
    on prediction.league_id = league.id
   and prediction.match_id = match.id
   and prediction.user_id = v_actor_id
  where match.id = p_match_id
    and (league.status <> 'completed' or snapshot.match_id is not null);
end;
$$;

revoke all on function public.get_match_detail_context(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_match_detail_context(uuid, uuid)
  to authenticated;

comment on function public.get_match_detail_context(uuid, uuid) is
  'Authorized active-member detail with database time; completed leagues read the frozen snapshot result and included set.';
