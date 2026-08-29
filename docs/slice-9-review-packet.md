# מפת review — Slice 9

מטרת המסמך היא להוביל reviewer אל השינוי והראיה במהירות. הסטטוס המחייב נשאר
ב־`docs/slice-9-delivery-ledger.md`; הקישורים כאן אינם ראיית סגירה חדשה.

## Look here first

1. **lifecycle completion atomicity** — התחילו ב־
   `supabase/migrations/20260827110000_slice9_league_completion.sql`, המשיכו ל־
   `20260827140000_slice9_lifecycle_concurrency_hardening.sql`, ובדקו את
   `supabase/tests/slice9-league-completion.test.sql` ו־
   `slice9-lifecycle-concurrency.test.sql`. הטרנזקציה חייבת לקפוא snapshot
   ולסגור את שני מצבי ה־join request עם `LEAGUE_COMPLETED` בלי לאבד proof,
   history או audit.
2. **canonical lock ordering** — השוו כל נתיב mutation לסדר:
   `leagues → profiles → join_requests → payment_proofs → league_members → matches → match_result_reviews → league_match_snapshots → league_match_reconciliations`.
   נתיב רשאי לדלג על רמה, אך לעולם לא לרכוש parent אחרי child. מוקדי הבדיקה הם
   migrations ‏`20260827100000`–`20260827140000` ומבחני ה־concurrency.
3. **RLS and least-privilege grants** — התחילו ב־
   `supabase/migrations/20260827090000_slice9_lifecycle_schema.sql`. ודאו
   constraints, indexes, RLS ו־grants באותה migration עבור
   `league_match_snapshots`, ‏`match_result_reviews` ו־
   `league_match_reconciliations`; בדקו גם שה־RPCs ה־`SECURITY DEFINER` עם
   `search_path=''`, שמות schema מלאים ו־EXECUTE מצומצם.
4. **reconciliation path** — עברו על
   `src/features/scoring/result-review-mutation.ts`,
   `completed-reconciliation-mutation.ts`,
   `private-scoring-gateway.ts`, migration ‏`20260827120000` וה־pgTAP שלה.
   ודאו versioning ודחיית stale/replay/foreign, וש־auto-scoring מוגבל לליגה
   שאינה completed; תיקון מאוחר נרשם ואינו משכתב final snapshot.

## מפת 25 הרשומות

| ID | מצב | מה השתנה | קבצים / migrations מרכזיים | בדיקות מוכיחות | ראיה |
| --- | --- | --- | --- | --- | --- |
| S9-DEF-002 | VERIFIED | החלטות lock/time עברו לזמן DB לפני serialization; lease מלא קיבל duration עקבי. | `20260826193000_slice9_database_time_serialization.sql`; `20260826194500_slice9_database_time_serialization_review.sql`; `20260826200000_slice9_full_sync_lease_duration.sql`; `docs/architecture.md` | `slice9-time-serialization.test.sql`; `predictions.test.sql`; full pgTAP/types drift | `docs/evidence/slice-9/w1/S9-DEF-002.md` |
| S9-DEF-001 | VERIFIED | recovery/confirmation מחזירים outcomes allowlisted ו־copy ניטרלי לחשבון. | `src/features/auth/auth-flow-results.ts`; `actions.ts`; auth pages/components; confirm route | `auth-flow-results.test.ts`; `e2e/auth.spec.ts` Desktop/Mobile | `docs/evidence/slice-9/w2/S9-DEF-001.md` |
| S9-DEF-004 | OWNER_ACTION_REQUIRED | Hosted delivery נצפה; ב־29.8.2026 ה־owner דיווח על same-browser callback, password update, replay denial, old-password denial ו־new-password login. זו ראיית pre-merge מסוננת בלבד; final-SHA configuration/flow, known-vs-unknown, cooldown וה־local post-check עדיין פתוחים. | `docs/runbooks/slice-9-def-004-hosted-auth.md`; `docs/deployment.md`; `scripts/check-slice9-owner-runbooks.mjs` | `owner-runbooks:check`; focused auth Vitest/Playwright | `docs/evidence/slice-9/w2/S9-DEF-004.md`; owner template לידו |
| S9-DEF-003 | VERIFIED | fallback ידני מלא ליצירה/עדכון משחק ותוצאת Manual דרך אותו orchestration. | `20260826210000_slice9_manual_match_fallback.sql`; scoring/sports/sync services; admin sync UI | `manual-match-fallback.test.sql`; `manual-match-concurrency.test.sql`; `manual-catalog.test.ts`; `e2e/reports.spec.ts`; `sync.spec.ts` | `docs/evidence/slice-9/w3/S9-DEF-003.md` |
| S9-DEF-007 | VERIFIED | הגדרות ליגה ניתנות לעריכה רק בחלון החוקי ובאופן אטומי. | `20260826300000_slice9_editable_league_settings.sql`; league settings action/service/UI | `league-settings.test.sql`; `league-settings-concurrency.test.sql`; `e2e/settings.spec.ts` | `docs/evidence/slice-9/w3/S9-DEF-007.md` |
| S9-DEF-008 | VERIFIED | נוספה הסרה מפורשת של manual override עם re-score דטרמיניסטי. | `20260826305000_slice9_clear_manual_override.sql`; scoring clear mutation/forms/gateway | `manual-override-clear.test.sql`; concurrency companion; `e2e/scoring.spec.ts` | `docs/evidence/slice-9/w3/S9-DEF-008.md` |
| S9-DEF-009 | VERIFIED | hard caps הוחלפו ב־exact authorization וב־keyset pagination יציב. | `20260826310000_slice9_keyset_pagination.sql`; `src/lib/keyset-pagination.ts`; league/member/prediction/scoring queries | keyset + concurrency pgTAP; `keyset-pagination.test.ts`; query-contract tests; `e2e/pagination.spec.ts` | `docs/evidence/slice-9/w3/S9-DEF-009.md` |
| S9-REQ-001 | VERIFIED | lifecycle מלא: schema/policy, activation manual+Cron, completion, review/reconciliation, members, races ו־E2E. | migrations `20260827090000`–`20260827150000`; league/scoring/sync services; lifecycle/member/admin UI | lifecycle schema/activation/completion/review/members/concurrency/manual-product pgTAP; `e2e/lifecycle.spec.ts` | `docs/evidence/slice-9/w4/S9-REQ-001.md` |
| S9-DEF-010 | VERIFIED | claim של sync משתמש ברוטציה least-recently-attempted ומונע starvation. | `20260827160000_slice9_sync_due_fairness.sql`; sync orchestrator | `slice9-sync-fairness.test.sql`; `sync-api-football.test.sql`; orchestrator Vitest | `docs/evidence/slice-9/w5/S9-DEF-010.md` |
| S9-DEF-011 | VERIFIED | `Retry-After` ארוך מסווג מיד RATE_LIMITED ושומר backoff בלי sleep שגוי. | `api-football-client.ts`; sync orchestrator/gateway; docs contracts | `api-football-client.test.ts`; `orchestrator.test.ts`; sync pgTAP | `docs/evidence/slice-9/w5/S9-DEF-011.md` |
| S9-DEF-012 | OWNER_ACTION_REQUIRED | budget ‏30/45/60/120 ו־Cron יחיד הוגדרו; runbook דורש tick Production טבעי. | `20260827170000_slice9_sync_cron_budget.sql`; `runtime-budget.ts`; Cron route; Production runbook | `slice9-sync-cron-budget.test.sql`; `sync-api-football.test.sql`; route/orchestrator tests; `owner-runbooks:check` | `docs/evidence/slice-9/w5/S9-DEF-012.md`; owner template לידו |
| S9-DEF-018 | VERIFIED | `FORCE_COOLDOWN` מן RPC נצרך כ־neutral skip בלי provider/apply/finalize. | `claim-contract.ts`; sync actions/display/gateway/types | claim/actions/display/orchestrator Vitest; `sync-api-football.test.sql` | `docs/evidence/slice-9/w5/S9-DEF-018.md` |
| S9-DEF-019 | VERIFIED | taxonomy בטוחה מפרידה provider/planner/apply/finalize וכונתה counters ללא double finalize. | `sync-planner.ts`; orchestrator/gateway/types | `sync-planner.test.ts`; `orchestrator.test.ts`; client bundle scan | `docs/evidence/slice-9/w5/S9-DEF-019.md` |
| S9-DEF-025 | VERIFIED | הרשומה הקיימת צומצמה ללא קריאת value ל־Sensitive Production-only; ‏Preview/Local/CI נשארו Manual ללא key, ו־Cron נצפה בקריאה בלבד. | Vercel target metadata; `scripts/check-sports-secret-boundaries.mjs`; `.env.example`; CI/env docs | Preview smoke ‏4/4; Sports ‏63/63; 53-artifact scan; build/runtime log scans | `docs/evidence/slice-9/w5/S9-DEF-025.md`; environment-scope matrix לידו |
| S9-DEF-015 | VERIFIED | Bidi_Control נדחה ב־application+DB וטקסט מעורב מוצג בבידוד. | `20260827180000_slice9_bidi_text_hardening.sql`; `untrusted-text.ts`; `isolated-text.tsx`; schemas/UI | bidi/membership pgTAP; untrusted/isolated/auth/league/member tests; `e2e/leagues.spec.ts` | `docs/evidence/slice-9/w6/S9-DEF-015.md` |
| S9-DEF-016 | VERIFIED | skip link ב־invite מצביע תמיד ל־main יחיד ובר־focus. | invite page; `skip-to-main-link.tsx`; invite bootstrap/header | `e2e/join-and-proofs.spec.ts` guest/auth × valid/unavailable | `docs/evidence/slice-9/w6/S9-DEF-016.md` |
| S9-DEF-020 | VERIFIED | unavailable invite משמר escape בטוח ל־Dashboard/logout רק למשתמש מחובר. | invite page; invite bootstrap; unavailable component | `e2e/join-and-proofs.spec.ts` malformed/expired/revoked × guest/auth | `docs/evidence/slice-9/w6/S9-DEF-020.md` |
| S9-DEF-022 | VERIFIED | שם link, contrast ויעדי 21/36/42px תוקנו; matrix מלאה מכסה 8 routes + rejection בחמישה רוחבים. ב־30.8 ה־owner אישר PASS ב־Chrome Menu Zoom=200% בשלושת המסכים, keyboard-only וללא clipping/overlap/page scroll; זו ראיית `OWNER_REPORTED` ללא screenshot שמור. | loading components; auth/header/admin controls; manager request card; `e2e/accessibility-matrix.spec.ts` | exact-SHA build+scan; matrix ‏14/14; loading ‏2/2; forced scale ‏10/10; owner-reported native zoom PASS | `docs/evidence/slice-9/w6/S9-DEF-022.md` |
| S9-DEF-024 | VERIFIED | runner מכשיל server errors; `AppLink` מונע prefetch ספקולטיבי, שמירת prediction ממתינה ל־RSC POST+idle, ו־teardown מחנה דפים ב־`about:blank` וסוגר contexts בסדר בטוח. | `scripts/run-e2e.ts`; `playwright-server-log.ts`; `response-streams.ts`; stream-safe fixture; `app-link.tsx`; `prediction-lock.spec.ts` | `playwright-server-log.test.ts`; `playwright-response-streams.test.ts`; חמש prediction-lock repeats; full 38-scenario E2E | `docs/evidence/slice-9/w6/S9-DEF-024.md`; `docs/evidence/slice-9/w6/S9-DEF-024-final-head-recurrence.md` |
| S9-DEF-013 | VERIFIED | ספר הפרויקט נגזר ממקור אחד; package entries נשמרים בסדר וב־`ZIP_STORED` כדי לקבל אותם bytes גם ב־Python/zlib שונים. | `project-book-source.md`; `generate-project-book.py`; `project-book.docx`; workflow | `project-book-contract.test.ts`; checks ב־Python 3.12+3.14; Word/Poppler render inspection של 5/5 עמודים | `docs/evidence/slice-9/w7/S9-DEF-013.md`; `docs/evidence/slice-9/w7/S9-DEF-013-python-runtime-determinism.md` |
| S9-DEF-014 | VERIFIED | policy מגדיר Production/Local Auth ומסווג Preview כ־public smoke ללא Auth. | `README.md`; `docs/deployment.md`; deployment-docs contract | `deployment-docs-contract.test.ts`; focused auth tests; URL wildcard scan | `docs/evidence/slice-9/w7/S9-DEF-014.md` |
| S9-REQ-002 | VERIFIED | 13/13 שקפי המאגר הם ראיית reproducibility; המצגת הרשמית כוללת 18 שקפים ונשמרת byte-for-byte. render/overflow עברו, וב־30.8 ה־owner אישר חזרה בטווח 10–15 דקות על 18/18, עם 5/5 fallback ופתיחת Production/GitHub. משך מדויק ו־screenshot לא נשמרו. | internal deck/source/notes; external selected-deck manifest; `timing-guide.md`; `demo-script.md`; fallback PNGs | `presentation:check`; external PPTX render/overflow inspection; lifecycle E2E; owner-reported rehearsal PASS | `docs/evidence/slice-9/w7/S9-REQ-002.md` |
| S9-REQ-004 | VERIFIED | README/testing/security/scale/evaluator והספר סונכרנו; manifest נפרד מקפיא את שלושת בינארי ההגשה החיצוניים בלי לשנות generators. | submission docs; project-book source/DOCX; external byte manifest; `scripts/check-submission-docs.mjs` | `docs:submission:check -- --online`; project-book contract/render; full local gates | `docs/evidence/slice-9/w7/S9-REQ-004.md` |
| S9-REQ-003 | OWNER_ACTION_REQUIRED | runbook יחיד סוגר final Production/Public/secret audit/anonymous clone, ואז מרכיב LINKS, תיק ארבעה קבצים ו־ZIP עם byte/hash/extract/reopen/link/secret QA. אישורי owner התקבלו; הביצוע עדיין NOT_RUN. | `final-submission-evidence.md`; final-production/Public/package runbook; owner-runbook/submission checkers | runs 33090719466, 33097585902, 33097590476; `submission:evidence:check`; `owner-runbooks:check` | `docs/evidence/slice-9/w8/S9-REQ-003.md`; owner template לידו |
| S9-REQ-005 | VERIFIED | Hosted policy נקראה בלבד; app הותאם לתקרת 72 bytes; ‏28 Security ו־20 Performance findings קיבלו disposition ו־`rls_auto_enable` הוקשח במיגרציה קדימה. | `20260825000000_revoke_rls_event_trigger_rpc_access.sql`; final hardening register; Advisor/Auth exports; checker | post-fix Advisors; ‏87 Auth Vitest; ‏641 Vitest; ‏1502 pgTAP; ‏624 multi-session; build/types/drift | `docs/evidence/slice-9/w8/S9-REQ-005.md`; שלושת exports לידו |

## גבול review

ממצאי owner אינם waiver. שלוש הרשומות שנותרו — S9-DEF-004, ‏S9-DEF-012
ו־S9-REQ-003 — נשארות `OWNER_ACTION_REQUIRED` עד evidence מתאים; המניין
המחייב הוא 22 `VERIFIED` ו־3 `OWNER_ACTION_REQUIRED`.

אישור owner המותנה להעביר את PR #14 ל־Ready, למזג ולפרסם את המאגר התקבל
ב־29.8.2026, אך אינו משנה סטטוס ואינו מתיר auto-merge או direct push. לפני
Ready/merge חייבים לכלול את החלק ה־pre-merge המתועד של S9-DEF-004, בדיקת
S9-DEF-022, חזרת S9-REQ-002 ושלושת CI jobs הנקובים. Chrome והחזרה עברו לפי
דיווח owner על application/deck candidate `4b77e24`; ה־Hosted Auth pre-merge
עבר בנפרד על Production alias קיים, ו־source SHA לא נלכד — אין לייחס אותו
ל־`4b77e24`. Commit הסגירה שאחריו מוגבל למסמכי evidence, ‏generators/checkers,
חוזה הבדיקה של הספר ולספר המאגר הנגזר, בלי שינוי קוד product runtime,
‏migrations, ‏E2E, fallback או המצגת הרשמית; עליו נדרשת ריצת exact-SHA ירוקה.
לאחר merge נשארים לביצוע החלק הסופי של
S9-DEF-004, ‏S9-DEF-012 ו־S9-REQ-003 על final/main SHA.

אין לייחס ל־Local הוכחת Hosted, אין להשתמש ב־Preview כראיית Production ואין
לשנות workflow/test/config כדי להסתיר failure. מעבר ל־Public מותר רק בתוך
runbook ‏S9-REQ-003 לאחר final Production, סריקות pre-public הנדרשות וכל יתר
שערי הקדם; לאחר המעבר נדרשים אימות אנונימי, בדיקת הגנות וסריקה חוזרת. עד שכל
שלוש הרשומות נסגרות אין להכריז `READY_TO_SUBMIT`.
