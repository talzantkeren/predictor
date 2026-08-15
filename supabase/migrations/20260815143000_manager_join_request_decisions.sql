-- Pull the manager decision queue into the hosted Slice 3 acceptance flow.
-- This migration is additive: existing requests, proof history, and membership
-- rows are preserved. All business mutations remain user-scoped RPCs.

comment on table public.join_requests is
  'Append-preserved join request history. Managers decide pending proof-backed requests through atomic RPCs.';
comment on table public.league_members is
  'League membership history. Approval atomically creates or reactivates one active membership per user and league.';

create function public.get_manager_join_requests(p_league_id uuid)
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

  if not exists (
    select 1
    from public.leagues as league
    where league.id = p_league_id
      and league.manager_id = v_actor_id
  ) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
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
  order by
    case request.status
      when 'pending_approval' then 0
      when 'pending_proof' then 1
      else 2
    end,
    request.created_at,
    request.id
  limit 100;
end;
$$;

create function public.get_my_join_requests_v2()
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
  order by request.created_at desc, request.id desc
  limit 100;
end;
$$;

create function public.approve_join_request(p_request_id uuid)
returns table (
  request_id uuid,
  request_status public.join_request_status,
  member_id uuid,
  member_status public.member_status,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_at timestamptz;
  v_request public.join_requests%rowtype;
  v_member public.league_members%rowtype;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select request.*
    into v_request
    from public.join_requests as request
    where request.id = p_request_id
    for update;

  if not found or not exists (
    select 1
    from public.leagues as league
    where league.id = v_request.league_id
      and league.manager_id = v_actor_id
  ) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if v_request.status = 'approved' then
    select member.*
      into v_member
      from public.league_members as member
      where member.league_id = v_request.league_id
        and member.user_id = v_request.user_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
    end if;

    return query
    select
      v_request.id,
      v_request.status,
      v_member.id,
      v_member.status,
      v_request.decided_at;
    return;
  end if;

  if v_request.status <> 'pending_approval' then
    raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
  end if;

  if not exists (
    select 1
    from public.payment_proofs as proof
    where proof.join_request_id = v_request.id
      and proof.deleted_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
  end if;

  v_at := clock_timestamp();

  insert into public.league_members (
    league_id,
    user_id,
    status,
    approved_by,
    approved_at,
    removed_by,
    removed_at,
    created_at,
    updated_at
  )
  values (
    v_request.league_id,
    v_request.user_id,
    'active',
    v_actor_id,
    v_at,
    null,
    null,
    v_at,
    v_at
  )
  on conflict (league_id, user_id) do update
  set status = 'active',
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      removed_by = null,
      removed_at = null,
      updated_at = excluded.updated_at
  returning * into v_member;

  update public.join_requests as request
  set status = 'approved',
      rejection_reason = null,
      decided_by = v_actor_id,
      decided_at = v_at,
      updated_at = v_at
  where request.id = v_request.id
  returning request.* into v_request;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  )
  values (
    v_actor_id,
    'join_request.approved',
    'join_request',
    v_request.id,
    jsonb_build_object('league_id', v_request.league_id),
    v_at
  );

  return query
  select
    v_request.id,
    v_request.status,
    v_member.id,
    v_member.status,
    v_request.decided_at;
end;
$$;

create function public.reject_join_request(p_request_id uuid, p_reason text)
returns table (
  request_id uuid,
  request_status public.join_request_status,
  rejection_reason text,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_at timestamptz;
  v_reason text := btrim(p_reason);
  v_request public.join_requests%rowtype;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if v_reason is null
     or char_length(v_reason) not between 3 and 300
     or v_reason ~ '[[:cntrl:]]'
     or v_reason ~ U&'[\2028\2029]' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select request.*
    into v_request
    from public.join_requests as request
    where request.id = p_request_id
    for update;

  if not found or not exists (
    select 1
    from public.leagues as league
    where league.id = v_request.league_id
      and league.manager_id = v_actor_id
  ) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if v_request.status = 'rejected' then
    if v_request.rejection_reason <> v_reason then
      raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
    end if;

    return query
    select
      v_request.id,
      v_request.status,
      v_request.rejection_reason,
      v_request.decided_at;
    return;
  end if;

  if v_request.status <> 'pending_approval' then
    raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
  end if;

  v_at := clock_timestamp();

  update public.join_requests as request
  set status = 'rejected',
      rejection_reason = v_reason,
      decided_by = v_actor_id,
      decided_at = v_at,
      updated_at = v_at
  where request.id = v_request.id
  returning request.* into v_request;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  )
  values (
    v_actor_id,
    'join_request.rejected',
    'join_request',
    v_request.id,
    jsonb_build_object('league_id', v_request.league_id),
    v_at
  );

  return query
  select
    v_request.id,
    v_request.status,
    v_request.rejection_reason,
    v_request.decided_at;
end;
$$;

revoke all on function public.get_manager_join_requests(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_join_requests_v2()
  from public, anon, authenticated, service_role;
revoke all on function public.approve_join_request(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reject_join_request(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.get_manager_join_requests(uuid) to authenticated;
grant execute on function public.get_my_join_requests_v2() to authenticated;
grant execute on function public.approve_join_request(uuid) to authenticated;
grant execute on function public.reject_join_request(uuid, text) to authenticated;

comment on function public.get_manager_join_requests(uuid) is
  'Returns a bounded, proof-safe join-request queue only to the exact league manager.';
comment on function public.get_my_join_requests_v2() is
  'Returns the caller own join-request history including a safe rejection reason.';
comment on function public.approve_join_request(uuid) is
  'Atomically approves a proof-backed request, activates one membership, and audits once.';
comment on function public.reject_join_request(uuid, text) is
  'Atomically rejects a proof-backed request with a required safe reason and audits once.';
