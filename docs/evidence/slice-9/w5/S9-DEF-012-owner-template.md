# S9-DEF-012 — owner evidence template

Status: `NOT_RUN`

Fill only after executing
`docs/runbooks/slice-9-def-012-production-cron.md`. Never paste `cron.job.command`,
Vault values, headers, URLs, `response.content`, cookies, actors, secrets or
provider payloads.

## Candidate and deployment

| Field | Value |
| --- | --- |
| Candidate SHA | `<candidate-sha>` |
| Immutable Production deployment/alias parity | NOT_CAPTURED |
| Observation UTC window | NOT_CAPTURED |
| Migration `20260827170000` present | NOT_RUN |

## Cron job shape

| jobname | schedule | active | timeout_is_45s | legacy/duplicate absent | Result |
| --- | --- | --- | --- | --- | --- |
| `predictor-sports-sync` | NOT_CAPTURED | NOT_CAPTURED | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |

## Linked scheduled observation

| Safe field | Value |
| --- | --- |
| request_id | NOT_CAPTURED |
| status_code | NOT_CAPTURED |
| timed_out | NOT_CAPTURED |
| response_created_at | NOT_CAPTURED |
| run_id | NOT_CAPTURED |
| terminal run status | NOT_CAPTURED |
| started_at | NOT_CAPTURED |
| finished_at | NOT_CAPTURED |
| run_seconds | NOT_CAPTURED |
| lease_released | NOT_CAPTURED |
| response_rows_for_run | NOT_CAPTURED |
| Sanitized artifact path | NOT_CAPTURED |
| Result | NOT_RUN |

Required final values include `timed_out=false`, a terminal run, non-null
`finished_at`, `run_seconds < 120`, `lease_released=true`, and exactly one linked
response row.

## Local post-check

| Command | Count/duration | Sanitized output | Result |
| --- | --- | --- | --- |
| focused Vitest route/orchestrator | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| focused pgTAP Cron/provider | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| `npm.cmd run owner-runbooks:check` | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| `git status --short` | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |

## Final disposition and promotion condition

| Owner | Target date | Trigger | Result | Precise missing action/failing field |
| --- | --- | --- | --- | --- |
| Operations owner | 2026-09-02 | final candidate deployed and natural due tick available | NOT_RUN | NOT_CAPTURED |

The **promotion condition** is any truncated/timed-out response, orphan lease,
missing/duplicate finalization or duplicate Cron/response mapping. If observed,
keep this template non-PASS and open a P2 defect using only sanitized columns.
