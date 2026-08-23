# Database tests

Add pgTAP tests alongside the migrations they verify. Every test file runs in a
transaction and rolls back its fixtures.

- `identity.test.sql` covers the Slice 1 profile schema, trigger hardening,
  grants, constraints and self/foreign RLS behavior.
- `leagues.test.sql` covers the Slice 2 league schema, transactional creation,
  ownership boundaries, lifecycle constraints and RLS behavior.
- `membership.test.sql` covers Slice 3 invite and join-request lifecycle,
  database-generated one-time tokens, exact expiry boundaries, idempotency,
  least-privilege grants and cross-league denial.
- `proofs.test.sql` covers Slice 3 private proof storage, upload quotas,
  finalization/idempotency, historical proof limits, signed-access
  authorization, narrow service-role access and hostile direct access.
- `manager-decisions.test.sql` covers the Slice 4 manager queue, safe proof
  summaries, atomic approve/reject, replay behavior and cross-league denial.
- `predictions.test.sql` covers the Slice 5 prediction schema, generated
  outcome, season consistency, database-time/status locking, one-row upsert,
  active-member denial matrix and owner-only/pre-kickoff versus same-league
  post-kickoff visibility.
- `scoring.test.sql` covers the Slice 6 system-admin boundary, deterministic
  scoring and correction/cancel behavior, per-league rule versions,
  service-only execution, security-invoker standings, competition ranks,
  cross-league denial and real concurrent `score_match`/`save_prediction`
  sessions without a lock-order deadlock.
- `sync.test.sql` covers Slice 7 manual-provider attempt logging, RLS and
  grants, system-actor rejection without writes, terminal-row constraints,
  and real cross-session transaction-lock contention and release.
