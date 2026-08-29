# S9-REQ-005 — Performance Advisor export and disposition

Status: `VERIFIED`

Command:

```powershell
supabase db advisors --linked --type performance --level info --output-format json
```

Findings: 20 (`0 ERROR`, `0 WARN`, `20 INFO`). Every item was dispositioned;
no index was added or removed merely to silence an informational finding.

| ID | Advisor item | Disposition | Evidence/rationale |
| --- | --- | --- | --- |
| P01 | unindexed FK `audit_logs_actor_id_fkey` | `NO-ADD WITH EVIDENCE` | Append-only provenance; reads use entity/type/id/time. There is no user-delete product flow or measured actor lookup. |
| P02 | unindexed FK `invite_links_created_by_fkey` | `NO-ADD WITH EVIDENCE` | Provenance only; queries use invite public ID or league/latest order. No creator lookup or deletion flow is measured. |
| P03 | unindexed FK `join_requests_decided_by_fkey` | `NO-ADD WITH EVIDENCE` | Provenance only; manager/user queries use league, user, status and created cursor indexes. |
| P04 | unindexed FK `league_members_approved_by_fkey` | `NO-ADD WITH EVIDENCE` | Provenance only; membership reads are league/user/status scoped. |
| P05 | unindexed FK `league_members_removed_by_fkey` | `NO-ADD WITH EVIDENCE` | Provenance only; no remover lookup or principal deletion path exists. |
| P06 | unindexed FK `matches_away_team_id_fkey` | `NO-ADD WITH EVIDENCE` | Fixtures read by season/kickoff/status/external identity; team deletion is not a product path. |
| P07 | unindexed FK `matches_home_team_id_fkey` | `NO-ADD WITH EVIDENCE` | Same measured fixture shapes and no team-delete workflow as P06. |
| P08 | unindexed FK `payment_proofs_uploaded_by_fkey` | `NO-ADD WITH EVIDENCE` | Proof access is by proof/request/path through authorization gateways; no uploader lookup or user deletion path. |
| P09 | unindexed FK `predictions_user_id_fkey` | `NO-ADD WITH EVIDENCE` | Unique `(league_id,match_id,user_id)` and `(league_id,user_id)` cover product reads; no user-only query or deletion flow. |
| P10 | unindexed FK `rate_limit_events_join_request_id_fkey` | `NO-ADD WITH EVIDENCE` | The real window query is covered by `(user_id,join_request_id,action,created_at desc)`; no request-delete path. |
| P11 | unindexed FK `sync_leases_run_id_fkey` | `NO-ADD WITH EVIDENCE` | One provider-keyed lease row; run lookup/deletion by this reverse FK is not a workload. |
| P12 | unindexed FK `system_admins_granted_by_fkey` | `NO-ADD WITH EVIDENCE` | Tiny deny-all provenance table; no granter lookup or deletion workflow. |
| P13 | unused `matches_status_kickoff_idx` | `RETAIN WITH EVIDENCE` | Matches the due-candidate status/kickoff predicate. On the small fixture, the planner chose another existing path; that is not removal evidence. |
| P14 | unused `seasons_current_catalog_idx` | `RETAIN WITH EVIDENCE` | Supports the current-season filter ordered by `starts_on desc` in `src/features/leagues/queries.ts`. |
| P15 | unused `invite_links_league_created_idx` | `RETAIN WITH EVIDENCE` | Supports latest invite-by-league ordering used by the invite gateway. |
| P16 | unused `join_requests_league_status_created_idx` | `RETAIN WITH EVIDENCE` | A representative manager-count plan used this index with a 0.034ms bitmap path. Hosted counters do not reflect that local workload. |
| P17 | unused `rate_limit_events_user_request_action_created_idx` | `RETAIN WITH EVIDENCE` | Exactly covers the request-scoped 15-minute rate-limit predicate. |
| P18 | unused `rate_limit_events_user_action_created_idx` | `RETAIN WITH EVIDENCE` | Exactly covers the user-scoped 24-hour rate-limit predicate. |
| P19 | unused `audit_logs_entity_created_idx` | `RETAIN WITH EVIDENCE` | Supports lifecycle audit existence/history reads by entity type/id and creation time. |
| P20 | unused `sports_provider_rounds_review_idx` | `RETAIN WITH EVIDENCE` | Small partial review-only index on a tiny Hosted sample; usage counters before representative review load do not justify destructive removal. |

Representative plans and sample-size limits are recorded in
`docs/slice-9-preflight-audit.md`. The decision trigger for every `NO-ADD` or
`RETAIN` row is a measured query/delete workload, sustained latency/storage
pressure, or a changed product access path—not the informational Advisor label
alone.
