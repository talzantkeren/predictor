# S9-REQ-003 — final Production and evaluator closeout

Status: `OWNER_ACTION_REQUIRED`.

This is the **single owner action** for S9-REQ-003: perform the steps below in
one sitting after every earlier owner action and the final branch push are
complete. Do not merge, approve, mark Ready, or enable auto-merge on PR #14.
Never reveal, copy, screenshot, or save an environment value, credential,
evaluator identity, Demo password, cookie, signed URL, or provider payload.

Copy
`docs/evidence/slice-9/w8/S9-REQ-003-owner-template.md` to a working copy and
fill only observed results. Keep every field `NOT_RUN`/`NOT_CAPTURED` until the
corresponding step has actually completed.

## 1. Freeze the pushed candidate and prove PR state

In PowerShell, from the repository root:

```powershell
$env:GIT_PAGER='cat'
git switch feature/slice-9-implementation
git pull --ff-only
$finalSha = git rev-parse HEAD
git status --short
git rev-parse origin/feature/slice-9-implementation
gh pr view 14 --json number,isDraft,state,headRefOid,mergeStateStatus,url
```

Require an empty status, identical local/origin SHAs, `state=OPEN`,
`isDraft=true`, and `headRefOid=$finalSha`. Save the sanitized output in the
template under “Final identity”; do not run a PR mutation command.

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

## 5. Promote the exact candidate to Production

Open **Vercel → predictor → Deployments**. Find the READY deployment whose
**Source** commit is the full `$finalSha`; open it and verify the full source
SHA before continuing. Select **… → Promote to Production → Promote**. This is
the sole Hosted deployment mutation in this runbook.

After promotion, open `Vercel → predictor → Deployments → Production`, select
the promoted deployment, and record from its Overview/Source/Domains panels:

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

## 7. Grant and verify evaluator access

Open **GitHub → predictor → Settings → Collaborators and teams → Add people**.
Invite the approved evaluator identity with read access only. Supply Demo
credentials through the approved out-of-band channel, never Git. Ask the
evaluator to confirm, in their own signed-in browser, that the private
repository opens and that the README local-run instructions are visible.

Record only `evaluator repository access: PASS`, the confirmation timestamp,
and the evidence location in the template. Do not record the evaluator identity
or Demo credential. This human confirmation cannot be replaced by the owner's
own GitHub session.

## 8. Close the one action and re-run document gates

Fill the template only when steps 1–7 all refer to the same `$finalSha`. Then
run:

```powershell
npm.cmd run submission:evidence:check
npm.cmd run owner-runbooks:check
npm.cmd run docs:submission:check -- --online
gh pr view 14 --json number,isDraft,state,headRefOid,mergeStateStatus,url
```

Require all document commands to exit 0 and the final PR read to remain
`OPEN`/`isDraft=true` on `$finalSha`. If any artifact is missing, refers to a
different SHA, or contains a secret, leave S9-REQ-003
`OWNER_ACTION_REQUIRED`.
