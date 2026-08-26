-- A due decision can perform bounded fixture selection before issuance. Keep
-- that serialized decision time, but start the promised lease from a second
-- fresh wall-clock sample immediately before the run is created.

create or replace function public.claim_sports_sync(
  p_provider text,
  p_force boolean default false
)
returns table (
  result_outcome text,
  result_run_id uuid,
  result_provider text,
  result_sync_kind text,
  result_generation bigint,
  result_token uuid,
  result_locked_until timestamptz,
  result_fixture_ids text[],
  result_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_text text;
  v_headers jsonb := '{}'::jsonb;
  v_lease public.sync_leases%rowtype;
  v_decision_at timestamptz;
  v_issued_at timestamptz;
  v_kind text;
  v_fixture_ids text[] := '{}'::text[];
  v_run_id uuid;
  v_token uuid;
  v_locked_until timestamptz;
begin
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end;

  v_actor_text := v_headers ->> 'x-predictor-system-actor';
  if v_actor_text is null
     or v_actor_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  v_actor_id := v_actor_text::uuid;
  if not exists (
    select 1 from public.system_admins as administrator
    where administrator.user_id = v_actor_id
  ) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if p_provider is distinct from 'api-football' or p_force is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select lease.* into strict v_lease
    from public.sync_leases as lease
    where lease.provider = p_provider
    for update;

  v_decision_at := clock_timestamp();

  if v_lease.run_id is not null and v_lease.locked_until > v_decision_at then
    insert into public.sync_runs (
      provider, status, sync_kind, started_at, finished_at, error_code
    ) values (
      p_provider, 'skipped',
      coalesce((select run.sync_kind from public.sync_runs as run where run.id = v_lease.run_id), 'targeted'),
      v_decision_at, v_decision_at, 'CONCURRENT_ATTEMPT'
    ) returning id into v_run_id;

    return query select
      'CONCURRENT_ATTEMPT'::text, v_run_id, p_provider,
      null::text, null::bigint, null::uuid, null::timestamptz,
      '{}'::text[], 'CONCURRENT_ATTEMPT'::text;
    return;
  end if;

  if v_lease.run_id is not null then
    update public.sync_runs as run
    set status = 'failed',
        finished_at = v_decision_at,
        error_code = 'LEASE_EXPIRED',
        error_message_safe = 'The previous Sync worker did not finish before its lease expired.'
    where run.id = v_lease.run_id and run.status = 'running';

    update public.sync_leases as lease
    set run_id = null,
        fencing_token = null,
        locked_until = null,
        updated_at = v_decision_at
    where lease.provider = p_provider;
    v_lease.run_id := null;
    v_lease.fencing_token := null;
    v_lease.locked_until := null;
  end if;

  if v_lease.backoff_until is not null and v_lease.backoff_until > v_decision_at then
    return query select
      'NOT_DUE'::text, null::uuid, p_provider, null::text,
      null::bigint, null::uuid, null::timestamptz, '{}'::text[],
      'PROVIDER_BACKOFF'::text;
    return;
  end if;

  if p_force
     and v_lease.last_forced_at is not null
     and v_lease.last_forced_at > v_decision_at - interval '1 minute' then
    return query select
      'NOT_DUE'::text, null::uuid, p_provider, null::text,
      null::bigint, null::uuid, null::timestamptz, '{}'::text[],
      'FORCE_COOLDOWN'::text;
    return;
  end if;

  select coalesce(array_agg(candidate.external_id order by candidate.kickoff_at), '{}'::text[])
    into v_fixture_ids
  from (
    select match.external_id, match.kickoff_at
    from public.matches as match
    where match.external_provider = 'api-football'
      and match.external_id is not null
      and match.status in ('scheduled', 'postponed', 'live')
      and coalesce(match.provider_status, '') not in ('AET', 'PEN')
      and (
        match.status = 'live'
        or match.predictions_locked_at is not null
        or match.kickoff_at between v_decision_at - interval '30 minutes'
          and v_decision_at + interval '3 hours'
      )
    order by match.kickoff_at
    limit 20
  ) as candidate;

  if p_force then
    v_kind := 'catalog';
    v_fixture_ids := '{}'::text[];
  elsif cardinality(v_fixture_ids) > 0
     and (v_lease.last_targeted_at is null
       or v_lease.last_targeted_at <= v_decision_at - interval '1 minute') then
    v_kind := 'targeted';
  elsif v_lease.last_catalog_at is null
     or v_lease.last_catalog_at <= v_decision_at - interval '12 hours' then
    v_kind := 'catalog';
    v_fixture_ids := '{}'::text[];
  elsif v_lease.last_reconciliation_at is null
     or v_lease.last_reconciliation_at <= v_decision_at - interval '6 hours' then
    v_kind := 'reconciliation';
    v_fixture_ids := '{}'::text[];
  else
    return query select
      'NOT_DUE'::text, null::uuid, p_provider, null::text,
      null::bigint, null::uuid, null::timestamptz, '{}'::text[],
      'NOT_DUE'::text;
    return;
  end if;

  v_issued_at := clock_timestamp();
  v_run_id := extensions.gen_random_uuid();
  v_token := extensions.gen_random_uuid();
  v_locked_until := v_issued_at + interval '120 seconds';
  v_lease.generation := v_lease.generation + 1;

  insert into public.sync_runs (
    id, provider, status, sync_kind, started_at,
    lease_generation, locked_until
  ) values (
    v_run_id, p_provider, 'running', v_kind, v_issued_at,
    v_lease.generation, v_locked_until
  );

  update public.sync_leases as lease
  set generation = v_lease.generation,
      run_id = v_run_id,
      fencing_token = v_token,
      locked_until = v_locked_until,
      last_forced_at = case when p_force then v_issued_at else lease.last_forced_at end,
      updated_at = v_issued_at
  where lease.provider = p_provider;

  return query select
    'CLAIMED'::text, v_run_id, p_provider, v_kind,
    v_lease.generation, v_token, v_locked_until, v_fixture_ids,
    null::text;
end;
$$;

revoke all on function public.claim_sports_sync(text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_sports_sync(text, boolean)
  to service_role;

comment on function public.claim_sports_sync(text, boolean) is
  'Locks the provider lease before fresh expiry/due/cooldown decisions, then issues the admitted run a full 120-second fence measured from its own start time.';
