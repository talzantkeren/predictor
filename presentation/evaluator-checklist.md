# Evaluator checklist

Status: `OWNER_ACTION_REQUIRED` until the human rehearsal row is completed on
the exact candidate SHA. This checklist contains no credentials or personal
data; evaluator account delivery happens out of band.

## Before the timer

- [ ] `git rev-parse HEAD` equals `<candidate-sha>` recorded in the rehearsal log.
- [ ] The PPTX opens and all **9/9** rendered slides match it visually.
- [ ] Production opens in Chrome; GitHub opens for the authorized evaluator.
- [ ] Two authorized Demo sessions are ready without exposing passwords on screen.
- [ ] The three sanitized fallback PNGs are open in their numbered order.

## Product narrative

- [ ] The presenter explains manager/member/system roles and treats draw as a
  first-class outcome.
- [ ] Invite, join request, Demo proof, approval and active-member privacy are
  shown or explicitly replaced by the named outage evidence.
- [ ] Activation, prediction lock, deterministic scoring, completion and final
  ranking are connected as one lifecycle.
- [ ] No direct database mutation fakes a user-visible step.
- [ ] A late correction is explained as versioned review/reconciliation, not an
  automatic rewrite of a completed league.

## Architecture, security and engineering

- [ ] The presenter identifies Next.js 16 Server Components, Server Actions,
  Route Handlers and shared feature services.
- [ ] The presenter explains server resource authorization plus RLS, least-
  privilege grants, database time, private Storage and the bounded secret client.
- [ ] The presenter distinguishes RULES/Vitest, DATA/pgTAP and FLOWS/Playwright
  without quoting an obsolete test count.
- [ ] The presenter explains pagination, bounded synchronization, indexes and
  why the current modular monolith is the smaller reliable architecture.
- [ ] Demo-only is explicit: no real financial operation, verified receipt,
  live-provider claim or runtime generative AI in the MVP.

## Resilience and close

- [ ] The outage handoff reaches the correct fallback image within 20 seconds.
- [ ] The presenter says which live step was not observed and does not claim it passed.
- [ ] Production and GitHub links are opened at the end.
- [ ] Total measured duration is between 10:00 and 15:00.
- [ ] Questions on components, libraries, security, scale and tradeoffs can be
  answered from the deck and repository evidence.

## Human evidence row

| Candidate SHA | Start/end (Asia/Jerusalem) | Duration | 9/9 slides | Production | GitHub | outage | evaluator explanations | Result / sanitized note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `<candidate-sha>` | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | OWNER_ACTION_REQUIRED |

Only the human presenter/evaluator may replace this row. Any failed checkbox
keeps the record open and must name the precise correction; it must never be
hidden by changing a test, workflow or checklist.
