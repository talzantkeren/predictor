# S9-DEF-004 — Hosted Auth delivery/recovery runbook

Status: `OWNER_ACTION_REQUIRED`. The pre-merge checkpoint removes the delivery
unknown, but formal acceptance is recorded only after the merged final SHA is
live. The built-in Supabase delivery service is an approved Demo mechanism; a
custom SMTP purchase is not required when one authorized demonstration succeeds.

The only owner-only capability is mailbox access. The owner supplies an exact
recipient that is already a member of the Supabase organization and an existing
Hosted Auth account, then returns the received recovery link out of band. Use a
mailbox that does not prefetch or rewrite one-time recovery links; institutional
safe-link scanners can consume the token before the human handoff. The agent
performs the Dashboard reads, UI request and remaining browser checks.
Never store the recipient, link, password, token, cookie, query string or full
callback URL in Git, terminal output, screenshots or evidence.

Supabase's built-in sender is best-effort, limited to two project-wide auth
emails per hour, and delivers only to exact organization-member addresses. A
Gmail plus-alias is valid only if that exact alias is already an organization
member. Do not invite a new organization member or configure SMTP merely to make
this check pass.

## Artifact destinations

Fill `docs/evidence/slice-9/w2/S9-DEF-004-owner-template.md`. Keep screenshots in
an owner-controlled packet; Git receives only the sanitized template and result
codes.

1. `S9-DEF-004/01-url-configuration.png`
2. `S9-DEF-004/02-delivery-mechanism.png`
3. `S9-DEF-004/03-email-templates.png`
4. `S9-DEF-004/04-rate-limits.png`
5. `S9-DEF-004/05-known-unknown-copy.png`
6. `S9-DEF-004/06-confirmation-session.png`
7. `S9-DEF-004/07-recovery-session.png`
8. `S9-DEF-004/08-replay-denied.png`
9. `S9-DEF-004/09-password-transition.png`
10. `S9-DEF-004/10-cooldown.png`

Before retaining any image, inspect it at full size and crop every account,
message, URL-query, browser-storage, project and provider identifier.

## 1. Pre-merge read-only configuration checkpoint

Open the Production project in Supabase Dashboard. Do not click Save on any Auth
screen during this checkpoint.

### Authentication → URL Configuration

Require:

- Site URL exactly `https://predictor-swart.vercel.app`;
- Redirect URLs exactly
  `https://predictor-swart.vercel.app/auth/confirm` and
  `http://localhost:3000/auth/confirm`;
- optional `http://127.0.0.1:3000/auth/confirm` only when that exact local origin
  is actively used;
- no wildcard and no stale Preview/Slice alias.

If a stale Preview entry is present, record `STALE_PREVIEW_CALLBACK_PRESENT`.
Do not remove it in the read-only checkpoint. In the final post-merge run, use
**Authentication → URL Configuration → Redirect URLs**, delete only the named
stale entries, click Save once, reload, and verify the exact allowlist above.
This mutation changes only callback allowlisting; it reads or re-enters no
secret.

### Authentication → Sign In / Providers and Emails

Require **Email: Enabled**. Under **Authentication → Emails → SMTP Settings**,
record only whether custom SMTP is absent/present; never open or copy a
credential. When custom SMTP is absent, the visible default templates and
“Set up SMTP” control establish that the project is using the built-in service.
Under **Authentication → Email Templates**, verify Confirm signup and Reset
Password use platform-generated confirmation URLs and contain no recipient or
real-financial content.

Under **Authentication → Rate Limits**, observe the email control without
changing it. For the built-in sender it is non-editable; record the documented
effective limit `BUILT_IN_EMAIL_LIMIT_2_PER_HOUR`. Do not manufacture a numeric
Dashboard value when the disabled control is blank.

## 2. Pre-merge recovery checkpoint — one send, then pause

This checkpoint may run against the current Production deployment to de-risk
delivery, but it can never close the record.

1. Obtain one owner-approved recipient. Confirm privately that the exact address
   is both an organization member and a known Hosted Auth account. Do not query
   or print it in evidence.
2. Immediately before submission, state that one password-recovery email will be
   sent from the Hosted Supabase project and obtain explicit owner confirmation.
3. In a private Chrome profile open
   `https://predictor-swart.vercel.app/forgot-password`, enter the address and
   submit once. The request must pass through the application form/Server Action
   in that same profile so its PKCE verifier cookie is retained. Do not replace
   this step with a direct `/auth/v1/recover` request: a direct request can send
   mail while leaving the application callback without its verifier. Record only
   UTC timestamp, HTTP/UI safe result code and elapsed time. Do not repeat the
   request.
4. Stop. The owner checks their own inbox and pastes the recovery link back only
   into the active private handoff. The agent cannot inspect the mailbox and must
   not claim delivery until the owner reports the message.
5. Treat the returned link as a credential: do not echo, log, screenshot or
   commit it. Navigate in the same private profile, verify the callback reaches
   `/update-password`, fill a generated temporary password, and hand control to
   the owner for the final password-change submit.
6. After the owner confirms the submit, the agent verifies the safe success
   state, opens the same link in a fresh private tab and requires replay denial,
   logs out, requires **old password denied**, and requires **new password login**.

If Supabase rejects the first human use with `otp_expired` before
`/update-password`, stop. Record `RECOVERY_TOKEN_REJECTED_BEFORE_CALLBACK`; do
not classify it as replay denial and do not send again without a new explicit
owner approval and a confirmed rate-limit window. The next authorized attempt
must use an exact organization-member/Auth address on a mailbox without
one-time-link prefetch. Never weaken Hosted Auth or change the email template to
work around a scanner during this checkpoint.

Sanitized pre-merge outcomes go in the “Pre-merge delivery checkpoint” section
of the template. The recovery link and either password never enter the template.

## 3. Final post-merge acceptance on one SHA

After authorized merge and final Production deployment, start from a clean
checkout of `main`:

```powershell
git switch main
git pull --ff-only
$finalSha = git rev-parse HEAD
git status --short
```

In **Vercel → predictor → Deployments → Production → Source**, require the live
Source SHA to equal `$finalSha`. Then repeat the URL/delivery/template/rate
observations and the full confirmation/recovery session on that deployment.

If the supplied known address has no disposable Hosted account, or its mailbox
prefetches one-time links, the owner may
authorize one normal UI signup in the same private browser. Observe confirmation
delivery and the **same-browser callback** before logout; this consumes one of
the two built-in messages. Wait for the project-wide window if necessary rather
than bypassing the limit. Do not create a user through the Admin API solely for
the audit.

From `/forgot-password`, submit the known address once and a syntactically valid
unknown address once. The visible copy must remain enumeration-safe. The unknown
request must not be treated as delivery evidence. Complete recovery, password
update, replay denial, logout, old-password denial and new-password login exactly
as in §2.

## 4. 429/cooldown behavior

Use only the approved known account. After the allowed demonstration, a further
UI recovery request may be used to observe the existing cooldown/429. Do not
change the two-per-hour limit, send parallel traffic or involve another
recipient. Require an actionable alert without provider detail. If the current
window would make the extra request unsafe or ambiguous, record `NOT_RUN` and
repeat only this row after the window; never infer a PASS.

## 5. Local regression

Against Local Supabase/Mailpit only:

```powershell
npm.cmd run test:e2e -- e2e/auth.spec.ts
npm.cmd run owner-runbooks:check
git status --short
```

Save only test names/counts/duration, absence or presence of `[WebServer] Error`,
and clean-status outcome.

## Completion rule

The pre-merge run proves only whether built-in delivery works and leaves the
record `OWNER_ACTION_REQUIRED`. Mark S9-DEF-004 `VERIFIED` only when the final
merged SHA has exact Production/local callbacks with stale Preview aliases
absent; email remains enabled; delivery, same-browser callback, update, replay
denial, logout, old-password denial, new-password login and applicable
cooldown/copy checks were actually observed; and the local regressions pass.
