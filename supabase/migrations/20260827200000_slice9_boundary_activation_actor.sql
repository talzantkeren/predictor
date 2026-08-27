-- Boundary-triggered late activation is a system reconciliation, not an act
-- performed by the member or invitee whose request happened to discover it.
-- Persist the dedicated server-supplied principal privately and retain the
-- triggering caller only as audit metadata.

create table private.slice9_system_actor_bindings (
  binding_name text primary key,
  actor_id uuid not null
    references public.system_admins(user_id) on delete cascade,
  bound_at timestamptz not null default clock_timestamp(),
  constraint slice9_system_actor_bindings_name_check check (
    binding_name = 'business_boundary_activation'
  ),
  constraint slice9_system_actor_bindings_bound_at_check check (
    isfinite(bound_at)
  )
);

revoke all on table private.slice9_system_actor_bindings
  from public, anon, authenticated, service_role;

comment on table private.slice9_system_actor_bindings is
  'Private singleton bindings from system-only gateway purposes to validated noninteractive system administrators. No Data API role has table access.';

create function private.slice9_bind_business_boundary_system_actor(
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bound_actor_id uuid;
begin
  if p_actor_id is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  perform administrator.user_id
  from public.system_admins as administrator
  where administrator.user_id = p_actor_id
  for key share;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  insert into private.slice9_system_actor_bindings as binding (
    binding_name,
    actor_id
  ) values (
    'business_boundary_activation',
    p_actor_id
  )
  on conflict (binding_name) do nothing;

  select binding.actor_id
    into v_bound_actor_id
    from private.slice9_system_actor_bindings as binding
    where binding.binding_name = 'business_boundary_activation';

  if v_bound_actor_id is distinct from p_actor_id then
    raise exception using
      errcode = 'P0001',
      message = 'SYSTEM_ACTOR_MISMATCH';
  end if;
end;
$$;

revoke all on function private.slice9_bind_business_boundary_system_actor(uuid)
  from public, anon, authenticated, service_role;

comment on function private.slice9_bind_business_boundary_system_actor(uuid) is
  'Binds the first validated server-supplied system actor for boundary activation and rejects silent replacement. Rotation requires revoking the old system_admin binding first. It has no Data API grant.';

create function private.slice9_business_boundary_system_actor()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
begin
  select binding.actor_id
    into v_actor_id
    from private.slice9_system_actor_bindings as binding
    join public.system_admins as administrator
      on administrator.user_id = binding.actor_id
    where binding.binding_name = 'business_boundary_activation'
    for key share of administrator;

  if v_actor_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'SYSTEM_ACTOR_UNAVAILABLE';
  end if;

  return v_actor_id;
end;
$$;

revoke all on function private.slice9_business_boundary_system_actor()
  from public, anon, authenticated, service_role;

comment on function private.slice9_business_boundary_system_actor() is
  'Returns the currently bound and still-authorized noninteractive actor for business-boundary activation. It has no Data API grant.';

create or replace function private.slice9_reconcile_effective_activation_after_league_lock(
  p_league_id uuid,
  p_actor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league public.leagues%rowtype;
  v_first_kickoff_at timestamptz;
  v_recorded_at timestamptz;
  v_system_actor_id uuid;
begin
  if p_league_id is null or p_actor_id is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  -- The caller already owns this row lock. Re-locking is intentional and
  -- documents the helper's required parent without acquiring a child first.
  select league.* into v_league
  from public.leagues as league
  where league.id = p_league_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_FOUND';
  end if;

  if v_league.status <> 'open' then
    return false;
  end if;

  select min(match.kickoff_at)
    into v_first_kickoff_at
    from public.matches as match
    where match.season_id = v_league.season_id;
  v_recorded_at := clock_timestamp();

  if v_first_kickoff_at is null or v_recorded_at < v_first_kickoff_at then
    return false;
  end if;

  -- Resolve the system identity only when a late transition will be written.
  -- The ordinary caller remains useful provenance but must not be attributed
  -- as the actor that performed this system reconciliation.
  v_system_actor_id := private.slice9_business_boundary_system_actor();

  update public.league_scoring_rules as scoring
  set locked_at = coalesce(scoring.locked_at, v_first_kickoff_at)
  where scoring.league_id = v_league.id;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_STARTABLE';
  end if;

  update public.leagues as league
  set status = 'active',
      activated_at = v_first_kickoff_at
  where league.id = v_league.id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_system_actor_id,
    'league_activated',
    'league',
    v_league.id,
    jsonb_build_object(
      'code', 'ACTIVATION_PERSIST_LATE',
      'origin', 'business_boundary',
      'triggering_actor_id', p_actor_id,
      'activated_at', v_first_kickoff_at,
      'recorded_at', v_recorded_at,
      'first_kickoff_at', v_first_kickoff_at
    ),
    v_recorded_at
  );

  return true;
end;
$$;

revoke all on function private.slice9_reconcile_effective_activation_after_league_lock(
  uuid, uuid
) from public, anon, authenticated, service_role;

comment on function private.slice9_reconcile_effective_activation_after_league_lock(
  uuid, uuid
) is
  'After the caller locks a league, applies one delayed effective activation when needed; attributes the audit to the bound system actor and stores the triggering caller only in metadata.';

create or replace function public.activate_due_leagues()
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
  perform private.slice9_bind_business_boundary_system_actor(v_actor_id);

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
  'Existing-Cron activation prefix. It validates and privately binds the dedicated system actor before scheduled or boundary-triggered activation can be recorded.';
