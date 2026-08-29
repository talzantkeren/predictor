-- Slice 9 lifecycle concurrency hardening. Every wrapped mutation establishes
-- the lifecycle serialization point, authorizes and locks its league parent,
-- reconciles a delayed effective activation, and only then delegates to the
-- previously verified narrow RPC implementation.

create function private.slice9_reconcile_effective_activation_after_league_lock(
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

  -- All catalog writers and lifecycle transitions own advisory lock
  -- 2026090609 before reaching this helper, so the included fixture set cannot
  -- change between the aggregate and persistence. No match child is locked
  -- here, which lets the delegated path continue in canonical child order.
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
    p_actor_id,
    'league_activated',
    'league',
    v_league.id,
    jsonb_build_object(
      'code', 'ACTIVATION_PERSIST_LATE',
      'origin', 'business_boundary',
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

alter function public.approve_join_request(uuid)
  rename to slice9_approve_join_request_without_league_lock;
alter function public.slice9_approve_join_request_without_league_lock(uuid)
  set schema private;
revoke all on function private.slice9_approve_join_request_without_league_lock(uuid)
  from public, anon, authenticated, service_role;

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
  v_league_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(2026090609);
  select league.id into v_league_id
  from public.join_requests as request
  join public.leagues as league on league.id = request.league_id
  where request.id = p_request_id and league.manager_id = v_actor_id
  for update of league;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform private.slice9_reconcile_effective_activation_after_league_lock(
    v_league_id, v_actor_id
  );
  return query select result.*
  from private.slice9_approve_join_request_without_league_lock(
    p_request_id
  ) as result;
end;
$$;

alter function public.reject_join_request(uuid, text)
  rename to slice9_reject_join_request_without_league_lock;
alter function public.slice9_reject_join_request_without_league_lock(uuid, text)
  set schema private;
revoke all on function private.slice9_reject_join_request_without_league_lock(uuid, text)
  from public, anon, authenticated, service_role;

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
  v_league_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(2026090609);
  select league.id into v_league_id
  from public.join_requests as request
  join public.leagues as league on league.id = request.league_id
  where request.id = p_request_id and league.manager_id = v_actor_id
  for update of league;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform private.slice9_reconcile_effective_activation_after_league_lock(
    v_league_id, v_actor_id
  );
  return query select result.*
  from private.slice9_reject_join_request_without_league_lock(
    p_request_id, p_reason
  ) as result;
end;
$$;

alter function public.finalize_payment_proof(uuid, uuid, uuid, text, integer)
  rename to slice9_finalize_payment_proof_without_league_lock;
alter function public.slice9_finalize_payment_proof_without_league_lock(
  uuid, uuid, uuid, text, integer
) set schema private;
revoke all on function private.slice9_finalize_payment_proof_without_league_lock(
  uuid, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;

create function public.finalize_payment_proof(
  p_request_id uuid,
  p_proof_id uuid,
  p_idempotency_key uuid,
  p_sha256 text,
  p_size_bytes integer
)
returns table (
  proof_id uuid,
  request_id uuid,
  status public.join_request_status,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_league_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(2026090609);
  select league.id into v_league_id
  from public.join_requests as request
  join public.leagues as league on league.id = request.league_id
  where request.id = p_request_id and request.user_id = v_actor_id
  for update of league;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform private.slice9_reconcile_effective_activation_after_league_lock(
    v_league_id, v_actor_id
  );
  return query select result.*
  from private.slice9_finalize_payment_proof_without_league_lock(
    p_request_id, p_proof_id, p_idempotency_key, p_sha256, p_size_bytes
  ) as result;
end;
$$;

alter function public.save_prediction(uuid, uuid, numeric, numeric)
  rename to slice9_save_prediction_without_league_lock;
alter function public.slice9_save_prediction_without_league_lock(
  uuid, uuid, numeric, numeric
) set schema private;
revoke all on function private.slice9_save_prediction_without_league_lock(
  uuid, uuid, numeric, numeric
) from public, anon, authenticated, service_role;

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
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(2026090609);
  perform league.id
  from public.leagues as league
  where league.id = p_league_id
    and exists (
      select 1 from public.league_members as member
      where member.league_id = league.id
        and member.user_id = v_actor_id
        and member.status = 'active'
    )
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform private.slice9_reconcile_effective_activation_after_league_lock(
    p_league_id, v_actor_id
  );
  return query select result.*
  from private.slice9_save_prediction_without_league_lock(
    p_league_id, p_match_id, p_predicted_home_score, p_predicted_away_score
  ) as result;
end;
$$;

alter function public.create_or_rotate_invite(uuid)
  rename to slice9_create_or_rotate_invite_without_activation_guard;
alter function public.slice9_create_or_rotate_invite_without_activation_guard(uuid)
  set schema private;
revoke all on function private.slice9_create_or_rotate_invite_without_activation_guard(uuid)
  from public, anon, authenticated, service_role;

create function public.create_or_rotate_invite(p_league_id uuid)
returns table (
  invite_id uuid,
  public_id uuid,
  status public.invite_status,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  raw_token text
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
  perform league.id from public.leagues as league
  where league.id = p_league_id and league.manager_id = v_actor_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform private.slice9_reconcile_effective_activation_after_league_lock(
    p_league_id, v_actor_id
  );
  return query select result.*
  from private.slice9_create_or_rotate_invite_without_activation_guard(
    p_league_id
  ) as result;
end;
$$;

alter function public.revoke_invite(uuid)
  rename to slice9_revoke_invite_without_activation_guard;
alter function public.slice9_revoke_invite_without_activation_guard(uuid)
  set schema private;
revoke all on function private.slice9_revoke_invite_without_activation_guard(uuid)
  from public, anon, authenticated, service_role;

create function public.revoke_invite(p_invite_id uuid)
returns table (
  invite_id uuid,
  status public.invite_status,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_league_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(2026090609);
  select league.id into v_league_id
  from public.invite_links as invite
  join public.leagues as league on league.id = invite.league_id
  where invite.id = p_invite_id and league.manager_id = v_actor_id
  for update of league;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform private.slice9_reconcile_effective_activation_after_league_lock(
    v_league_id, v_actor_id
  );
  return query select result.*
  from private.slice9_revoke_invite_without_activation_guard(
    p_invite_id
  ) as result;
end;
$$;

alter function public.submit_join_request(uuid, text)
  rename to slice9_submit_join_request_without_activation_guard;
alter function public.slice9_submit_join_request_without_activation_guard(uuid, text)
  set schema private;
revoke all on function private.slice9_submit_join_request_without_activation_guard(uuid, text)
  from public, anon, authenticated, service_role;

create function public.submit_join_request(p_public_id uuid, p_token_hash text)
returns table (
  request_id uuid,
  status public.join_request_status,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_league_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(2026090609);
  select league.id into v_league_id
  from public.invite_links as invite
  join public.leagues as league on league.id = invite.league_id
  where invite.public_id = p_public_id
    and invite.token_hash = p_token_hash
  for update of league;
  if not found then
    raise exception using errcode = 'P0001', message = 'INVITE_UNAVAILABLE';
  end if;
  perform private.slice9_reconcile_effective_activation_after_league_lock(
    v_league_id, v_actor_id
  );
  return query select result.*
  from private.slice9_submit_join_request_without_activation_guard(
    p_public_id, p_token_hash
  ) as result;
end;
$$;

alter function public.complete_league(uuid)
  rename to slice9_complete_league_without_activation_guard;
alter function public.slice9_complete_league_without_activation_guard(uuid)
  set schema private;
revoke all on function private.slice9_complete_league_without_activation_guard(uuid)
  from public, anon, authenticated, service_role;

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
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(2026090609);
  perform league.id from public.leagues as league
  where league.id = p_league_id and league.manager_id = v_actor_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_FOUND';
  end if;
  perform private.slice9_reconcile_effective_activation_after_league_lock(
    p_league_id, v_actor_id
  );
  return query select result.*
  from private.slice9_complete_league_without_activation_guard(
    p_league_id
  ) as result;
end;
$$;

revoke all on function public.approve_join_request(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reject_join_request(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_payment_proof(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.save_prediction(uuid, uuid, numeric, numeric)
  from public, anon, authenticated, service_role;
revoke all on function public.create_or_rotate_invite(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_invite(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_join_request(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_league(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.approve_join_request(uuid) to authenticated;
grant execute on function public.reject_join_request(uuid, text) to authenticated;
grant execute on function public.finalize_payment_proof(uuid, uuid, uuid, text, integer)
  to authenticated;
grant execute on function public.save_prediction(uuid, uuid, numeric, numeric)
  to authenticated;
grant execute on function public.create_or_rotate_invite(uuid) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.submit_join_request(uuid, text) to authenticated;
grant execute on function public.complete_league(uuid) to authenticated;

comment on function private.slice9_reconcile_effective_activation_after_league_lock(
  uuid, uuid
) is
  'Persists a delayed effective-active boundary exactly once after its caller owns the lifecycle advisory lock and league parent; audit time remains the actual write time.';
