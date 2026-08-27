begin;

select no_plan();

select ok(
  exists (
    select 1
    from pg_catalog.pg_extension
    where extname = 'pg_cron'
  ),
  'the repository provisions the Supabase Cron extension'
);

select ok(
  to_regprocedure('private.configure_predictor_sync_cron()') is not null
  and (
    select procedure.prosecdef
      and procedure.proconfig = array['search_path=""']
    from pg_catalog.pg_proc as procedure
    where procedure.oid = 'private.configure_predictor_sync_cron()'::regprocedure
  )
  and not has_function_privilege(
    'anon',
    'private.configure_predictor_sync_cron()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.configure_predictor_sync_cron()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'private.configure_predictor_sync_cron()',
    'EXECUTE'
  ),
  'the configuration helper is definer-only with an empty search path'
);

select ok(
  not has_schema_privilege('anon', 'cron', 'USAGE')
  and not has_schema_privilege('authenticated', 'cron', 'USAGE')
  and not has_schema_privilege('service_role', 'cron', 'USAGE'),
  'Data API roles have no USAGE on the extension-owned Cron schema'
);

set local role anon;
select throws_ok(
  $$select cron.schedule('forbidden', '* * * * *', 'select 1')$$,
  '42501',
  'permission denied for schema cron',
  'anon cannot schedule a Cron job through owner-issued function ACLs'
);
select throws_ok(
  $$select count(*) from cron.job$$,
  '42501',
  'permission denied for schema cron',
  'anon cannot read Cron configuration through owner-issued table ACLs'
);
reset role;

set local role service_role;
select throws_ok(
  $$select cron.schedule('forbidden', '* * * * *', 'select 1')$$,
  '42501',
  'permission denied for schema cron',
  'service_role cannot schedule a Cron job directly'
);
select throws_ok(
  $$select count(*) from cron.job$$,
  '42501',
  'permission denied for schema cron',
  'service_role cannot read Cron configuration directly'
);
reset role;

select ok(
  45000 > 30000 + 10000
  and 45000 < 60000
  and 60000 < 120000,
  '45s pg_net timeout has margin over the 30s app budget and remains below the 60s route and 120s lease'
);

select is(
  private.configure_predictor_sync_cron(),
  'CRON_JOB_NOT_FOUND',
  'local and CI environments without a scheduled job remain an intentional no-op'
);

create temp table slice9_cron_fixture as
select cron.schedule(
  'predictor-slice7-manual-sync',
  '* * * * *',
  $command$
    select net.http_post(
      url := 'https://example.invalid/api/cron/sync',
      body := '{}'::jsonb,
      headers := '{"Authorization":"Bearer sanitized-test-value"}'::jsonb,
      timeout_milliseconds := 10000
    );
  $command$
) as job_id;

select is(
  private.configure_predictor_sync_cron(),
  'CRON_JOB_CONFIGURED',
  'the legacy provider-specific job is aligned without external HTTP'
);

select results_eq(
  $$
    select job.jobname, job.schedule, job.active,
           job.command like '%timeout_milliseconds := 45000%' as timeout_aligned,
           job.command like '%example.invalid/api/cron/sync%' as target_preserved
    from cron.job as job
    where job.jobname = 'predictor-sports-sync'
  $$,
  $$values ('predictor-sports-sync'::text, '* * * * *'::text, true, true, true)$$,
  'rename preserves schedule, active state and target while changing only the timeout'
);

select is(
  private.configure_predictor_sync_cron(),
  'CRON_JOB_CONFIGURED',
  'reapplying the aligned configuration is idempotent'
);

select cron.unschedule('predictor-sports-sync');
truncate table slice9_cron_fixture;
insert into slice9_cron_fixture (job_id)
select cron.schedule(
  'predictor-slice7-manual-sync',
  '*/5 * * * *',
  $command$
    select net.http_post(
      url := 'https://example.invalid/api/cron/sync',
      body := '{}'::jsonb,
      headers := '{}'::jsonb,
      timeout_milliseconds => 10000
    );
  $command$
);
select cron.alter_job(
  (select job_id from slice9_cron_fixture),
  active => false
);

select is(
  private.configure_predictor_sync_cron(),
  'CRON_JOB_CONFIGURED',
  'a disabled legacy job is aligned provider-neutrally'
);
select results_eq(
  $$select schedule, active,
           command like '%timeout_milliseconds := 45000%'
    from cron.job where jobname = 'predictor-sports-sync'$$,
  $$values ('*/5 * * * *'::text, false, true)$$,
  'alignment preserves a disabled job and its non-default schedule'
);

select cron.schedule(
  'predictor-slice7-manual-sync',
  '* * * * *',
  $$select net.http_post(
    url := 'https://example.invalid/api/cron/sync',
    timeout_milliseconds := 10000
  );$$
);
select throws_ok(
  $$select private.configure_predictor_sync_cron()$$,
  'P0001',
  'DUPLICATE_SYNC_CRON_JOB',
  'configuration fails closed instead of mutating duplicate scheduled jobs'
);

select * from finish();
rollback;
