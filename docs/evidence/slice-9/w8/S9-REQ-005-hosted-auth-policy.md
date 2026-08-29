# S9-REQ-005 — Hosted Auth policy export

Status: `VERIFIED`

Observation window: 2026-08-27 22:57–23:26 UTC. The Supabase Management API
was read with the CLI's existing local authentication. The response was kept in
memory and projected to the allowlisted fields below; no token, project/account
identifier, password, URL or unrelated configuration value was printed or
stored. No Hosted Auth setting was changed.

## Sanitized Hosted fields

| Field | Observed value | Disposition |
| --- | --- | --- |
| `password_min_length` | `8` | Application keeps the stronger user-facing rule of at least eight characters. |
| active GoTrue version | `v2.195.0` | Version was observed with `supabase services --output json`. |
| active GoTrue maximum | `72` UTF-8 bytes | The tagged Go source uses `len(password)` and `MaxPasswordLength = 72`; application validation now uses `TextEncoder` and the same byte ceiling. |
| `password_required_characters` | none | No stronger character-class claim is made. |
| `password_hibp_enabled` | `false` | `ACCEPTED WITH RATIONALE` under `S9-TDEC-004`; never described as enabled. |
| `security_update_password_require_reauthentication` | `false` | Recorded as observed; no setting change. |
| `external_email_enabled` | `true` | Recorded as observed; final SMTP/flow verification remains `S9-DEF-004`. |
| `mailer_autoconfirm` | `false` | Recorded as observed. |
| `rate_limit_email_sent` | `2` | Monitoring/rate evidence only; no configuration mutation. |
| `rate_limit_token_refresh` | `150` | Monitoring/rate evidence only; no configuration mutation. |
| `rate_limit_verify` | `30` | Monitoring/rate evidence only; no configuration mutation. |
| `rate_limit_otp` | `30` | Monitoring/rate evidence only; no configuration mutation. |
| `security_captcha_enabled` | `false` | Recorded as observed; no stronger claim. |

Source used for the version-specific maximum:
[`supabase/auth` v2.195.0 `password.go`](https://github.com/supabase/auth/blob/v2.195.0/internal/api/password.go#L15-L45).
Although its error text says “characters”, Go's `len(string)` counts bytes; the
application therefore validates the exact UTF-8 byte boundary, including
multibyte Hebrew passwords.

## Application correction and proof

The prior application contract was 8–128 JavaScript characters and was not
consistent with the active Hosted service. It was corrected to at least eight
characters and at most 72 UTF-8 bytes in `src/features/auth/schemas.ts`; all
password inputs retain `minLength=8` and now use `maxLength=72` as a coarse
browser guard, while the Server Action schema remains authoritative.

Observed checks:

```text
Vitest auth rules: 87/87 PASS
Full Vitest: 50 files, 641/641 PASS
TypeScript strict check: PASS
Production build: PASS
```

Boundary coverage includes 72 ASCII bytes accepted, 73 rejected, and a mixed
ASCII/Hebrew value of exactly 72 UTF-8 bytes accepted with 73 rejected.

## Accepted residual risk

Leaked-password protection remains disabled. Owner: repository owner under
`S9-TDEC-004`. Target date: revisit on trigger. Triggers: the plan gains the
feature for another reason, the product begins handling more sensitive data,
credential-stuffing evidence or an incident appears, or the evaluator requires
it. Current mitigations are the aligned 8-character/72-byte validation,
enumeration-safe recovery, observed rate limits and Demo-only scope.
