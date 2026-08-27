# Predictor1 — deck source manifest

The **authoritative editable source** is `predictor1-final-project.pptx`. This
manifest is the human-readable content contract used to review that source and
its nine rendered PNGs. It does not replace the PPTX, its speaker notes or the
repository’s canonical product and architecture documents.

The deck’s communication job is: by the end, a RUNI evaluator should understand
how Predictor1 turns one private-league lifecycle into an auditable, secure final
state, and which boundaries remain intentionally Demo-only.

## Slide 1 — opening thesis

- Claim: Predictor1 is a private Hebrew RTL league whose final ranking remains
  explainable.
- Presenter window: 00:00–00:35.
- Visual: restrained title page; no product claim beyond Demo scope.
- [Sources] `docs/product.md`, `README.md`.

## Slide 2 — problem and value

- Claim: trust depends on controlled membership, a database deadline,
  deterministic scoring, and explicit correction history.
- Presenter window: 00:35–01:40.
- Boundary: no real payment, financial operation or verified receipt.
- [Sources] `docs/product.md`, `docs/architecture.md`.

## Slide 3 — one visible lifecycle

- Claim: invite → request → approval → activation → prediction is performed
  through product actions, not direct database mutation.
- Presenter window: 01:40–03:20.
- Visual: sanitized open-league screenshot from the lifecycle E2E.
- [Sources] `e2e/lifecycle.spec.ts`,
  `presentation/fallback/01-open-league.png`.

## Slide 4 — architecture boundary

- Claim: one Next.js 16 application owns HTTP/UI orchestration while PostgreSQL,
  RLS and RPCs enforce durable rules.
- Presenter window: 03:20–04:45.
- [Sources] `docs/architecture.md`, `docs/technical-plan.md`.

## Slide 5 — security in layers

- Claim: identity, resource authorization, RLS, database time and private proof
  delivery are separate controls.
- Presenter window: 04:45–06:15.
- [Sources] `docs/security.md`, `docs/architecture.md`, `AGENTS.md`.

## Slide 6 — completion and reconciliation

- Claim: completion freezes a final snapshot atomically; a later correction is
  explicit and reviewed rather than silently rewriting the final table.
- Presenter window: 06:15–08:00.
- Visual: sanitized final-report lifecycle screenshot.
- [Sources] `docs/architecture.md`, `e2e/lifecycle.spec.ts`,
  `presentation/fallback/03-completed-final-report.png`.

## Slide 7 — stable test strategy

- Visible subtitle: `Final-SHA evidence only • CI does not depend on a live Sports provider`.
- Claim: RULES, DATA and FLOWS are proven by Vitest, pgTAP and Playwright.
- No dated totals or file counts are embedded; exact results belong to final-SHA
  evidence and the delivery ledger.
- Presenter window: 08:00–09:10.
- [Sources] `docs/slice-9-delivery-ledger.md`, `docs/testing.md`.

## Slide 8 — scale and future boundary

- Claim: pagination, bounded sync and database indexes support the measured
  course scale; larger architecture or runtime AI requires evidence and an
  approved scope change.
- Presenter window: 09:10–10:30.
- [Sources] `docs/scale.md`, `docs/product.md`, `docs/architecture.md`.

## Slide 9 — resolution and links

- Claim: one demo connects membership, prediction, result and final state.
- Presenter window: 10:30–11:30, then questions.
- Links: Production Demo and the private GitHub repository; access is checked
  separately and never inferred from an anonymous response.
- [Sources] `README.md`, `docs/deployment.md`, `presentation/demo-script.md`.

## Render contract

Every slide has one same-numbered PNG under `predictor1-final-project/`, one
speaker-note block bounded by `[Sources]` and `[/Sources]`, and the same 16:9
canvas. Finalization must inspect all nine PNGs at full size, reject empty
placeholders/overflow, and run `npm.cmd run presentation:check`.
