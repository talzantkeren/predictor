-- Independent-review hardening: lifecycle mutations use a league-scoped
-- advisory key. A one-key registry mutex remains only for bounded sports
-- catalog writers that can add fixtures; they enter the registry barrier,
-- discover affected leagues, then acquire those league keys in stable order.

create function private.slice9_lock_leagues(p_league_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_lock_key integer;
begin
  if p_league_ids is null
     or array_position(p_league_ids, null::uuid) is not null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  for v_lock_key in
    select distinct
      pg_catalog.hashtext(requested.league_id::text) as lock_key
    from unnest(p_league_ids) as requested(league_id)
    order by lock_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      2026090609,
      v_lock_key
    );
  end loop;
end;
$$;

revoke all on function private.slice9_lock_leagues(uuid[])
  from public, anon, authenticated, service_role;

comment on function private.slice9_lock_leagues(uuid[]) is
  'Acquires deterministic transaction-scoped lifecycle locks in advisory-key order. The first int is the Slice 9 namespace; hashtext of canonical UUID text is the stable per-league key. A 32-bit collision causes only conservative false contention.';

-- A sports catalog transaction must not miss a league inserted after it
-- discovers the affected season. League creation therefore participates in a
-- narrow registry barrier: creators share the one-key registry mutex, while
-- catalog writers take it exclusively before discovering league keys.
alter function public.create_league(
  uuid, text, text, integer, text, timestamptz, boolean,
  smallint, smallint, smallint, jsonb
) rename to slice9_create_league_without_registry_lock;

alter function public.slice9_create_league_without_registry_lock(
  uuid, text, text, integer, text, timestamptz, boolean,
  smallint, smallint, smallint, jsonb
) set schema private;

revoke all on function private.slice9_create_league_without_registry_lock(
  uuid, text, text, integer, text, timestamptz, boolean,
  smallint, smallint, smallint, jsonb
) from public, anon, authenticated, service_role;

create function public.create_league(
  p_season_id uuid,
  p_name text,
  p_description text,
  p_demo_entry_fee_agorot integer,
  p_demo_payment_instructions text,
  p_joins_close_at timestamptz,
  p_allow_late_join boolean,
  p_exact_points smallint,
  p_correct_outcome_points smallint,
  p_incorrect_points smallint,
  p_prizes jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(2026090609);

  return private.slice9_create_league_without_registry_lock(
    p_season_id,
    p_name,
    p_description,
    p_demo_entry_fee_agorot,
    p_demo_payment_instructions,
    p_joins_close_at,
    p_allow_late_join,
    p_exact_points,
    p_correct_outcome_points,
    p_incorrect_points,
    p_prizes
  );
end;
$$;

revoke all on function public.create_league(
  uuid, text, text, integer, text, timestamptz, boolean,
  smallint, smallint, smallint, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.create_league(
  uuid, text, text, integer, text, timestamptz, boolean,
  smallint, smallint, smallint, jsonb
) to authenticated;

-- Remove the historical global mutex from the completion delegate. The
-- public wrapper below establishes the exact league key before this body
-- takes the league parent and its children in canonical order.
create or replace function private.slice9_complete_league_without_activation_guard(
  p_league_id uuid
)
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

revoke all on function private.slice9_complete_league_without_activation_guard(uuid)
  from public, anon, authenticated, service_role;

-- All eight lifecycle boundary wrappers discover and authorize the exact
-- league before acquiring its key, then revalidate while locking the parent.
create or replace function public.approve_join_request(p_request_id uuid)
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
  select league.id into v_league_id
  from public.join_requests as request
  join public.leagues as league on league.id = request.league_id
  where request.id = p_request_id and league.manager_id = v_actor_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    2026090609, pg_catalog.hashtext(v_league_id::text)
  );
  perform league.id
  from public.join_requests as request
  join public.leagues as league on league.id = request.league_id
  where request.id = p_request_id
    and league.id = v_league_id
    and league.manager_id = v_actor_id
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

create or replace function public.reject_join_request(
  p_request_id uuid,
  p_reason text
)
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
  select league.id into v_league_id
  from public.join_requests as request
  join public.leagues as league on league.id = request.league_id
  where request.id = p_request_id and league.manager_id = v_actor_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    2026090609, pg_catalog.hashtext(v_league_id::text)
  );
  perform league.id
  from public.join_requests as request
  join public.leagues as league on league.id = request.league_id
  where request.id = p_request_id
    and league.id = v_league_id
    and league.manager_id = v_actor_id
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

create or replace function public.finalize_payment_proof(
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
  select league.id into v_league_id
  from public.join_requests as request
  join public.leagues as league on league.id = request.league_id
  where request.id = p_request_id and request.user_id = v_actor_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    2026090609, pg_catalog.hashtext(v_league_id::text)
  );
  perform league.id
  from public.join_requests as request
  join public.leagues as league on league.id = request.league_id
  where request.id = p_request_id
    and league.id = v_league_id
    and request.user_id = v_actor_id
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

create or replace function public.save_prediction(
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
  perform league.id
  from public.leagues as league
  where league.id = p_league_id
    and exists (
      select 1 from public.league_members as member
      where member.league_id = league.id
        and member.user_id = v_actor_id
        and member.status = 'active'
    );
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    2026090609, pg_catalog.hashtext(p_league_id::text)
  );
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

create or replace function public.create_or_rotate_invite(p_league_id uuid)
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
  perform league.id from public.leagues as league
  where league.id = p_league_id and league.manager_id = v_actor_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    2026090609, pg_catalog.hashtext(p_league_id::text)
  );
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

create or replace function public.revoke_invite(p_invite_id uuid)
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
  select league.id into v_league_id
  from public.invite_links as invite
  join public.leagues as league on league.id = invite.league_id
  where invite.id = p_invite_id and league.manager_id = v_actor_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    2026090609, pg_catalog.hashtext(v_league_id::text)
  );
  perform league.id
  from public.invite_links as invite
  join public.leagues as league on league.id = invite.league_id
  where invite.id = p_invite_id
    and league.id = v_league_id
    and league.manager_id = v_actor_id
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

create or replace function public.submit_join_request(
  p_public_id uuid,
  p_token_hash text
)
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
  select league.id into v_league_id
  from public.invite_links as invite
  join public.leagues as league on league.id = invite.league_id
  where invite.public_id = p_public_id
    and invite.token_hash = p_token_hash;
  if not found then
    raise exception using errcode = 'P0001', message = 'INVITE_UNAVAILABLE';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    2026090609, pg_catalog.hashtext(v_league_id::text)
  );
  perform league.id
  from public.invite_links as invite
  join public.leagues as league on league.id = invite.league_id
  where invite.public_id = p_public_id
    and invite.token_hash = p_token_hash
    and league.id = v_league_id
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

create or replace function public.complete_league(p_league_id uuid)
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
  perform league.id from public.leagues as league
  where league.id = p_league_id and league.manager_id = v_actor_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_FOUND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    2026090609, pg_catalog.hashtext(p_league_id::text)
  );
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

-- Manual activation is a single-league path and no longer enters the global
-- sports-writer mutex.
create or replace function public.start_league(p_league_id uuid)
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
  perform league.id from public.leagues as league
  where league.id = p_league_id and league.manager_id = v_actor_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAGUE_NOT_FOUND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    2026090609, pg_catalog.hashtext(p_league_id::text)
  );
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

-- Scheduled activation fixes its candidate set at one database timestamp,
-- acquires those league keys in order, and rechecks each parent in the existing
-- activation core. A league that becomes due later is intentionally handled by
-- the next tick instead of being admitted without its key.
create or replace function private.slice9_activate_due_leagues_core(
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

  select coalesce(
      array_agg(candidate.league_id order by candidate.league_id),
      '{}'::uuid[]
    )
    into v_candidate_ids
    from (
      select league.id as league_id
      from public.leagues as league
      join public.matches as match on match.season_id = league.season_id
      where league.status = 'open'
      group by league.id
      having min(match.kickoff_at) <= v_decision_at + p_lookahead
    ) as candidate;

  perform private.slice9_lock_leagues(v_candidate_ids);

  perform administrator.user_id
  from public.system_admins as administrator
  where administrator.user_id = p_actor_id
  for key share;
  if not found then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

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

-- The Manual catalog owns one fixed season. Wrap the already verified body so
-- direct owner-only test calls and the public gateway enter the registry
-- barrier before discovering and bridging the affected leagues.
alter function private.slice9_apply_manual_fixture_catalog_core(
  jsonb, uuid, timestamptz
) rename to slice9_apply_manual_fixture_catalog_core_with_global_lock;

revoke all on function private.slice9_apply_manual_fixture_catalog_core_with_global_lock(
  jsonb, uuid, timestamptz
) from public, anon, authenticated, service_role;

create function private.slice9_apply_manual_fixture_catalog_core(
  p_payload jsonb,
  p_actor_id uuid,
  p_explicit_decision_at timestamptz
)
returns table (
  result_run_id uuid,
  result_status public.sync_status,
  result_code text,
  result_started_at timestamptz,
  result_finished_at timestamptz,
  result_rows_inserted integer,
  result_teams_changed integer,
  result_matches_changed integer
)
language plpgsql
set search_path = ''
as $$
declare
  v_league_ids uuid[];
begin
  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  select coalesce(array_agg(league.id order by league.id), '{}'::uuid[])
    into v_league_ids
    from public.leagues as league
    where league.season_id = '26000000-0000-4000-8000-000000000027'::uuid;

  perform private.slice9_lock_leagues(v_league_ids);

  return query
  select result.*
  from private.slice9_apply_manual_fixture_catalog_core_with_global_lock(
    p_payload, p_actor_id, p_explicit_decision_at
  ) as result;
end;
$$;

revoke all on function private.slice9_apply_manual_fixture_catalog_core(
  jsonb, uuid, timestamptz
) from public, anon, authenticated, service_role;

-- Provider batches can touch every league on the provider season, plus the
-- seasons of already-known fixtures. Discover both sources before delegating
-- to the retained fenced sports-writer implementation.
alter function public.apply_api_football_sync_batch(uuid, bigint, uuid, jsonb)
  rename to slice9_apply_api_football_sync_batch_with_global_lock;
alter function public.slice9_apply_api_football_sync_batch_with_global_lock(
  uuid, bigint, uuid, jsonb
) set schema private;

revoke all on function private.slice9_apply_api_football_sync_batch_with_global_lock(
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
declare
  v_league_ids uuid[];
begin
  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  select coalesce(
      array_agg(distinct affected.league_id order by affected.league_id),
      '{}'::uuid[]
    )
    into v_league_ids
    from (
      select league.id as league_id
      from public.leagues as league
      join public.seasons as season on season.id = league.season_id
      where season.external_provider = 'api-football'
        and season.external_id = '2026'
      union
      select league.id
      from jsonb_array_elements(
        case
          when jsonb_typeof(p_payload -> 'fixtures') = 'array'
            then p_payload -> 'fixtures'
          else '[]'::jsonb
        end
      ) as fixture(value)
      join public.matches as match
        on match.external_provider = 'api-football'
       and match.external_id = fixture.value ->> 'externalId'
      join public.leagues as league on league.season_id = match.season_id
    ) as affected;

  perform private.slice9_lock_leagues(v_league_ids);

  return query
  select result.*
  from private.slice9_apply_api_football_sync_batch_with_global_lock(
    p_run_id, p_generation, p_token, p_payload
  ) as result;
end;
$$;

revoke all on function public.apply_api_football_sync_batch(
  uuid, bigint, uuid, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_api_football_sync_batch(
  uuid, bigint, uuid, jsonb
) to service_role;

-- Manual creation/correction may move an unlocked fixture between seasons.
-- Lock the union of source and requested season leagues before the existing
-- full editor and its sports-writer mutex.
alter function public.create_or_correct_match(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) rename to slice9_create_or_correct_match_with_global_lock;
alter function public.slice9_create_or_correct_match_with_global_lock(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) set schema private;

revoke all on function private.slice9_create_or_correct_match_with_global_lock(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) from public, anon, authenticated, service_role;

create function public.create_or_correct_match(
  p_operation text,
  p_match_id uuid,
  p_season_id uuid,
  p_home_team_id uuid,
  p_away_team_id uuid,
  p_round_number numeric,
  p_kickoff_at timestamptz,
  p_status public.match_status,
  p_home_score numeric,
  p_away_score numeric
)
returns table (
  result_match_id uuid,
  result_status public.match_status,
  result_home_score smallint,
  result_away_score smallint,
  result_version integer,
  result_created boolean,
  result_changed boolean,
  result_manual_override boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_ids uuid[];
begin
  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  select coalesce(
      array_agg(league.id order by league.id),
      '{}'::uuid[]
    )
    into v_league_ids
    from public.leagues as league
    where league.season_id = p_season_id
       or league.season_id = (
         select match.season_id
         from public.matches as match
         where match.id = p_match_id
       );

  perform private.slice9_lock_leagues(v_league_ids);

  return query
  select result.*
  from private.slice9_create_or_correct_match_with_global_lock(
    p_operation,
    p_match_id,
    p_season_id,
    p_home_team_id,
    p_away_team_id,
    p_round_number,
    p_kickoff_at,
    p_status,
    p_home_score,
    p_away_score
  ) as result;
end;
$$;

revoke all on function public.create_or_correct_match(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) from public, anon, authenticated, service_role;
grant execute on function public.create_or_correct_match(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) to service_role;

-- Review resolution changes one canonical match and can score every
-- non-completed league on its season, so bridge all season leagues first.
alter function public.resolve_match_result_review(
  uuid, integer, public.match_status, numeric, numeric
) rename to slice9_resolve_match_result_review_without_global_lock;
alter function public.slice9_resolve_match_result_review_without_global_lock(
  uuid, integer, public.match_status, numeric, numeric
) set schema private;

revoke all on function private.slice9_resolve_match_result_review_without_global_lock(
  uuid, integer, public.match_status, numeric, numeric
) from public, anon, authenticated, service_role;

-- The review already has a complete season-to-league set. Replace the moved
-- delegate with its established body minus the legacy global mutex; the public
-- bridge below owns the affected league keys.
create or replace function private.slice9_resolve_match_result_review_without_global_lock(
  p_match_id uuid,
  p_result_version integer,
  p_selected_status public.match_status,
  p_selected_home_score numeric,
  p_selected_away_score numeric
)
returns table (
  result_match_id uuid,
  result_review_version integer,
  result_applied_version integer,
  result_status public.match_status,
  result_home_score smallint,
  result_away_score smallint,
  result_predictions_scored integer,
  result_reconciliations_created integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.slice9_system_actor_from_request();
  v_match public.matches%rowtype;
  v_review public.match_result_reviews%rowtype;
  v_scored record;
  v_at timestamptz;
  v_reconciliation_count integer := 0;
begin
  if p_match_id is null
     or p_result_version is null
     or p_result_version < 0
     or p_selected_status not in ('finished', 'canceled') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  if p_selected_status = 'finished' then
    if p_selected_home_score is null
       or p_selected_away_score is null
       or p_selected_home_score <> trunc(p_selected_home_score)
       or p_selected_away_score <> trunc(p_selected_away_score)
       or p_selected_home_score not between 0 and 30
       or p_selected_away_score not between 0 and 30 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
    end if;
  elsif p_selected_home_score is not null or p_selected_away_score is not null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select match.* into v_match
  from public.matches as match
  where match.id = p_match_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REVIEW_NOT_FOUND';
  end if;

  select review.* into v_review
  from public.match_result_reviews as review
  where review.match_id = p_match_id
    and review.result_version = p_result_version
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'REVIEW_NOT_FOUND';
  end if;

  if v_review.disposition <> 'pending'
     or not v_match.requires_review
     or v_match.review_result_version is distinct from p_result_version
     or v_match.result_version is distinct from p_result_version then
    raise exception using errcode = 'P0001', message = 'REVIEW_STALE';
  end if;

  select count(*)::integer into v_reconciliation_count
  from public.league_match_snapshots as snapshot
  where snapshot.match_id = p_match_id;

  select * into strict v_scored
  from private.score_match(
    p_match_id,
    p_selected_status,
    p_selected_home_score,
    p_selected_away_score,
    true,
    'result-review'
  );
  v_at := clock_timestamp();

  update public.match_result_reviews as review
  set disposition = 'resolved',
      selected_status = p_selected_status,
      selected_home_score = v_scored.result_home_score,
      selected_away_score = v_scored.result_away_score,
      applied_result_version = v_scored.result_version,
      decided_by = v_actor_id,
      decided_at = v_at
  where review.match_id = p_match_id
    and review.result_version = p_result_version;

  update public.matches as match
  set requires_review = false,
      review_code = null,
      review_result_version = null,
      updated_at = v_at
  where match.id = p_match_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_actor_id,
    'match_result_review_resolved',
    'match_result_review',
    p_match_id,
    jsonb_build_object(
      'review_result_version', p_result_version,
      'applied_result_version', v_scored.result_version,
      'selected_status', p_selected_status,
      'selected_home_score', v_scored.result_home_score,
      'selected_away_score', v_scored.result_away_score,
      'predictions_scored', v_scored.predictions_scored,
      'reconciliations_created', v_reconciliation_count
    ),
    v_at
  );

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_actor_id,
    'match_manually_corrected',
    'match',
    p_match_id,
    jsonb_build_object(
      'source', 'result-review',
      'review_result_version', p_result_version,
      'result_version', v_scored.result_version,
      'status', p_selected_status
    ),
    v_at
  );

  return query select
    p_match_id,
    p_result_version,
    v_scored.result_version,
    v_scored.result_status,
    v_scored.result_home_score,
    v_scored.result_away_score,
    v_scored.predictions_scored,
    v_reconciliation_count;
end;
$$;

create function public.resolve_match_result_review(
  p_match_id uuid,
  p_result_version integer,
  p_selected_status public.match_status,
  p_selected_home_score numeric,
  p_selected_away_score numeric
)
returns table (
  result_match_id uuid,
  result_review_version integer,
  result_applied_version integer,
  result_status public.match_status,
  result_home_score smallint,
  result_away_score smallint,
  result_predictions_scored integer,
  result_reconciliations_created integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_ids uuid[];
begin
  select coalesce(array_agg(league.id order by league.id), '{}'::uuid[])
    into v_league_ids
    from public.leagues as league
    join public.matches as match on match.season_id = league.season_id
    where match.id = p_match_id;

  perform private.slice9_lock_leagues(v_league_ids);

  return query
  select result.*
  from private.slice9_resolve_match_result_review_without_global_lock(
    p_match_id,
    p_result_version,
    p_selected_status,
    p_selected_home_score,
    p_selected_away_score
  ) as result;
end;
$$;

revoke all on function public.resolve_match_result_review(
  uuid, integer, public.match_status, numeric, numeric
) from public, anon, authenticated, service_role;
grant execute on function public.resolve_match_result_review(
  uuid, integer, public.match_status, numeric, numeric
) to service_role;

-- A reconciliation is exact-league work, so it needs only that league key.
alter function public.reconcile_completed_league(uuid, integer, text)
  rename to slice9_reconcile_completed_league_without_global_lock;
alter function public.slice9_reconcile_completed_league_without_global_lock(
  uuid, integer, text
) set schema private;

revoke all on function private.slice9_reconcile_completed_league_without_global_lock(
  uuid, integer, text
) from public, anon, authenticated, service_role;

-- Reconciliation owns one exact league. Replace the moved delegate with the
-- established body minus the legacy global mutex; the public bridge below
-- owns that league's key.
create or replace function private.slice9_reconcile_completed_league_without_global_lock(
  p_reconciliation_id uuid,
  p_expected_result_version integer,
  p_decision text
)
returns table (
  result_reconciliation_id uuid,
  result_league_id uuid,
  result_match_id uuid,
  result_version integer,
  result_disposition public.league_match_reconciliation_disposition,
  result_predictions_scored integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.slice9_system_actor_from_request();
  v_discovered public.league_match_reconciliations%rowtype;
  v_reconciliation public.league_match_reconciliations%rowtype;
  v_match public.matches%rowtype;
  v_snapshot public.league_match_snapshots%rowtype;
  v_at timestamptz;
  v_scored_count integer := 0;
begin
  if p_reconciliation_id is null
     or p_expected_result_version is null
     or p_expected_result_version < 0
     or p_decision not in ('apply', 'dismiss') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select reconciliation.* into v_discovered
  from public.league_match_reconciliations as reconciliation
  where reconciliation.id = p_reconciliation_id;
  if not found then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  perform league.id
  from public.leagues as league
  where league.id = v_discovered.league_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  select match.* into v_match
  from public.matches as match
  where match.id = v_discovered.match_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  select snapshot.* into v_snapshot
  from public.league_match_snapshots as snapshot
  where snapshot.league_id = v_discovered.league_id
    and snapshot.match_id = v_discovered.match_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  select reconciliation.* into v_reconciliation
  from public.league_match_reconciliations as reconciliation
  where reconciliation.id = p_reconciliation_id
  for update;
  if not found
     or v_reconciliation.league_id is distinct from v_discovered.league_id
     or v_reconciliation.match_id is distinct from v_discovered.match_id then
    raise exception using
      errcode = 'P0001', message = 'RECONCILIATION_NOT_FOUND';
  end if;

  if v_reconciliation.disposition <> 'pending' then
    raise exception using errcode = 'P0001', message = 'RECONCILIATION_REPLAY';
  end if;
  if v_reconciliation.result_version <> p_expected_result_version
     or (
       p_decision = 'apply'
       and (
         v_snapshot.completed_result_version >= v_reconciliation.result_version
         or v_match.result_version <> v_reconciliation.result_version
         or v_match.status is distinct from v_reconciliation.candidate_status
         or v_match.home_score is distinct from v_reconciliation.candidate_home_score
         or v_match.away_score is distinct from v_reconciliation.candidate_away_score
       )
     ) then
    raise exception using errcode = 'P0001', message = 'RECONCILIATION_STALE';
  end if;

  v_at := clock_timestamp();
  if p_decision = 'apply' then
    update public.league_match_snapshots as snapshot
    set completed_status = v_reconciliation.candidate_status,
        completed_home_score = v_reconciliation.candidate_home_score,
        completed_away_score = v_reconciliation.candidate_away_score,
        completed_result_version = v_reconciliation.result_version
    where snapshot.league_id = v_reconciliation.league_id
      and snapshot.match_id = v_reconciliation.match_id;

    with calculated_scores as (
      select
        prediction.id,
        case
          when v_reconciliation.candidate_status = 'canceled' then 0::smallint
          when prediction.predicted_home_score = v_reconciliation.candidate_home_score
           and prediction.predicted_away_score = v_reconciliation.candidate_away_score
            then rules.exact_points
          when prediction.predicted_outcome = case
            when v_reconciliation.candidate_home_score > v_reconciliation.candidate_away_score
              then 'HOME'::public.outcome
            when v_reconciliation.candidate_home_score < v_reconciliation.candidate_away_score
              then 'AWAY'::public.outcome
            else 'DRAW'::public.outcome
          end then rules.correct_outcome_points
          else rules.incorrect_points
        end as calculated_points,
        case
          when v_reconciliation.candidate_status = 'canceled' then false
          else prediction.predicted_home_score = v_reconciliation.candidate_home_score
            and prediction.predicted_away_score = v_reconciliation.candidate_away_score
        end as calculated_exact,
        case
          when v_reconciliation.candidate_status = 'canceled' then false
          else prediction.predicted_outcome = case
            when v_reconciliation.candidate_home_score > v_reconciliation.candidate_away_score
              then 'HOME'::public.outcome
            when v_reconciliation.candidate_home_score < v_reconciliation.candidate_away_score
              then 'AWAY'::public.outcome
            else 'DRAW'::public.outcome
          end
        end as calculated_correct_outcome,
        rules.version as rule_version
      from public.predictions as prediction
      join public.league_scoring_rules as rules
        on rules.league_id = prediction.league_id
      where prediction.league_id = v_reconciliation.league_id
        and prediction.match_id = v_reconciliation.match_id
    )
    update public.predictions as prediction
    set points = calculated.calculated_points,
        is_exact = calculated.calculated_exact,
        is_correct_outcome = calculated.calculated_correct_outcome,
        scored_at = v_at,
        scored_result_version = v_reconciliation.result_version,
        scored_rule_version = calculated.rule_version
    from calculated_scores as calculated
    where prediction.id = calculated.id
      and (
        prediction.points is distinct from calculated.calculated_points
        or prediction.is_exact is distinct from calculated.calculated_exact
        or prediction.is_correct_outcome is distinct from calculated.calculated_correct_outcome
        or prediction.scored_result_version is distinct from v_reconciliation.result_version
        or prediction.scored_rule_version is distinct from calculated.rule_version
        or prediction.scored_at is null
      );
    get diagnostics v_scored_count = row_count;
  end if;

  update public.league_match_reconciliations as reconciliation
  set disposition = case
        when p_decision = 'apply'
          then 'applied'::public.league_match_reconciliation_disposition
        else 'dismissed'::public.league_match_reconciliation_disposition
      end,
      decided_by = v_actor_id,
      decided_at = v_at
  where reconciliation.id = p_reconciliation_id
  returning * into v_reconciliation;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata, created_at
  ) values (
    v_actor_id,
    case
      when p_decision = 'apply'
        then 'league_match_reconciliation_applied'
      else 'league_match_reconciliation_dismissed'
    end,
    'league_match_reconciliation',
    p_reconciliation_id,
    jsonb_build_object(
      'league_id', v_reconciliation.league_id,
      'match_id', v_reconciliation.match_id,
      'result_version', v_reconciliation.result_version,
      'predictions_scored', v_scored_count
    ),
    v_at
  );

  return query select
    v_reconciliation.id,
    v_reconciliation.league_id,
    v_reconciliation.match_id,
    v_reconciliation.result_version,
    v_reconciliation.disposition,
    v_scored_count;
end;
$$;

create function public.reconcile_completed_league(
  p_reconciliation_id uuid,
  p_expected_result_version integer,
  p_decision text
)
returns table (
  result_reconciliation_id uuid,
  result_league_id uuid,
  result_match_id uuid,
  result_version integer,
  result_disposition public.league_match_reconciliation_disposition,
  result_predictions_scored integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
begin
  select reconciliation.league_id into v_league_id
  from public.league_match_reconciliations as reconciliation
  where reconciliation.id = p_reconciliation_id;

  if found then
    perform private.slice9_lock_leagues(array[v_league_id]);
  end if;

  return query
  select result.*
  from private.slice9_reconcile_completed_league_without_global_lock(
    p_reconciliation_id, p_expected_result_version, p_decision
  ) as result;
end;
$$;

revoke all on function public.reconcile_completed_league(uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_completed_league(uuid, integer, text)
  to service_role;

comment on function public.complete_league(uuid) is
  'Exact-manager completion scoped by the two-part league advisory key. Unrelated leagues can complete independently; affected sports writers bridge the same key before touching the included match set.';
