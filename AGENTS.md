# AGENTS.md

## Repository mission

Build Predictor1, a Hebrew RTL web application for private football score-prediction leagues, as the RUNI Internet Technologies 2026 final project. The submission deadline is 6 September 2026.

Do not agree with a requested implementation automatically. Check it against the product rules, architecture, security model, course requirements, deadline, and a smaller reliable alternative. Explain material contradictions before changing code.

## Canonical sources

Read these files before planning or editing product code, in this order:

1. `docs/product.md` — product scope, business rules, roles, MVP and acceptance criteria.
2. `docs/architecture.md` — the single canonical architecture and security boundaries.
3. `docs/technical-plan.md` — repository layout, schema, APIs, tests and slice order.
4. `Internet Technologies.pdf` / `project_sources/01-Internet-Technologies.pdf` — course constraints when available.

`AGENTS.md` contains durable working rules, not a second specification. `CLAUDE.md` is only a pointer to the same sources. Never create agent-specific architecture or product documents.

When an approved decision changes, update the applicable canonical document in the same change. If code and docs conflict, stop and resolve the conflict explicitly; do not silently choose one.

## Non-negotiable constraints

- Use one modular Next.js 16 App Router application deployed to Vercel. Do not create a separate backend service or repository.
- Use TypeScript with strict checks, Supabase PostgreSQL/Auth/Storage/Cron, and database migrations committed to Git.
- Use `src/proxy.ts`, not `middleware.ts`, for the Next.js 16 proxy convention. Proxy refreshes sessions; it is not the authorization layer.
- Use Server Components for reads, Server Actions for UI mutations, Route Handlers for uploads/Cron/AI/external HTTP, and shared feature services for business logic.
- Enable RLS and least-privilege grants in the same migration that creates every exposed table.
- Use the new Supabase publishable/secret keys. A secret key is server-only and bypasses RLS; confine it to `src/lib/supabase/admin.ts` with `server-only`.
- The only Slice 3 exception that may consume the admin client is a server-only,
  fixed-bucket `payment-proofs` gateway. It may upload sanitized WebP bytes,
  compensate by deleting the same derived object, look up an authorized proof's
  internal path, and create a signed URL only after user-session resource
  authorization. It must not expose a generic client, accept an arbitrary bucket
  or path, or write business tables.
- Store all timestamps as UTC `timestamptz`; database time decides prediction locking.
- Keep `predictions.points` and scoring metadata. Scoring rules belong to each league and default to 3/1/0.
- Treat draw as a first-class outcome. Tie-break by correct outcomes only, then share the place and applicable prizes.
- Scoring must overwrite deterministically from the current match result and rule version; never increment points.
- Keep `join_requests`, `league_members`, and 1:N `payment_proofs` separate. Never overwrite proof history or call a proof a verified receipt.
- The public course deployment is Demo-only. Do not add a real payment link, money transfer, cash prize operation, or real financial document. Real-money operation is blocked by the compliance gate in `docs/product.md`.
- AI may summarize stored match data and uncertainty; it must not invent facts, recommend gambling, or block prediction flows.
- A Sports provider is not selected until the documented POC passes. The manual adapter and seed path must always work.

## Working method

- Implement the current vertical slice from `docs/technical-plan.md`; do not build all layers or screens at once.
- Keep every slice deployable. Add security, tests and documentation with the feature, not in a final cleanup pass.
- Before editing, inspect the relevant feature, migrations, RLS policies and tests. Preserve unrelated user changes.
- Prefer the smallest change that completes the slice and its acceptance criteria.
- Do not add a production dependency without documenting why the platform or existing dependency cannot solve the need.
- Do not introduce an ORM, global client state library, microservice, queue or external cache without an approved architecture change.
- Update generated Supabase types whenever the schema changes and fail verification on drift.
- Use English for code, identifiers, migrations and commit messages. Use Hebrew for user-facing copy and project documentation; the UI is RTL.

## Database and security rules

- Treat all browser, URL, form, file, provider and AI data as untrusted.
- Validate at each server boundary with Zod and enforce invariants again with PostgreSQL constraints/RLS.
- Derive the actor from the server session. Never trust a client-provided `user_id`, role, manager flag, points value, lock status or price total.
- Authorize against the actual resource on every Server Action and Route Handler, then rely on RLS as defense in depth.
- Multi-row state changes that must be atomic belong in a transaction/database function.
- `SECURITY DEFINER` is exceptional: set `search_path = ''`, schema-qualify every relation, revoke default execution and grant only the required role.
- Never make the proof bucket public. Serve proof images only after resource authorization through a short-lived signed URL.
- Do not grant `anon` or `authenticated` direct `storage.objects` access for the
  proof bucket. Direct browser upload would bypass the Route Handler's byte,
  signature, decode and re-encode checks.
- Proof uploads accept one JPEG/PNG/WebP image up to the documented limit, verify magic bytes, decode and re-encode with `sharp`, discard the original, generate the storage name on the server and rate-limit the route.
- Never log secrets, tokens, cookies, signed URLs, proof paths/content, passwords or full provider payloads containing personal data.
- Do not use `dangerouslySetInnerHTML` for AI or user content.
- Never run destructive commands against a linked or production Supabase project. `supabase db reset --linked` is forbidden.

## Code conventions

- Prefer Server Components. Add `"use client"` only at the smallest interactive boundary.
- Keep Actions and Handlers thin: session → validation → authorization → service/RPC → typed result.
- Keep services independent of `Request`, `Response`, React and mutable process memory.
- Use explicit domain names. Avoid generic `utils.ts`, boolean role shortcuts and duplicated validation schemas.
- Do not use `any`; use `unknown` at trust boundaries and narrow it.
- Represent expected failures with stable error codes and safe user messages. Never expose stack traces or SQL errors.
- Use integer minor units/basis points for monetary Demo values and percentages; never use floating point.
- Select only required columns, filter explicitly, paginate unbounded lists and add indexes only for real query patterns.
- Maintain accessible labels, keyboard behavior, focus states, mobile layout, loading, empty and error states.

## Tests and verification

After bootstrap, the supported checks are:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run build
npm run test:e2e
```

Run the narrowest relevant checks while iterating and the full applicable set before handoff. Do not claim a check passed if the script does not exist or could not run.

Required coverage for consequential changes:

- Vitest for pure rules, validators, adapters and prize calculations.
- pgTAP/Supabase tests for constraints, RLS, function privileges, atomicity and scoring.
- Playwright for user-visible flows and cross-user authorization.
- Recorded fixtures/fakes for Sports and AI; CI must not depend on live providers.

Every authorization change needs a negative test with another user or league. Every scoring change needs exact, home, away, draw, wrong, retry and corrected-result cases.

## Documentation and course compliance

Flag any request that conflicts with the course requirement to use Next.js, TypeScript, Supabase Database and Vercel, or that jeopardizes the required product, technical, testing, scale, security, local-run and presentation deliverables.

When behavior changes, update the relevant requirements, architecture decision, technical contract, tests and user-facing instructions. Keep `README.md`, `.env.example`, `docs/testing.md`, `docs/security.md` and `docs/scale.md` current as they are introduced.

## Definition of done

A task is done only when:

- its product requirement and slice exit criteria are satisfied;
- architecture and Demo/compliance constraints are preserved;
- migrations, RLS, grants, generated types and indexes are complete where relevant;
- validation, authorization, errors and edge cases are handled;
- relevant automated checks pass;
- RTL/mobile/accessibility states were inspected for UI work;
- canonical docs were updated when the decision or contract changed;
- the feature can be explained and demonstrated from the deployed application.

## Code review rules

- Flag any path that lets a user read or mutate another user’s league, prediction, request or proof; require resource authorization plus an RLS test.
- Flag any use of the Supabase secret client outside explicitly privileged sync/scoring/system modules.
- Flag client-side enforcement of kickoff, roles, scoring or proof access as a security bug even if the UI hides the control.
- Flag incremental scoring, mutable scoring rules after league start, or leaderboard logic that contradicts the canonical tie-break.
- Flag public Storage objects, unvalidated uploads, raw file retention or signed URLs issued from client-supplied paths.
- Flag any real-money capability or payment-provider link while the documented compliance gate is closed.
