# S9-DEF-004 — Hosted Auth delivery/recovery runbook

Status: `OWNER_ACTION_REQUIRED`. This runbook defines one **single owner action**:
configure/verify approved Hosted delivery and execute one authorized disposable
confirmation/recovery session on the final candidate. The agent must not perform
it because it requires owner credentials, a disposable recipient and Hosted
mutation/email delivery.

Do not reveal, copy, screenshot, paste into a terminal, or commit an SMTP
password, recipient address, password, token, cookie, query string, full callback
URL, provider response, or Supabase secret. Use a disposable non-personal
recipient explicitly approved for this test.

## Artifact destinations

Fill `docs/evidence/slice-9/w2/S9-DEF-004-owner-template.md`. Save only reviewed,
sanitized images under an owner-controlled evidence bundle using these names:

1. `S9-DEF-004/01-url-configuration.png`
2. `S9-DEF-004/02-smtp-scope.png`
3. `S9-DEF-004/03-email-templates.png`
4. `S9-DEF-004/04-rate-limits.png`
5. `S9-DEF-004/05-known-unknown-copy.png`
6. `S9-DEF-004/06-confirmation-session.png`
7. `S9-DEF-004/07-recovery-session.png`
8. `S9-DEF-004/08-replay-denied.png`
9. `S9-DEF-004/09-password-transition.png`
10. `S9-DEF-004/10-cooldown.png`

Before committing any image, inspect it at full size and remove all account,
message, URL-query, browser-storage and provider identifiers. The template may
link to an external owner packet instead of committing screenshots.

## 1. Pin the candidate

From a clean repository checkout:

```powershell
git switch feature/slice-9-implementation
git pull
git rev-parse HEAD
git status --short
```

Record only the full SHA. `git status --short` must be empty. Open the immutable
Production deployment corresponding to that SHA; if SHA parity is unavailable,
stop and leave the template `NOT_RUN`.

## 2. Verify exact URL configuration

In Supabase Dashboard, choose the Production project, then open
**Authentication → URL Configuration**.

- Site URL must be exactly `https://predictor-swart.vercel.app`.
- Redirect URLs must include exactly
  `https://predictor-swart.vercel.app/auth/confirm` and
  `http://localhost:3000/auth/confirm`.
- `http://127.0.0.1:3000/auth/confirm` is allowed only when that exact loopback
  origin is used locally.
- Do not add a wildcard. Preview callback is absent unless Preview Auth is an
  explicitly approved internal QA path.

Capture `01-url-configuration.png` with query strings and project identifiers
cropped. If a URL must change, make only the exact owner-approved change, save,
reload this screen and capture the resulting list.

## 3. Configure/verify delivery without opening credentials

Open **Authentication → SMTP Settings**. Using the approved secrets manager,
configure the approved custom SMTP/delivery provider if it is not already
configured. Do not use Reveal/Copy and do not type a credential while screen
sharing. The sender/domain must be a non-personal Demo sender authorized by the
owner.

Save, reload the screen, and capture `02-smtp-scope.png` showing only enabled
state, sender classification/domain and safe scope. Crop hostname, username,
password, project identifiers and provider response details.

Open **Authentication → Email Templates**. Inspect Confirm signup and Reset
Password. Confirm each uses the platform-generated confirmation URL and contains
no recipient-specific or real-financial language. Capture only template names and
enabled state as `03-email-templates.png`; do not capture a generated link.

Open **Authentication → Rate Limits**. Record the displayed email/recovery
limits and monitoring destination without changing them. Capture
`04-rate-limits.png` after removing project/account identifiers.

## 4. Authorized confirmation and known/unknown recovery

Use a new private Chrome profile and the approved disposable address. Start from
`https://predictor-swart.vercel.app/register`.

1. Register through the UI with a unique synthetic display name and a temporary
   password held only in the password manager.
2. Observe delivery time, open the confirmation message in the same browser,
   follow the callback, and verify an authenticated session reaches the expected
   product route. Record only UTC timestamps, origin and path; never the full URL.
3. Log out.
4. On `/forgot-password`, submit the approved known address, then a syntactically
   valid unknown disposable address that is not an account. Capture only the two
   user-facing response blocks as `05-known-unknown-copy.png`; both must avoid
   account enumeration.
5. Record safe outcome codes and elapsed time in the template. Do not record the
   addresses.

This is the required **same-browser callback** confirmation proof. Save the
post-callback product state, with display name masked, as
`06-confirmation-session.png`.

## 5. Recovery, replay and password transition

For the known disposable account:

1. Request recovery once and observe delivery.
2. Open the message in the same browser and follow the callback.
3. Verify a recovery session is established, set a new temporary password, and
   capture only the safe success state as `07-recovery-session.png`.
4. Reopen the already-used recovery link in a fresh private tab. It must be
   rejected without a session; capture the path and safe error only as
   `08-replay-denied.png`.
5. Log out. Attempt login with the old password: **old password denied**.
6. Attempt login with the new password: **new password login** succeeds.
7. Capture the two safe UI outcomes, never either password, as
   `09-password-transition.png`.

Record expected stable outcome codes/messages, path-only destinations and UTC
timestamps in the template.

## 6. 429/cooldown behavior

Using only the authorized disposable known account, submit recovery through the
UI at the documented rate until the existing Hosted limit returns 429/cooldown.
Do not change the limit, use parallel traffic, or involve another recipient.
Verify the UI exposes an actionable alert and does not reveal provider detail.
Capture only that alert and safe retry guidance as `10-cooldown.png`; record no
raw headers.

If the configured limit would require abusive volume, stop and mark this row
`NOT_RUN` with the exact owner decision; do not manufacture a PASS.

## 7. Local regression after Hosted observation

From the clean candidate checkout, with Local Supabase/Mailpit only:

```powershell
npm.cmd run test:e2e -- e2e/auth.spec.ts
npm.cmd run owner-runbooks:check
git status --short
```

Expected test names include authentication/profile signup, confirmation, logout,
login and recovery in Desktop and Mobile Chromium. Save only test counts,
duration and the absence/presence of `[WebServer] Error`. The repository must
remain clean except for the deliberately filled sanitized evidence template.

## Completion rule

The single owner action is complete only when URL/SMTP/template/rate screens,
known+unknown handling, delivery, same-browser callback/session, update, replay
denial, logout, old-password denial, new-password success and 429/cooldown are
all observed on the same final candidate and the local commands pass. Otherwise
leave `S9-DEF-004` as `OWNER_ACTION_REQUIRED` and name the one failed step.
