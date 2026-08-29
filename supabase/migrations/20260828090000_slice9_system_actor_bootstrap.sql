-- Make the noninteractive Sync principal an explicit, durable designation.
-- The legacy private binding remains a lock-safe cache, but business-boundary
-- reconciliation can resolve the designated principal even when that cache is
-- absent. Hosted bootstrap must designate the environment-specific actor before
-- user traffic; migrations intentionally cannot invent an Auth principal UUID.

alter table public.system_admins
  add column automation_purpose text;

alter table public.system_admins
  add constraint system_admins_automation_purpose_check
  check (
    automation_purpose is null
    or automation_purpose = 'sports_sync'
  );

create unique index system_admins_automation_purpose_unique_idx
  on public.system_admins (automation_purpose)
  where automation_purpose is not null;

alter table public.system_admins enable row level security;
revoke all on table public.system_admins
  from public, anon, authenticated, service_role;

comment on column public.system_admins.automation_purpose is
  'Optional unique automation designation. sports_sync identifies the noninteractive principal used by Sync and business-boundary activation.';

create or replace function private.slice9_bind_business_boundary_system_actor(
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bound_actor_id uuid;
  v_designated_actor_id uuid;
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

  select administrator.user_id
    into v_designated_actor_id
    from public.system_admins as administrator
    where administrator.automation_purpose = 'sports_sync'
    for key share;

  if v_designated_actor_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'SYSTEM_ACTOR_UNAVAILABLE';
  end if;
  if v_designated_actor_id is distinct from p_actor_id then
    raise exception using
      errcode = 'P0001',
      message = 'SYSTEM_ACTOR_MISMATCH';
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
  'Verifies the explicitly designated sports_sync principal and populates the private boundary cache before league locks. It has no Data API grant.';

create function private.slice9_sync_business_boundary_actor_binding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.automation_purpose = 'sports_sync'
     and new.automation_purpose is distinct from old.automation_purpose then
    delete from private.slice9_system_actor_bindings as binding
    where binding.binding_name = 'business_boundary_activation'
      and binding.actor_id = old.user_id;
  end if;

  if new.automation_purpose = 'sports_sync' then
    perform private.slice9_bind_business_boundary_system_actor(new.user_id);
  end if;

  return new;
end;
$$;

revoke all on function private.slice9_sync_business_boundary_actor_binding()
  from public, anon, authenticated, service_role;

create trigger slice9_sync_business_boundary_actor_binding
after insert or update of automation_purpose on public.system_admins
for each row execute function private.slice9_sync_business_boundary_actor_binding();

-- Existing environments already have the immutable binding from an observed
-- Cron call. Promote it atomically to the durable designation during deploy.
update public.system_admins as administrator
set automation_purpose = 'sports_sync'
from private.slice9_system_actor_bindings as binding
where binding.binding_name = 'business_boundary_activation'
  and binding.actor_id = administrator.user_id;

create or replace function private.slice9_business_boundary_system_actor()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
begin
  -- Prefer the legacy cache without locking its tuple. The automation purpose
  -- is authoritative, so a stale cache can never designate a human admin.
  select binding.actor_id
    into v_actor_id
    from private.slice9_system_actor_bindings as binding
    join public.system_admins as administrator
      on administrator.user_id = binding.actor_id
     and administrator.automation_purpose = 'sports_sync'
    where binding.binding_name = 'business_boundary_activation'
    for key share of administrator;

  if v_actor_id is null then
    -- Read-only fallback is safe after a league lock. Writing the binding here
    -- would invert Cron's binding-before-league order and recreate a deadlock.
    select administrator.user_id
      into v_actor_id
      from public.system_admins as administrator
      where administrator.automation_purpose = 'sports_sync'
      for key share;
  end if;

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
  'Returns the explicitly designated and still-authorized sports_sync principal. It falls back read-only when the legacy cache row is absent and has no Data API grant.';

comment on trigger slice9_sync_business_boundary_actor_binding
  on public.system_admins is
  'Populates or removes the private boundary cache at the controlled sports_sync designation boundary, before application traffic.';
