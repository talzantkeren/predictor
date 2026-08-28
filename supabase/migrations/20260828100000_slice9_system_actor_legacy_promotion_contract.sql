-- Re-run the legacy-binding promotion through an idempotent, testable contract.
-- The original deployment statement remains immutable; this forward migration
-- makes the already-bound Hosted upgrade path executable under local pgTAP.

create function private.slice9_promote_legacy_boundary_binding()
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_bound_actor_id uuid;
  v_designated_actor_id uuid;
begin
  select binding.actor_id
    into v_bound_actor_id
    from private.slice9_system_actor_bindings as binding
    where binding.binding_name = 'business_boundary_activation';

  if v_bound_actor_id is null then
    return false;
  end if;

  perform administrator.user_id
  from public.system_admins as administrator
  where administrator.user_id = v_bound_actor_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SYSTEM_ACTOR_UNAVAILABLE';
  end if;

  select administrator.user_id
    into v_designated_actor_id
    from public.system_admins as administrator
    where administrator.automation_purpose = 'sports_sync'
    for key share;

  if v_designated_actor_id is not null
     and v_designated_actor_id is distinct from v_bound_actor_id then
    raise exception using
      errcode = 'P0001',
      message = 'SYSTEM_ACTOR_MISMATCH';
  end if;

  update public.system_admins as administrator
  set automation_purpose = 'sports_sync'
  where administrator.user_id = v_bound_actor_id
    and administrator.automation_purpose is null;

  return exists (
    select 1
    from public.system_admins as administrator
    join private.slice9_system_actor_bindings as binding
      on binding.actor_id = administrator.user_id
     and binding.binding_name = 'business_boundary_activation'
    where administrator.user_id = v_bound_actor_id
      and administrator.automation_purpose = 'sports_sync'
  );
end;
$$;

revoke all on function private.slice9_promote_legacy_boundary_binding()
  from public, anon, authenticated, service_role;

comment on function private.slice9_promote_legacy_boundary_binding() is
  'Invoker-rights, deployment-only contract that promotes an existing private boundary binding to the unique sports_sync designation. It returns false when no legacy binding exists and has no Data API grant.';

select private.slice9_promote_legacy_boundary_binding();
