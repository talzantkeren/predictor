-- Slice 9 lifecycle activation: manual manager start plus the fixed-lookahead
-- fallback invoked before every existing Sync Cron provider branch.

alter table public.leagues
  add column activated_at timestamptz,
  add constraint leagues_activated_at_check check (
    activated_at is null or isfinite(activated_at)
  );

create index leagues_open_season_idx
  on public.leagues (season_id, id)
  where status = 'open';

comment on column public.leagues.activated_at is
  'Effective activation time. On-time transitions use their database decision time; delayed persistence records the first included kickoff while audit created_at remains the actual write time.';

create function private.slice9_activate_league_core(
  p_league_id uuid,
  p_actor_id uuid,
  p_origin text,
  p_explicit_decision_at timestamptz
)
returns table (
  result_league_id uuid,
  result_status public.league_status,
  result_activated_at timestamptz,
  result_recorded_at timestamptz,
  result_code text,
  result_changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league public.leagues%rowtype;
  v_first_kickoff_at timestamptz;
  v_decision_at timestamptz;
  v_activated_at timestamptz;
  v_code text;
begin
  if p_league_id is null
     or p_actor_id is null
     or p_origin not in ('manual', 'scheduled') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select league.*
    into v_league
    from public.leagues as league
    where league.id = p_league_id
    for update;

  if not found
     or (
       p_origin = 'manual'
       and v_league.manager_id <> p_actor_id
     )
     or (
       p_origin = 'scheduled'
       and not exists (
         select 1
         from public.system_admins as administrator
         where administrator.user_id = p_actor_id
       )
     ) then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_FOUND';
  end if;

  if v_league.status <> 'open' then
    if v_league.status = 'active' then
      return query select
        v_league.id,
        v_league.status,
        v_league.activated_at,
        null::timestamptz,
        'ALREADY_ACTIVE'::text,
        false;
      return;
    end if;

    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_STARTABLE';
  end if;

  -- The league parent is locked above. Scoring is locked before the match
  -- level, and included matches are locked in canonical UUID order.
  perform scoring.league_id
    from public.league_scoring_rules as scoring
    where scoring.league_id = v_league.id
    for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_STARTABLE';
  end if;

  perform match.id
    from public.matches as match
    where match.season_id = v_league.season_id
    order by match.id
    for update;

  select min(match.kickoff_at)
    into v_first_kickoff_at
    from public.matches as match
    where match.season_id = v_league.season_id;

  v_decision_at := coalesce(p_explicit_decision_at, clock_timestamp());
  if not isfinite(v_decision_at) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  if v_first_kickoff_at is not null
     and v_decision_at > v_first_kickoff_at then
    v_code := 'ACTIVATION_PERSIST_LATE';
    v_activated_at := v_first_kickoff_at;
  elsif p_origin = 'manual' then
    v_code := 'MANUAL_ACTIVATION';
    v_activated_at := v_decision_at;
  else
    v_code := 'ACTIVATION_FALLBACK';
    v_activated_at := v_decision_at;
  end if;

  update public.leagues as league
  set status = 'active',
      activated_at = v_activated_at
  where league.id = v_league.id;

  update public.league_scoring_rules as scoring
  set locked_at = coalesce(scoring.locked_at, v_activated_at)
  where scoring.league_id = v_league.id;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  ) values (
    p_actor_id,
    'league_activated',
    'league',
    v_league.id,
    jsonb_build_object(
      'code', v_code,
      'origin', p_origin,
      'activated_at', v_activated_at,
      'recorded_at', v_decision_at,
      'first_kickoff_at', v_first_kickoff_at
    ),
    v_decision_at
  );

  return query select
    v_league.id,
    'active'::public.league_status,
    v_activated_at,
    v_decision_at,
    v_code,
    true;
end;
$$;

revoke all on function private.slice9_activate_league_core(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated, service_role;

create function private.slice9_activate_due_leagues_core(
  p_actor_id uuid,
  p_explicit_decision_at timestamptz,
  p_lookahead interval
)
returns table (
  activated_count integer,
  late_count integer,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision_at timestamptz;
  v_candidate_ids uuid[] := '{}'::uuid[];
  v_candidate_id uuid;
  v_result record;
  v_activated_count integer := 0;
  v_late_count integer := 0;
begin
  if p_actor_id is null
     or not exists (
       select 1
       from public.system_admins as administrator
       where administrator.user_id = p_actor_id
     ) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  v_decision_at := coalesce(p_explicit_decision_at, clock_timestamp());
  if not isfinite(v_decision_at)
     or p_lookahead is null
     or p_lookahead < interval '1 minute'
     or p_lookahead > interval '5 minutes' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  -- Manual catalog and API-Football apply take this same application lock
  -- before league/match work, so the first included kickoff cannot change
  -- between candidate selection and persistence.
  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  select coalesce(array_agg(candidate.league_id order by candidate.league_id), '{}')
    into v_candidate_ids
    from (
      select league.id as league_id
      from public.leagues as league
      join public.matches as match on match.season_id = league.season_id
      where league.status = 'open'
      group by league.id
      having min(match.kickoff_at) <= v_decision_at + p_lookahead
    ) as candidate;

  -- Acquire every parent before any match child. The core re-locks each parent
  -- reentrantly, then locks only that league season's matches in UUID order.
  perform league.id
    from public.leagues as league
    where league.id = any(v_candidate_ids)
    order by league.id
    for update;

  foreach v_candidate_id in array v_candidate_ids loop
    select result.*
      into v_result
      from private.slice9_activate_league_core(
        v_candidate_id,
        p_actor_id,
        'scheduled',
        v_decision_at
      ) as result;

    if v_result.result_changed then
      v_activated_count := v_activated_count + 1;
      if v_result.result_code = 'ACTIVATION_PERSIST_LATE' then
        v_late_count := v_late_count + 1;
      end if;
    end if;
  end loop;

  return query select v_activated_count, v_late_count, v_decision_at;
end;
$$;

revoke all on function private.slice9_activate_due_leagues_core(
  uuid, timestamptz, interval
) from public, anon, authenticated, service_role;

create function public.start_league(p_league_id uuid)
returns table (
  result_league_id uuid,
  result_status public.league_status,
  result_activated_at timestamptz,
  result_recorded_at timestamptz,
  result_code text,
  result_changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  return query
  select result.*
  from private.slice9_activate_league_core(
    p_league_id,
    v_actor_id,
    'manual',
    null::timestamptz
  ) as result;
end;
$$;

revoke all on function public.start_league(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_league(uuid) to authenticated;

comment on function public.start_league(uuid) is
  'Atomically and idempotently lets the exact league manager activate an open league using fresh database time, locks scoring, and writes one safe audit event.';

create function public.activate_due_leagues()
returns table (
  activated_count integer,
  late_count integer,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := private.slice9_system_actor_from_request();

  return query
  select result.*
  from private.slice9_activate_due_leagues_core(
    v_actor_id,
    null::timestamptz,
    interval '2 minutes'
  ) as result;
end;
$$;

revoke all on function public.activate_due_leagues()
  from public, anon, authenticated, service_role;
grant execute on function public.activate_due_leagues() to service_role;

comment on function public.activate_due_leagues() is
  'Existing-Cron activation prefix. A two-minute lookahead covers the documented one-minute cadence; delayed writes are preserved as ACTIVATION_PERSIST_LATE and counted separately.';

-- Serialize provider fixture writes with first-kickoff activation selection.
-- The existing hardened implementation remains inaccessible behind this
-- wrapper and still delegates terminal scoring through score_match.
alter function public.apply_api_football_sync_batch(uuid, bigint, uuid, jsonb)
  rename to slice9_apply_api_football_sync_batch_unserialized;
alter function public.slice9_apply_api_football_sync_batch_unserialized(
  uuid, bigint, uuid, jsonb
) set schema private;

revoke all on function private.slice9_apply_api_football_sync_batch_unserialized(
  uuid, bigint, uuid, jsonb
) from public, anon, authenticated, service_role;

create function public.apply_api_football_sync_batch(
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
begin
  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  -- The delegated implementation invokes score_match; this wrapper only
  -- establishes the lifecycle serialization point and never updates predictions.
  return query
  select result.*
  from private.slice9_apply_api_football_sync_batch_unserialized(
    p_run_id,
    p_generation,
    p_token,
    p_payload
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
  'Serializes provider fixture writes with lifecycle first-kickoff decisions, then delegates the existing fenced, isolated, deterministic apply implementation.';
