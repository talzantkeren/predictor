# ביקורת שער שחרור לפני Slice 9

| שדה | ערך |
| --- | --- |
| תאריך ביקורת | 26 באוגוסט 2026, `Asia/Jerusalem` |
| ענף ביקורת | `feature/slice-9-preflight-audit` |
| SHA בסיס מקובע | `a14edfc4df446a57f0bfe7153f6f0870e0cab243` |
| מקור הבסיס | `origin/main`, לאחר `git fetch origin --prune` |
| re-fetch סופי לפני commit | `origin/main` נשאר `a14edfc4df446a57f0bfe7153f6f0870e0cab243`; הביקורת אינה stale |
| פלטפורמה | Windows 11, Node `v24.16.0`, npm `11.13.0`, Docker Server `29.7.2`, PostgreSQL מקומי 17 |
| פסק דין מבוקר | **SLICE 9 BACKLOG READY** |

פסק הדין אומר שה־backlog של Slice 9 שלם, ממוסמך וניתן לתכנון. הוא **אינו**
אומר שהמוצר מוכן לשחרור. ב־defect register יש 25 ממצאים: P1=6, P2=11,
P3=8; יחד עם חמש דרישות Slice 9 החסרות יש 30 רשומות פתוחות: P1=9, P2=13,
P3=8. לכן אסור להשתמש בניסוח `RELEASE READY`, להתחיל הגשה או למזג תיקון עד
השלמת Slice 9 וביקורת סופית חדשה על SHA פרוס יחיד.

PR זה הוא תיעוד בלבד. הוא אינו כולל תיקון runtime, migration, שינוי Hosted,
קריאת ספק חיה, AI או יכולת כספית.

## 1. כללי מקור והיקף

הביקורת קראה תחילה את `AGENTS.md`, ולאחריו, לפי הסדר, את
`docs/product.md`, `docs/architecture.md`, `docs/technical-plan.md`, את כל תשעת
עמודי `Internet Technologies.pdf`, ואת כל הקבצים תחת `docs/`. קוד, migration,
RLS, RPC, Actions, Handlers, בדיקות, CI, GitHub, Vercel ו־Supabase נבדקו מול
המסמכים הקנוניים. מסמכי prompt, mockups, PRים לא ממוזגים וראיות POC הוגדרו
כהיסטוריים או כהפניות חזותיות; הם אינם מחליפים דרישת מוצר או ארכיטקטורה.

ארבעה workstreams בלתי תלויים שימשו לביקורת: מוצר/קורס/מסמכים;
אבטחה/DB/תחרותיות; פונקציונליות/בדיקות/RTL/נגישות; וספורט/תפעול/פריסה.
הממצאים להלן אומתו מחדש מול המקור בידי הסוקר הראשי, אוחדו לפי root cause
ודורגו לפי השפעה ולא לפי מספר התאמות טקסט.

## 2. Coverage ledger

| משטח | כיסוי שבוצע בפועל |
| --- | --- |
| עץ Git מקובע | 279 קבצים tracked ב־SHA; worktree ו־`origin/main` היו זהים בתחילת הביקורת |
| `docs/` | 26/26 קבצים מהעץ המקובע; גם `rg --files docs` החזיר 26, ללא הבדל |
| קורס | PDF חיצוני בן 9 עמודים: extraction מלא + render ובדיקה חזותית של 9/9 |
| ספר פרויקט | `docs/project-book.docx`: extraction מלא של 48 פסקאות ו־2 טבלאות; export לקריאה בלבד דרך Word ובדיקה חזותית של 4/4 עמודים |
| עיצוב | HTML אחד ו־9/9 mockups נפתחו ונבדקו חזותית; החלטות mockup בלבד לא קודמו לדרישות |
| Routes | 18 pages, שני layouts, root/global error, not-found ו־9 משטחי loading (root ועוד 8 route-specific) |
| Mutations | 15 Server Actions ו־5 Route Handlers |
| DB | 19 tables, view אחד, 44 functions ב־`public`/`private`, 14 trigger objects (16 event rows ב־`information_schema`), 7 enums, 14 policies, bucket פרטי אחד ו־19 migrations |
| בדיקות | 36 קובצי Vitest, 10 קובצי pgTAP ו־8 קובצי Playwright; ללא `.skip`, `.only` או `.todo` |
| Runtime מקומי | reset מאפס, verify מלא, בדיקת concurrency רב־session, query plans, UI מקומי ו־clean clone חד־פעמי |
| UI ידני | ציבורי/Auth/Dashboard/League/Matches/Match/Standings/Members/Settings/Reports/Admin/Invite-unavailable; `360`, `390`, `768`, `1024`, `1440`; Chrome Desktop ו־Pixel 5 באוטומציה |
| Hosted | Production ציבורי, Vercel env names, deployment SHA, Supabase migrations/Auth/URLs/Cron/Advisors, GitHub checks/PRs — read-only בלבד |
| חסום במכוון | Hosted Auth mutation/email אמיתי, evaluator GitHub identity, שינוי Cron/SMTP, Preview private-flow מלא, וזום דפדפן native 200%; כולם מופיעים כשערי Slice 9 ולא כ־PASS |

### 2.1 מלאי Routes וגבולות

Pages: `/`, `/login`, `/register`, `/forgot-password`, `/update-password`,
`/profile`, `/invite/[publicId]`, `/dashboard`, `/leagues/new`,
`/leagues/[leagueId]`, `/leagues/[leagueId]/matches`,
`/leagues/[leagueId]/standings`, `/leagues/[leagueId]/members`,
`/leagues/[leagueId]/reports`, `/leagues/[leagueId]/settings`,
`/matches/[matchId]`, `/admin/matches`, `/admin/sync`.

Server Actions: register, login, forgot password, update password, update
profile, sign out, create league, create/rotate invite, revoke invite, submit
request, approve request, reject request, save prediction, apply manual result,
trigger sync.

Route Handlers: `GET /auth/confirm`,
`POST /api/invites/[publicId]/exchange`,
`POST /api/join-requests/[requestId]/proofs`,
`GET /api/payment-proofs/[proofId]`, `POST /api/cron/sync`.

אין Actions ל־`updateLeagueSettings`, `startLeague`, `completeLeague`, יצירה/
תיקון מלא של match או clear manual override. ההבחנה בין defect לבין עבודה
מתוכננת נעשית ברשומות להלן.

### 2.2 מלאי DB והרשאות

- Tables: `audit_logs`, `competitions`, `invite_links`, `join_requests`,
  `league_members`, `league_scoring_rules`, `leagues`, `matches`,
  `payment_proofs`, `predictions`, `prize_rules`, `profiles`,
  `rate_limit_events`, `seasons`, `sports_provider_rounds`, `sync_leases`,
  `sync_runs`, `system_admins`, `teams`.
- View: `league_leaderboard` עם `security_invoker=true`.
- Enums: `invite_status`, `join_request_status`, `league_status`,
  `match_status`, `member_status`, `outcome`, `sync_status`.
- Bucket: `payment-proofs`, `public=false`; אין policy ישירה ל־browser על
  `storage.objects`.
- 14 policies הן SELECT מצומצם על משאבי המוצר ועדכון profile עצמי. טבלאות
  מערכת ללא policy הן deny-all מכוון ונגישות רק דרך gateway/RPC.
- ה־secret client מוגדר רק ב־`src/lib/supabase/admin.ts` ונצרך ב־gateways
  המצומצמים `private-proof-storage.ts`, `private-scoring-gateway.ts` ו־
  `private-sync-gateway.ts`; בדיקת boundary ייעודית מגינה על רשימה זו.
- 44 functions נבדקו לפי owner/grant/`SECURITY DEFINER`; RPCs ציבוריים
  מצמצמים EXECUTE ל־role הדרוש, עם `search_path=''` ויחסים schema-qualified.
  פריטי Advisor שדורשים disposition Hosted רשומים ב־S9-REQ-005.

#### מלאי function/RPC מלא

- `private`: `apply_api_football_sync_batch`,
  `enforce_prediction_season_consistency`, `enforce_scoring_rule_lock`,
  `hash_invite_token`, `invite_token_hash_is_valid`,
  `is_active_league_member`, `is_league_manager`, `join_request_eligibility`,
  `league_accepts_new_requests`, `payment_proof_summaries`,
  `prevent_league_prediction_season_change`,
  `prevent_match_prediction_season_change`, `prevent_prediction_lock_reopen`,
  `score_match`, `shares_active_league`, `touch_prediction_updated_at`,
  `touch_slice3_updated_at`, `touch_updated_at`, `validate_prize_rule_total`.
- `public`: `apply_api_football_sync_batch`, `approve_join_request`,
  `authorize_payment_proof_access`, `claim_sports_sync`,
  `consume_proof_upload_rate_limit`, `create_league`,
  `create_or_rotate_invite`, `finalize_payment_proof`, `finalize_sports_sync`,
  `get_join_request_upload_context`, `get_league_invite_metadata`,
  `get_manager_join_requests`, `get_my_join_requests`,
  `get_my_join_requests_v2`, `get_prediction_database_time`,
  `handle_new_auth_user`, `is_system_admin`, `record_sync_attempt`,
  `reject_join_request`, `resolve_invite`, `revoke_invite`, `save_prediction`,
  `score_match`, `set_profile_updated_at`, `submit_join_request`.

#### מלאי trigger/policy/grant מלא

- Trigger objects: `profiles_set_updated_at`, `auth_user_created_create_profile`,
  `league_scoring_rules_enforce_lock`, `prize_rules_validate_total`,
  `leagues_touch_updated_at`, `league_members_touch_updated_at`,
  `league_scoring_rules_touch_updated_at`, `invite_links_touch_updated_at`,
  `join_requests_touch_updated_at`, `predictions_enforce_season_consistency`,
  `predictions_touch_updated_at`, `leagues_prevent_prediction_season_change`,
  `matches_prevent_prediction_season_change`,
  `matches_prevent_prediction_lock_reopen`.
- Policies: `competitions_authenticated_read`,
  `join_requests_authorized_read`, `league_members_authorized_read`,
  `league_scoring_rules_authorized_read`, `leagues_member_read`,
  `matches_authenticated_read`, `payment_proofs_authorized_read`,
  `predictions_authorized_read`, `prize_rules_authorized_read`,
  `profiles_select_authorized`, `profiles_update_own`,
  `seasons_authenticated_read`, `sync_runs_select_system_admin`,
  `teams_authenticated_read`.
- Direct product-table grants ל־`authenticated` הם SELECT בלבד על tables/view
  הדרושים ועדכון profile עצמי; mutations עוברים RPC. `anon` מקבל רק EXECUTE
  על `resolve_invite`; `authenticated` מקבל EXECUTE על 21 gateways/helpers
  המפורטים ב־grant assertions. Storage schema מחזיק grants platform-default,
  אך RLS ללא object policy חוסם direct browser access. `service_role` אינו
  מקבל gateway EXECUTE אלא במפורש עבור scoring/sync system paths.

#### מלאי HTTP/provider ו־mutation boundary

| boundary | actor ומקור קלט | authorization/mutation/audit |
| --- | --- | --- |
| Auth Actions + `/auth/confirm` | Supabase server session, form/URL Zod/safe redirect | Supabase Auth; profile RLS; DEF-001/004 |
| League create | `getUser()`; form Zod | `create_league` RPC אטומי + creator membership/audit |
| Invite/request/decision Actions | `getUser()`; IDs/forms untrusted | exact RPC manager/member checks + RLS/audit; terminal gap DEF-005 |
| Invite exchange Handler | fragment-derived proof/cookie input, no secret path | hash verification, HttpOnly scoped cookie, opaque response |
| Proof upload/view Handlers | session + UUID/form/body/file untrusted | exact request/proof authorization, fixed private bucket, sanitize/re-encode/signed ≤60s |
| Prediction Action | session + scores/UUIDs | `save_prediction`; DB member/league/match locks; DEF-002 |
| Manual result Action | session system-admin | fixed scoring gateway/RPC/audit; DEF-003/008 |
| Cron/admin sync | constant-time bearer או session system-admin | fixed provider, claim/apply/finalize fencing and run rows |
| API-Football HTTP | server-only key; fixed base URL, GET allowlist/params | 8MiB response bound, timeout/retry/Zod/paging/identity; no browser call |
| Supabase Storage HTTP | server-only fixed gateway | no arbitrary bucket/path; upload/remove/signed URL after exact AuthZ |

Status transitions שנבדקו: league `draft→open` בלבד קיים; membership
`pending_proof→pending_approval→approved/rejected`; member `active/removed`;
match `scheduled/postponed/live/finished/canceled` עם fail-closed review;
sync `running→succeeded/failed/skipped`; scoring overwrites current result.
Lifecycle gaps ו־terminal composition מופיעים DEF-005/006/REQ-001.

#### Bound/pagination ledger

| query/operation | bound נוכחי | disposition |
| --- | --- | --- |
| dashboard memberships/leagues | 100 | silent truncation P3 subcase של DEF-009 |
| fixture list | 500 + sentinel 501 | bounded; filters קיימים, pagination נדרש כשקטלוג גדל |
| match-detail active members/revealed predictions | 200 | אסור לשמש AuthZ; DEF-009 |
| admin manual matches | 200 + sentinel 201 | whole-page failure; DEF-009 |
| manager join requests | 100 | no cursor/total; DEF-009 |
| leaderboard/report | fail-closed 500 | intentional current scale; explicit error tested |
| proofs per request | 5 | product/security invariant, constraint/rate/idempotency tested |
| sync history | 100 | intentional operator cap; retention measurement-gated |
| targeted fixtures / provider team batch / apply batch | 20 / 20 / 50 | explicit; fairness defect DEF-010 |
| provider season fixtures / notes / response | 1,000 / 100 / 8MiB | explicit fail-closed bounds |

### 2.3 מלאי בדיקות והטענה שהן מוכיחות

| קבוצה | קבצים | התנהגות עיקרית |
| --- | --- | --- |
| Auth/platform | `auth-rules.test.ts`, `env.test.ts`, `admin-boundary.test.ts`, `proxy.test.ts`, ארבע בדיקות Route של API | validation, redirects, env/server-only, session refresh, Handler errors/AuthZ |
| Proof/files | `http`, `image`, `proof-upload-ui-rules`, `request-body`, `rpc`, `security`, `service`, `storage-path` | body/signature/decode/re-encode/dimensions, idempotency, compensation, private access |
| League/membership | `leagues-rules.test.ts`, `membership-rules.test.ts` | scoring/prize validation, invite/request/decision display and boundary rules |
| Prediction/report/scoring | `predictions-rules`, `round-groups`, `reports/{queries,service}`, `scoring/{errors,prize-allocation,queries,schemas,scoring-rules}` | lock/display rules, grouping, manager report, deterministic scoring/rank/prizes |
| Sports/sync | `api-football-client`, `api-football-provider`, `provider-factory`, `sports-provider`, `sync-planner`, `sync/{display,errors,orchestrator,queries}`, Cron route | fixed provider boundary, normalization, planner, retry/orchestration, operator UI |
| pgTAP | `foundation`, `identity`, `leagues`, `manager-decisions`, `membership`, `predictions`, `proofs`, `scoring`, `sync`, `sync-api-football` | constraints, RLS/grants, AuthZ negatives, atomicity, scoring, lease/fencing/provider apply |
| Playwright | `auth`, `home`, `join-and-proofs`, `leagues`, `prediction-lock`, `reports`, `scoring`, `sync` | user journeys, responsive/RTL anchors, cross-role denial, DB-backed integration |

המלאי המדויק של 54 קובצי הבדיקה:

- Vitest/platform/Handlers: `src/proxy.test.ts`, `src/lib/env.test.ts`,
  `src/lib/supabase/admin-boundary.test.ts`,
  `src/app/api/cron/sync/route.test.ts`,
  `src/app/api/invites/[publicId]/exchange/route.test.ts`,
  `src/app/api/join-requests/[requestId]/proofs/route.test.ts`,
  `src/app/api/payment-proofs/[proofId]/route.test.ts`.
- Vitest/Auth/files: `src/features/auth/auth-rules.test.ts`,
  `src/features/files/http.test.ts`, `image.test.ts`,
  `proof-upload-ui-rules.test.ts`, `request-body.test.ts`, `rpc.test.ts`,
  `security.test.ts`, `service.test.ts`, `storage-path.test.ts` (כל קובצי files
  תחת `src/features/files/`).
- Vitest/domain: `src/features/leagues/leagues-rules.test.ts`,
  `src/features/membership/membership-rules.test.ts`,
  `src/features/predictions/predictions-rules.test.ts`,
  `src/features/predictions/round-groups.test.ts`,
  `src/features/reports/queries.test.ts`, `src/features/reports/service.test.ts`,
  `src/features/scoring/errors.test.ts`,
  `src/features/scoring/prize-allocation.test.ts`,
  `src/features/scoring/queries.test.ts`, `src/features/scoring/schemas.test.ts`,
  `src/features/scoring/scoring-rules.test.ts`.
- Vitest/sports/sync: `src/features/sports/api-football-client.test.ts`,
  `api-football-provider.test.ts`, `provider-factory.test.ts`,
  `sports-provider.test.ts`, `sync-planner.test.ts` (תחת `sports/`), וכן
  `src/features/sync/display.test.ts`, `errors.test.ts`, `orchestrator.test.ts`,
  `queries.test.ts` (תחת `sync/`).
- pgTAP: `supabase/tests/foundation.test.sql`, `identity.test.sql`,
  `leagues.test.sql`, `manager-decisions.test.sql`, `membership.test.sql`,
  `predictions.test.sql`, `proofs.test.sql`, `scoring.test.sql`,
  `sync.test.sql`, `sync-api-football.test.sql`.
- Playwright: `e2e/auth.spec.ts`, `home.spec.ts`, `join-and-proofs.spec.ts`,
  `leagues.spec.ts`, `prediction-lock.spec.ts`, `reports.spec.ts`,
  `scoring.spec.ts`, `sync.spec.ts`.

ה־Preview smoke בוחר רק בדיקות המסומנות `@preview`; הוא אינו ראיה ל־Auth או
למשטחים פרטיים. תרחישי Auth ו־join הקיימים ארוכים ומונוליטיים, ולכן דרישות
ה־regression להלן דורשות פיצול נקודתי כאשר הדבר משפר בידוד כשל.

## 3. מלאי מלא של `docs/`

לפני הכתיבה, העץ המקובע וה־working tree הכילו אותם 26 paths. לאחר הכתיבה
ה־working tree מכיל 27: ההפרש היחיד הוא הקובץ החדש
`docs/slice-9-preflight-audit.md`; `docs/technical-plan.md` ו־`docs/product.md`
הם paths קיימים ששונו במכוון. המלאי הבא כולל את 26 מקורות הבסיס ואת artifact
הביקורת החדש.

| path | סוג/תפקיד | נבדק בפועל | drift/disposition |
| --- | --- | --- | --- |
| `docs/architecture.md` | Markdown קנוני | נקרא במלואו | חוזה lifecycle דורש הכרעה S9-DEF-006 |
| `docs/design-brief.md` | visual reference | נקרא במלואו | אין הרחבת scope; עיצוב light/RTL נשמר |
| `docs/design/slice-7c/README.md` | visual/historical | נקרא במלואו | Slice 7c היסטורי, לא סטטוס שחרור נוכחי |
| `docs/design/slice-7c/claude-design-export.html` | visual reference | DOM ו־render נבדקו | source visual בלבד; קובצי helper חסרים אינם runtime product |
| `docs/design/slice-7c/final-review-prompt.md` | historical prompt | נקרא במלואו | instructions היסטוריות בלבד |
| `docs/design/slice-7c/implementation-review-prompt.md` | historical prompt | נקרא במלואו | כנ״ל |
| `docs/design/slice-7c/mockups/component-states.png` | visual reference | נבדק ברזולוציה מקורית | states בלבד |
| `docs/design/slice-7c/mockups/dashboard-desktop.png` | visual reference | נבדק ברזולוציה מקורית | אין דרישת aggregation חדשה |
| `docs/design/slice-7c/mockups/dashboard-mobile.png` | visual reference | נבדק ברזולוציה מקורית | כנ״ל |
| `docs/design/slice-7c/mockups/league-overview-desktop.png` | visual reference | נבדק ברזולוציה מקורית | כנ״ל |
| `docs/design/slice-7c/mockups/league-overview-mobile.png` | visual reference | נבדק ברזולוציה מקורית | כנ״ל |
| `docs/design/slice-7c/mockups/matches-desktop.png` | visual reference | נבדק ברזולוציה מקורית | inline prediction אינו דרישה |
| `docs/design/slice-7c/mockups/matches-mobile.png` | visual reference | נבדק ברזולוציה מקורית | clipping היסטורי אינו אישור ל־clipping runtime |
| `docs/design/slice-7c/mockups/standings-desktop.png` | visual reference | נבדק ברזולוציה מקורית | tie-break הקנוני נשמר |
| `docs/design/slice-7c/mockups/standings-mobile.png` | visual reference | נבדק ברזולוציה מקורית | כנ״ל |
| `docs/design/slice-7c/s3-polish-review-prompt.md` | historical prompt | נקרא במלואו | לא מקור קנוני |
| `docs/evidence/api-football-canary-2026-08-24.md` | evidence היסטורי | נקרא במלואו | נשמר קשור ל־SHA/מועד המקורי; לא שוכתב |
| `docs/evidence/api-football-poc-2026-08-23.md` | evidence היסטורי | נקרא במלואו | מוכיח בחירת provider, לא תצפית release נוכחית |
| `docs/product.md` | Markdown קנוני | נקרא במלואו | status header תוקן מכנית ב־PR; קישור PDF חסר נשאר S9-DEF-023 |
| `docs/project-book.docx` | derived/course deliverable | text + 4/4 pages | Slice 8 next, 460/20, תוכן כספי ופריסת עמודים: S9-DEF-013 |
| `docs/prompts/slice-6-implementation-prompt.md` | historical prompt | נקרא במלואו | אינו contract נוכחי |
| `docs/scale.md` | ניתוח קנוני תומך | נקרא במלואו | advisor/query-scale disposition ב־S9-REQ-005 |
| `docs/security.md` | ניתוח קנוני תומך | נקרא במלואו | Hosted Auth ו־advisor residual gates פתוחים |
| `docs/slice-9-preflight-audit.md` | audit artifact חדש | נכתב ונקרא במלואו; diff/staged review לפני commit | source durable לכל finding; אינו משנה runtime |
| `docs/sports-provider-poc.md` | החלטה/תכנית POC | נקרא במלואו | API-Football נבחר; Manual/recorded fallbacks נשארים |
| `docs/technical-plan.md` | Markdown קנוני | נקרא במלואו | סעיף Slice 9 עודכן לקישור ול־register זה |
| `docs/testing.md` | תכנית/ראיות בדיקה | נקרא במלואו | ספירות 489/646/22 אומתו מחדש; פערי regression רשומים |

ה־PDF של הקורס נמצא מחוץ ל־checkout ב־`C:/Users/Tal/Downloads/Internet
Technologies.pdf`. תשעת עמודיו דורשים מוצר Next.js/TypeScript/Supabase/Vercel,
אפיון, DB/זרימות/הרשאות, בדיקות, scale, security, URL חי, GitHub, הוראות local
ומצגת 10–15 דקות. אין בו משקלי ציון; לא הומצא rubric. הקישור הנוכחי
`project_sources/01-Internet-Technologies.pdf` אינו tracked ולכן דורש תיקון
ב־S9-DEF-023, בלי לערוך את PDF המקור.

## 4. מטריצת עקיבות — דרישות מוצר

כל שורה מפנה בנפרד למקור, למימוש, לראיה חיובית, לראיה שלילית/edge/concurrency
ולראיית Hosted/manual. `PASS` הוא לדרישה המדויקת בלבד ולא לשחרור הכולל.

| מקור | ID | התנהגות | קוד/migration | בדיקה חיובית | בדיקה שלילית/edge/concurrency | Hosted/manual | סטטוס | finding |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `docs/product.md` §9.1 | AUTH-01 | הרשמה Email/סיסמה | `src/features/auth/actions.ts`; Supabase Auth | `e2e/auth.spec.ts` signup | `src/features/auth/auth-rules.test.ts` validation/enumeration | Mailpit local | PASS | — |
| `docs/product.md` §9.1 | AUTH-02 | confirm/login/logout/recovery | `src/features/auth/actions.ts`; `src/app/auth/confirm/route.ts` | `e2e/auth.spec.ts` login/recovery local | reuse/old-password/429/Hosted delivery חסרים | Hosted mutation לא בוצעה; no SMTP | FAIL | S9-DEF-001, S9-DEF-004 |
| `docs/product.md` §9.1 | AUTH-03 | profile אוטומטי ועדכון עצמי | `supabase/migrations/20260812220000_identity.sql`; `src/features/auth/actions.ts` | `supabase/tests/identity.test.sql` own update | `supabase/tests/identity.test.sql` other-user denial | local | PASS | — |
| `docs/product.md` §9.1 | AUTH-04 | session בכל route מוגן | `src/proxy.ts`; Server Components `getUser()` | `src/proxy.test.ts` refresh; Auth E2E | Playwright guest/cross-role denials | Production public shell בלבד | PASS למימוש | — |
| `docs/product.md` §9.1 | AUTH-05 | redirect בטוח ומחובר→dashboard | `src/features/auth/schemas.ts`; `src/features/auth/actions.ts`; `src/proxy.ts` | Auth E2E valid next | `src/features/auth/auth-rules.test.ts` hostile next | allowlist Hosted חלקי | PARTIAL | S9-DEF-014 |
| `docs/product.md` §9.2 | LEAGUE-01 | create + manager | `src/features/leagues/actions.ts`; `supabase/migrations/20260813182000_leagues.sql` | `e2e/leagues.spec.ts` create | `supabase/tests/leagues.test.sql` foreign actor | local | PASS | — |
| `docs/product.md` §9.2 | LEAGUE-02 | כל שדות והגדרות | `src/features/leagues/schemas.ts`; create RPC | create form happy path | invalid create covered; edit path absent | local | PARTIAL | S9-DEF-007 |
| `docs/product.md` §9.2 | LEAGUE-03 | prize rules =100% | `supabase/migrations/20260813183000_harden_prize_rule_invariant.sql` | valid split unit/pgTAP | invalid total/position pgTAP | local Demo | PASS ביצירה | S9-DEF-007 לעדכון |
| `docs/product.md` §9.2 | LEAGUE-04 | scoring nonnegative + version | `league_scoring_rules`; `supabase/migrations/20260816110600_slice6_scoring_and_leaderboard.sql` | valid 3/1/0 pgTAP | negative/mutation-after-lock pgTAP | local | PASS | — |
| `docs/product.md` §9.2 | LEAGUE-05 | lock לפני kickoff ראשון | `supabase/migrations/20260823190000_slice7b_api_football_sync.sql` lock trigger | normal lock pgTAP | first-kickoff lifecycle/concurrency חסר | multi-session time failure reproduced | PARTIAL | S9-DEF-006, S9-DEF-002 |
| `docs/product.md` §9.2 | LEAGUE-06 | manager/system-admin mutation | create AuthZ בלבד; settings mutation absent | manager create | cross-user create covered; edit absent | N/A | FAIL | S9-DEF-007 |
| `docs/product.md` §9.2 | LEAGUE-07 | create atomic | `public.create_league` in `supabase/migrations/20260813182000_leagues.sql` | creator/membership pgTAP | rollback/replay pgTAP | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-01 | create/revoke/rotate invite | `src/features/membership/actions.ts`; Slice 3 RPCs | valid invite E2E | non-manager/revoked pgTAP | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-02 | expired/revoked deny | `public.resolve_invite`; submit RPC | valid token E2E | expired/revoked/malformed pgTAP/E2E | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-03 | בקשה פעילה יחידה | Slice 3 partial unique index + submit RPC | first request pgTAP | duplicate/cross-user pgTAP | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-04 | status enum | `join_request_status`; membership display | every expected state unit | invalid transition pgTAP | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-05 | proof→pending approval | upload Handler + `finalize_payment_proof` | file/E2E valid image | bad bytes/oversize/replay pgTAP/unit | local synthetic | PASS | S9-DEF-005 terminal |
| `docs/product.md` §9.3 | JOIN-06 | exact manager approve/reject | `src/features/membership/actions.ts`; decision RPCs | approve/reject E2E | other-league denial pgTAP/E2E; terminal חסר | local | PARTIAL | S9-DEF-005 |
| `docs/product.md` §9.3 | JOIN-07 | membership atomic/idempotent | `supabase/migrations/20260815143000_manager_join_request_decisions.sql` | approve creates member | replay/concurrency pgTAP; terminal חסר | local | PARTIAL | S9-DEF-005 |
| `docs/product.md` §9.3 | JOIN-08 | resubmit after reject while open | `private.join_request_eligibility` | resubmit E2E | closed/duplicate denial pgTAP | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-09 | 1:N private proof history | `payment_proofs`; RLS; `src/features/files/private-proof-storage.ts` | multiple proof history pgTAP | cross-league/direct-storage denial | local | PASS | S9-DEF-005 terminal |
| `docs/product.md` §9.3 | JOIN-10 | hash/fragment/7d/one-time | invite RPC + `src/app/api/invites/[publicId]/exchange/route.ts` | valid exchange E2E | replay/expired/raw-token absence | local | PASS | S9-DEF-016, S9-DEF-020 UX |
| `docs/product.md` §9.3 | JOIN-11 | idempotent/concurrent request | partial unique + submit RPC | first submit | real DB concurrent duplicate pgTAP | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-12 | safe WebP/idempotency/rate cap | upload Handler; `src/features/files/image.ts`; rate RPC | JPEG/PNG/WebP unit/E2E | magic/decode/pixel/rate/replay/compensation | local synthetic only | PASS | S9-DEF-005 terminal |
| `docs/product.md` §9.3 | JOIN-13 | uploader/exact manager signed ≤60s | proof-view Handler + private gateway | authorized signed URL | outsider/other-league/path denial | local | PASS | S9-DEF-005 terminal |
| `docs/product.md` §9.4 | MATCH-01 | round/date display | `src/features/predictions/queries.ts`; league matches page | query/unit + Playwright | empty/filter/date edges | local | PASS | — |
| `docs/product.md` §9.4 | MATCH-02 | teams/UTC/status/result | sports schema/provider/pages | provider fixtures/unit/E2E | unknown/status identity failures | local + Hosted catalog | PASS | S9-DEF-010 reliability |
| `docs/product.md` §9.4 | MATCH-03 | system-admin full create/correct | `src/features/scoring/actions.ts` result-only | result override E2E | create/schedule/team correction absent | N/A | FAIL | S9-DEF-003, S9-DEF-009 |
| `docs/product.md` §9.4 | MATCH-04 | provider server-only/persisted | `src/features/sports/api-football-client.ts`; private sync gateway | provider/unit/pgTAP | client-secret scan + invalid payload | Hosted Cron/sync aggregate observed | PASS | — |
| `docs/product.md` §9.4 | MATCH-05 | manual precedence + explicit clear | scoring gateway + sync skip | manual override/skip pgTAP | clear/resume absent | local | PARTIAL | S9-DEF-008 |
| `docs/product.md` §9.4 | MATCH-06 | run audit/no duplicate window | sync claim/apply/finalize RPCs | sync pgTAP/E2E normal | time/fairness/429/timeout/type/stage edges | Hosted one Cron + no active lease snapshot | PARTIAL | S9-DEF-002, S9-DEF-010, S9-DEF-011, S9-DEF-012, S9-DEF-018, S9-DEF-019 |
| `docs/product.md` §9.4 | MATCH-07 | irreversible reveal latch | sync apply + lock trigger | early-cancel privacy pgTAP | cancellation/lock multi-session race reproduced statically | local | FAIL under concurrency | S9-DEF-002 |
| `docs/product.md` §9.4 | MATCH-08 | FT only; AET/PEN review | provider normalizer/planner/apply | recorded FT fixtures | AET/PEN/unknown fail-closed unit/pgTAP | historical POC | PASS | — |
| `docs/product.md` §9.5 | PRED-01 | active member, integer nonnegative | prediction Action/RPC/constraints | valid save E2E | invalid score/inactive denial; member #201 gap | local | PARTIAL at scale | S9-DEF-009 |
| `docs/product.md` §9.5 | PRED-02 | unique user/league/match | unique constraint + upsert | first save | double-submit/replay pgTAP | local | PASS | — |
| `docs/product.md` §9.5 | PRED-03 | DB time strictly before kickoff | `public.save_prediction` | ordinary pre-kickoff pgTAP | real multi-session late-commit failure | local reproduction | FAIL | S9-DEF-002 |
| `docs/product.md` §9.5 | PRED-04 | countdown UX only | match page + DB decision | geometry/countdown E2E | expired UI cannot override DB lock | local | PASS | — |
| `docs/product.md` §9.5 | PRED-05 | own-before/all-after reveal | prediction RLS/query | own/all reveal pgTAP | outsider/early cancel covered; latch race open | local | PARTIAL | S9-DEF-002, S9-DEF-009 |
| `docs/product.md` §9.5 | PRED-06 | late member only future | `public.save_prediction` | future match save | past/locked match denial pgTAP | local | PASS | — |
| `docs/product.md` §9.6 | SCORE-01 | HOME/DRAW/AWAY | outcome enum + scoring rules | all three outcomes unit | invalid/missing result pgTAP | local | PASS | — |
| `docs/product.md` §9.6 | SCORE-02 | league 3/1/0 default | `private.score_match`; rule table | exact/home/draw/away/wrong cases | negative/mutated rule rejection | local | PASS | — |
| `docs/product.md` §9.6 | SCORE-03 | no prediction = 0 display | invoker leaderboard/report | no-prediction display test | no phantom row/points | local | PASS | — |
| `docs/product.md` §9.6 | SCORE-04 | scoring metadata persisted | predictions columns + scoring function | metadata pgTAP | stale version/correction assertions | local | PASS | — |
| `docs/product.md` §9.6 | SCORE-05 | overwrite/idempotent | `private.score_match` | retry same result | replay does not increment pgTAP | local | PASS | — |
| `docs/product.md` §9.6 | SCORE-06 | correction replaces | same function | corrected result E2E | old points/version replaced | local | PASS | — |
| `docs/product.md` §9.6 | SCORE-07 | points/outcomes/shared rank | `public.league_leaderboard` | rank `1,1,3` unit/pgTAP | draw/tie/retry edges | local | PASS | — |
| `docs/product.md` §9.6 | SCORE-08 | exact display only | leaderboard view/order/UI | exact display/tie tests | no arbitrary secondary tie-break | local | PASS | — |
| `docs/product.md` §9.7 | REPORT-01 | exact manager opaque deny | `src/features/reports/service.ts` | manager report E2E | member/outsider/other-manager denial | local | PASS | — |
| `docs/product.md` §9.7 | REPORT-02 | active-member count | `src/features/reports/queries.ts` | creator/active count | removed member excluded; terminal mutation gap | local | PARTIAL terminal | S9-DEF-005 |
| `docs/product.md` §9.7 | REPORT-03 | distinct request counts | report queries | approved/rejected counts | proof-history nondup | local | PASS | — |
| `docs/product.md` §9.7 | REPORT-04 | canonical shared rank | leaderboard reuse | rank render unit/E2E | tie ordering edge | local | PASS | — |
| `docs/product.md` §9.7 | REPORT-05 | current vs final by completed | report service/page | final fixture renders | product completion path absent | no Hosted lifecycle | PARTIAL planned | S9-REQ-001 |
| `docs/product.md` §9.7 | REPORT-06 | no AI/finance | report query/UI boundary | report E2E/static absence | repository-wide AI/money scan | Production Demo shell | PASS | — |

## 5. מטריצת עקיבות — קורס ושערים פנימיים

| מקור | ID | דרישה | קוד/migration/docs | בדיקה חיובית | בדיקה שלילית/edge/concurrency | Hosted/manual | סטטוס | finding/requirement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| course PDF pp.1–6 | COURSE-01 | מוצר Web E2E עם ערך משתמש | Slices 0–8 + canonical docs | 22 Playwright green | lifecycle/full-demo absent | Production public | PARTIAL | S9-REQ-001 |
| course PDF pp.2–6 | COURSE-02 | אפיון, architecture, plan | `docs/product.md`; `docs/architecture.md`; `docs/technical-plan.md` | full document review | cross-document drift review | N/A | PASS עם findings | S9-REQ-004 |
| course PDF pp.1,4,7 | COURSE-03 | Next.js+TS+Supabase+Vercel | `package.json`; migrations; `.github/workflows/ci.yml` | build/CI/deployment exact base SHA | final SHA not yet exists | Production base | PASS לבסיס | S9-REQ-003 לסופי |
| course PDF pp.3–6 | COURSE-04 | DB/pages/APIs/flow/permissions/services | inventories §2 + canonical docs | route/DB/service coverage | missing fallback/settings/terminal mutations | local | PARTIAL | S9-DEF-003, S9-DEF-005, S9-DEF-007 |
| course PDF pp.5–6 | COURSE-05 | core/invalid/AuthZ/DB/edge/UI tests | 54 test files; `npm run verify` | 489/646/22 fresh | listed concurrency/manual/Hosted gaps | local/CI | PARTIAL | S9-REQ-005 |
| course PDF p.6 | COURSE-06 | scale/queries/indexes/limits/future | `docs/scale.md`; plans; Advisors | 8 local plans + linked stats | seed/hosted shape קטן; hundreds absent | linked CLI/dashboard | PARTIAL | S9-REQ-005 |
| course PDF p.6 | COURSE-07 | AuthN/AuthZ/validation/API/secrets/security | `docs/security.md`; RLS/grants/scans | 646 pgTAP + secret boundary scan | Hosted Auth/lifecycle/bidi/key-scope gaps | Advisor/config read-only | PARTIAL | S9-DEF-004, S9-DEF-005, S9-DEF-015, S9-DEF-025 |
| course PDF p.7 | COURSE-08 | live URL/GitHub/local instructions | README + CI/deployment | clean clone and public 200 | evaluator private-repo identity unavailable | Production base | BLOCKED לסופי | S9-REQ-003 |
| course PDF pp.7–9 | COURSE-09 | presentation 10–15 דקות | artifact absent | N/A — missing | N/A — no rehearsal/timing | N/A | MISSING | S9-REQ-002 |
| course PDF pp.8–9 | COURSE-10 | value/architecture/flows/tests/scale/security/future | deck/demo script absent | N/A — missing | N/A — outage/credential fallback absent | N/A | MISSING | S9-REQ-002 |
| internal release gate | INTERNAL-AUTH | evaluator signup/recovery reliable | Supabase Auth config + Auth Actions | local Mailpit | arbitrary Hosted recipient/reuse/429 absent | default SMTP team-only/2h | FAIL | S9-DEF-004 |
| internal release gate | INTERNAL-BRANCH | required checks protected | GitHub settings/API | exact-SHA CI green | protection/ruleset API 403 | GitHub private/free | BLOCKED | S9-DEF-017 |
| internal release gate | INTERNAL-URL | incognito ללא protection | Vercel deployment/alias | Production alias HTTP 200 | final candidate absent | public base | PASS לבסיס | S9-REQ-003 לסופי |
| README | INTERNAL-CLEAN | clean-clone local run | README + `.env.example` + migrations | clone/install/reset/dev, `/`+`/login` 200 | values withheld; disposable cleanup | local fresh clone | PASS | — |
| internal accessibility gate | INTERNAL-UI | RTL/responsive/keyboard/zoom | global CSS/layouts/components | 360–1440 + desktop/mobile E2E | native 200%/full keyboard/contrast missing | local manual | PARTIAL | S9-REQ-005 |

## 6. פקודות ותוצאות בפועל

| פקודה/בדיקה | תוצאה חדשה בביקורת |
| --- | --- |
| `git status --porcelain=v1` לפני editing | exit 0, ללא פלט; worktree נקי |
| `git fetch origin --prune` | exit 0; `origin/main` נקבע ל־`a14edfc4…` |
| `git rev-parse`, log, branch, `git diff --check origin/main` | exit 0; SHA מלא זהה, ענף הביקורת חדש, diff נקי |
| Node/npm | `v24.16.0` / `11.13.0`; הפעלות ראשונות בלי PATH מתאים לא התחילו בדיקה ואינן נספרות ככשל מוצר |
| `npm ci` | exit 0; 425 packages, 426 audited, 0 vulnerabilities |
| `supabase start` | exit 0; הפלט נשמר זמנית ללא הדפסת credentials ונמחק בניקוי |
| `supabase db reset --local` | exit 0; 19 migrations + seed מאפס |
| `npm run verify` | exit 0; lint, typecheck, build ו־client-secret scan עברו; 36 קובצי Vitest/489 tests, 10 קובצי pgTAP/646 assertions, 22/22 Playwright ב־Desktop Chrome ו־mobile Chromium |
| `supabase db lint --local --schema public,private --level warning --fail-on error` | exit 0, `No schema errors found` |
| linked DB lint | exit 0, ללא schema errors |
| generated-type parity | exit 0 כחלק מ־verify |
| `supabase migration list --linked` | 19/19 timestamps local/remote מיושרים עד `20260824090000` |
| `npm audit --audit-level=low` | exit 0, 0 vulnerabilities |
| real multi-session kickoff reproduction | exit 0; התחלת transaction `00:22:43.117793Z`, kickoff `00:22:46.746966Z`, commit wall time `00:22:49.889954Z`; prediction נוצר אחרי kickoff |
| `EXPLAIN (ANALYZE, BUFFERS)` מקומי | 8 תבניות read; כולן מתחת 0.20ms. sync-due נוסה על 25 candidates זמניים ו־fixture list ב־limit 501; ה־transaction בוטלה. פירוט בסעיף 8 |
| `supabase inspect db table-stats --linked` / `index-stats --linked` | exit 0; 19 tables ו־53 indexes הוחזרו ב־JSON; לא נקראו credentials |
| Hosted sync aggregate | שני `SELECT` read-only ב־SQL Editor ב־`2026-08-26 01:09:09.621276+00`; 172 terminal runs, ללא failed/running וללא active lease/backoff |
| README clean clone חד־פעמי | clone exact SHA, Node 24, `npm ci`, env process-safe, Supabase start/reset, Next ready; `/` ו־`/login` החזירו 200; Supabase נעצר והעותק הועבר לסל המיחזור |
| UI ידני | 360/390/768/1024/1440, ללא page-level overflow במסכים שנבדקו; screenshots/DOM/labels/landmarks נבדקו |
| static safety scans | 0 TODO/FIXME/HACK/ts-ignore/eslint-disable; 0 skip/only/todo; 0 `dangerouslySetInnerHTML`/`eval`/`new Function`; 4 console matches רק ב־scripts; 13 cast/non-null matches נבדקו בהקשר; 35 secret-boundary filename matches נבדקו בלי להדפיס ערכים |
| cleanup | שני שרתי הפיתוח ו־Supabase המקומי נעצרו; אין containers מקומיים פעילים |
| post-edit docs review | `git diff --check`, status/stat ו־`git diff -- docs README.md AGENTS.md CLAUDE.md` עברו; הקובץ החדש נפתח ונבדק במלואו |
| staged allowlist review | staged בדיוק `docs/product.md`, `docs/technical-plan.md`, `docs/slice-9-preflight-audit.md`; `git diff --cached --check/stat/name-only` וה־diff המלא עברו |

הריצה היחידה הנספרת כ־full suite היא `npm run verify`. ריצת Vitest נוספת של
workstream החזירה גם היא 489/489, אך היא אבחונית ואינה מוצגת כראיה עצמאית.
Script graph נבדק: `verify` מריץ lint→typecheck→Vitest→pgTAP→types parity→E2E;
`scripts/run-e2e.ts` מבצע build ו־client-secret scan לפני Playwright, ולכן build
והסריקה לא הורצו פעם נוספת רק כדי לנפח evidence.
במהלך Playwright הופיע פעמיים log של Next.js
`The destination stream closed early`, אף שכל 22 הבדיקות עברו; הוא נרשם
כ־S9-DEF-024 ולא הוסתר. משך הקיר הכולל של `verify` לא נשמר ב־PTY ולכן הוא
`N/A — not captured`; זמני ה־runner וה־exit status נשמרו.

### 6.1 CI, PRים ופריסה — ראיה היסטורית מדויקת ל־SHA הבסיס

- GitHub Actions run
  [32856868405](https://github.com/talzantkeren/predictor/actions/runs/32856868405)
  רץ על `a14edfc4…`; jobs של quality, DB ו־Playwright הסתיימו `success`.
  זו ראיה היסטורית ל־base, לא תחליף ל־CI של PR הביקורת או של Slice 9.
- `.github/workflows/ci.yml` משתמש `contents: read`, Node `24.16.0`, `npm ci`,
  concurrency עם cancel-in-progress ושלושה jobs נפרדים. DB/E2E עוצרים Supabase
  ב־`if: always()`, ו־CI כופה `SPORTS_API_PROVIDER=manual`; אין provider/Hosted
  Auth חיצוני. Playwright report מועלה רק בכשל. אחרי הריצה המקומית נשאר רק
  `test-results/.last-run.json` עם `passed` ורשימת failures ריקה — ללא trace,
  proof, Email, token או secret.
- Vercel Production deployment `6084792619` הוא `success` ומקושר ל־SHA
  המקובע. ה־URL הבלתי משתנה הוא
  `https://predictor-cboalnn2l-tals-projects-19902e47.vercel.app`; alias
  `https://predictor-swart.vercel.app` נפתח ללא login/protection והציג Demo
  בעברית.
- Production כולל את תשעת שמות ה־env הצפויים, ללא קריאת ערכים:
  Supabase URL/publishable/secret, app URL, Demo mode, provider/key, Cron secret
  ו־system actor. Preview כולל שישה שמות, ברירת המחדל שלו Manual, וכן entries
  ישנים branch-specific; ראו S9-DEF-025.
- PR #9, `Docs: expand Slice 10 production hardening contract`, פתוח, non-draft
  ו־`DIRTY`. הוא היסטורי בלבד ולא מוזג/נסגר. רק הדרישות התקפות של SMTP/recovery
  עברו עצמאית ל־register זה. אין בו review אנושי או review decision; comment
  היחיד הוא deployment bot, ולכן אין thread אנושי לא פתור לקדם ל־backlog. אין
  בו שינויי sports runtime; ניסוח ה־manual provider בו קדם לבחירת API-Football
  ואינו מקור נוכחי לחוזה ה־fallback.
- היסטוריית המסירה הממוקדת נבדקה: PRs #1, #2, #3, #4, #5, #7, #8, #10,
  #11 ו־#12 מיזגו בהתאמה Bootstrap, Auth, Leagues, Join/decisions, Predictions,
  Scoring, Manual Sync, API-Football, Design ו־Reports; #6 הוסיף prompt היסטורי.
  לא נכרה כל commit ישן ולא הוחזר רעיון superseded.
- API branch-protection ו־rulesets החזירו 403: repository פרטי בתכנית הנוכחית
  אינו מספק את יכולת ההגנה הדרושה. אין מכאן ראיה ש־main מוגן; ראו S9-DEF-017.
- evaluator access ל־repository הפרטי לא ניתן לאימות ללא זהות evaluator; זהו
  שער מפורש ב־S9-REQ-003.

## 7. ראיות Hosted/Auth/Cron/Advisors

הבדיקות הבאות היו read-only דרך dashboard/CLI חתומים. לא נקראו ערכי secret,
לא נשלח Email, לא הופעל provider חי ולא שונה configuration.

נתיבי הראיה הניתנים לשחזור: Supabase
[SQL Editor](https://supabase.com/dashboard/project/zthqqxsbtioaacvpmqna/sql/new),
[Cron jobs](https://supabase.com/dashboard/project/zthqqxsbtioaacvpmqna/integrations/cron/jobs),
[job 1](https://supabase.com/dashboard/project/zthqqxsbtioaacvpmqna/integrations/cron/jobs/1?child-label=predictor-slice7-manual-sync),
[Security Advisor](https://supabase.com/dashboard/project/zthqqxsbtioaacvpmqna/advisors/security)
ו־[Performance Advisor](https://supabase.com/dashboard/project/zthqqxsbtioaacvpmqna/advisors/performance);
Vercel [environment settings](https://vercel.com/tals-projects-19902e47/predictor/settings/environment-variables)
וה־[immutable deployment](https://predictor-cboalnn2l-tals-projects-19902e47.vercel.app).
CLI read-only: `supabase inspect db table-stats --linked` ו־
`supabase inspect db index-stats --linked`.

- Supabase project הוא `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.155`.
- Site URL הוא Production alias. Redirect URLs בפועל: localhost
  `/auth/confirm`, Slice 1 ישן, Production `/auth/confirm`, ו־Slice 3 ישן עם
  `/**`. אין current Preview callback מדויק. README מציג רשימה אחרת.
- Email Auth/signup/confirm מופעלים; OTP length 8, expiry 3600s. אין custom
  SMTP. ה־built-in sender מוגבל לנמעני team, best-effort ובמכסה project-wide
  של שתי הודעות לשעה. leaked-password protection כבוי וזמין רק ב־Pro.
- template recovery משתמש ב־`ConfirmationURL`; לא בוצע Hosted mutation כדי
  לבדוק delivery/session/reuse. לכן S9-DEF-004 הוא P1 ולא `PASS`.
- Cron: job פעיל יחיד, כל דקה, אל Production `/api/cron/sync`, עם secret
  מ־Vault. שמו `predictor-slice7-manual-sync`; timeout חיצוני 10,000ms מול
  budget אפליקטיבי 30s ו־lease 120s. הריצות האחרונות הרגילות הצליחו, אך slow
  path אינו מכוסה; ראו S9-DEF-012.
- snapshot read-only ב־`2026-08-26 01:09:09.621276+00`: `api-football` כלל
  catalog `5`, reconciliation `7`, targeted `155`, כולם `succeeded`; Manual
  כלל `5` `skipped`. ה־lease generation היה `167`, ללא `run_id`,
  `locked_until` או `backoff_until`. זה מוכיח מצב רגעי בלבד, לא slow path.

### 7.1 Security Advisor — 0 errors, 22 warnings, 6 info

| פריטים | disposition |
| --- | --- |
| `pg_net` ב־`public` | ה־job הנוכחי תלוי ב־`pg_net`; לא הוכח שמיקום `public` עצמו נדרש. יש לאמת schema/dependencies נתמכים לפני כל move ב־S9-REQ-005 |
| advisor role-entries ל־`SECURITY DEFINER`: `resolve_invite`, `approve_join_request`, `authorize_payment_proof_access`, `consume_proof_upload_rate_limit`, `create_league`, `create_or_rotate_invite`, `finalize_payment_proof`, `get_join_request_upload_context`, `get_league_invite_metadata`, `get_manager_join_requests`, `get_my_join_requests`, `get_my_join_requests_v2`, `is_system_admin`, `reject_join_request`, `revoke_invite`, `save_prediction`, `submit_join_request` | gateways מכוונים, `search_path=''`, grants מצומצמים ו־pgTAP. לשמור disposition function-by-function; אין warning אוטומטי שהוא bypass |
| `rls_auto_enable` ל־anon/authenticated | אינו קיים ב־local migrations אך הופיע ב־Hosted Advisor; owner/definition/grants חייבים להיבדק ולהיות מוסברים או מבוטלים לפני release |
| leaked password protection disabled | מגבלת plan מאומתת; להחליט plan/mitigation, rate limiting ו־password policy ב־S9-REQ-005 |
| שש טבלאות RLS ללא policies: `audit_logs`, `invite_links`, `rate_limit_events`, `sports_provider_rounds`, `sync_leases`, `system_admins` | deny-all מכוון עם gateway/RPC; לשמר tests של no direct grant |

### 7.2 Performance Advisor — 0 errors, 0 warnings, 20 info

כל 20 הפריטים קיבלו disposition; אין הוספה/מחיקה עיוורת של index:

- 12 foreign keys ללא index ייעודי: `audit_logs.actor_id`,
  `invite_links.created_by`, `join_requests.decided_by`,
  `league_members.approved_by`, `league_members.removed_by`,
  `matches.away_team_id`, `matches.home_team_id`, `payment_proofs.uploaded_by`,
  `predictions.user_id`, `rate_limit_events.join_request_id`,
  `sync_leases.run_id`, `system_admins.granted_by`. חלקם static/append-only או
  משמשים delete checks בלבד; ב־S9-REQ-005 יש למדוד shape מייצג ולתעד add/no-add.
- שמונה indexes כרגע ללא שימוש:
  `matches_status_kickoff_idx`, `seasons_current_catalog_idx`,
  `invite_links_league_created_idx`,
  `join_requests_league_status_created_idx`,
  `rate_limit_events_user_request_action_created_idx`,
  `rate_limit_events_user_action_created_idx`,
  `audit_logs_entity_created_idx`, `sports_provider_rounds_review_idx`.
  `join_requests_league_status_created_idx` כן שימש בתכנית המקומית; נתוני
  Advisor קטנים אינם הצדקה להסרה. שאר הפריטים נשארים עד workload מייצג.

## 8. Query plans ונתוני scale

ה־local base shape בזמן המדידה: 17 leagues, 29 members, 5 matches, 0
predictions, 10 requests, 46 profiles ו־2 sync runs. לתוכניות fixture/sync-due
נוספו בתוך transaction עוד 25 משחקי API-Football `live` (יותר מ־limit 20),
וה־transaction בוטלה. לכן sequential scan על טבלה קטנה הוא החלטת planner
תקינה, לא defect, אך נתיב ה־bound עצמו כן הודגם.

| pattern | plan/זמן מקומי | פירוש |
| --- | --- | --- |
| Dashboard memberships | seq scan 29 + in-memory sort, 0.076ms | index `(user_id,status,league_id)` קיים; נדרש load shape לפני שינוי |
| Fixture list exact | season index + joins/sort, 30 rows, `LIMIT 501`, 0.107ms | cap מוצר 500 + sentinel 501 אינו invariant; pagination defect נפרד |
| Prediction reveal | empty prediction scan, 0.025ms | RLS/visibility נבדקו ב־pgTAP; concurrency defect אינו plan defect |
| Standings | group/window על member/profile/prediction, 0.199ms | תקין ליעד קטן; למדוד hundreds לפני materialization |
| Manager request counts | bitmap index על `join_requests_league_status_created_idx`, 0.034ms | advisor “unused” אינו מייצג workload זה |
| Sync history | 2-row scan/sort, 0.020ms | cap 100 קיים; retention עתידי measurement-gated |
| Sync due candidate | `matches_external_identity_key` + sort, 25 eligible→20, 0.035ms | query-equivalent read-only; `matches_status_kickoff_idx` לא נבחר ב־shape זה. DEF-010 דורש fairness, לא index עיוור |
| Lifecycle eligibility prototype | league PK + 5-row terminal scan, 0.027ms | predicate עצמו עדיין החלטה פתוחה, לא מאושר מהמבחן |

Hosted table stats היו קטנים גם הם (כ־187 matches, 172 sync runs, 26 rounds,
20 teams, lease אחד). אין ראיה לצורך Redis, queue, backend נפרד, cache חיצוני
או materialized leaderboard.

## 9. בדיקת UI, RTL ונגישות

- `lang="he"`, `dir="rtl"`, focus styles, home-first score ordering ו־
  `LeagueTabs` link navigation אומתו. `LeagueTabs` אינו ARIA tabs widget ולכן
  היעדר arrow-key semantics אינו defect.
- בכל `360/390/768/1024/1440` לא נמצא page-level horizontal overflow במסכי
  הליגה, fixtures, standings, members, settings, reports ו־admin. גלילת tabs
  מקומית נראית ומכוונת. Match detail ב־390 הציג labels נפרדים ושעה מוחלטת/
  timezone.
- Public, registration, Dashboard, create league, empty league, five fixtures,
  prediction, admin results/sync ו־invite unavailable נבדקו חזותית. loading
  skeleton צולם לפני completion ולא הוצג כתוכן סופי.

משטחים שלא נכללו ברשימת ה־manual לעיל קיבלו disposition מפורש, ואינם מוצגים
כאילו עברו manual visual gate:

| משטח | ראיה שבוצעה | disposition שנותר |
| --- | --- | --- |
| `/profile` | source review + `e2e/auth.spec.ts:185-380` מכסה render/update ו־foreign read/update denial | לא נפתח ידנית בכל viewport; final keyboard/contrast/200% ב־S9-REQ-005 |
| private proof view | `e2e/join-and-proofs.spec.ts:976-1026` מוכיח owner/manager redirect, WebP signed ≤60s ו־outsider/other-manager 404 | signed image לא נשמרה/screenshot לא נחשף; post-fix manual gate ב־S9-REQ-005 |
| root error/not-found | `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx` נקראו; public no-console/page-error ב־`e2e/home.spec.ts:7-24` | fault injection/404 visual matrix לא הורץ; נדרש ב־S9-REQ-005, לא PASS ידני |
| 9 loading surfaces | כל תשעת קובצי `loading.tsx` נקראו; skeleton אחד נלכד חזותית; 22 E2E עברו transitions | לא כל skeleton נלכד route-by-route; semantics findings ב־S9-DEF-022 וה־matrix הסופי ב־S9-REQ-005 |
| empty/error states פרטיים | empty league ו־invite-unavailable נבדקו ידנית; Auth/validation/opaque denials מכוסים ב־E2E/pgTAP | remaining route-specific empty/error/manual states הם acceptance מפורש של S9-REQ-005 |

- native browser zoom 200% לא היה ניתן להפעלה דרך משטח הבדיקה; viewports
  360/390 נותנים reflow שקול לרוחב 720/780 ב־200%, אך אינם ראיית zoom/focus
  מלאה. לכן gate ידני נשאר ב־S9-REQ-005.
- defects מאומתים: bidi isolation/control (S9-DEF-015), skip target חסר ב־
  invite המחובר (S9-DEF-016), escape חסר ב־invite unavailable
  (S9-DEF-020) ופערי הודעה/controls קטנים (S9-DEF-022).

## 10. Defect register

סיכום defect-only: **P0: 0; P1: 6; P2: 11; P3: 8**. לפי סוג: 13 `BUG`, שלושה
`DATA_INTEGRITY`, שני `RELEASE_BLOCKER`, ארבעה `DOC_CONFLICT`, אחד
`DECISION_REQUIRED` ושני `SECURITY`. כל P1/P2 חוסם release; waiver ל־P2 דורש
owner, נימוק, mitigation ותאריך בכתב. אין waiver מאושר בזמן הביקורת. עם חמש
רשומות REQ: **30 פתוחות — P1=9, P2=13, P3=8**.

**P0 — No findings.** לא נמצאה דליפת credential, bypass cross-tenant, גישה
ציבורית ל־proof פרטי, מחיקה/השחתה הרסנית או יכולת כסף אמיתי.

### S9-DEF-001 — recovery suppresses and misclassifies errors

- Type: `BUG`
- Severity: `P1`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: AUTH-02/05, Slices 1 ו־7c.
- Environment and pinned SHA: local/static, `a14edfc4…`.
- Affected roles/routes/data: אורח ומשתמש; `/forgot-password`, `/auth/confirm`,
  `/login`, recovery session.
- Preconditions/reproduction: לגרום ל־`resetPasswordForEmail` להחזיר 429 או
  provider error; Action מחזיר success. לפתוח callback invalid/expired/reused;
  failure מוצג success/info וכל code-exchange error מסווג browser mismatch.
- Expected: נוסח enumeration-safe זהה לכתובת קיימת/לא קיימת, אבל rate limit/
  outage actionable; callback failure מסומן alert מדויק וללא false success.
- Actual: `src/features/auth/actions.ts:153-173` משליך את error;
  `src/features/auth/components/login-form.tsx:21-25` מסמן כל status success;
  `src/features/auth/components/forgot-password-form.tsx:19-25` מסמן failure
  כ־info; `src/app/auth/confirm/route.ts:83-116` מאחד errors.
- Impact/root cause: core recovery נראה מצליח כשלא נשלח Email ומטעה משתמש/
  operator. חוזה status הוא string ולא typed result, וה־Action בחר להסתיר גם
  שגיאות מערכת במקום רק זהות חשבון.
- Minimal Slice 9 boundary: typed account-neutral recovery result ו־callback
  status; אין לחשוף אם Email קיים ואין לשנות ספק Auth.
- Required changes: Auth Action/error mapper/UI/tests/docs; ללא DB migration.
- Acceptance: success/unknown address נותנים copy שקול; 429 מציג cooldown;
  outage מציג retry; invalid/expired/reused/cross-browser מובחנים בבטחה;
  failures הם `role=alert`, success הוא `role=status`.
- Regression: Vitest ל־success/unknown/429/outage ולמיפוי callback; Playwright
  local Mailpit request→callback→update→reuse denied→logout→old password denied→
  new login; manual Hosted לפי S9-DEF-004.
- Dependencies/order: לפני S9-DEF-004; Waiver: N/A; Status: `Open`.

### S9-DEF-002 — החלטות זמן מתקבלות לפני serialization

- Type: `DATA_INTEGRITY`
- Severity: `P1`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: PRED-03/05, MATCH-06/07, LEAGUE-05; Slices 5,
  7b ו־lifecycle המתוכנן.
- Environment and pinned SHA: real local PostgreSQL multi-session + static,
  `a14edfc4…`.
- Affected roles/routes/tables: member prediction, Cron/system actor;
  `matches`, `predictions`, `sync_leases`, `sync_runs`.
- Preconditions/reproduction: match נקבע ל־`clock_timestamp()+4s`; session A
  נועל match 7s; session B מתחיל לפני kickoff וקורא `save_prediction`; אחרי
  השחרור הפונקציה מכניסה prediction בזמן wall שאחרי kickoff. התחלה
  `00:22:43.117793Z`, kickoff `00:22:46.746966Z`, commit wall
  `00:22:49.889954Z`, `committed_after_kickoff=true`.
- Expected: הכרעת deadline נלקחת אחרי row lock לפי wall-clock DB; cancellation
  אחרי kickoff קובעת latch; lease חדש מקבל כ־120s אחרי המתנה.
- Actual/evidence: `save_prediction` משתמש `now()` transaction-stable אחרי
  `FOR UPDATE`
  (`supabase/migrations/20260823190000_slice7b_api_football_sync.sql:237-250`). wrapper של cancellation מחשב
  `locksPredictions` ללא lock לפני helper שנועל ומאמין ל־boolean
  (`supabase/migrations/20260824090000_slice7b_review_hardening.sql:432-447`;
  helper `supabase/migrations/20260823190000_slice7b_api_football_sync.sql:832-907`).
  `claim_sports_sync` מאתחל `v_at := clock_timestamp()` לפני lock ה־lease
  (`supabase/migrations/20260824090000_slice7b_review_hardening.sql:198-236,328-346`).
- Impact/root cause: late prediction יכול להישמר; canceled-after-kickoff עלול
  להישאר ללא latch ואז future reactivation פותח predictions שכבר נחשפו;
  contender יכול לקבל lease מקוצר/פג או החלטת due ישנה. root cause משותף:
  time sample אינו חלק מה־critical section.
- Minimal fix boundary: forward-only migration; sample `clock_timestamp()` מיד
  אחרי lock בכל invariant, והעבר חישוב cancellation latch לתוך helper הנעול.
- Required changes: migration/functions, grants/comments/generated types אם
  signature משתנה, architecture/testing/security docs.
- Acceptance: no commit at/after kickoff גם אם transaction התחיל קודם;
  cancellation post-kickoff תמיד latches; reactivation אינה פותחת reveal;
  claim delayed across boundary judges fresh time and returns ~120s lease.
- Regression: שלושה pgTAP/dblink או harness רב־connection אמיתי, כולל hold/
  release across kickoff, cancellation+reactivation, due/cooldown/lease boundary;
  unit Promise יחיד אינו מספיק.
- Dependencies/order: ראשון ב־DB לפני lifecycle/sync fixes; Waiver: N/A;
  Status: `Open`.

### S9-DEF-003 — fallback ידני מלא למשחקים חסר

- Type: `BUG`
- Severity: `P1`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: MATCH-02/03/04, fallback non-negotiable; Slices
  4, 6, 7.
- Environment/SHA: static + local UI, `a14edfc4…`.
- Roles/routes/data: system admin, `/admin/matches`; `teams`, `matches`, results,
  audit log.
- Preconditions/reproduction: להשבית/לא לבחור API-Football ולנסות ליצור או
  לתקן teams/round/kickoff/status. UI/Action מאפשרים רק `finished`/`canceled`
  ותוצאה על match קיים.
- Expected: admin יכול להזין schedule ותוצאה מלאה, צרה ומבוקרת; Manual seed
  תמיד מאפשר demo.
- Actual/evidence: `src/features/scoring/actions.ts:21-71` ו־
  `src/features/scoring/components/manual-result-form.tsx:14-46` הם result-only;
  Manual provider הוא fixtures מוקלטים ב־
  `src/features/sports/provider-factory.ts:17-21` ו־
  `src/features/sports/fixtures.ts:18-78`; manual sync אינו משנה matches.
- Impact/root cause: outage/provider drift יכול לעצור core prediction league;
  partial manual override נחשב בטעות ל־Manual adapter מלא.
- Minimal fix boundary: system-admin workflow צר ליצירה/תיקון match/team/
  round/kickoff/status/result, לא generic DB editor ולא provider חדש.
- Required changes: schemas, Action/service, RPC אטומי ואודיט, UI, migration,
  RLS/grants/generated types, product/architecture/testing/runbook.
- Acceptance: create/correct/replay audited; Demo/API identities אינן מתמזגות
  בשם; ordinary user/anonymous denied opaquely; UTC/score/status validation;
  no browser provider call.
- Regression: Vitest validators; pgTAP AuthZ/atomicity/replay/audit/provider
  isolation; Playwright provider-outage/manual-demo path.
- Dependencies/order: אחרי S9-DEF-002 ולפני lifecycle completion; Waiver: N/A;
  Status: `Open`.

### S9-DEF-004 — Hosted confirmation/recovery אינו בר־הדגמה אמינה

- Type: `RELEASE_BLOCKER`
- Severity: `P1`; Confidence: `CONFIRMED` לגבי configuration/evidence gap;
  Release blocking: `Yes`.
- Affected requirements/slices: AUTH-01/02, COURSE-01/07/08, Slice 1.
- Environment/SHA: Hosted read-only config + docs, `a14edfc4…`.
- Roles/routes/data: evaluator/new user; signup, recovery, SMTP, redirects,
  templates, sessions. אין שימוש בחשבון אמיתי בביקורת.
- Preconditions/reproduction: dashboard מציג no custom SMTP, built-in sender
  team-address-only ושתי הודעות/שעה; current Preview callback אינו allowlisted;
  אין current evidence ל־delivery→session→update→reuse denial.
- Expected: arbitrary approved evaluator/test recipient יכול לאשר ולהשלים
  recovery באופן אמין, ללא credential committed וללא enumeration.
- Actual: בסיס יכול לשלוח best-effort רק לנמעני team; Hosted mutation נאסרה
  בצדק ללא disposable non-Production authorization. README עצמו מזהיר על
  best-effort. אין proof ל־old-password rejection או token reuse.
- Impact/root cause: registration/recovery — core course flow — עלול להיכשל
  בזמן demo. default SMTP אינו production contract.
- Minimal fix boundary: custom SMTP עם sender/domain בטוחים או חלופה מאושרת
  שמוכיחה arbitrary evaluator delivery; exact redirect/template/rate config;
  אין לפרסם password.
- Required changes: Hosted Auth/SMTP/redirect config, safe evidence/runbook,
  README/security/testing; אין secret ב־Git.
- Acceptance: authorized disposable Hosted E2E: request known+unknown with
  comparable handling, delivery, same-browser callback, session, password
  update, link reuse denied, logout, old password denied, new login success;
  429/cooldown actionable; current Preview/Production origins מדויקים.
- Regression: manual Hosted evidence + local Playwright/Mailpit; config
  screenshots/logs sanitized and tied to final SHA.
- Dependencies/order: S9-DEF-001 ו־014 קודם; Waiver: N/A; Status: `Open`.

### S9-DEF-005 — terminal league נשאר mutable דרך membership/proof

- Type: `DATA_INTEGRITY`
- Severity: `P1`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: JOIN-05/06/07/09/12/13, REPORT-02/05,
  architecture lifecycle read-only; Slices 3–4 ו־9.
- Environment/SHA: static SQL/UI, `a14edfc4…`.
- Roles/routes/tables: manager/applicant; proof upload, members decisions;
  `leagues`, `join_requests`, `payment_proofs`, `league_members`, `audit_logs`.
- Preconditions/reproduction: league מסומן `completed`/`archived` עם pending
  request. upload-context/rate/finalize/approve/reject אינם נועלים ובודקים
  terminal league; UI תמיד מציג פעולות pending.
- Expected: completed/archived הוא read-only; final member counts/standings אינם
  משתנים. policy מפורש קובע מה קורה ל־pending request בזמן completion.
- Actual/evidence: RPCs ב־
  `supabase/migrations/20260814231000_slice3_membership_and_proofs.sql:1087-1417`
  וב־
  `supabase/migrations/20260815143000_manager_join_request_decisions.sql:106-342`
  בודקים request/manager אך לא league status;
  `src/app/(app)/leagues/[leagueId]/members/page.tsx:73-87` וה־card מציגים
  actions; אין terminal negative pgTAP.
- Impact/root cause: אחרי S9 completion ניתן להחליף proof או לאשר/לדחות,
  לשנות membership/report final. lifecycle לא הורכב לתוך RPCs קודמים.
- Minimal fix boundary: lock order league→request; explicit status matrix עבור
  upload/decision; opaque error, audit/idempotency נשמרים.
- Required changes: forward migration/RPCs, UI disabled/read-only states,
  generated types אם נדרש, product decision/docs/tests.
- Acceptance: completed/archived reject all forbidden mutations atomically;
  double/concurrent completion+decision deterministic; pending policy מתועד;
  final report immutable.
- Regression: pgTAP manager/other/anonymous plus completion race; Playwright
  terminal members/proof UI; no direct DB fixture transition ב־flow הסופי.
- Dependencies/order: הכרעת S9-DEF-006 ואז לפני S9-REQ-001; Waiver: N/A;
  Status: `Open`.

### S9-DEF-006 — חוזה lifecycle אינו מוכרע

- Type: `DECISION_REQUIRED`
- Severity: `P1`; Confidence: `CONFIRMED`; Release blocking: `Requires explicit decision`
- Affected requirements/slices: LEAGUE-05, REPORT-05, Slice 9 lifecycle.
- Environment/SHA: canonical docs + schema/code, `a14edfc4…`.
- Roles/routes/tables: manager/system sync; league status, matches/scoring/audit.
- Preconditions/reproduction: product/architecture דורשים active לכל המאוחר
  ב־first kickoff; technical plan מתאר `startLeague` ידני בלבד. completion
  predicate אינו מגדיר canceled/postponed/live/AET/PEN/review/unknown. מקורות:
  `docs/product.md:190-198`, `docs/architecture.md:238-252`,
  `docs/technical-plan.md:610-625`.
- Expected: source state, actor, preconditions, automatic deadline guarantee,
  terminal predicate, correction policy, replay/concurrency/audit כולם חד־משמעיים.
- Actual: רק invite מעביר `draft→open`; אין product actions ל־active/completed,
  והמסמכים אינם פותרים manual-vs-first-kickoff או terminal exceptions.
- Impact/root cause: implementation שיבחר silently עלול להשאיר league open
  אחרי kickoff, לנעול מוקדם, להשלים עם unresolved match או להיתקע לנצח.
- Viable options: (A) transition אוטומטי מתוזמן/ב־sync; (B) effective state
  נגזר עם reconciliation persisted; (C) manager start + DB fallback אוטומטי
  ב־first kickoff. לכל אפשרות tradeoff של auditability, cron dependence ו־UX.
  אין בחירה בביקורת זו.
- Minimal fix boundary: החלטה מפורשת ועדכון product/architecture/technical plan
  לפני קוד; completion matrix כולל finished/canceled/postponed/review/correction.
- Required changes: canonical docs first; אחר כך S9-REQ-001 RPCs/Actions/tests.
- Acceptance: decision מאושר עם state machine/lock order/idempotency/audit;
  terminal predicate אינו מתעלם מ־unresolved ואינו נתקע על canceled; scoring
  reconciliation סופי מוגדר.
- Regression: pgTAP allowed/forbidden/replay/concurrent/first-kickoff/provider
  correction; Playwright `open→active/current→completed/final` דרך UI.
- Dependencies/order: לפני כל lifecycle implementation; Waiver: N/A;
  Status: `Decision required`.

### S9-DEF-007 — מסך הגדרות ליגה אינו משנה הגדרות

- Type: `BUG`
- Severity: `P2`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: LEAGUE-02/03/04/06, Slice 2.
- Environment/SHA: static + local UI, `a14edfc4…`.
- Roles/routes/data: manager, `/leagues/[leagueId]/settings`; league fields,
  joins, scoring/prizes.
- Preconditions/reproduction: לפתוח settings כמנהל. הדף מכיל invite בלבד;
  אין Action ל־edit, ו־create service מכריח `joins_close_at=null`.
- Expected: manager בלבד יכול לעדכן שדות מותרים, join close וחוקים לפני lock.
- Actual/evidence:
  `src/app/(app)/leagues/[leagueId]/settings/page.tsx:14-110`,
  `src/features/leagues/actions.ts:31-67`,
  `src/features/leagues/service.ts:21-24`; `updateLeagueSettings` מופיע בתכנית
  אך אינו קיים.
- Impact/root cause: דרישות שהוגדרו ביצירה אינן ניתנות לניהול והצטרפות לא ניתנת
  לסגירה לפי זמן. Slice 2 מסר create vertical בלבד בלי לסגור edit contract.
- Minimal fix boundary: manager-only explicit fields; no real payment; scoring/
  prizes atomic/versioned ונעולים לפי DB state.
- Required changes: schema/Action/service/RPC/migration/RLS/grants/types/UI/docs.
- Acceptance: valid pre-lock update; invalid 100%/negative/locked/foreign actor
  denied atomically; joins_close_at משפיע על request eligibility; opaque errors.
- Regression: Vitest schemas; pgTAP other-manager/active/locked/replay/concurrent;
  Playwright settings mobile/RTL/error/success.
- Dependencies/order: אחרי S9-DEF-006 ו־002; Waiver: none; Status: `Open`.

### S9-DEF-008 — אין פעולה להסרת manual override

- Type: `BUG`
- Severity: `P2`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: MATCH-05, Slices 6–7b.
- Environment/SHA: static + local admin UI, `a14edfc4…`.
- Roles/routes/tables: system admin `/admin/matches`; `matches`, scoring/audit.
- Preconditions/reproduction: להחיל result ידני ואז לנסות להחזיר ownership
  לספק. gateway תמיד שולח `p_is_manual_override=true`; אין control להסרה;
  sync מדלג לנצח.
- Expected: explicit, authorized, audited, idempotent clear ששומר תוצאה קיימת
  עד update ספק מאומת.
- Actual/evidence: `src/features/scoring/private-scoring-gateway.ts:29-43`,
  `src/app/(app)/admin/matches/page.tsx:92-107`, sync helper
  `supabase/migrations/20260823190000_slice7b_api_football_sync.sql:832-842`;
  provider false path דוחה override קיים.
- Impact/root cause: תיקון זמני הופך permanent ומונע correction אוטומטי.
- Minimal fix boundary: clear-specific RPC/Action; לא להוסיף generic status edit.
- Required changes: migration/RPC/audit, gateway/types/UI/docs.
- Acceptance: ordinary user denied; clear replay no duplicate audit; next valid
  provider apply resumes; current result אינו נמחק באמצע.
- Regression: pgTAP AuthZ/audit/replay/provider-resume/concurrency; Playwright
  confirmation and status copy.
- Dependencies/order: אחרי S9-DEF-002, לפני completion; Waiver: none;
  Status: `Open`.

### S9-DEF-009 — hard caps משמשים בטעות כשלמות נתונים והרשאה

- Type: `BUG`
- Severity: `P2`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: PRED-01/05, MATCH-03, JOIN-06, scale contract;
  Slices 4–6.
- Environment/SHA: static, `a14edfc4…`.
- Roles/routes/data: active member #201, system admin, manager; match detail,
  admin matches, members queue, dashboard.
- Preconditions/reproduction: (1) 201 active members: query לוקח 200 ואז בודק
  viewer בתוך הרשימה ולכן #201 מקבל not-found; (2) 201 matches: admin query
  מביא 201 ומכשיל את כל הדף; (3) 101 pending requests: RPC מחזיר רק 100 בלי
  next cursor; dashboard חותך 100 leagues.
- Expected: exact membership authorization אינה תלויה page; lists paginated
  באופן יציב, bounded ועם more-state.
- Actual/evidence: `src/features/predictions/queries.ts:14-18,349-380`;
  `src/features/scoring/queries.ts:10,53-63`; manager RPC
  `supabase/migrations/20260815143000_manager_join_request_decisions.sql:42-63`;
  `src/features/membership/queries.ts:175-185`;
  `src/features/leagues/queries.ts:43-89`.
- Impact/root cause: משתמש חוקי נחסם, fallback admin נעלם בדיוק כשהקטלוג גדל,
  ובקשה pending עלולה לא להיות ניתנת להחלטה. limit הוגדר כ־safety cap ואז
  שימש כראיית completeness.
- Minimal fix boundary: exact AuthZ query; keyset pagination/filter per resource;
  keep explicit server bounds.
- Required changes: queries/RPC/UI/types/index only if plan proves need/docs.
- Acceptance: member #201 authorized בלי disclosure; all 201+ matches reachable
  via season/status/round; request #101 reachable; stable cursor תחת concurrent
  decision; keyboard/mobile controls.
- Regression: unit query contracts; pgTAP 101/201 and cross-league denial;
  Playwright pagination/filter and empty/end states.
- Dependencies/order: יכול לרוץ אחרי P1 DB fixes; Waiver: none; Status: `Open`.

### S9-DEF-010 — targeted sync יכול להרעיב catalog/reconciliation

- Type: `DATA_INTEGRITY`
- Severity: `P2`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: MATCH-02/06/08, Slice 7b, scale/operations.
- Environment/SHA: static SQL, `a14edfc4…`.
- Roles/routes/tables: Cron/system actor; matches, rounds, lease/runs.
- Preconditions/reproduction: fixture scheduled/postponed עם latch נשאר eligible;
  כל דקה targeted נבחר לפני overdue catalog (12h) ו־reconciliation (6h).
  20 fixtures ישנים יכולים גם לדחוק live חדש.
- Expected: bounded eventual service לכל kind ו־live priority בלי שבירת backoff.
- Actual/evidence:
  `supabase/migrations/20260824090000_slice7b_review_hardening.sql:288-319`
  בוחר targeted ראשון ב־`elsif` chain, oldest kickoff, limit 20; local
  `EXPLAIN (ANALYZE, BUFFERS)` על 25 candidates החזיר 20 ב־0.035ms.
- Impact/root cause: catalog/status corrections יכולים לא להגיע לעולם; priority
  גלובלי אחד מערבב freshness עם fairness.
- Minimal fix boundary: due-aware fair selection/rotation; לא queue חיצוני.
- Required changes: forward migration/planner contract/docs/types אם code משתנה.
- Acceptance: catalog/reconciliation נבחרים בתוך bound מתועד גם עם targeted
  קבוע; live אינו נדחק על ידי >20 stale; genuine NOT_DUE לא יוצר row/call.
- Regression: deterministic pgTAP sequential claim/finalize עם כל kinds overdue,
  >20 stale + current live, quota/backoff/fencing assertions.
- Dependencies/order: אחרי S9-DEF-002; Waiver: none; Status: `Open`.

### S9-DEF-011 — `Retry-After` ארוך מסווג timeout ומאבד backoff

- Type: `BUG`
- Severity: `P2`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: MATCH-06, Slice 7b reliability.
- Environment/SHA: static + unit contract, `a14edfc4…`.
- Roles/routes/data: Cron/admin sync; provider error, lease backoff/quota.
- Preconditions/reproduction: בניסיון הראשון מתוך default three attempts
  מתקבל HTTP 429 עם `Retry-After: 45`/`120` או HTTP date. parser חותך ל־30;
  ה־wait שאינו נכנס ב־remaining 30s זורק `PROVIDER_TIMEOUT` לפני ניסיון שני
  ולפני terminal rate-limit result.
- Expected: no long sleep; return `PROVIDER_RATE_LIMITED` מיד עם durable bounded
  retry hint/quota, וה־DB מונע call נוסף.
- Actual/evidence:
  `src/features/sports/api-football-client.ts:207-225,291-306,368-391,435-447`;
  test קיים ב־`src/features/sports/api-football-client.test.ts:276-286` משתמש
  `maxAttempts:1` ולכן מפספס production path;
  DB backoff מופעל רק לקוד rate-limit.
- Impact/root cause: quota protection נכשל ו־operator רואה timeout שגוי; error
  classification מתרחש אחרי wait-budget במקום לפניו.
- Minimal fix boundary: preserve classification/metadata, no infrastructure/new
  dependency.
- Required changes: client error type/retry logic/orchestrator/finalizer tests/docs.
- Acceptance: integer 45/120/date מחזירים rate-limited בלי sleep ארוך; hint
  durable נבדק כשלם לא־שלילי ונחסם לחוזה DB `0..3600`; quota metadata של 429
  תקין/לא־שלילי ונישא בלי raw headers ומתקבלת החלטה מפורשת אם הוא נשמר;
  short delay יכול retry/succeed; forced/scheduled claim מכבדים DB backoff.
- Regression: Vitest default attempt paths + orchestrator; pgTAP backoff/finalize;
  no live provider call.
- Dependencies/order: לפני Hosted Cron slow-path; Waiver: none; Status: `Open`.

### S9-DEF-012 — Cron timeout קצר מ־budget חוקי של האפליקציה

- Type: `BUG`
- Severity: `P2`; Confidence: `CONFIRMED` configuration mismatch;
  Release blocking: `Yes`.
- Affected requirements/slices: MATCH-06, deployment/operations Slice 7b.
- Environment/SHA: Hosted read-only dashboard + code, `a14edfc4…`.
- Roles/routes/data: scheduled Cron `/api/cron/sync`, lease/finalization.
- Preconditions/reproduction: outer `pg_net timeout_milliseconds=10000`; client
  יכול לצרוך 30s בשלושה attempts, lease 120s. normal 200 logs אינם slow proof.
- Expected: outer timeout > measured app worst case + margin, < lease/function
  limit, או app budget נמוך ומוכח; finalize exactly once.
- Actual/evidence: job יחיד כל דקה ל־Production;
  `src/features/sports/api-football-client.ts:291-306`; lease 120s מוגדר ב־
  `supabase/migrations/20260823190000_slice7b_api_football_sync.sql:293-465`.
  שם ה־job הוא `predictor-slice7-manual-sync` אף שהספק API-Football.
- Impact/root cause: `pg_net` יכול לסיים את חלון התצפית שלו לפני Route חוקי
  של 30s. לא הוכח אם Vercel ממשיך או נעצר אחרי disconnect ולא הוכח lease
  expiry; הצלחת pg_cron מוכיחה enqueue בלבד, לא completion/finalization.
- Minimal fix boundary: align numbers and rename job provider-neutrally; לא לשנות
  Hosted במהלך audit.
- Required changes: controlled Supabase Cron config, runbook/docs, slow fake test.
- Acceptance: controlled slow response completes/fails and finalizes once; timeout
  עם margin ומתחת ל־lease ול־Vercel max duration המאומת; ראיית response של
  `pg_net` מקושרת לאותה שורת `sync_runs` terminal יחידה ול־lease משוחרר;
  sanitized scheduled Hosted evidence after deploy.
- Regression: Vitest fake transport/route + pgTAP fencing/expiry; manual Hosted.
- Dependencies/order: אחרי S9-DEF-011/002; Waiver: none; Status: `Open`.

### S9-DEF-013 — ספר הפרויקט derived סותר את המקור הקנוני

- Type: `DOC_CONFLICT`
- Severity: `P2`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: COURSE-02/05/09, Slice 8/9 documentation.
- Environment/SHA: DOCX extraction + Word PDF render 4/4, `a14edfc4…`.
- Roles/routes/data: evaluator; `docs/project-book.docx`.
- Preconditions/reproduction: לפתוח/render את המסמך. הוא מציין Slice 8 next,
  460 unit/20 Playwright, report של חלוקת פרסים/financial-like Demo reports,
  timeline 28–29 באוגוסט ו־footer v1.1/24.8.
- Expected: derived book משקף Slice 8 non-financial complete, 489/646/22,
  Slice 9 next, current date/version ופריסה קריאה.
- Actual/evidence: extraction 48 paragraphs/2 tables; render 4 pages מצא crowding/
  overlap בעמוד 2 ועמוד 3 כמעט ריק. אין generator workflow קנוני. המסמך לא
  שונה בביקורת כדי לא להשחית binary.
- Impact/root cause: evaluator יקבל סיפור מוצר/בדיקות שגוי; binary עודכן ידנית
  בלי source/template deterministic.
- Minimal fix boundary: synchronize from finalized canonical Markdown בעזרת
  workflow מתועד; אין לשכתב היסטוריית evidence.
- Required changes: DOCX, generator/update instructions/assets, render evidence.
- Acceptance: כל עמוד rendered ונבדק RTL/tables/header/footer/no clipping; אין
  “Slice 8 next”, 460/20, AI/finance; counts rerun and links work.
- Regression: document render-and-verify 4/4 או מספר העמודים החדש + text drift
  checklist; manual evaluator read.
- Dependencies/order: אחרי fixes/docs final ולפני rehearsal; Waiver: none;
  Status: `Open`.

### S9-DEF-014 — Redirect allowlist ו־README אינם מתארים את Preview הנוכחי

- Type: `DOC_CONFLICT`
- Severity: `P2`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: AUTH-01/02/05, COURSE-08, Slices 1/7c.
- Environment/SHA: README/code + Hosted Auth/Vercel read-only, `a14edfc4…`.
- Roles/routes/data: new/recovery user on Preview/Production; callback URL.
- Preconditions/reproduction: להשוות `README.md:340-353`, Vercel aliases ו־
  Supabase Redirect URLs. Hosted כולל local, old Slice1, Production ו־old
  Slice3 wildcard; README מזכיר old Slice1/3/5 ו־Slice7c באופן אחר; current
  Preview origin ש־Action בוחר אינו exact allowlisted.
- Expected: Site URL + exact local/current Preview/Production callbacks, ללא
  obsolete wildcard/aliases, tie ל־SHA ו־flow evidence.
- Actual: drift בין שלושה מקורות ו־Preview Auth עלול להידחות.
- Impact/root cause: stale per-slice aliases נשארו אחרי merges ו־README עודכן
  חלקית; confirmation/recovery Preview אינו אמין.
- Minimal fix boundary: לבחור current stable Preview policy וליישר config/docs;
  לא להרחיב wildcard ללא צורך.
- Required changes: Supabase Auth URLs, README, Vercel alias/env documentation,
  sanitized evidence.
- Acceptance: local/Preview/Production signup+recovery callback עוברים; obsolete
  entries נמחקים/מנומקים; redirects exact and no open redirect.
- Regression: Auth unit/Playwright + manual current Preview/Production proof.
- Dependencies/order: לפני S9-DEF-004; Waiver: none; Status: `Open`.

### S9-DEF-015 — שמות לא־מהימנים מאפשרים bidi spoofing ואינם מבודדים

- Type: `SECURITY`
- Severity: `P2`; Confidence: `CONFIRMED` code-level; Release blocking: `Yes`
- Affected requirements/slices: RTL/accessibility, validation/security, all UI.
- Environment/SHA: static + viewport review, `a14edfc4…`.
- Roles/routes/data: כל user; display/league names ב־dashboard, standings,
  reports, members, וכן competition/round/team strings שמקורן בספק.
- Preconditions/reproduction: להזין mixed Hebrew/Latin או RLO/isolate controls.
  schemas מאפשרים bidi formatting controls ורכיבים מציגים ללא `<bdi>`.
- Expected: dangerous embedding/override controls rejected at app+DB; untrusted
  text isolated `dir=auto` כך ש־rank/score/status שכנים אינם משנים משמעות.
- Actual/evidence: `src/features/auth/schemas.ts:14-22`,
  `src/features/leagues/schemas.ts:87-93`; provider sanitizer ב־
  `src/features/sports/api-football-provider.ts:81-90` מסיר C0/DEL אך לא bidi
  controls; unisolated `src/app/(app)/dashboard/page.tsx:33-35`,
  `src/app/(app)/leagues/[leagueId]/standings/page.tsx:118-120,206-209`,
  `src/app/(app)/leagues/[leagueId]/reports/page.tsx:207-209,286-289`,
  `src/features/membership/components/manager-join-request-card.tsx:59-60`;
  team names במסכים מסוימים כן משתמשים `<bdi>`.
- Impact/root cause: UI spoofing/ordering ambiguity ונזק RTL. validation מטפל
  ב־C0/C1 אבל לא ב־Unicode directional controls, והבידוד אינו reusable.
- Minimal fix boundary: shared explicit display component/pattern + validators/
  DB constraint forward-only; לא למחוק לגיטימית Latin/Hebrew mixed text.
- Required changes: schemas/components/migration אם constraint, docs/tests.
- Acceptance: long/mixed Hebrew/Latin תקינים; RLO/LRE/RLI/PDI dangerous cases
  rejected או neutralized; home/right/ranks/badges נשארים יציבים בכל widths.
- Regression: Vitest unicode validators; pgTAP DB constraint; Playwright visual/
  DOM bidi cases and accessibility names.
- Dependencies/order: independent אחרי P1; Waiver: none; Status: `Open`.

### S9-DEF-016 — skip link ב־invite מחובר מצביע ליעד חסר

- Type: `BUG`
- Severity: `P2`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: JOIN-10, accessibility keyboard, Slice 3/7c.
- Environment/SHA: static + local invalid route/E2E valid flow, `a14edfc4…`.
- Roles/routes/data: authenticated invite user, `/invite/[publicId]`.
- Preconditions/reproduction: valid invite כשהמשתמש מחובר. `AppHeader` מציג
  `href="#main-content"`, אך `<main>` של route חסר id.
- Expected: skip activation מעביר focus ל־main יחיד ונראה.
- Actual/evidence: `src/features/auth/components/app-header.tsx:8-13`; app layout
  הרגיל מספק target, אך `src/app/invite/[publicId]/page.tsx:235-240` עוקף
  אותו. אין keyboard assertion.
- Impact/root cause: keyboard/screen-reader user אינו יכול לדלג navigation;
  route ציבורי/מחובר בנה shell ידנית.
- Minimal fix boundary: exactly one focusable main target; no shell duplication.
- Required changes: invite page/layout and Playwright accessibility test.
- Acceptance: Tab→skip→Enter lands focus on main; guest/auth variants; no
  duplicate IDs and focus visible/not obscured.
- Regression: Playwright keyboard valid/expired invite at mobile/desktop.
- Dependencies/order: יכול לרוץ במקביל; Waiver: none; Status: `Open`.

### S9-DEF-017 — אין אכיפה מוכחת של required checks על `main`

- Type: `RELEASE_BLOCKER`
- Severity: `P2`; Confidence: `CONFIRMED` plan limitation; Release blocking: `Yes unless explicitly waived`
- Affected requirements/slices: internal release governance, all slices.
- Environment/SHA: GitHub API read-only, `a14edfc4…`.
- Roles/routes/data: repository maintainers, PR merge path.
- Preconditions/reproduction: branch-protection ו־ruleset endpoints מחזירים 403
  עם הודעת private-repo plan limitation; green CI קיים אך אינו מוכיח enforcement.
- Expected: `main` דורש quality/DB/E2E ו־no direct unreviewed merge, או חלופה
  מתועדת ומאושרת שמספקת אותה הגנה.
- Actual: אין יכולת לאמת/להפעיל protection בתכנית הנוכחית.
- Impact/root cause: אפשר לעקוף checks ולמזג SHA שלא נבדק; feature תלוי GitHub
  plan, לא בקוד.
- Minimal fix boundary/options: להפוך public אם מותר, לשדרג plan, או owner-approved
  manual release control/waiver עם evidence. הביקורת אינה בוחרת.
- Required changes: GitHub setting או release policy/docs; no runtime change.
- Acceptance: API/setting proof של required checks על final branches, או waiver
  חתום עם owner/date/mitigation/revisit deadline.
- Regression/evidence: negative merge attempt או screenshot/API sanitized;
  final PR checks on exact SHA.
- Dependencies/order: לפני final merge; Waiver owner currently `None`;
  Status: `Open`.

### S9-DEF-018 — `FORCE_COOLDOWN` חוקי ב־DB אך נדחה ב־TypeScript

- Type: `BUG`
- Severity: `P3`; Confidence: `CONFIRMED`; Release blocking: `No, tracked`
- Affected requirements/slices: MATCH-06, Slice 7b operator UX.
- Environment/SHA: static DB/code/tests, `a14edfc4…`.
- Affected roles/routes/data: system admin `/admin/sync`; claim result.
- Preconditions/reproduction: forced sync בתוך דקה. RPC מחזיר
  `NOT_DUE/FORCE_COOLDOWN`, ו־pgTAP מוכיח זאת; gateway schema/types אינם כוללים
  code ולכן UI ממפה `SYNC_UNAVAILABLE`.
- Expected/actual: skip ניטרלי, no provider/no row, עם copy cooldown; בפועל
  generic failure. Evidence:
  `supabase/migrations/20260824090000_slice7b_review_hardening.sql:278-285`,
  `supabase/tests/sync-api-football.test.sql:1061-1077`,
  `src/features/sync/private-sync-gateway.ts:53-67,96-139`,
  `src/features/sync/types.ts:46-80`.
- Impact/root cause: operator מקבל failure שגוי; DB ו־TS union drifted.
- Minimal fix boundary: schema/types/display בלבד.
- Required migration/RLS/grant/config/doc changes: `N/A` migration/RLS/grant;
  TypeScript contract, copy ו־tests בלבד.
- Acceptance: real RPC row parses; Action/route returns skipped; no provider/run.
- Regression: unit + real RPC integration assertions ל־`FORCE_COOLDOWN`.
- Dependencies/order: אחרי S9-DEF-002; Waiver: N/A; Status: `Open`.

### S9-DEF-019 — error taxonomy של sync אינו מבחין בין שלבי הכשל

- Type: `BUG`
- Severity: `P3`; Confidence: `CONFIRMED`; Release blocking: `No, tracked`
- Affected requirements/slices: MATCH-06, observability Slice 7b.
- Environment/SHA: static/unit, `a14edfc4…`.
- Affected roles/routes/data: system admin/Cron; safe error code/counters.
- Preconditions/reproduction: planner contract error מסווג provider unavailable;
  failure של success-finalizer מסווג apply failed. catch אחד עוטף fetch/planning/
  apply/finalize.
- Expected: stage-specific stable safe codes ללא raw payload/SQL/stack; actual
  evidence: `src/features/sports/sync-planner.ts:83-145`,
  `src/features/sports/api-football-provider.ts:308-312`,
  `src/features/sync/orchestrator.ts:57-69,100-140`; tests אינם מכסים
  planner/finalizer.
- Impact/root cause: runbook/operator מטפלים בגורם הלא נכון; generic `Error`/
  catch boundary רחב.
- Minimal fix boundary: typed stage errors and safe finalizer contract; no new
  logging service.
- Required migration/RLS/grant/config/doc changes: `N/A` unless persisted code
  contract changes; otherwise forward migration + generated types; runbook copy.
- Acceptance: provider/planner/apply/finalize codes נפרדים והחלטת safe counters.
- Regression: Vitest לכל stage + secret/PII absence.
- Dependencies/order: אחרי P2 sync fixes; Waiver: N/A; Status: `Open`.

### S9-DEF-020 — invite unavailable מאבד escape למשתמש מחובר

- Type: `BUG`
- Severity: `P3`; Confidence: `CONFIRMED`; Release blocking: `No, tracked`
- Affected requirements/slices: JOIN-02/10, UX Slice 3.
- Environment/SHA: local visual/static/E2E, `a14edfc4…`.
- Roles/routes: signed-in user on malformed/expired/revoked invite.
- Preconditions/reproduction: error path returns `UnavailableInvite` לפני shell;
  יש רק link `/` ואין header/logout/dashboard.
- Expected: guest נשאר opaque; authenticated user מקבל app header/logout או
  dashboard escape. Actual: `src/app/invite/[publicId]/page.tsx:217-230`,
  `src/features/membership/components/unavailable-invite.tsx:3-24`; screenshot
  מקומי אימת.
- Impact/root cause: historical navigation trap חלקי; early return עוקף shell.
- Minimal fix boundary: auth-aware unavailable shell, no resource disclosure.
- Required migration/RLS/grant/config/doc changes: `N/A`; component/E2E בלבד.
- Acceptance: guest נשאר opaque; auth מקבל logout/dashboard רק כשמתאים.
- Regression: Playwright guest/auth expired/revoked/malformed keyboard cases.
- Dependencies/order: לצד S9-DEF-016; Waiver: N/A; Status: `Open`.

### S9-DEF-021 — חוזה `/members` סותר את גבול ההסרה/reactivation

- Type: `DOC_CONFLICT`
- Severity: `P3`; Confidence: `CONFIRMED`; Release blocking: `No, tracked`
- Affected requirements/slices: page map/member lifecycle, Slice 4/9.
- Environment/SHA: canonical docs + UI, `a14edfc4…`.
- Affected roles/routes/data: manager/member, `/members`.
- Preconditions/reproduction: product page map אומר requests+members+proofs;
  technical table מזכיר activation/removal, אך approved boundary דוחה general
  removal/reactivation; UI מציג queue בלבד. מקורות: `docs/product.md:305-318`,
  `docs/technical-plan.md:16-20,610-625`.
- Expected: הכרעה מפורשת אם active-member list הוא MVP ומה deferred. Actual:
  `docs/product.md` page map מול `docs/technical-plan.md` boundary.
- Impact/root cause: implementation עלול להרחיב scope או להשאיר deliverable חסר.
- Minimal fix boundary: reconcile canonical docs first; אין להוסיף removal בלי
  approval.
- Required migration/RLS/grant/config/doc changes: docs בלבד אם list deferred;
  אם נדרש list — query/UI/RLS tests, ללא removal mutation אוטומטי.
- Acceptance: page contract מדויק; removal נשאר future אם זו ההכרעה.
- Regression: אם list required — privacy/pagination/cross-league tests; אחרת link/
  contract review.
- Dependencies/order: החלטה לפני final docs; Waiver: N/A; Status: `Open`.

### S9-DEF-022 — פערי נגישות קטנים ב־loading/forms/targets

- Type: `BUG`
- Severity: `P3`; Confidence: `CONFIRMED` לשני subcases; Release blocking: `No, tracked`
- Affected requirements/slices: accessibility/RTL, Slices 3/7c.
- Environment/SHA: static + visual, `a14edfc4…`.
- Affected routes: admin loading, manager rejection; control touch-size manual gate.
- Preconditions/reproduction: loading skeletons admin חסרים `aria-busy`/label;
  reject textarea error אינו ב־`aria-describedby` ואין `aria-invalid`.
- Expected/actual evidence: `src/app/(app)/admin/matches/loading.tsx:1-13`,
  `src/app/(app)/admin/sync/loading.tsx:1-16`,
  `src/features/membership/components/manager-join-request-card.tsx:113-133`.
  reduced-motion CSS מונע motion מוגזם אך לא מחליף announcement.
- Impact/root cause: assistive tech אינו מקבל status/error relation; components
  נבנו חזותית בלי semantic state מלא.
- Minimal fix boundary: semantic busy/status/error wiring; verify 44px controls,
  contrast/focus at native 200%.
- Required migration/RLS/grant/config/doc changes: `N/A`; components/tests/docs.
- Acceptance: no duplicate live announcements; error focus/description; loading
  named.
- Regression: manual keyboard/contrast/touch/native-200% + Playwright smoke.
- Dependencies/order: S9-REQ-005; Waiver: N/A; Status: `Open`.

### S9-DEF-023 — קישור מקור הקורס אינו זמין ב־repository

- Type: `DOC_CONFLICT`
- Severity: `P3`; Confidence: `CONFIRMED`; Release blocking: `No, tracked`
- Affected requirements/slices: documentation provenance, all slices.
- Environment/SHA: docs + external PDF, `a14edfc4…`.
- Affected data: `docs/product.md:3-12,391-397` header/source link.
- Preconditions/reproduction: ב־SHA המקובע header היה "approved to begin
  implementation" אף ש־Slice 8 complete; הוא תוקן מכנית ב־PR זה לגרסה 2.11/
  26.8/Slices 0–8 complete. link ל־`project_sources/01-Internet-Technologies.pdf`
  עדיין אינו tracked.
- Expected: current status ו־delivery/source provenance תקין בלי לשכפל או לערוך
  PDF שלא אושר ל־repo. Actual open: link החסר ב־`product.md` section 17.
- Impact/root cause: evaluator/agent עלול להסיק שלב שגוי או לא למצוא source.
- Minimal fix boundary: mechanical link only after deciding whether course PDF
  may be tracked or referenced externally; status header כבר תוקן ב־PR זה.
- Required migration/RLS/grant/config/doc changes: `N/A`; docs/provenance בלבד.
- Acceptance: source link opens for evaluator; no course text rewrite.
- Regression: link/date/version checker + manual evaluator open.
- Dependencies/order: final docs; Waiver: N/A; Status: `Open`.

### S9-DEF-024 — full E2E ירוק משאיר server error לא מוסבר

- Type: `BUG`
- Severity: `P3`; Confidence: `PROBABLE`; Release blocking: `No, tracked`
- Affected requirements/slices: test determinism/release evidence.
- Environment/SHA: fresh `npm run verify`, `a14edfc4…`.
- Affected data: Playwright web server lifecycle/logging.
- Preconditions/reproduction: `npm run verify`; אחרי prediction-lock הופיע פעמיים
  `[WebServer] Error: The destination stream closed early`, וכל 22 tests עברו.
- Expected: green run ללא error, או shutdown noise מזוהה/מסונן רק בשורש.
- Actual/impact: error אמיתי עלול להיבלע תחת success ולהחליש signal. root cause
  טרם אומת ולכן confidence `PROBABLE`, לא טענת runtime regression.
- Minimal fix boundary: reproduce narrow with traces/server stderr; לתקן lifecycle/
  response abort או לסווג expected shutdown במקור, לא להשתיק broadly.
- Required migration/RLS/grant/config/doc changes: `N/A`; test harness/runtime
  source לפי root cause, ו־testing docs אם expected.
- Acceptance: שלוש ריצות clean ללא unexpected error; אם expected, comment ו־
  exact filter בלבד.
- Regression: narrow Playwright repetition; artifacts נקיים מסודות.
- Dependencies/order: final verification; Waiver: N/A; Status: `Open`.

### S9-DEF-025 — production sports credential זמין ל־Preview שאינו משתמש בו

- Type: `SECURITY`
- Severity: `P3`; Confidence: `CONFIRMED` scope; Release blocking: `No, tracked decision`
- Affected requirements/slices: least privilege, Slice 7b deployment.
- Environment/SHA: Vercel env names/scopes read-only, `a14edfc4…`.
- Affected roles/data: Preview deployments; `SPORTS_API_KEY` (value not read).
- Preconditions/reproduction: Vercel environment settings מציגים
  `SPORTS_API_KEY` ב־Production+Preview, אך `SPORTS_API_PROVIDER` Production-only
  ולכן Preview defaults Manual; values לא נקראו.
- Expected: unused production credential אינו מוזרק ל־Preview, או policy מבודדת
  עם key low-quota נפרד. Actual: scope רחב מהצורך.
- Impact/root cause: Preview code/PR compromise יכול לקרוא credential production;
  env scopes drifted after provider selection.
- Minimal fix boundary/options: Production-only key; או trusted-preview canary
  policy + separate constrained credential. אין בחירה שקטה.
- Required migration/RLS/grant/config/doc changes: `N/A`; Vercel env scope +
  deployment/security docs בלבד.
- Acceptance: scope screenshot sanitized, Preview manual tests green, no value/
  log/browser bundle.
- Regression: final env-name/scope matrix + client-secret scan.
- Dependencies/order: final env review; Waiver: owner/date required if retained;
  Status: `Decision required`.

## 11. דרישות Slice 9 שעדיין חסרות

אלה עבודות מתוכננות/מסמכי הגשה, לא regressions של Slice שכבר נמסר.

### S9-REQ-001 — מימוש lifecycle מלא דרך המוצר

- Type: `RELEASE_BLOCKER`; Severity: `P1`; Confidence: `CONFIRMED` missing;
  Release blocking: `Yes`.
- Source/affected requirements: Slice 9 planned scope, LEAGUE-05, REPORT-05,
  COURSE-01; `open→active→completed`.
- Environment/SHA/roles/data: `a14edfc4…`; manager, system sync, members;
  leagues/matches/predictions/scoring/audit.
- Preconditions/evidence: אין `startLeague`/`completeLeague` Action/RPC/UI;
  report E2E משתמש fixture DB להדגמת final בלבד.
- Expected/actual: product path אטומי/authorized/idempotent עם audit; בפועל
  transitions אינם קיימים. זה planned Slice 9, ולכן אינו `BUG`.
- Minimal boundary: לאחר S9-DEF-006/002 ואחרי DEF-003/005/008, Server Actions
  צרים + services + forward RPCs; no generic status update.
- Required changes: product/architecture decision, migration/RLS/grants/types,
  Actions/UI/docs/audit.
- Acceptance: source/preconditions/actor/lock order/replay/concurrency מוגדרים;
  scoring rules locked; terminal predicate + final reconciliation; opaque
  cross-user denial; E2E `open→active/current→completed/final` ללא DB mutation.
- Regression: Vitest state rules; real multi-session pgTAP; Playwright full flow;
  Hosted/manual proof after deploy.
- Dependencies/order:
  `DEF-006→DEF-002→{DEF-003,DEF-005,DEF-008}→REQ-001`; שלושת הפריטים בסוגריים
  מקבילים. Waiver: N/A; Status: `Open`.

### S9-REQ-002 — מצגת, demo script וחזרה של 10–15 דקות

- Type: `RELEASE_BLOCKER`; Severity: `P1`; Confidence: `CONFIRMED` missing;
  Release blocking: `Yes`.
- Source: course PDF pages 7–9, technical plan section 19.
- Environment/SHA/roles/data: evaluator/student; final deck, demo script,
  rehearsal log ו־fallback assets ב־`a14edfc4…`.
- Preconditions/reproduction: `rg --files` ומלאי docs אינם מכילים tracked
  `presentation/`, approved link או deterministic demo script.
- Expected: deck מכסה product/value, architecture/DB, flows, tests, scale,
  security, future; demo deterministic ומותאם 10–15 דקות.
- Actual/root cause: אין artifact/rehearsal timing/evaluator credential delivery
  plan; זוהי דרישת Slice 9 מתוכננת שטרם התחילה, לא regression.
- Minimal fix boundary: deck או approved link, script, timing log, fallback
  screenshots ו־safe local/Hosted access; no generated claims/credentials.
- Required migration/RLS/grant/config/doc changes: `N/A` migration/RLS/grant;
  presentation/demo artifacts + evaluator runbook בלבד.
- Acceptance: rehearsal מלא בין 10–15 דקות; כל link עובד; presenter מסוגל
  להסביר components/libraries/security/tradeoffs; outage fallback; no real money/
  AI/password in Git.
- Regression/verification: manual timed rehearsal + evaluator checklist on final
  SHA; outage fallback ו־link check.
- Dependencies/order: אחרי core fixes/docs, לפני final audit; Waiver: N/A;
  Status: `Open`.

### S9-REQ-003 — ראיית הגשה סופית וגישת evaluator

- Type: `RELEASE_BLOCKER`; Severity: `P1`; Confidence: `CONFIRMED` future gate;
  Release blocking: `Yes`.
- Source: COURSE-03/08 + internal incognito/repository-access checks.
- Environment/SHA/roles: final Preview/Production/GitHub, evaluator.
- Preconditions/reproduction/evidence: base deployment exact SHA/HTTP 200;
  evaluator identity אינה ידועה ו־final Slice 9 SHA טרם קיים מטבעו.
- Expected: CI, migrations/types, Preview ו־Production מצביעים לאותו final SHA;
  public URL incognito; evaluator GitHub access; safe demo instructions.
- Actual/root cause: base מוכח, אך final deployment/repository-access proof חסרים
  כי Slice 9 טרם מומש; planned gate, לא bug.
- Minimal fix boundary: deployment/evidence only לאחר fixes; אין credentials
  committed.
- Required migration/RLS/grant/config/doc changes: `N/A` נוסף מעבר לתיקוני
  findings; deployment settings, access approval ו־delivery docs.
- Acceptance: immutable Vercel URL + alias both final SHA; current Preview smoke;
  Production 200/Demo-only; exact env-name matrix; Hosted migration parity;
  evaluator מאשר repo access; no deployment protection/team login.
- Regression/verification: GitHub/Vercel/Supabase read-only screenshots/API links
  + incognito manual on final SHA.
- Dependencies/order: אחרון לפני final audit; Waiver: N/A; Status: `Open`.

### S9-REQ-004 — חבילת מסמכי הגשה מסונכרנת

- Type: `RELEASE_BLOCKER`; Severity: `P2`; Confidence: `CONFIRMED` planned;
  Release blocking: `Yes unless explicitly waived`.
- Source: course PDF + Slice 9 plan; README, testing, security, scale, project book.
- Environment/SHA/roles/data: evaluator/maintainer; current docs inspected;
  drift defects 013/014/021/023.
- Preconditions/reproduction: full text/link inventory + DOCX 4/4 render מפיקים
  את ה־drift המתועד ברשומות אלה.
- Expected: one consistent current status/date/version, setup/env/deploy URLs,
  architecture/DB/flows/tests/scale/security/residual risks and project book.
- Actual: canonical supporting docs mostly current אך derived book/redirect/source/
  members scope drifted; safe evaluator/demo instructions חסרים.
- Impact/root cause: evaluator עלול לקבל counts/status/setup סותרים; derived
  artifacts והגדרות Hosted לא סונכרנו במחזור אחד.
- Minimal boundary: correct only approved facts; synchronize DOCX deterministically;
  preserve historical POC SHA and no rubric invention.
- Acceptance: all internal/external links checked; counts freshly rerun; no Slice
  8 next/Slice 10/runtime AI/financial report; clean-clone instructions repeated;
  page render inspected; secrets absent.
- Required migration/RLS/grant/config/doc changes: `N/A` DB; README/docs/DOCX/
  source-provenance + deterministic render instructions.
- Regression/verification: link checker/manual, document render,
  `git diff --check`, full staged allowlist review.
- Dependencies/order: אחרי decisions/fixes, לפני REQ-002/003; Waiver: none;
  Status: `Open`.

### S9-REQ-005 — hardening וראיית בדיקה סופית

- Type: `RELEASE_BLOCKER`; Severity: `P2`; Confidence: `CONFIRMED` planned;
  Release blocking: `Yes unless explicitly waived`.
- Source: Slice 9 plan, internal release standard, WCAG/OWASP/official checklists.
- Environment/SHA/roles/data: maintainers/evaluator; local/Hosted/manual final
  candidate, כל routes/tables/config.
- Preconditions/reproduction/current evidence: verify/advisors/plans/viewports
  עברו על base, אך regressions
  של findings, scale shape מייצג, native 200%, contrast/keyboard מלא ו־Hosted
  post-fix evidence חסרים.
- Expected/actual/root cause: final candidate אחד מוכח end-to-end; בפועל קיים
  רק base audit לפני fixes ולכן gate מתוכנן פתוח.
- Minimal boundary: fix register בלבד, בלי dependency/infrastructure לא מוכחים.
- Acceptance: zero open P0/P1 and no unwaived P2; every advisor item disposition;
  representative hundreds-user plans; exact authz negative לכל שינוי; all
  multi-session/scoring/state cases; 360–1440 + native 200% + keyboard/contrast/
  touch; `npm run verify`, lint DB, type parity, audit, clean clone all green.
- Required evidence: command logs/counts/durations, Playwright artifacts sanitized,
  Preview/Production manual gates, accepted-risk owner/date/trigger.
- Required migration/RLS/grant/config/doc changes: לפי כל finding בלבד; כל Advisor
  מקבל add/no-add/waive disposition, אין שינוי schema עיוור.
- Regression: full canonical verify פעם אחת + targeted reruns לפי failure;
  real multi-session, clean clone, Hosted/manual matrix על exact final SHA.
- Dependencies/order: אחרי כל fixes, לפני REQ-003; Waiver: none; Status: `Open`.

## 12. בדיקה מחדש של regressions היסטוריים

| יעד היסטורי | מצב 26.8.2026 | ראיה/finding |
| --- | --- | --- |
| Hosted recovery/rate limit | Open | no SMTP, 2/hour/team-only; DEF-001/004 |
| callback→session→update→logout→new login | Open evidence gap | local flow קיים אך reuse/old-password/Hosted חסרים; DEF-001/004 |
| checkbox hover מפעיל spinner לא קשור | `VERIFIED RESOLVED` | אין `group-hover`/spinner ב־league form; reduced-motion global |
| invite ללא logout/navigation | Open חלקי | valid authenticated E2E מכיל header; unavailable עדיין חסר escape, DEF-020 |
| manager review wording | `VERIFIED RESOLVED` | `membership/display.ts` ו־card אומרים בדיקת מנהל, לא verified receipt |
| Slice 5 DB-lock at deadline | Open/reproduced | late commit אמיתי, DEF-002 |
| canceled-before-kickoff privacy | static/tests resolved, race open | pgTAP מכסה early cancel; cancellation-latch race DEF-002 |
| manual start vs first kickoff | Open decision | DEF-006 |
| completion terminal statuses | Open decision | DEF-006/REQ-001 |
| stale technical/product/testing status | `VERIFIED RESOLVED` | technical/testing היו current; product header תוקן מכנית ב־PR audit |
| project book Slice 8/old counts/finance | Open | rendered/extracted, DEF-013 |
| README aliases/deployment SHA | חלקי | deployment SHA verified; redirects DEF-014 |
| `main` protection | BLOCKED/open | GitHub plan 403, DEF-017 |
| PR #9 Slice 10 | `VERIFIED HISTORICAL` | open/non-draft/DIRTY; לא מוזג; SMTP migrated independently |
| Hosted demo password ב־Git | `VERIFIED RESOLVED` | scoped scan לא מצא credential; instructions עדיין REQ-002/003 |

## 13. שערים חסומים/ידניים

| שער | מדוע אינו PASS עכשיו | תנאי סגירה |
| --- | --- | --- |
| Hosted signup/recovery | mutation/email אסורים ללא disposable authorization; config לא אמין | DEF-004 acceptance |
| current Preview private Auth | redirect חסר ו־smoke ציבורי בלבד | DEF-014 + Preview E2E |
| Cron slow path | שינוי Hosted/provider call אסור בביקורת | DEF-011/012 fake + sanitized Hosted run |
| final deployment SHA | Slice 9 טרם מומש | REQ-003 |
| evaluator private GitHub access | זהות evaluator לא ידועה | evaluator confirmation out-of-band |
| branch protection | GitHub plan limitation | DEF-017 option/waiver |
| native 200%/contrast/full keyboard | browser-control zoom חסום, smoke אינו manual audit מלא | REQ-005 manual matrix |
| presentation rehearsal | artifacts חסרים | REQ-002 |
| project-book regeneration | אין workflow deterministic ב־repo | DEF-013 |

## 14. סיכונים שהתקבלו בעבר ו־post-MVP

| סיכון retained | owner/מקור אישור | mitigation נוכחי | revisit trigger |
| --- | --- | --- | --- |
| אין malware scanner כללי ל־proof | project architecture/security, 25.8.2026 | JPEG/PNG/WebP synthetic בלבד, magic/decode/pixel cap/re-encode/private bucket | שינוי סוגי קובץ, משתמשים ציבוריים או דרישת compliance |
| private proof orphan בתוצאה עמומה | architecture/security/testing, 25.8.2026 | replay finalizer פעם אחת; אין מחיקה מסוכנת; object נשאר private ואירוע sanitized מפנה ל־manual reconciliation | אירוע ראשון, orphan מזדקן, נפח Storage או צורך באוטומציה |
| shared Vercel egress/Provider 429; אין proactive quota cutoff | `docs/scale.md` + sports POC | quota headers + bounded client + durable backoff לאחר DEF-011; אין static egress/threshold ללא מדידה | remaining quota נמוך, exhaustion, blocked shared IP או אירוע 429 ראשון |
| אין lease renewal | architecture/scale | 120s lease ו־30s app budget, fencing | measured run מתקרב ל־lease או batch גדל |
| אין retention job/materialized leaderboard/cache | scale document | bounded history ו־small private leagues | plans/latency/storage חוצים thresholds מתועדים |
| Hosted `NS→live→FT` observation opportunistic | canary plan | recorded fixtures + Manual path + fail-closed review | חלון משחק חוקי זמין ללא בזבוז quota |

אין waiver חדש ל־P2 בביקורת זו. P4/post-MVP בלבד: export/charts/BI, malware
scanning רחב, materialized leaderboard/Redis/queue לפי מדידה, ושילוב model
generative רק לאחר submission ואישור scope. Real-money/payment/prize operation
נשאר חסום על ידי compliance gate ואינו suggestion לביצוע.

## 15. Critical path של Slice 9

1. לאשר את audit PR וה־register; לא להתחיל runtime לפני אישור DEF-006.
2. להכריע automatic/manual first-kickoff, completion matrix, pending terminal
   requests, members scope, branch policy ו־Preview credential scope.
3. לתקן forward-only את DEF-002 ולכתוב שלוש בדיקות DB רב־session.
4. לתקן DEF-001/014, להגדיר SMTP/redirects ולסגור DEF-004 בראיית Hosted מורשית.
5. לאחר DEF-002 לקדם במקביל את DEF-003, DEF-005 ו־DEF-008; כששלושתם סגורים,
   לממש REQ-001 lifecycle מלא.
6. להשלים settings/bounds: DEF-007/009.
7. לתקן sports reliability: DEF-010/011/012/018/019.
8. לסגור bidi/invite/accessibility: DEF-015/016/020/022 ו־native 200% matrix.
9. לפתור כל P3 או לתעד defer מפורש; אין P3 שנעלם מה־register.
10. לסנכרן README/docs/project book וליצור deck/demo/rehearsal: DEF-013/021/023,
    REQ-002/004.
11. להריץ REQ-005 full verification/Advisors/plans/clean clone על candidate נקי.
12. לפרוס אותו SHA ל־Preview/Production, לאמת evaluator access/branch control,
    ולבצע final audit: אפס P0/P1 וללא P2 שאינו waived במפורש.

## 16. החלטות שחייבות אישור

| החלטה | אפשרויות/tradeoff |
| --- | --- |
| first-kickoff activation | Cron/sync automatic; effective-derived + reconciliation; manager action + DB fallback. tradeoff: תלות scheduler מול audit/UX |
| completion predicate | finished+canceled terminal עם review gate; explicit manager override; או provider reconciliation חובה. אסור להתעלם מ־postponed/AET/PEN/unknown |
| pending requests at completion | reject/freeze אוטומטי; allow read-only history; או block completion עד הכרעה. חייב lock order league→request |
| `/members` scope | active-member list read-only ב־MVP או defer מפורש; removal/reactivation אינו נוסף בשקט |
| branch protection | public repo, plan upgrade, או manual signed waiver/control |
| Preview sports key | Production-only או key נפרד low-quota ל־trusted canary |
| course PDF provenance | track approved copy תחת `project_sources/` או link delivery יציב; אין להמציא/לערוך מקור |
| leaked-password protection | plan upgrade או documented password/rate/monitor mitigation |

## 17. מקורות רשמיים שנבדקו

כל הקישורים הבאים נפתחו ונבדקו ב־26 באוגוסט 2026:

- Next.js: [Production Checklist](https://nextjs.org/docs/app/guides/production-checklist),
  [Data Security](https://nextjs.org/docs/app/guides/data-security),
  [Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy),
  [Server Actions](https://nextjs.org/docs/app/getting-started/mutating-data).
- Supabase: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
  [Functions](https://supabase.com/docs/guides/database/functions),
  [Passwords/recovery](https://supabase.com/docs/guides/auth/passwords),
  [Rate limits](https://supabase.com/docs/guides/auth/rate-limits),
  [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
  [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
  [Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod),
  [Advisors](https://supabase.com/docs/guides/database/database-advisors),
  [DB testing](https://supabase.com/docs/guides/local-development/testing/overview),
  [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).
- Vercel: [Environment variables](https://vercel.com/docs/environment-variables),
  [Sensitive variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables),
  [Cron security](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
- Testing/accessibility: [Playwright best practices](https://playwright.dev/docs/best-practices),
  [Playwright accessibility](https://playwright.dev/docs/accessibility-testing),
  [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/).
- Security/DB/provider: [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/),
  [Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html),
  [File upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html),
  [Forgot password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html),
  [PostgreSQL function security](https://www.postgresql.org/docs/current/sql-createfunction.html),
  [RFC 9110 Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after),
  [RFC 6585 status 429](https://www.rfc-editor.org/rfc/rfc6585.html#section-4),
  [API-Football v3 and quota headers](https://www.api-football.com/documentation-v3#section/Authentication/API-SPORTS-Account).

## 18. פסק דין סופי של ביקורת ה־backlog

**SLICE 9 BACKLOG READY**

כל מקור שהיה יכול לשנות את זיהוי או היקף ה־backlog נבדק. כל defect מאומת,
דרישה חובה חסרה, החלטה, שער Hosted וסתירת מסמכים מופיעים בקובץ זה ובסעיף Slice
9 של `docs/technical-plan.md`. אין ממצא הקיים רק בצ׳אט. המוצר אינו מוכן לשחרור:
יש להשלים את critical path, לקבל החלטות, ולהריץ ביקורת סופית חדשה על SHA אחד
שגם עבר CI וגם פרוס בפועל.
