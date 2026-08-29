# S9-DEF-004 — owner evidence template

Status: `NOT_RUN`

The final-SHA section of this file is intentionally empty of results. The
pre-merge checkpoint may contain only sanitized owner-reported outcomes. Replace
the final placeholders only after performing
`docs/runbooks/slice-9-def-004-hosted-auth.md`. Do not record an email address,
password, token, cookie, full callback URL/query, SMTP credential, provider
payload or raw rate-limit header.

## Pre-merge delivery checkpoint

| Field | Safe result |
| --- | --- |
| Pre-merge deployment | EXISTING_PRODUCTION_ALIAS; source SHA was not recaptured during the owner-reported flow |
| Built-in delivery classification | BUILT_IN_DELIVERY_CONFIRMED; CUSTOM_SMTP_ABSENT |
| Recovery request UTC / safe UI code | 2026-08-29 / OWNER_INITIATED_APP_RECOVERY_ACCEPTED; exact UTC and elapsed time NOT_CAPTURED |
| Owner reported message received | YES — authorized recovery message received; recipient omitted |
| Callback reached `/update-password` | YES — OWNER_REPORTED_SAME_BROWSER_CALLBACK; artifact NOT_CAPTURED |
| Password update safe result | PASS — OWNER_REPORTED_PASSWORD_UPDATED; values omitted |
| Reused link denied | PASS — OWNER_REPORTED_REPLAY_DENIED; link omitted |
| Old password denied | PASS — OWNER_REPORTED_OLD_PASSWORD_DENIED; value omitted |
| New password login | PASS — OWNER_REPORTED_NEW_PASSWORD_LOGIN; value omitted |
| Observation basis | OWNER_REPORTED_SAME_DEVICE_FLOW; no browser artifact retained |

This checkpoint never changes the final status. Final evidence below is captured
again after merge and Production deployment.

## Candidate and configuration

| Field | Value |
| --- | --- |
| Candidate SHA | `<candidate-sha>` |
| Immutable Production SHA/alias parity | NOT_CAPTURED |
| UTC start/end | NOT_CAPTURED |
| Site URL origin | NOT_CAPTURED |
| Production callback path | NOT_CAPTURED |
| Local callback path | NOT_CAPTURED |
| Delivery mechanism classification | NOT_CAPTURED |
| Built-in/custom delivery classification screenshot | NOT_CAPTURED |
| Confirm/Reset template screenshot | NOT_CAPTURED |
| Hosted rate-limit/monitoring screenshot | NOT_CAPTURED |

## Flow observations

| Step | UTC timestamp / elapsed | Safe path or outcome code | Sanitized artifact | Result |
| --- | --- | --- | --- | --- |
| signup request | NOT_CAPTURED | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| confirmation delivery | NOT_CAPTURED | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| same-browser callback/session | NOT_CAPTURED | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| known recovery request/copy | NOT_CAPTURED | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| unknown recovery request/copy | NOT_CAPTURED | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| recovery delivery/session/update | NOT_CAPTURED | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| replay denied | NOT_CAPTURED | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| old password denied | NOT_CAPTURED | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| new password login | NOT_CAPTURED | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| 429/cooldown actionable alert | NOT_CAPTURED | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |

## Local post-check

| Command | Test name/count/duration | Sanitized output | Result |
| --- | --- | --- | --- |
| `npm.cmd run test:e2e -- e2e/auth.spec.ts` | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| `npm.cmd run owner-runbooks:check` | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |
| `git status --short` | NOT_CAPTURED | NOT_CAPTURED | NOT_RUN |

## Final owner disposition

| Owner | Target date | Trigger | Result | Precise missing action if not PASS |
| --- | --- | --- | --- | --- |
| Project owner | 2026-09-02 | exact organization-member recipient and mailbox handoff available | NOT_RUN | NOT_CAPTURED |

Do not change the record or ledger to `VERIFIED` unless every row above is
observed on the same final candidate and the evidence has been sanitized at full
size.
