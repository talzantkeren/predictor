-- S9-DEF-012: make the existing scheduled HTTP observation window longer
-- than the bounded provider path without weakening the 120-second lease. The
-- helper preserves the existing schedule, URL, Vault lookup, headers and
-- active state; it neither returns nor logs the command that can contain
-- secret lookups.

create extension if not exists pg_cron with schema pg_catalog;

revoke all on schema cron from public, anon, authenticated, service_role;
revoke all on all tables in schema cron from public, anon, authenticated, service_role;
revoke all on all sequences in schema cron from public, anon, authenticated, service_role;
revoke all on all functions in schema cron from public, anon, authenticated, service_role;

grant usage on schema cron to postgres;
grant select on table cron.job to postgres;
grant execute on function cron.schedule(text, text, text) to postgres;
grant execute on function cron.unschedule(bigint) to postgres;
grant execute on function cron.alter_job(bigint, text, text, text, text, boolean)
  to postgres;

create function private.configure_predictor_sync_cron()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_count integer;
  v_job_id bigint;
  v_job_name text;
  v_schedule text;
  v_command text;
  v_active boolean;
  v_new_command text;
  v_replacement_job_id bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('predictor-sports-sync-cron-config', 0)
  );

  select count(*)::integer
    into v_job_count
  from cron.job as job
  where job.jobname in (
    'predictor-slice7-manual-sync',
    'predictor-sports-sync'
  );

  if v_job_count > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_SYNC_CRON_JOB';
  end if;

  select job.jobid, job.jobname, job.schedule, job.command, job.active
    into v_job_id, v_job_name, v_schedule, v_command, v_active
  from cron.job as job
  where job.jobname in (
    'predictor-slice7-manual-sync',
    'predictor-sports-sync'
  );

  if not found then
    return 'CRON_JOB_NOT_FOUND';
  end if;

  if v_command ~ 'timeout_milliseconds[[:space:]]*(=>|:=)[[:space:]]*45000([^0-9]|$)' then
    v_new_command := v_command;
  elsif v_command ~ 'timeout_milliseconds[[:space:]]*(=>|:=)[[:space:]]*10000([^0-9]|$)' then
    v_new_command := pg_catalog.regexp_replace(
      v_command,
      'timeout_milliseconds[[:space:]]*(=>|:=)[[:space:]]*10000',
      'timeout_milliseconds := 45000'
    );
  else
    raise exception using
      errcode = 'P0001',
      message = 'SYNC_CRON_TIMEOUT_PATTERN_UNRECOGNIZED';
  end if;

  if v_job_name = 'predictor-slice7-manual-sync' then
    perform cron.unschedule(v_job_id);
    select cron.schedule(
      'predictor-sports-sync',
      v_schedule,
      v_new_command
    ) into v_replacement_job_id;

    if not v_active then
      perform cron.alter_job(v_replacement_job_id, active => false);
    end if;
  else
    perform cron.alter_job(v_job_id, command => v_new_command);
  end if;

  return 'CRON_JOB_CONFIGURED';
end;
$$;

revoke all on function private.configure_predictor_sync_cron()
  from public, anon, authenticated, service_role;

comment on function private.configure_predictor_sync_cron() is
  'One-time/provider-neutral Cron alignment: preserves the existing job configuration while changing pg_net timeout from 10s to 45s. Returns no command or secret-bearing value.';

-- Local/CI intentionally has no scheduled job. Hosted updates only the one
-- pre-existing named job and fails closed on duplicates or an unknown command.
select private.configure_predictor_sync_cron();
