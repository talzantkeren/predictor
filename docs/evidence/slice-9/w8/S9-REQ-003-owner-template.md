# S9-REQ-003 — owner evidence template

Status: `NOT_RUN`.

This file is intentionally empty of claims. Fill it only while executing
`docs/runbooks/slice-9-req-003-final-production-review.md`; never store secrets,
evaluator identity, Demo credentials, cookies, signed URLs, or environment
values.

Executor: authenticated post-merge agent.

## Owner input — supplied out of band only

```text
approved evaluator identity received: NOT_RUN
approved Demo access method received: NOT_RUN
identity or credential recorded in Git: NOT_RUN
```

## Final identity

```text
final/main SHA: <final-sha>
local/origin parity: NOT_RUN
clean worktree: NOT_RUN
PR #14 merged: NOT_RUN
merge commit equals final SHA: NOT_RUN
PR read-only output: NOT_CAPTURED
```

## Exact-SHA CI

```text
run ID: <final-run-id>
head SHA parity: NOT_RUN
overall conclusion: NOT_RUN
Lint, typecheck, unit tests and build: NOT_RUN
Supabase database tests: NOT_RUN
Playwright core flows: NOT_RUN
sanitized JSON: docs/evidence/slice-9/w8/S9-REQ-003-owner-ci.json — NOT_CAPTURED
```

## Hosted migration parity

```text
Git list: docs/evidence/slice-9/w8/S9-REQ-003-git-migrations.txt — NOT_CAPTURED
Hosted list: docs/evidence/slice-9/w8/S9-REQ-003-hosted-migrations.csv — NOT_CAPTURED
newest Git migration: NOT_CAPTURED
newest Hosted migration: NOT_CAPTURED
ordered lists equal: NOT_RUN
Hosted migration parity: NOT_RUN
```

## System actor readiness

```text
exactly_one_designated_actor: NOT_RUN
boundary_binding_ready: NOT_RUN
sync_actor_matches_designation: NOT_RUN
actor UUID copied, saved or captured: NOT_RUN
```

## Environment scopes

```text
sanitized names/scopes: docs/evidence/slice-9/w8/S9-REQ-003-final-env-scopes.md — NOT_CAPTURED
SPORTS_API_KEY Production-only: NOT_RUN
environment values opened or saved: NOT_RUN
```

## Final Production

```text
deployment ID: NOT_CAPTURED
Source SHA: <final-sha>
immutable URL: NOT_CAPTURED
Production alias: NOT_CAPTURED
state READY: NOT_RUN
Cron duration contract: NOT_RUN
sanitized deployment transcription: docs/evidence/slice-9/w8/S9-REQ-003-production.txt — NOT_CAPTURED
```

## Incognito Demo smoke

```text
immutable HTTP 200: NOT_RUN
Production alias HTTP 200: NOT_RUN
incognito without protection/team login: NOT_RUN
Demo-only: NOT_RUN
financial operation absent: NOT_RUN
timestamp: NOT_CAPTURED
```

## Evaluator

```text
evaluator repository access: NOT_RUN
README/local-run instructions visible: NOT_RUN
out-of-band Demo access supplied: NOT_RUN
confirmation timestamp: NOT_CAPTURED
identity or credential recorded here: NOT_RUN
```

## Final verification

```text
npm.cmd run submission:evidence:check: NOT_RUN
npm.cmd run owner-runbooks:check: NOT_RUN
npm.cmd run docs:submission:check -- --online: NOT_RUN
final PR #14 merged/final-SHA read: NOT_RUN
single-SHA evidence set complete: NOT_RUN
```
