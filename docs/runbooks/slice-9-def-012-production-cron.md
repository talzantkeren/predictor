# S9-DEF-012 — final Production Cron observation

Status: `OWNER_ACTION_REQUIRED`. This runbook defines one **single owner action**:
after the final candidate is deployed and its migrations are present, observe one
natural scheduled Production tick and link its sanitized `pg_net` response to one
terminal `sync_runs` row and a released lease.

Never invoke the Production route with a copied Cron secret, reveal Vault values,
select `cron.job.command`, print headers/URLs, or store `response.content`, cookies,
actor identifiers or provider payloads. Never run a linked reset. Keep Draft PR
#14 Draft and unmerged.

## Artifact destinations

Fill `docs/evidence/slice-9/w5/S9-DEF-012-owner-template.md`. Save sanitized
outputs in the owner evidence bundle with these names:

1. `S9-DEF-012/01-production-deployment-sha.png`
2. `S9-DEF-012/02-migration-version.txt`
3. `S9-DEF-012/03-cron-job-shape.txt`
4. `S9-DEF-012/04-linked-response-run.txt`
5. `S9-DEF-012/05-local-regression.txt`

Text artifacts must contain only the selected columns shown below. Never save a
SQL Editor history panel if it exposes another query.

## 1. Pin the final deployment

From a clean checkout:

```powershell
git switch feature/slice-9-implementation
git pull
git rev-parse HEAD
git status --short
```

In Vercel open **Project → Deployments → Production**, select the immutable
deployment, then open its **Source** panel. Confirm the displayed commit equals
the command output and that the Production alias is attached. Capture only the
commit SHA, deployment state and alias as `01-production-deployment-sha.png`.
If they differ, stop and leave the template `NOT_RUN`.

## 2. Verify the Cron migration and one-job shape

In the Production Supabase project open
**Supabase Dashboard → SQL Editor → New query**. Run:

```sql
select version
from supabase_migrations.schema_migrations
where version = '20260827170000';
```

Save the single version row as `02-migration-version.txt`. A missing row is a
deployment blocker; apply forward migrations through the approved deployment
procedure, never `supabase db reset --linked`, then rerun this query.

In a fresh SQL Editor query run the following. It reads `cron.job.command` only
inside a boolean expression and never returns the command:

```sql
select jobname,
       schedule,
       active,
       command ~ 'timeout_milliseconds[[:space:]]*(=>|:=)[[:space:]]*45000([^0-9]|$)'
         as timeout_is_45s
from cron.job
where jobname in ('predictor-slice7-manual-sync', 'predictor-sports-sync')
order by jobname;
```

Required output is exactly one row:

- `jobname=predictor-sports-sync`;
- `active=true`;
- `timeout_is_45s=true`;
- no legacy or duplicate row.

Save only those four columns as `03-cron-job-shape.txt`. If no row exists and the
approved Vault entries already exist, run exactly once in a new query:

```sql
select private.configure_predictor_sync_cron();
```

Do not expand the returned command or inspect Vault. Rerun the sanitized shape
query. If a duplicate/legacy row or wrong timeout remains, stop; do not add a
second Cron.

## 3. Observe one natural scheduled tick

Do not change Production fixtures, lease rows, provider state or schedule to
force due work. Wait for a natural scheduled tick whose safe JSON response
contains a non-null UUID `data.runId`. Query within the six-hour `pg_net`
retention window.

Open **Supabase Dashboard → SQL Editor → New query** and run:

```sql
with candidate_responses as (
  select response.id as request_id,
         response.status_code,
         response.timed_out,
         response.created,
         response.content::jsonb #>> '{data,runId}' as run_id_text
  from net._http_response as response
  where response.created >= clock_timestamp() - interval '6 hours'
    and response.content_type like 'application/json%'
    and response.content ~ '"runId"[[:space:]]*:[[:space:]]*"[0-9a-f-]{36}"'
), linked as (
  select response.request_id,
         response.status_code,
         response.timed_out,
         response.created as response_created_at,
         run.id as run_id,
         run.status as run_status,
         run.started_at,
         run.finished_at,
         extract(epoch from (run.finished_at - run.started_at))::numeric(10,3)
           as run_seconds,
         lease.run_id is null as lease_released,
         count(*) over (partition by run.id) as response_rows_for_run
  from candidate_responses as response
  join public.sync_runs as run
    on run.id = response.run_id_text::uuid
  join public.sync_leases as lease
    on lease.provider = run.provider
)
select request_id,
       status_code,
       timed_out,
       response_created_at,
       run_id,
       run_status,
       started_at,
       finished_at,
       run_seconds,
       lease_released,
       response_rows_for_run
from linked
order by response_created_at desc
limit 1;
```

This query parses the response internally but does not return its content.
Required evidence:

- `timed_out=false`;
- `run_status` is terminal (`succeeded` or `failed`);
- `finished_at` is non-null and `run_seconds < 120`;
- `lease_released=true`;
- `response_rows_for_run=1`.

Save only the selected row as `04-linked-response-run.txt`. Record the safe
result in the template. Do not claim success from pg_cron enqueue alone.

## 4. Promotion condition

If the selected response is truncated/timed out, the run stays nonterminal,
`finished_at` is null, `lease_released=false`, or more than one response/final
observation maps to the run, stop and promote S9-DEF-012 to a P2 defect. Attach
only the sanitized selected columns. Do not retry with a second Cron or edit a
test/config to suppress the result.

## 5. Local regression after the Production observation

Against Local Supabase only, from the same clean candidate:

```powershell
npm.cmd run test -- src/app/api/cron/sync/route.test.ts src/features/sync/orchestrator.test.ts
npx.cmd --no-install supabase test db supabase/tests/slice9-sync-cron-budget.test.sql supabase/tests/sync-api-football.test.sql
npm.cmd run owner-runbooks:check
git status --short
```

Save test names/counts/durations and the clean status as
`05-local-regression.txt`. No Hosted response/body belongs in local logs.

## Completion rule

The single owner action is complete only when deployment SHA, migration, one-job
shape, one natural response, one terminal run, timing and lease release all meet
the requirements and the local regressions pass. Otherwise leave the template
and ledger `OWNER_ACTION_REQUIRED` with the precise failing column.
