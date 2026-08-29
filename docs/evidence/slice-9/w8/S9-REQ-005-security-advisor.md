# S9-REQ-005 — Security Advisor export and disposition

Status: `VERIFIED`

Commands were run with Supabase CLI 2.113.0 against the linked project:

```powershell
supabase db advisors --linked --type security --level info --output-format json
```

Initial findings: 28 (`0 ERROR`, `22 WARN`, `6 INFO`). One real defect produced
two role-specific warnings: the Hosted-only `public.rls_auto_enable()` event
trigger function was directly executable by `anon` and `authenticated` and used
`search_path=pg_catalog`, not the repository's required empty path.

The definition, owner, ACL and `ensure_rls` event-trigger dependency were
inspected read-only. Migration
`20260825000000_revoke_rls_event_trigger_rpc_access.sql` preserves the trigger,
sets `search_path=''`, and revokes `PUBLIC`, `anon`, `authenticated` and
`service_role` execution. An isolated linked dry-run listed exactly that one
migration; it was then applied without applying the 19 post-merge migrations.
The post-fix inspection observed owner `postgres`, SECURITY DEFINER true, empty
search path, all four execution paths false, active trigger `ensure_rls`, and an
unchanged definition hash. Post-fix findings: 26; both `rls_auto_enable`
warnings were absent.

## Every initial item

| ID | Level | Advisor item | Disposition | Evidence/rationale |
| --- | --- | --- | --- | --- |
| S01 | INFO | `rls_enabled_no_policy`: `audit_logs` | `NO-FIX WITH EVIDENCE` | Intentional deny-all table. Hosted: RLS true, zero policies, no direct DML for anon/authenticated/service role. Writes occur only inside narrow audited gateways. |
| S02 | INFO | `rls_enabled_no_policy`: `invite_links` | `NO-FIX WITH EVIDENCE` | Intentional deny-all secret-bearing table; same Hosted RLS/grant observation. Invite operations use resource-authorized RPCs. |
| S03 | INFO | `rls_enabled_no_policy`: `rate_limit_events` | `NO-FIX WITH EVIDENCE` | Intentional deny-all enforcement table; same Hosted RLS/grant observation. Only the rate-limit gateway writes it. |
| S04 | INFO | `rls_enabled_no_policy`: `sports_provider_rounds` | `NO-FIX WITH EVIDENCE` | Intentional system-only table; same Hosted RLS/grant observation. No browser CRUD path exists. |
| S05 | INFO | `rls_enabled_no_policy`: `sync_leases` | `NO-FIX WITH EVIDENCE` | Intentional system-only lease table; same Hosted RLS/grant observation. Sync RPCs own mutations. |
| S06 | INFO | `rls_enabled_no_policy`: `system_admins` | `NO-FIX WITH EVIDENCE` | Intentional deny-all authorization table; same Hosted RLS/grant observation. Direct client mutation is forbidden. |
| S07 | WARN | `extension_in_public`: `pg_net` | `NO-FIX WITH EVIDENCE` | Hosted `pg_net` 0.20.4 reports `extrelocatable=false`; recreation would endanger the working Cron queue. Its objects are under `net`, and the observed PostgREST OpenAPI advertised zero `net` paths/definitions. Keep until a supported migration and measured need exist. |
| S08 | WARN | anon can execute `resolve_invite(uuid,text)` | `NO-FIX WITH EVIDENCE` | This is the one intentional public token-resolution gateway. Hosted observed SECURITY DEFINER + empty search path, PUBLIC/service-role revoked; negative token/resource tests are in `membership.test.sql`. |
| S09 | WARN | anon can execute `rls_auto_enable()` | `FIXED` | Forward migration applied; post-fix Advisor no longer reports it. Trigger linkage preserved and pgTAP covers path/ACL/linkage. |
| S10 | WARN | authenticated can execute `approve_join_request(uuid)` | `NO-FIX WITH EVIDENCE` | Intentional atomic manager gateway; actor and league resource checks plus cross-user negatives in `manager-decisions.test.sql` and concurrency suites. |
| S11 | WARN | authenticated can execute `authorize_payment_proof_access(uuid)` | `NO-FIX WITH EVIDENCE` | Intentional proof authorization gateway; exact proof/request authorization and cross-user denials in `proofs.test.sql`. |
| S12 | WARN | authenticated can execute `consume_proof_upload_rate_limit(uuid)` | `NO-FIX WITH EVIDENCE` | Intentional atomic rate-limit gateway; authenticated-only grant and request ownership tests in `proofs.test.sql`. |
| S13 | WARN | authenticated can execute `create_league(...)` | `NO-FIX WITH EVIDENCE` | Intentional atomic creation gateway; empty search path, authenticated-only grant and malformed/cross-user cases in `leagues.test.sql`. |
| S14 | WARN | authenticated can execute `create_or_rotate_invite(uuid)` | `NO-FIX WITH EVIDENCE` | Intentional manager-only gateway; manager/league checks and foreign-manager negatives in `membership.test.sql`. |
| S15 | WARN | authenticated can execute `finalize_payment_proof(...)` | `NO-FIX WITH EVIDENCE` | Intentional atomic finalization gateway; idempotency, ownership, status and cross-user tests in `proofs.test.sql`. |
| S16 | WARN | authenticated can execute `get_join_request_upload_context(uuid)` | `NO-FIX WITH EVIDENCE` | Narrow authenticated proof-upload context; request ownership and manager/member negatives in `proofs.test.sql`. |
| S17 | WARN | authenticated can execute `get_league_invite_metadata(uuid)` | `NO-FIX WITH EVIDENCE` | Narrow manager metadata reader; resource checks and foreign-manager denial in `membership.test.sql`. |
| S18 | WARN | authenticated can execute `get_manager_join_requests(uuid)` | `NO-FIX WITH EVIDENCE` | Current Hosted bounded-by-league compatibility reader, manager-authorized and tested. Pending keyset migration removes it under `S9-REQ-003`; no pre-merge Production rollout was attempted. |
| S19 | WARN | authenticated can execute `get_my_join_requests()` | `NO-FIX WITH EVIDENCE` | Current Hosted self-only reader; `auth.uid()` fixes the actor and membership tests deny another identity. Pending keyset migration removes it under `S9-REQ-003`. |
| S20 | WARN | authenticated can execute `get_my_join_requests_v2()` | `NO-FIX WITH EVIDENCE` | Current Hosted self-only compatibility reader with the same fixed-actor boundary. Pending keyset migration removes it under `S9-REQ-003`. |
| S21 | WARN | authenticated can execute `is_system_admin()` | `NO-FIX WITH EVIDENCE` | Narrow boolean authorization gateway; empty path, authenticated-only grant and negative non-admin checks in `scoring.test.sql`. |
| S22 | WARN | authenticated can execute `reject_join_request(uuid,text)` | `NO-FIX WITH EVIDENCE` | Intentional atomic manager gateway; league manager and cross-user negative tests in `manager-decisions.test.sql`. |
| S23 | WARN | authenticated can execute `resolve_invite(uuid,text)` | `NO-FIX WITH EVIDENCE` | Same intentional token gateway as S08; authenticated callers need it for the join flow and receive no secret-bearing row. |
| S24 | WARN | authenticated can execute `revoke_invite(uuid)` | `NO-FIX WITH EVIDENCE` | Intentional manager-only mutation; actor/resource checks and cross-league denial in `membership.test.sql`. |
| S25 | WARN | authenticated can execute `rls_auto_enable()` | `FIXED` | Same migration and post-fix absence as S09. |
| S26 | WARN | authenticated can execute `save_prediction(uuid,uuid,numeric,numeric)` | `NO-FIX WITH EVIDENCE` | Intentional atomic database-time gateway; membership/league/kickoff checks and cross-user plus race coverage in `predictions.test.sql` and the multi-session suite. |
| S27 | WARN | authenticated can execute `submit_join_request(uuid,text)` | `NO-FIX WITH EVIDENCE` | Intentional authenticated invite mutation; token, actor, league state and duplicate/cross-user cases in `membership.test.sql`. |
| S28 | WARN | leaked password protection disabled | `ACCEPTED WITH RATIONALE` | `S9-TDEC-004`; owner/trigger/mitigation fields are recorded in the Auth policy export. It remains disabled. |

Hosted inspection also observed all 17 intentional application gateways as
SECURITY DEFINER with `search_path=''`, no PUBLIC/service-role execution,
`resolve_invite` as the sole anon executable gateway, and authenticated access
to all 17. Repository pgTAP globally rejects PUBLIC execution on public-schema
functions and adds domain-specific authorization negatives.

Migration parity is deliberately not claimed here: Hosted now contains the 19
baseline migrations plus this isolated hardening migration, while 19 Slice 9
migrations remain local-only. Applying those feature migrations and verifying
the final deployment stays solely under `S9-REQ-003` after merge.
