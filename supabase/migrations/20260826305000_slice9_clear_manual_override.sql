-- Slice 9 DEF-008: let a system administrator explicitly hand one
-- API-Football match back to the provider without changing its current result.
-- The mutation is intentionally narrower than score_match: it changes only
-- ownership metadata and leaves every result, latch, and prediction untouched.

create function public.clear_manual_match_override(p_match_id uuid)
returns table (
  result_match_id uuid,
  result_status public.match_status,
  result_home_score smallint,
  result_away_score smallint,
  result_version integer,
  result_external_provider text,
  result_cleared boolean,
  result_manual_override boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_match public.matches%rowtype;
  v_match_exists boolean := false;
  v_snapshot_exists boolean := false;
  v_season_snapshot uuid;
  v_at timestamptz;
begin
  v_actor_id := private.slice9_system_actor_from_request();

  if p_match_id is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  -- Discover only the parent key. The authoritative row is locked and checked
  -- again after every affected league has been acquired in canonical UUID order.
  select match.season_id into v_season_snapshot
  from public.matches as match
  where match.id = p_match_id;
  v_snapshot_exists := found;

  if v_snapshot_exists then
    perform league.id
    from public.leagues as league
    where league.season_id = v_season_snapshot
    order by league.id
    for update;
  end if;

  -- A revocation that committed while this call waited must win. Conversely,
  -- once this key-share lock is retained, revocation waits for the authorized
  -- transaction to finish.
  perform administrator.user_id
  from public.system_admins as administrator
  where administrator.user_id = v_actor_id
  for key share;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select match.* into v_match
  from public.matches as match
  where match.id = p_match_id
  for update;
  v_match_exists := found;

  if v_match_exists is distinct from v_snapshot_exists
     or (
       v_match_exists
       and v_match.season_id is distinct from v_season_snapshot
     ) then
    raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
  end if;
  if not v_match_exists then
    raise exception using errcode = 'P0001', message = 'MATCH_NOT_FOUND';
  end if;

  -- A synthetic/manual-only row has no provider ownership to restore. Keep the
  -- check exact so this boundary cannot become a generic source switch.
  if v_match.external_provider is distinct from 'api-football'
     or v_match.external_id is null
     or v_match.external_id !~ '^[1-9][0-9]{0,19}$' then
    raise exception using
      errcode = 'P0001',
      message = 'MATCH_PROVIDER_OWNERSHIP_REQUIRED';
  end if;

  -- Replay is a true no-op: no timestamp movement and no duplicate audit.
  if not v_match.is_manually_overridden then
    return query select
      v_match.id,
      v_match.status,
      v_match.home_score,
      v_match.away_score,
      v_match.result_version,
      v_match.external_provider,
      false,
      false;
    return;
  end if;

  -- Frozen snapshots and explicit post-completion reconciliation arrive in W4.
  -- Until then, a first handoff must not reopen automatic mutation for a season
  -- that already has a completed or archived league.
  if exists (
    select 1
    from public.leagues as league
    where league.season_id = v_match.season_id
      and league.status in ('completed', 'archived')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COMPLETED_RECONCILIATION_REQUIRED';
  end if;

  v_at := clock_timestamp();

  update public.matches as match
  set is_manually_overridden = false,
      updated_at = v_at
  where match.id = v_match.id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata
  ) values (
    v_actor_id,
    'match_manual_override_cleared',
    'match',
    v_match.id,
    jsonb_build_object(
      'source', 'system-admin',
      'provider', v_match.external_provider,
      'external_id', v_match.external_id,
      'status', v_match.status,
      'home_score', v_match.home_score,
      'away_score', v_match.away_score,
      'result_version', v_match.result_version,
      'predictions_locked_at', v_match.predictions_locked_at,
      'result_preserved', true,
      'predictions_preserved', true
    )
  );

  return query select
    v_match.id,
    v_match.status,
    v_match.home_score,
    v_match.away_score,
    v_match.result_version,
    v_match.external_provider,
    true,
    false;
end;
$$;

revoke all on function public.clear_manual_match_override(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.clear_manual_match_override(uuid)
  to service_role;

comment on function public.clear_manual_match_override(uuid) is
  'Idempotently returns one manually overridden API-Football match to provider ownership for a verified system actor while preserving its current result, version, prediction latch, and all predictions.';
