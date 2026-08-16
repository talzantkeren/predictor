-- Slice 5 predictions: exact-score storage, database-owned lock/reveal rules,
-- season consistency, least-privilege RLS, and one authenticated save RPC.

do $$
begin
  create type public.outcome as enum ('HOME', 'DRAW', 'AWAY');
exception
  when duplicate_object then null;
end
$$;

create table public.predictions (
  id uuid primary key default extensions.gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete restrict,
  match_id uuid not null references public.matches(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  predicted_home_score smallint not null,
  predicted_away_score smallint not null,
  predicted_outcome public.outcome generated always as (
    case
      when predicted_home_score > predicted_away_score then 'HOME'::public.outcome
      when predicted_home_score < predicted_away_score then 'AWAY'::public.outcome
      else 'DRAW'::public.outcome
    end
  ) stored not null,
  points smallint not null default 0,
  is_exact boolean,
  is_correct_outcome boolean,
  scored_at timestamptz,
  scored_result_version integer,
  scored_rule_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint predictions_home_score_check check (predicted_home_score between 0 and 30),
  constraint predictions_away_score_check check (predicted_away_score between 0 and 30),
  constraint predictions_points_check check (points between 0 and 100),
  constraint predictions_scored_result_version_check check (
    scored_result_version is null or scored_result_version >= 0
  ),
  constraint predictions_scored_rule_version_check check (
    scored_rule_version is null or scored_rule_version > 0
  ),
  constraint predictions_league_match_user_key unique (league_id, match_id, user_id)
);

create index predictions_match_idx on public.predictions (match_id);
create index predictions_league_user_idx on public.predictions (league_id, user_id);

comment on table public.predictions is
  'One current exact-score prediction per league, match, and active member. Scoring metadata remains null until Slice 6.';
comment on column public.predictions.predicted_outcome is
  'Database-generated outcome derived from the exact score; clients cannot supply it.';
comment on column public.predictions.points is
  'Stored Slice 6 scoring output. Zero with scored_at null means the prediction is not yet scored.';

create function private.enforce_prediction_season_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_league_season_id uuid;
  v_match_season_id uuid;
begin
  select league.season_id
    into v_league_season_id
    from public.leagues as league
    where league.id = new.league_id;

  select match.season_id
    into v_match_season_id
    from public.matches as match
    where match.id = new.match_id;

  if v_league_season_id is null
     or v_match_season_id is null
     or v_league_season_id is distinct from v_match_season_id then
    raise exception using
      errcode = 'P0001',
      message = 'PREDICTION_SEASON_MISMATCH';
  end if;

  return new;
end;
$$;

create function private.prevent_league_prediction_season_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.season_id is distinct from old.season_id
     and exists (
       select 1
       from public.predictions as prediction
       where prediction.league_id = old.id
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'PREDICTION_SEASON_MISMATCH';
  end if;

  return new;
end;
$$;

create function private.prevent_match_prediction_season_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.season_id is distinct from old.season_id
     and exists (
       select 1
       from public.predictions as prediction
       where prediction.match_id = old.id
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'PREDICTION_SEASON_MISMATCH';
  end if;

  return new;
end;
$$;

create function private.touch_prediction_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function private.enforce_prediction_season_consistency()
  from public, anon, authenticated, service_role;
revoke all on function private.prevent_league_prediction_season_change()
  from public, anon, authenticated, service_role;
revoke all on function private.prevent_match_prediction_season_change()
  from public, anon, authenticated, service_role;
revoke all on function private.touch_prediction_updated_at()
  from public, anon, authenticated, service_role;

create trigger predictions_enforce_season_consistency
before insert or update of league_id, match_id on public.predictions
for each row execute function private.enforce_prediction_season_consistency();

create trigger predictions_touch_updated_at
before update on public.predictions
for each row execute function private.touch_prediction_updated_at();

create trigger leagues_prevent_prediction_season_change
before update of season_id on public.leagues
for each row execute function private.prevent_league_prediction_season_change();

create trigger matches_prevent_prediction_season_change
before update of season_id on public.matches
for each row execute function private.prevent_match_prediction_season_change();

alter table public.predictions enable row level security;

revoke all on table public.predictions
  from public, anon, authenticated, service_role;
grant select on table public.predictions to authenticated;

create policy predictions_authorized_read
  on public.predictions
  for select
  to authenticated
  using (
    private.is_active_league_member(league_id)
    and (
      user_id = (select auth.uid())
      or exists (
        select 1
        from public.matches as match
        where match.id = match_id
          and now() >= match.kickoff_at
      )
    )
  );

create function public.get_prediction_database_time()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now();
$$;

create function public.save_prediction(
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

  select league.season_id
    into v_league_season_id
    from public.leagues as league
    where league.id = p_league_id;

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

revoke all on function public.get_prediction_database_time()
  from public, anon, authenticated, service_role;
revoke all on function public.save_prediction(uuid, uuid, numeric, numeric)
  from public, anon, authenticated, service_role;

grant execute on function public.get_prediction_database_time() to authenticated;
grant execute on function public.save_prediction(uuid, uuid, numeric, numeric)
  to authenticated;

comment on function public.get_prediction_database_time() is
  'Returns PostgreSQL transaction time for deterministic server-rendered prediction lock state.';
comment on function public.save_prediction(uuid, uuid, numeric, numeric) is
  'Creates or replaces the caller prediction only while active membership, season, status, and database-time checks hold.';
