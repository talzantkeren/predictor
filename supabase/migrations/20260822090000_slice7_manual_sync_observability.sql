-- Slice 7 manual-provider observability. The current Cron path records one
-- terminal attempt per authorized invocation and performs no provider I/O.

create type public.sync_status as enum (
  'running',
  'succeeded',
  'failed',
  'skipped'
);

comment on type public.sync_status is
  'Sync lifecycle states. running is reserved for a future live-provider lease and is not written by the Slice 7 manual path.';

revoke all on type public.sync_status
  from public, anon, authenticated, service_role;
grant usage on type public.sync_status to authenticated, service_role;

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  status public.sync_status not null,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  fixtures_seen integer not null default 0,
  matches_changed integer not null default 0,
  results_changed integer not null default 0,
  error_code text,
  error_message_safe text,
  constraint sync_runs_provider_format check (
    provider = lower(btrim(provider))
    and char_length(provider) between 2 and 50
    and provider ~ '^[a-z][a-z0-9_-]+$'
  ),
  constraint sync_runs_nonnegative_counts check (
    fixtures_seen >= 0
    and matches_changed >= 0
    and results_changed >= 0
  ),
  constraint sync_runs_finished_at_state check (
    (status = 'running' and finished_at is null)
    or (status <> 'running' and finished_at is not null)
  ),
  constraint sync_runs_time_order check (
    finished_at is null or finished_at >= started_at
  ),
  constraint sync_runs_result_code_format check (
    error_code is null
    or (
      char_length(error_code) between 2 and 64
      and error_code ~ '^[A-Z][A-Z0-9_]+$'
    )
  ),
  constraint sync_runs_safe_message_format check (
    error_message_safe is null
    or (
      error_message_safe = btrim(error_message_safe)
      and char_length(error_message_safe) between 1 and 500
    )
  ),
  constraint sync_runs_result_metadata check (
    (status = 'running' and error_code is null and error_message_safe is null)
    or (status = 'succeeded' and error_code is null and error_message_safe is null)
    or (status = 'skipped' and error_code is not null and error_message_safe is null)
    or (status = 'failed' and error_code is not null)
  )
);

comment on table public.sync_runs is
  'Append-only operational record of authorized Sync attempts. Slice 7 writes terminal manual-provider outcomes only.';
comment on column public.sync_runs.error_code is
  'Legacy column name for a result code, including non-error skipped outcomes. Determine failures only with status = failed, never with error_code is not null.';
comment on column public.sync_runs.error_message_safe is
  'Optional sanitized operator-facing detail for failed runs. It remains null for skipped outcomes.';

create index sync_runs_started_at_desc_idx
  on public.sync_runs (started_at desc);

alter table public.sync_runs enable row level security;

revoke all on table public.sync_runs
  from public, anon, authenticated, service_role;
grant select on table public.sync_runs to authenticated;

create policy sync_runs_select_system_admin
on public.sync_runs
for select
to authenticated
using ((select public.is_system_admin()));

create function public.record_sync_attempt()
returns table (
  result_id uuid,
  result_provider text,
  result_status public.sync_status,
  result_started_at timestamptz,
  result_finished_at timestamptz,
  result_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Stable application namespace for the short Slice 7 claim transaction.
  v_lock_key constant bigint := 2026090607;
  v_actor_id uuid;
  v_actor_text text;
  v_request_headers jsonb := '{}'::jsonb;
  v_at timestamptz;
  v_result_code text;
begin
  begin
    v_request_headers := coalesce(
      nullif(current_setting('request.headers', true), ''),
      '{}'
    )::jsonb;
  exception
    when invalid_text_representation then
      raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end;

  v_actor_text := v_request_headers ->> 'x-predictor-system-actor';
  if v_actor_text is null
     or v_actor_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  v_actor_id := v_actor_text::uuid;
  if not exists (
    select 1
    from public.system_admins as administrator
    where administrator.user_id = v_actor_id
  ) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  v_result_code := case
    when pg_catalog.pg_try_advisory_xact_lock(v_lock_key)
      then 'MANUAL_PROVIDER'
    else 'CONCURRENT_ATTEMPT'
  end;
  v_at := clock_timestamp();

  return query
  insert into public.sync_runs (
    provider,
    status,
    started_at,
    finished_at,
    fixtures_seen,
    matches_changed,
    results_changed,
    error_code,
    error_message_safe
  ) values (
    'manual',
    'skipped',
    v_at,
    v_at,
    0,
    0,
    0,
    v_result_code,
    null
  )
  returning
    sync_runs.id,
    sync_runs.provider,
    sync_runs.status,
    sync_runs.started_at,
    sync_runs.finished_at,
    sync_runs.error_code;
end;
$$;

revoke all on function public.record_sync_attempt()
  from public, anon, authenticated, service_role;
grant execute on function public.record_sync_attempt() to service_role;

comment on function public.record_sync_attempt() is
  'Atomically authenticates the fixed system actor, takes transaction advisory lock 2026090607, and appends one terminal manual Sync outcome. It performs no provider, match, scoring, or audit mutation.';
