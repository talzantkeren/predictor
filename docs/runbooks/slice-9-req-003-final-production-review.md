# S9-REQ-003 — final Production and evaluator closeout

Status: `OWNER_ACTION_REQUIRED`.

This is an **agent-executable post-merge gate**. Do not execute it while PR #14
is Draft or before an authorized merge and the final Production deployment
exist. This runbook never authorizes merge, approval, Ready-for-review,
auto-merge or deployment from the current pre-merge task.

The only owner input required is supplied before step 7 and kept outside Git:

1. the approved evaluator's GitHub identity; and
2. the approved out-of-band access method for Demo credentials.

An authenticated agent can perform every other step. Never reveal, copy,
screenshot, or save an environment secret, credential, evaluator identity,
Demo password, cookie, signed URL, or provider payload.

Copy
`docs/evidence/slice-9/w8/S9-REQ-003-owner-template.md` to a working copy and
fill only observed results. Keep every field `NOT_RUN`/`NOT_CAPTURED` until the
corresponding step has actually completed.

## Mechanical artifact map

| Artifact | Exact screen or command | Sanitized content |
| --- | --- | --- |
| Final identity | repository PowerShell commands in §1 and `gh pr view` | main/final SHA, clean parity, merged state and merge timestamp; no identity |
| `S9-REQ-003-owner-ci.json` | `gh run view` in §2 | only the seven allowlisted JSON fields |
| Git/Hosted migration lists | `Get-ChildItem` in §3 and **Supabase → SQL Editor → New query** | ordered migration version IDs only |
| System actor readiness | the value-free SQL in §3A; identifier-only visual equality | three PASS/FAIL booleans; no UUID |
| `S9-REQ-003-final-env-scopes.md` | `vercel env ls --json` in §4 | environment names/scopes only; no value |
| `S9-REQ-003-production.txt` | **Vercel → Deployments → Production → Overview/Source/Domains** | deployment ID, Source SHA, immutable host, alias, target/state, route duration |
| Incognito smoke | Chrome Incognito plus the two `curl.exe` commands in §6 | timestamp, URL kind, effective host, HTTP status and PASS/FAIL |
| Evaluator confirmation | **GitHub → Settings → Collaborators and teams** plus evaluator reply | PASS/FAIL, timestamp and evidence location; no identity or credential |

Nothing in this runbook calls `vercel env pull`, reveals an environment value,
reads Vault, exports a token or asks anyone to re-enter a secret.

## 1. Freeze the merged final SHA and prove PR state

In PowerShell, from the repository root:

```powershell
$env:GIT_PAGER='cat'
git switch main
git pull --ff-only
$finalSha = git rev-parse HEAD
git status --short
git rev-parse origin/main
gh pr view 14 --json number,isDraft,state,headRefOid,mergeCommit,mergedAt,url
```

Require an empty status, identical local/origin SHAs, `state=MERGED`, a non-null
`mergedAt`, and `mergeCommit.oid=$finalSha`. Save the sanitized output in the
template under “Final identity”; do not run a PR mutation command. If PR #14 is
still Draft/open, stop: the post-merge gate is not yet eligible to run.

## 2. Bind completed CI to that exact SHA

Open **GitHub → predictor → Actions → CI**, select the newest completed run
whose commit is `$finalSha`, and record its run ID and URL. Then run:

```powershell
gh run view <final-run-id> --json databaseId,attempt,headSha,status,conclusion,jobs,url
```

Save the JSON, limited to those fields, as
`docs/evidence/slice-9/w8/S9-REQ-003-owner-ci.json`. Require
`status=completed`, `conclusion=success`, exact `headSha=$finalSha`, and success
for all three jobs: `Lint, typecheck, unit tests and build`,
`Supabase database tests`, and `Playwright core flows`. A queued, skipped,
cancelled, billing-blocked, or different-SHA run does not qualify.

## 3. Prove Hosted migration parity without linking the CLI

First generate the Git-side list locally:

```powershell
Get-ChildItem supabase/migrations -Filter *.sql |
  Sort-Object Name |
  ForEach-Object { $_.BaseName -replace '_.*$','' } |
  Set-Content docs/evidence/slice-9/w8/S9-REQ-003-git-migrations.txt
```

Then open `Supabase Dashboard → SQL Editor → New query` inside the Production
project and run this read-only query:

```sql
select version
from supabase_migrations.schema_migrations
order by version;
```

Download only the `version` column as
`docs/evidence/slice-9/w8/S9-REQ-003-hosted-migrations.csv`. Compare the two
ordered ID lists; require exact equality through the newest Git migration.
Record `Hosted migration parity: PASS` only after the comparison. Do not run
`supabase link`, `supabase db push`, or any linked reset from the agent session.

### 3A. Require the system actor designation before application traffic

Migration `20260828090000` promotes an existing boundary binding atomically. On
a brand-new Hosted project, however, the environment-specific Auth principal is
created outside Git and cannot be invented by schema SQL. Keep application
traffic closed after migrations, create the noninteractive principal through
Supabase Auth Admin, and grant its protected row through the controlled SQL
channel with `automation_purpose='sports_sync'` before deploying the app. Never
save or screenshot either UUID. A rotation must clear the old designation and
grant the new one in the same controlled maintenance window before traffic
resumes.

Then run only this value-free readiness query and record its two booleans:

```sql
select
  (select count(*)
     from public.system_admins
     where automation_purpose = 'sports_sync') = 1
    as exactly_one_designated_actor,
  (select count(*)
     from private.slice9_system_actor_bindings as binding
     join public.system_admins as administrator
       on administrator.user_id = binding.actor_id
      and administrator.automation_purpose = 'sports_sync'
     where binding.binding_name = 'business_boundary_activation') = 1
    as boundary_binding_ready;
```

Require both values to be `true`. In the same closed-traffic maintenance window,
open only the Production `SYNC_SYSTEM_ACTOR_ID` entry in Vercel's protected
settings UI and visually compare its **identifier** with the noninteractive Auth
principal just designated. This UUID is an identifier, not a credential; no
secret is opened. Do not use `vercel env pull`, copy either UUID, paste it into a
shell or SQL history, save it, or capture it in a screenshot. Record only
`sync_actor_matches_designation: PASS` or `FAIL` in the owner template.

Require all three observations—`exactly_one_designated_actor`,
`boundary_binding_ready` and `sync_actor_matches_designation`—to be `PASS`
before deploying or opening application traffic. A mismatch remains fail-closed;
do not use the first natural Cron tick as discovery or repair.

## 4. Confirm the final environment-name/scope matrix

This step follows the S9-DEF-025 Preview-scope correction. Run:

```powershell
npx.cmd --no-install vercel env ls --json
```

Before saving anything, reduce the output to environment **names and scopes
only** (`key`, `type`, `target`, `gitBranch`). Save the sanitized table as
`docs/evidence/slice-9/w8/S9-REQ-003-final-env-scopes.md`. Require
`SPORTS_API_KEY` to have Production scope only; do not open Reveal/Copy or save
values.

## 5. Bind the live Production deployment to the final SHA

Open **Vercel → predictor → Deployments**. Find the READY deployment whose
**Source** commit is the full `$finalSha`; open it and verify the full source SHA
before continuing. Require the Production alias to be attached. If automatic
post-merge deployment did not attach it, stop and report the deployment blocker;
this audit runbook does not authorize promotion of a different SHA.

Open `Vercel → predictor → Deployments → Production`, select the deployment,
and record from its Overview/Source/Domains panels:

- deployment ID;
- full Source commit SHA;
- immutable URL;
- Production alias;
- target/state; and
- `api/cron/sync` maximum duration.

Save a text transcription with no environment values as
`docs/evidence/slice-9/w8/S9-REQ-003-production.txt`. Require the Source SHA to
equal `$finalSha`, state READY, and the configured Cron duration to satisfy the
documented 120-second route budget.

## 6. Prove anonymous Demo-only access

Close all authenticated Vercel/GitHub tabs. In a fresh Chrome Incognito window,
open both the immutable URL and the Production alias from step 5. Confirm both
load without Vercel protection/team login, show the Demo-only product, and
contain no real payment operation. From PowerShell also run for each URL:

```powershell
curl.exe -L --max-time 20 -sS -o NUL -w '%{http_code} %{url_effective}' <url>
```

Record only timestamp, URL kind, final effective host, HTTP `200`,
`incognito=PASS`, and `Demo-only=PASS` in the template. Do not save cookies,
account details, proof paths, or signed URLs.

## 7. Grant and verify evaluator access — the only owner input

Before opening GitHub Settings, obtain the two owner-supplied items named at the
top: approved evaluator identity and approved out-of-band Demo access method.
Do not proceed with a guessed identity or channel, and do not write either into
the repository.

Open **GitHub → predictor → Settings → Collaborators and teams → Add people**.
Invite the approved evaluator identity with read access only. Supply Demo
credentials through the approved out-of-band channel, never Git. Ask the
evaluator to confirm, in their own signed-in browser, that the private
repository opens and that the README local-run instructions are visible.

Record only `evaluator repository access: PASS`, the confirmation timestamp,
and the evidence location in the template. Do not record the evaluator identity
or Demo credential. This human confirmation cannot be replaced by the owner's
own GitHub session.

## 8. Close the post-merge gate and re-run document gates

Fill the template only when steps 1–7 all refer to the same `$finalSha`. Then
run:

```powershell
npm.cmd run submission:evidence:check
npm.cmd run owner-runbooks:check
npm.cmd run docs:submission:check -- --online
gh pr view 14 --json number,isDraft,state,headRefOid,mergeCommit,mergedAt,url
```

Require all document commands to exit 0 and the final PR read to remain
`MERGED` with `mergeCommit.oid=$finalSha`. If any artifact is missing, refers
to a different SHA, or contains a secret, leave S9-REQ-003
`OWNER_ACTION_REQUIRED`.
