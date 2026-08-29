# S9-REQ-003 — final Production and Public repository closeout

Status: `OWNER_ACTION_REQUIRED`.

This is an **agent-executable post-merge gate**. The owner authorization for
Ready-for-review, a reviewed merge and conditional Public publication is already
recorded, but it grants no PASS. Start this runbook only after every documented
pre-merge gate passed on the exact candidate SHA, PR #14 was merged without
direct push or auto-merge, and the final Production deployment exists.

The owner approved Public visibility and publication of technical author
metadata on 29 August 2026. No evaluator GitHub identity is required. Any Demo
credential delivery method that is needed remains out of band and outside Git.

An authenticated agent can perform every other step. Never reveal, copy,
screenshot, or save an environment secret, credential,
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
| Pre-public publication audit | Gitleaks on the clean worktree and a mirror of every advertised ref; GitHub CLI/API inventory for PRs, Actions, Releases and Issues | scanner/version, surface counts, inaccessible non-public payload count, finding counts and PASS/FAIL only; no value |
| Public repository verification | pre/post GitHub settings snapshot, anonymous HTTP/API, credential-disabled `git ls-remote` and clean clone | visibility, README/default `main`/final SHA, protection/rulesets, secret scanning/push protection and PASS/FAIL only |
| Post-public publication scan | a fresh anonymous mirror and the same trusted scanner after visibility changes | advertised-ref/commit counts, finding counts and PASS/FAIL only; no value |

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

## 7. Complete the mandatory pre-public publication audit

Do not change visibility until steps 1–6, every other required submission gate
and this section are PASS on `$finalSha`. Use a trusted Gitleaks release with
`--redact=100`; keep any temporary machine-readable report outside the
repository and record finding counts only. The audit must cover the working tree, every branch, every tag and the full Git history. A last-commit scan is
not sufficient.

From the clean final checkout, require an empty `git status --short`. Scan the
complete working directory with `gitleaks dir`, including tracked, untracked and
ignored secret-bearing candidates such as `.env*` and local credential/config
files. Bulk dependency/build directories may be excluded only with documented
patterns after their ignored config/text candidates have received a separate
targeted scan; being ignored is not itself a scan disposition. Also scan a fresh
authenticated `git clone --mirror` with `gitleaks git --log-opts=--all`. Confirm
the mirror includes every ref advertised by GitHub, including branch, tag and
pull-request refs, and record only counts of refs, commits and findings. Record
the result in `pre-public FULL_HISTORY_SECRET_SCAN: NOT_RUN` only after it is
observed; the completed value must be PASS with zero validated real secrets.
On Windows set `$env:GIT_ATTR_NOSYSTEM='1'` before the Git scan so an Office
textconv cannot invalidate the walk, and require a nonzero scanned commit count;
a zero-commit scanner result is invalid, never PASS.

Inspect `.env.example` separately and require that `.env.example` contains names and placeholders only. Record this as `ENV_EXAMPLE_PLACEHOLDERS_ONLY: NOT_RUN`.
Never copy ignored local credential content into a report, commit or Actions
artifact. If a scanner finds a real credential anywhere in the working
directory or any publishable file/ref, stop without showing the value and
require revocation/rotation; an expired or invalid value may receive a sanitized
disposition, but an active ignored credential is not skipped. Do not rewrite
history or force-push without new, explicit owner authorization.

Using authenticated GitHub CLI/API reads, enumerate and inspect all PR descriptions and comments, GitHub Actions logs and artifacts, and Releases, Issues, evidence files and screenshots. Include issue comments, PR reviews and
review comments. Download every still-accessible Actions log/artifact to a
private temporary directory, scan it with redaction, and delete no run or
artifact. For retention-pruned or otherwise inaccessible payloads, record the
count separately and verify that GitHub does not serve the payload; do not claim
that its unavailable bytes were scanned. Record the aggregate result as
`ACTIONS_LOGS_AND_ARTIFACTS_AUDIT: NOT_RUN`.

Review every finding privately. Test hashes, examples and approved technical
author metadata may be classified as false positives only with a documented
type/location disposition that never includes the matched value. The pre-public
gate is PASS only when all publishable surfaces were covered, every finding has
a disposition, and the validated real-secret count is zero. Store only
PASS/FAIL, surface counts, inaccessible non-public payload counts, raw finding
counts and false-positive counts in the template.

## 8. Publish and verify the repository

### 8A. Snapshot controls and change visibility

First record a sanitized pre-change snapshot:

```powershell
gh api repos/talzantkeren/predictor/branches/main
gh api repos/talzantkeren/predictor/branches/main/protection
gh api repos/talzantkeren/predictor/rulesets
gh api repos/talzantkeren/predictor
```

Record only visibility, default branch, `protected`, ruleset/protection status
or the documented availability error, and secret-scanning/push-protection
status. Then change visibility using GitHub Settings or the authenticated CLI;
never put a credential on the command line. Require `visibility=public` and
record `repository visibility PUBLIC: NOT_RUN` only from the observed result.

### 8B. Verify anonymous access and final SHA

In a browser with no GitHub session, open the repository and confirm the README,
default `main` and final commit are visible. From a fresh PowerShell process with
no credential helper, verify the advertised main SHA and a clean clone:

```powershell
$env:GIT_TERMINAL_PROMPT='0'
git -c credential.helper= ls-remote https://github.com/talzantkeren/predictor.git refs/heads/main
$cloneRoot = Join-Path $env:TEMP ('predictor-anonymous-' + [guid]::NewGuid().ToString('N'))
git -c credential.helper= clone --no-tags --single-branch --branch main https://github.com/talzantkeren/predictor.git $cloneRoot
git -C $cloneRoot rev-parse HEAD
git -C $cloneRoot status --short
```

Require the remote and cloned SHAs to equal `$finalSha`, with an empty clone
status. Record `anonymous final SHA parity: NOT_RUN` and
`anonymous clean clone: NOT_RUN` only from those observations. Also require
anonymous HTTP access to the repository, README, default `main` and final
commit.

### 8C. Recheck controls and run the mandatory post-public scan

Re-query branch protection and rulesets and compare them with the pre-change snapshot.
Record `BRANCH_PROTECTION_AFTER_VISIBILITY_CHANGE: NOT_RUN`. If a
protection or ruleset present before the visibility change was lost or disabled,
restore the same effective protection. If none existed before, record that fact
and do not create a new rule without a separately approved decision. Never allow
force-push or branch deletion while restoring an existing rule.

Verify `secret scanning availability and enabled state: NOT_RUN` and
`push protection availability and enabled state: NOT_RUN`; enable each feature
when GitHub exposes it for this repository. Record an unavailable feature as
unavailable, not PASS-by-intent.

Finally, make a fresh credential-disabled anonymous mirror of the now-Public
repository, verify its advertised refs and `$finalSha`, and rerun the trusted scanner across every ref and the full history. Record
`post-public FULL_HISTORY_SECRET_SCAN: NOT_RUN`; completion requires PASS and
zero validated real secrets. This post-public scan is mandatory and occurs
after the visibility, anonymous-access, protection and security-feature checks.
Demo credentials, if required, remain outside Git and are not part of repository
access.

## 9. Close the post-merge gate and re-run document gates

Fill the template only when steps 1–8 all refer to the same `$finalSha`. Then
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
