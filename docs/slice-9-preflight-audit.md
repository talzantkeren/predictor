# ביקורת שער שחרור לפני Slice 9

| שדה | ערך |
| --- | --- |
| תאריך ביקורת | 26 באוגוסט 2026, `Asia/Jerusalem` |
| ענף ביקורת | `feature/slice-9-preflight-audit` |
| SHA בסיס מקובע | `a14edfc4df446a57f0bfe7153f6f0870e0cab243` |
| מקור הבסיס | `origin/main`, לאחר `git fetch origin --prune` |
| בסיס ריוויזיה | PR #13 היה `OPEN` ו־Draft ב־head `1b5b28f4e2190e6597cee8e48fcc12b3aee4e3c4`; רק שלושת קובצי התיעוד המורשים היו ב־diff |
| re-fetch סופי לפני commit | `origin/main` נשאר `a14edfc4df446a57f0bfe7153f6f0870e0cab243`; הביקורת אינה stale |
| פלטפורמה | Windows 11, Node `v24.16.0`, npm `11.13.0`, Docker Server `29.7.2`, PostgreSQL מקומי 17 |
| פסק דין מבוקר | **SLICE 9 BACKLOG READY** |

פסק הדין אומר שה־backlog של Slice 9 שלם, ממוסמך וניתן לתכנון. הוא **אינו**
אומר שהמוצר מוכן לשחרור. לאחר סגירת ההחלטות יש 20 ממצאי delivery פתוחים
ו־5 דרישות Slice 9 פתוחות: **25 רשומות שאינן decision-only — P1=7, P2=8,
P3=10**. בנפרד יש חמש החלטות מוצר וארבע החלטות טכניות סגורות, אפס החלטות
פתוחות ושני accepted residual risks סגורים. לכן אסור
להשתמש בניסוח `RELEASE READY`, להתחיל הגשה או למזג תיקון עד השלמת Slice 9
וביקורת סופית חדשה על SHA פרוס יחיד.

PR זה הוא תיעוד בלבד. הוא אינו כולל תיקון runtime, migration, שינוי Hosted,
קריאת ספק חיה, AI או יכולת כספית.

## 1. כללי מקור והיקף

הביקורת קראה תחילה את `AGENTS.md`, ולאחריו, לפי הסדר, את
`docs/product.md`, `docs/architecture.md`, `docs/technical-plan.md`, את כל תשעת
עמודי ה־export המדויק שמזוהה ב־[`docs/course-source.md`](./course-source.md),
ואת כל הקבצים תחת `docs/`. קוד, migration,
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
| `docs/` | 26/26 קבצים בעץ הבסיס; ה־audit הוסיף path אחד והסגירה הנוכחית מוסיפה את `course-source.md`, ולכן head זה מכיל 28 paths תחת `docs/` |
| קורס | export PDF חיצוני בן 9 עמודים: extraction מלא + render ובדיקה חזותית של 9/9; provenance ו־SHA-256 מדויקים ב־[`course-source.md`](./course-source.md) |
| ספר פרויקט | `docs/project-book.docx`: extraction מלא של 48 פסקאות ו־2 טבלאות; export לקריאה בלבד דרך Word ובדיקה חזותית של 4/4 עמודים |
| עיצוב | HTML אחד ו־9/9 mockups נפתחו ונבדקו חזותית; החלטות mockup בלבד לא קודמו לדרישות |
| Routes | 18 pages, שני layouts, root/global error, not-found ו־9 משטחי loading (root ועוד 8 route-specific) |
| Mutations | 15 Server Actions ו־5 Route Handlers |
| DB | 19 tables, view אחד, 44 functions ב־`public`/`private`, 14 trigger objects (16 event rows ב־`information_schema`), 7 enums, 14 policies, bucket פרטי אחד ו־19 migrations |
| בדיקות | 36 קובצי Vitest, 10 קובצי pgTAP ו־8 קובצי Playwright; ללא `.skip`, `.only` או `.todo` |
| Runtime מקומי | reset מאפס, verify מלא, בדיקת concurrency רב־session, query plans, UI מקומי ו־clean clone חד־פעמי |
| UI ידני | ציבורי/Auth/Dashboard/League/Matches/Match/Standings/Members/Settings/Reports/Admin/Invite-unavailable; `360`, `390`, `768`, `1024`, `1440`; Chrome Desktop ו־Pixel 5 באוטומציה |
| Hosted | Production ו־Preview: Vercel deployment status/URL/commit, env names, Supabase migrations/Auth/URLs/Cron/Advisors ו־GitHub checks/PRs — read-only בלבד |
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
| Invite/request/decision Actions | `getUser()`; IDs/forms untrusted | exact RPC manager/member checks + RLS/audit; terminal composition מתוכנן ב־REQ-001 |
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
החלטות ה־lifecycle נסגרו בריוויזיה; ה־runtime וה־terminal composition נשארים
פתוחים ב־REQ-001, כאשר DEF-005 ו־DEF-021 מוזגו לתנאי הקבלה שלו.

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

העץ המקובע הכיל 26 paths תחת `docs/`. כתיבת ה־audit הוסיפה את
`docs/slice-9-preflight-audit.md`; סגירת `S9-TDEC-003` מוסיפה את
`docs/course-source.md`. לכן head זה מכיל 28 paths תחת `docs/`; שינויים
בקבצים קיימים אינם משנים את הספירה. המלאי הבא כולל את 26 מקורות הבסיס, את
artifact הביקורת ואת manifest ה־provenance.

| path | סוג/תפקיד | נבדק בפועל | drift/disposition |
| --- | --- | --- | --- |
| `docs/architecture.md` | Markdown קנוני | נקרא במלואו | state-machine/DB-authority הכלליים נשמרו, אך §10.2 עדיין מתאר overwrite בכל הליגות; סנכרונו ל־PDEC-003 הוא prerequisite ראשון בתוך REQ-001 ואסור היה לערוך אותו מעבר לשלושת הקבצים המורשים ב־PR זה |
| `docs/design-brief.md` | visual reference | נקרא במלואו | אין הרחבת scope; עיצוב light/RTL נשמר |
| `docs/design/slice-7c/README.md` | visual/historical | נקרא במלואו | Slice 7c היסטורי, לא סטטוס שחרור נוכחי |
| `docs/design/slice-7c/claude-design-export.html` | visual reference | DOM ו־render נבדקו | source visual בלבד; קובצי helper חסרים אינם runtime product |
| `docs/design/slice-7c/final-review-prompt.md` | historical prompt | נקרא במלואו | instructions היסטוריות בלבד; טקסט optional lookup ישן נשמר כראיה היסטורית ואינו source/dependency פעיל |
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
| `docs/product.md` | Markdown קנוני | נקרא במלואו | version/status והחלטות lifecycle/members עודכנו; קישור המקור מפנה ל־manifest קיים ו־portable |
| `docs/course-source.md` | evidence/provenance manifest | נבדק מול export שנבדק בביקורת | מזהה upstream, תאריך, filename, bytes, 9 pages ו־SHA-256; אינו specification וה־PDF אינו ב־Git |
| `docs/project-book.docx` | derived/course deliverable | text + 4/4 pages | Slice 8 next, 460/20, תוכן כספי ופריסת עמודים: S9-DEF-013 |
| `docs/prompts/slice-6-implementation-prompt.md` | historical prompt | נקרא במלואו | אינו contract נוכחי |
| `docs/scale.md` | ניתוח קנוני תומך | נקרא במלואו | advisor/query-scale disposition ב־S9-REQ-005 |
| `docs/security.md` | ניתוח קנוני תומך | נקרא במלואו | TDEC-004 ו־mitigations תועדו; Hosted Auth/password-policy ו־Advisor evidence נסגרו ב־S9-REQ-005 ב־28.8.2026 ללא claim של leaked-password protection |
| `docs/slice-9-preflight-audit.md` | audit artifact חדש | נכתב ונקרא במלואו; diff/staged review לפני commit | source durable לכל finding; decision closure אינו משנה runtime/Hosted |
| `docs/sports-provider-poc.md` | החלטה/תכנית POC | נקרא במלואו | API-Football נבחר; Manual/recorded fallbacks נשארים |
| `docs/technical-plan.md` | Markdown קנוני | נקרא במלואו | סעיף Slice 9 עודכן לקישור ול־register זה |
| `docs/testing.md` | תכנית/ראיות בדיקה | נקרא במלואו | ספירות 489/646/22 אומתו מחדש; פערי regression רשומים |

מקור ה־upstream הוא Google Document מוגבל גישה שמזהה המסמך שלו
`16lecHM5vEMoao_P3WiN3k-UHzFQzZCcq_L3p5rAE2AA`. ה־export המדויק שנבדק הוא
`Internet Technologies.pdf`, בן 9 עמודים ו־`407508` bytes, עם SHA-256
`19b5dabc8e3f359d69b82bd0a0674740ba8704273b80602d3d7a25706557f39c`.
הפרטים ודרך האימות נשמרים ב־[`docs/course-source.md`](./course-source.md);
ה־PDF נמסר בנפרד בערוץ הקורס/evaluator ואינו ב־Git כחומר צד שלישי. תשעת
עמודיו דורשים מוצר Next.js/TypeScript/Supabase/Vercel, אפיון,
DB/זרימות/הרשאות, בדיקות, scale, security, URL חי, GitHub, הוראות local ומצגת
10–15 דקות. אין בו משקלי ציון; לא הומצא rubric.

## 4. מטריצת עקיבות — דרישות מוצר

כל שורה מפנה בנפרד למקור, למימוש, לראיה חיובית, לראיה שלילית/edge/concurrency
ולראיית Hosted/manual. `PASS` הוא לדרישה המדויקת בלבד ולא לשחרור הכולל.
כל 53 ה־IDs שהיו בסעיף 9 ב־SHA הבסיס נבדקו שוב מול חוזי Actions/Routes; לא
נמצא orphan נוסף מעבר ל־MATCH-03 שכבר מוזג ל־S9-DEF-003. חמש החלטות המוצר
שאושרו בריוויזיה קיבלו IDs חדשים, ולכן המטריצה המעודכנת מכסה **58/58**.

| מקור | ID | התנהגות | קוד/migration | בדיקה חיובית | בדיקה שלילית/edge/concurrency | Hosted/manual | סטטוס | finding |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `docs/product.md` §9.1 | AUTH-01 | הרשמה Email/סיסמה | `src/features/auth/actions.ts`; Supabase Auth | `e2e/auth.spec.ts` signup | `src/features/auth/auth-rules.test.ts` validation/enumeration | Mailpit local | PASS | — |
| `docs/product.md` §9.1 | AUTH-02 | confirm/login/logout/recovery | `src/features/auth/actions.ts`; `src/app/auth/confirm/route.ts` | `e2e/auth.spec.ts` login/recovery local | reuse/old-password/429/Hosted delivery חסרים | Hosted mutation לא בוצעה; no SMTP | FAIL | S9-DEF-001, S9-DEF-004 |
| `docs/product.md` §9.1 | AUTH-03 | profile אוטומטי ועדכון עצמי | `supabase/migrations/20260812220000_identity.sql`; `src/features/auth/actions.ts` | `supabase/tests/identity.test.sql` own update | `supabase/tests/identity.test.sql` other-user denial | local | PASS | — |
| `docs/product.md` §9.1 | AUTH-04 | session בכל route מוגן | `src/proxy.ts`; Server Components `getUser()` | `src/proxy.test.ts` refresh; Auth E2E | Playwright guest/cross-role denials | Production public shell בלבד | PASS למימוש | — |
| `docs/product.md` §9.1 | AUTH-05 | redirect בטוח ומחובר→dashboard | `src/features/auth/schemas.ts`; `src/features/auth/actions.ts`; `src/proxy.ts` | Auth E2E valid next | `src/features/auth/auth-rules.test.ts` hostile next | Production/local callback verification תחת DEF-004 | PASS למימוש | S9-DEF-014 הוא docs-only |
| `docs/product.md` §9.2 | LEAGUE-01 | create + manager | `src/features/leagues/actions.ts`; `supabase/migrations/20260813182000_leagues.sql` | `e2e/leagues.spec.ts` create | `supabase/tests/leagues.test.sql` foreign actor | local | PASS | — |
| `docs/product.md` §9.2 | LEAGUE-02 | כל שדות והגדרות | `src/features/leagues/schemas.ts`; create RPC | create form happy path | invalid create covered; edit path absent | local | PARTIAL | S9-DEF-007 |
| `docs/product.md` §9.2 | LEAGUE-03 | prize rules =100% | `supabase/migrations/20260813183000_harden_prize_rule_invariant.sql` | valid split unit/pgTAP | invalid total/position pgTAP | local Demo | PASS ביצירה | S9-DEF-007 לעדכון |
| `docs/product.md` §9.2 | LEAGUE-04 | scoring nonnegative + version | `league_scoring_rules`; `supabase/migrations/20260816110600_slice6_scoring_and_leaderboard.sql` | valid 3/1/0 pgTAP | negative/mutation-after-lock pgTAP | local | PASS | — |
| `docs/product.md` §9.2 | LEAGUE-05 | lock לפני kickoff ראשון | `supabase/migrations/20260823190000_slice7b_api_football_sync.sql` lock trigger | normal lock pgTAP | first-kickoff lifecycle/concurrency חסר | multi-session time failure reproduced | PARTIAL | S9-DEF-002, S9-REQ-001 |
| `docs/product.md` §9.2 | LEAGUE-06 | manager/system-admin mutation | create AuthZ בלבד; settings mutation absent | manager create | cross-user create covered; edit absent | N/A | FAIL | S9-DEF-007 |
| `docs/product.md` §9.2 | LEAGUE-07 | create atomic | `public.create_league` in `supabase/migrations/20260813182000_leagues.sql` | creator/membership pgTAP | rollback/replay pgTAP | local | PASS | — |
| `docs/product.md` §9.2 | LEAGUE-08 | manual activation + automatic first-kickoff fallback | planned `startLeague` + lifecycle RPC/system reconciliation | N/A — planned | manual/automatic race + DB-time fallback missing | no Hosted lifecycle | PLANNED | S9-REQ-001, S9-DEF-002 |
| `docs/product.md` §9.2 | LEAGUE-09 | terminal-only atomic completion | planned `completeLeague` RPC | N/A — planned | nonterminal/AET/PEN/replay/concurrency missing | no Hosted lifecycle | PLANNED | S9-REQ-001 |
| `docs/product.md` §9.3 | JOIN-01 | create/revoke/rotate invite | `src/features/membership/actions.ts`; Slice 3 RPCs | valid invite E2E | non-manager/revoked pgTAP | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-02 | expired/revoked deny | `public.resolve_invite`; submit RPC | valid token E2E | expired/revoked/malformed pgTAP/E2E | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-03 | בקשה פעילה יחידה | Slice 3 partial unique index + submit RPC | first request pgTAP | duplicate/cross-user pgTAP | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-04 | status enum | `join_request_status`; membership display | every expected state unit | invalid transition pgTAP | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-05 | proof→pending approval | upload Handler + `finalize_payment_proof` | file/E2E valid image | bad bytes/oversize/replay pgTAP/unit | local synthetic | PASS למצב הקיים | — |
| `docs/product.md` §9.3 | JOIN-06 | exact manager approve/reject | `src/features/membership/actions.ts`; decision RPCs | approve/reject E2E | other-league denial pgTAP/E2E | local | PASS למצב הקיים | — |
| `docs/product.md` §9.3 | JOIN-07 | membership atomic/idempotent | `supabase/migrations/20260815143000_manager_join_request_decisions.sql` | approve creates member | replay/concurrency pgTAP | local | PASS למצב הקיים | — |
| `docs/product.md` §9.3 | JOIN-08 | resubmit after reject while open | `private.join_request_eligibility` | resubmit E2E | closed/duplicate denial pgTAP | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-09 | 1:N private proof history | `payment_proofs`; RLS; `src/features/files/private-proof-storage.ts` | multiple proof history pgTAP | cross-league/direct-storage denial | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-10 | hash/fragment/7d/one-time | invite RPC + `src/app/api/invites/[publicId]/exchange/route.ts` | valid exchange E2E | replay/expired/raw-token absence | local | PASS | S9-DEF-016, S9-DEF-020 UX |
| `docs/product.md` §9.3 | JOIN-11 | idempotent/concurrent request | partial unique + submit RPC | first submit | real DB concurrent duplicate pgTAP | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-12 | safe WebP/idempotency/rate cap | upload Handler; `src/features/files/image.ts`; rate RPC | JPEG/PNG/WebP unit/E2E | magic/decode/pixel/rate/replay/compensation | local synthetic only | PASS | — |
| `docs/product.md` §9.3 | JOIN-13 | uploader/exact manager signed ≤60s | proof-view Handler + private gateway | authorized signed URL | outsider/other-league/path denial | local | PASS | — |
| `docs/product.md` §9.3 | JOIN-14 | completion closes both pending states atomically with `LEAGUE_COMPLETED` | planned `completeLeague`; existing `rejected` representation | N/A — planned | upload/finalize/approve/reject completion races missing | no Hosted lifecycle | PLANNED | S9-REQ-001; S9-DEF-005 merged |
| `docs/product.md` §9.3 | JOIN-15 | read-only active-member list + queue | queue קיים; active-member list query/UI absent | queue E2E | pagination/cross-league/list completeness missing | N/A | PARTIAL planned | S9-REQ-001; S9-DEF-021 merged |
| `docs/product.md` §9.4 | MATCH-01 | round/date display | `src/features/predictions/queries.ts`; league matches page | query/unit + Playwright | empty/filter/date edges | local | PASS | — |
| `docs/product.md` §9.4 | MATCH-02 | teams/UTC/status/result | sports schema/provider/pages | provider fixtures/unit/E2E | unknown/status identity failures | local + Hosted catalog | PASS | S9-DEF-010 reliability |
| `docs/product.md` §9.4 | MATCH-03 | system-admin full create/correct | `src/features/scoring/actions.ts` result-only | result override E2E | create/schedule/team correction absent | N/A | FAIL | S9-DEF-003, S9-DEF-009 |
| `docs/product.md` §9.4 | MATCH-04 | provider server-only/persisted | `src/features/sports/api-football-client.ts`; private sync gateway | provider/unit/pgTAP | client-secret scan + invalid payload | Hosted Cron/sync aggregate observed | PASS | — |
| `docs/product.md` §9.4 | MATCH-05 | manual precedence + explicit clear | scoring gateway + sync skip | manual override/skip pgTAP | clear/resume absent | local | PARTIAL | S9-DEF-008 |
| `docs/product.md` §9.4 | MATCH-06 | run audit/no duplicate window | sync claim/apply/finalize RPCs | sync pgTAP/E2E normal | time/fairness/429/timeout/type/stage edges | Hosted one Cron + no active lease snapshot | PARTIAL | S9-DEF-002, S9-DEF-010, S9-DEF-011, S9-DEF-012, S9-DEF-018, S9-DEF-019 |
| `docs/product.md` §9.4 | MATCH-07 | irreversible reveal latch | sync apply + lock trigger | early-cancel privacy pgTAP | cancellation/lock multi-session race reproduced statically | local | FAIL under concurrency | S9-DEF-002 |
| `docs/product.md` §9.4 | MATCH-08 | FT only; AET/PEN review | provider normalizer/planner/apply | recorded FT fixtures | AET/PEN/unknown fail-closed unit/pgTAP | historical POC | PASS | — |
| `docs/product.md` §9.4 | MATCH-09 | completed-league correction requires explicit reconciliation | current scorer rewrites globally; planned lifecycle reconciliation boundary | N/A — planned | provider correction after completion/replay/AuthZ missing | no Hosted lifecycle | PLANNED | S9-REQ-001 |
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
| `docs/product.md` §9.6 | SCORE-06 | correction replaces in non-completed; completed requires explicit reconciliation | current function rewrites globally; planned lifecycle guard/reconciliation | corrected result E2E לפני completion | post-completion silent rewrite/review/AuthZ חסרים | local only | PARTIAL planned | S9-REQ-001 |
| `docs/product.md` §9.6 | SCORE-07 | points/outcomes/shared rank | `public.league_leaderboard` | rank `1,1,3` unit/pgTAP | draw/tie/retry edges | local | PASS | — |
| `docs/product.md` §9.6 | SCORE-08 | exact display only | leaderboard view/order/UI | exact display/tie tests | no arbitrary secondary tie-break | local | PASS | — |
| `docs/product.md` §9.7 | REPORT-01 | exact manager opaque deny | `src/features/reports/service.ts` | manager report E2E | member/outsider/other-manager denial | local | PASS | — |
| `docs/product.md` §9.7 | REPORT-02 | active-member count | `src/features/reports/queries.ts` | creator/active count | removed member excluded | local | PASS למצב הקיים | — |
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
| course PDF pp.3–6 | COURSE-04 | DB/pages/APIs/flow/permissions/services | inventories §2 + canonical docs | route/DB/service coverage | missing match-create/settings/lifecycle capabilities | local | PARTIAL | S9-DEF-003, S9-DEF-007, S9-REQ-001 |
| course PDF pp.5–6 | COURSE-05 | core/invalid/AuthZ/DB/edge/UI tests | 54 test files; `npm run verify` | 489/646/22 fresh | listed concurrency/manual/Hosted gaps | local/CI | PARTIAL | S9-REQ-005 |
| course PDF p.6 | COURSE-06 | scale/queries/indexes/limits/future | `docs/scale.md`; plans; Advisors | 8 local plans + linked stats | seed/hosted shape קטן; hundreds absent | linked CLI/dashboard | PARTIAL | S9-REQ-005 |
| course PDF p.6 | COURSE-07 | מסמך AuthN/AuthZ/validation/API/secrets/residual risks | `docs/security.md`; RLS/grants/scans | 646 pgTAP + secret boundary scan | final security document/candidate evidence pending | Advisor/config read-only | PARTIAL | S9-REQ-004, S9-REQ-005 |
| course PDF p.7 | COURSE-08 | live URL/GitHub/local instructions | README + CI/deployment | clean clone and public 200 | evaluator private-repo identity unavailable | Production base | BLOCKED לסופי | S9-REQ-003 |
| course PDF pp.7–9 | COURSE-09 | presentation 10–15 דקות | artifact absent | N/A — missing | N/A — no rehearsal/timing | N/A | MISSING | S9-REQ-002 |
| course PDF pp.8–9 | COURSE-10 | value/architecture/flows/tests/scale/security/future | deck/demo script absent | N/A — missing | N/A — outage/credential fallback absent | N/A | MISSING | S9-REQ-002 |
| internal release gate | INTERNAL-AUTH | evaluator signup/recovery reliable | Supabase Auth config + Auth Actions | local Mailpit | arbitrary Hosted recipient/reuse/429 absent | default SMTP team-only/2h | FAIL | S9-DEF-004 |
| internal release gate | INTERNAL-BRANCH | manual reviewed-PR release control | documented owner control | exact-SHA CI green | GitHub protection/ruleset API 403; procedural control אינו enforced | GitHub private/free | RESOLVED — ACCEPTED RESIDUAL RISK | S9-DEF-017 / S9-TDEC-001 |
| internal release gate | INTERNAL-URL | incognito ללא protection | Vercel deployment/alias | Production alias HTTP 200 | final candidate absent | public base | PASS לבסיס | S9-REQ-003 לסופי |
| README | INTERNAL-CLEAN | clean-clone local run | README + `.env.example` + migrations | clone/install/reset/dev, `/`+`/login` 200 | values withheld; disposable cleanup | local fresh clone | PASS | — |
| internal accessibility gate | INTERNAL-UI | RTL/responsive/keyboard/zoom | global CSS/layouts/components | 360–1440 + desktop/mobile E2E | native 200%/full keyboard/contrast missing | local manual | PARTIAL | S9-REQ-005 |

ה־PDF דורש URL חי, קישור GitHub, מסמכי מוצר/תכנון/בדיקות/סקייל/אבטחה,
הוראות local/env, בדיקות ומצגת 10–15 דקות. Branch protection, Preview Auth,
custom SMTP ו־leaked-password protection אינם דרישות מפורשות שלו; הם נשארים
מסומנים כ־internal controls/evidence ולא מיוחסים ישירות לקורס.

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
- בנקודת baseline של הריוויזיה, Preview deployment ‏`6095307286` היה
  `success` עבור head הישן של PR #13, ‏
  `1b5b28f4e2190e6597cee8e48fcc12b3aee4e3c4`, ב־
  `https://predictor-4mxgk52ja-tals-projects-19902e47.vercel.app`; HEAD ציבורי
  החזיר 200. זהו Preview של תיעוד הביקורת, לא ה־SHA המקובע של המוצר ולא הוכחת
  Auth callback/private flow. Preview של head החדש יאומת אחרי push ברמת PR,
  בלי להציג אותו כראיית runtime ל־`origin/main`.
- Production כולל את תשעת שמות ה־env הצפויים, ללא קריאת ערכים:
  Supabase URL/publishable/secret, app URL, Demo mode, provider/key, Cron secret
  ו־system actor. Preview כולל שישה שמות, ברירת המחדל שלו Manual, וכן entries
  ישנים branch-specific. S9-TDEC-002 הכריעה שה־sports key הוא Production-only;
  המצב הנצפה טרם שונה ולכן S9-DEF-025 נשאר פתוח.
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
  אינו מספק enforcement. אין מכאן ראיה ש־main מוגן; residual risk התקבל עם
  manual release control ב־S9-DEF-017/S9-TDEC-001.
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

אלה שני ה־`SELECT` המסוננים ששימשו ל־snapshot; הם אינם בוחרים actor IDs,
operator notes, payloads או secrets:

```sql
select
  clock_timestamp() as observed_at,
  provider,
  sync_kind,
  status,
  count(*)::bigint as run_count
from public.sync_runs
group by provider, sync_kind, status
order by provider, sync_kind, status;

select
  provider,
  generation,
  run_id,
  locked_until,
  backoff_until
from public.sync_leases
order by provider;
```

### 7.1 Security Advisor — 0 errors, 22 warnings, 6 info

| פריטים | disposition |
| --- | --- |
| `pg_net` ב־`public` | `NO-FIX WITH EVIDENCE`: Hosted 0.20.4 הוא non-relocatable, ה־objects תחת `net`, ו־PostgREST OpenAPI לא פרסם נתיב/definition של `net`; recreation ספקולטיבי יסכן Cron |
| advisor role-entries ל־`SECURITY DEFINER`: `resolve_invite`, `approve_join_request`, `authorize_payment_proof_access`, `consume_proof_upload_rate_limit`, `create_league`, `create_or_rotate_invite`, `finalize_payment_proof`, `get_join_request_upload_context`, `get_league_invite_metadata`, `get_manager_join_requests`, `get_my_join_requests`, `get_my_join_requests_v2`, `is_system_admin`, `reject_join_request`, `revoke_invite`, `save_prediction`, `submit_join_request` | gateways מכוונים, `search_path=''`, grants מצומצמים ו־pgTAP. לשמור disposition function-by-function; אין warning אוטומטי שהוא bypass |
| `rls_auto_enable` ל־anon/authenticated | `FIXED`: definition/owner/ACL/trigger נבדקו, migration `20260825000000` קבע `search_path=''`, ביטל direct execute ושמר את `ensure_rls`; שתי האזהרות נעלמו בריצה חוזרת |
| leaked password protection disabled | `ACCEPTED WITH RATIONALE` תחת `S9-TDEC-004`; נצפה כבוי. חוזה היישום תוקן לשמונה תווים לפחות ועד 72 בתים, ו־rate/monitoring תועדו ללא שינוי Hosted Auth |
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
| Lifecycle eligibility prototype | league PK + 5-row terminal scan, 0.027ms | predicate הוכרע תיעודית; plan קטן זה אינו ראיית implementation/concurrency של REQ-001 |

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

Type, category, priority ו־status הם שדות נפרדים. `RELEASE_BLOCKER` יכול לתאר
פער evidence/מסירה או planned requirement אך אינו severity; רשומת
`DECISION_REQUIRED` או `ACCEPTED_RISK` נספרת ב־decision/risk ledger ולא בתוך
open defect count. רשומת `Merged` אינה נספרת שוב.

ריוויזיה זו מוסיפה במפורש שלוש classifications שאינן `BUG` ואינן מנפחות את
ספירת ה־implementation defects: `MISSING_MVP_CAPABILITY` ל־DEF-003,
`LIFECYCLE_PREREQUISITE` הממוזג ל־DEF-005 ו־`OPERABILITY_RISK` ל־DEF-012.
שדות Category של Hosted/governance/decision alias אינם Type נוסף.

החשבון המכני לאחר הריוויזיה:

| קבוצה | P1 | P2 | P3 | Unscored | סה״כ | disposition |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| implementation/security defects פתוחים | 2 | 5 | 7 | 0 | 14 | `BUG` 11, `DATA_INTEGRITY` 2, `SECURITY` 1 |
| documentation conflicts פתוחים | 0 | 1 | 1 | 0 | 2 | DEF-013/014 |
| missing MVP capability פתוח | 1 | 0 | 0 | 0 | 1 | DEF-003 |
| Hosted configuration/evidence gaps פתוחים | 1 | 0 | 1 | 0 | 2 | DEF-004/025 |
| unreproduced operability risk פתוח | 0 | 0 | 1 | 0 | 1 | DEF-012 |
| **ממצאי delivery פתוחים** | **4** | **6** | **10** | **0** | **20** | לא כולל decisions/merged/accepted risk |
| accepted residual risks סגורים | 0 | 0 | 1 | 1 | 2 | DEF-017/TDEC-001 הם סיכון P3 יחיד; TDEC-004 הוא decision risk unscored |
| planned Slice 9 requirements | 3 | 2 | 0 | 0 | 5 | REQ-001–005 |
| **delivery פתוח כולל REQ** | **7** | **8** | **10** | **0** | **25** | בסיס ה־critical path |

| ledger | Resolved | Open |
| --- | ---: | ---: |
| החלטות מוצר `S9-PDEC-*` | 5 | 0 |
| החלטות טכניות `S9-TDEC-*` | 4 | 0 |
| gates ידניים/config/evidence (§13) | 3 | 10 |

חמש רשומות DEF אינן פתוחות עצמאית: DEF-005 ו־DEF-021 מוזגו ל־REQ-001,
DEF-006 נסגר כהחלטת מוצר, DEF-017 נסגר כ־accepted risk ו־DEF-023 נסגר עם
manifest ה־provenance. DEF-025 הוא כעת finding פתוח P3: TDEC-002 הכריעה את
המדיניות אך שינוי Hosted והראיות טרם בוצעו. כל P1/P2 delivery חוסם release;
waiver ל־P2 דורש owner, נימוק, mitigation ותאריך בכתב. אין waiver חדש ל־P2.

#### Disposition של ריוויזיית `AUDIT_NEEDS_REVISION`

| delta | disposition מדויק |
| --- | --- |
| Scope statement | `CORRECTED` — היעדים לא השתנו; capability scope התרחב במפורש ב־DEF-003/007/008/009 וב־active-members acceptance |
| S9-DEF-003 | `RECLASSIFIED` ל־`MISSING_MVP_CAPABILITY`, נשאר P1; team CRUD הוסר והוגדר catalog/seed/identity בטוח |
| CLAUDE-NEW-001 | `MERGED INTO S9-DEF-003`; אינו ID/ממצא נספר |
| Product §9 orphan sweep | `58/58` לאחר חמש החלטות חדשות; כל 53 ה־IDs המקוריים נבדקו ולא נמצא orphan נוסף; LEAGUE-06 תוקן בתוך DEF-007 |
| S9-DEF-004 | `RETAINED` כ־P1 Hosted release/evidence gap; configuration child של split DEF-014 נבלע בו ללא ID חדש |
| S9-DEF-005 | `MERGED INTO S9-REQ-001`; terminal matrix/locks/negative+real concurrency נשארו חובה, לא blocker עצמאי לפני lifecycle |
| S9-DEF-006 | `VERIFIED RESOLVED — PRODUCT DECISION CONTRACT`; אין טענת runtime fix |
| S9-DEF-012 | `RECLASSIFIED` ל־`OPERABILITY_RISK`, P3; promotion condition מוגדר |
| S9-DEF-014 | `SPLIT WITHOUT DUPLICATION`: README/stale+wildcard Preview aliases נשארים DEF-014 P3; Production/local Hosted config/evidence הוא child `CONFIGURATION` P2 dependency של DEF-004 ואינו ID/ספירה נוספת |
| S9-DEF-015 / 016 | `RETAINED`, downgraded to P3; נשארים ב־final RTL/accessibility pass |
| S9-DEF-017 | `P3 ACCEPTED RESIDUAL RISK`; נסגר באמצעות manual release control מאושר, ללא public repo/plan purchase |
| S9-DEF-021 | policy/docs `VERIFIED RESOLVED`; read-only active-member capability `MERGED INTO S9-REQ-001` |
| S9-TDEC-002 / DEF-025 | decision `RESOLVED`: sports key Production-only ו־Preview/Local/CI Manual ללא live canary; DEF-025 חזר כ־P3 פתוח עד שינוי Vercel והראיות |
| S9-TDEC-003 / DEF-023 | `RESOLVED`: manifest tracked ו־exact PDF נמסר בנפרד; DEF-023 נסגר |
| S9-TDEC-004 | `RESOLVED — ACCEPTED RESIDUAL RISK`: אין plan upgrade/client lookup; Hosted password-policy evidence נשאר ב־REQ-005 |
| S9-REQ-001–005 | `RETAINED` כ־planned requirements, לא regressions; REQ-001 הורחב רק ב־merged acceptance והחלטות הבעלים |
| Decision-table delta | lock order הועבר ל־implementation/data-integrity invariant; `/members` הוכרע ב־PDEC-005 ואינו open policy |
| Decisions/counts | product/technical decisions הופרדו מ־defects; כל המספרים חושבו מחדש בטבלה לעיל |
| Course attribution | branch/Preview/SMTP/leaked-password מסומנים internal ולא מיוחסים ישירות ל־PDF |
| Critical path | resolved decisions ו־DEF-017 הוסרו מעבודת engineering; DEF-005/021 נכנסו ל־REQ-001; capability work תוזמן במפורש |
| Test-count limitation in Claude review | `NOT A FINDING`; 489/646/22 נשארים evidence של הריצה המקובעת המתועדת, ולא נטענת ריצת runtime חדשה בריוויזיה. final candidate חייב rerun תחת REQ-005 |

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

- Type: `MISSING_MVP_CAPABILITY`
- Severity: `P1`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: MATCH-02/03/04/05/09, fallback non-negotiable; Slices
  5–7 ו־Slice 9.
- Environment/SHA: static + local UI, `a14edfc4…`.
- Roles/routes/data: system admin, `/admin/matches`; `teams`, `matches`, results,
  audit log.
- Preconditions/reproduction: לבחור `SPORTS_API_PROVIDER=manual` ולנסות לאכלס
  או ליצור match חדש. `src/features/sync/orchestrator.ts:82-89` מחזיר
  `skipped/MANUAL_PROVIDER` לפני ש־fixtures של ה־adapter מוחלים. migration
  `supabase/migrations/20260815200600_slice5_manual_demo_fixtures.sql:1-69`
  מספקת חמש רשומות Demo סטטיות בלבד. ה־adapter הנוכחי ב־
  `src/features/sports/fixtures.ts:3-78` משתמש ב־IDs לא־UUID, תאריכי אוגוסט
  ו־live/finished ישנים שאינם תואמים ל־UUIDs/תאריכי אוקטובר של ה־seed; אסור
  להזרים payload זה כפי שהוא. אין workflow מוצרי ליצירה/תיקון מלאים.
- Expected: system admin יכול ליצור או לתקן match מתוך season ושתי teams
  קיימות, עם stable server-issued create UUID, round, kickoff UTC, status
  ותוצאה לפי הסטטוס. אין team-CRUD כללי.
- Actual/evidence: `src/features/scoring/actions.ts:21-71` ו־
  `src/features/scoring/components/manual-result-form.tsx:14-46` הם result-only;
  Manual provider עצמו קיים ונבדק ב־`src/features/sports/manual-provider.ts`
  וב־`src/features/sports/sports-provider.test.ts`, אך orchestration הידני אינו
  מחיל אותו. MATCH-03 נמצא ב־`docs/product.md` וה־base technical plan לא כלל
  owning Action, implementation boundary או exit criterion; שלושתם נוספו
  כעת לחוזה Slice 9.
- Impact/root cause: outage, Preview Manual או catalog drift משאירים רק את
  ה־fixtures ההיסטוריים ואת result-only override. זו יכולת MVP שמעולם לא
  תוזמנה בחוזה פעולה, לא regression של Action שנמסר.
- Minimal fix boundary: `createOrCorrectMatch` צר ל־system admin; בחירת teams
  קיימות בלבד; round/kickoff/status/result; ו־`ManualSportsProvider` שמגיע
  למסלול persistence server-only חסום ואידמפוטנטי. אין generic DB editor,
  provider חדש או team CRUD.
- Required changes: deterministic catalog/seed עם UUIDs יציבים, bounded manual
  adapter import, schemas, Action/service, RPC אטומי ואודיט, UI, migration,
  RLS/grants/generated types ו־testing/runbook.
- Acceptance: create/correct/replay audited; ordinary user/anonymous denied
  opaquely; אותו create UUID+payload יוצר row ו־audit outcome יחידים ו־payload
  שונה לאותו UUID נכשל; UTC/score/status/team/season validation; no browser
  provider call. finished לפני DB kickoff נדחה; latch של
  `predictions_locked_at` אינו נפתח; שינוי season/teams עם predictions קיימים
  נכשל סגור; manual create/correction מסמן manual ownership עד clear מפורש;
  completed-league correction נכנס ל־REQ-001 review ולא משכתב final בשקט.
  `manual-catalog-v1` נגזר במדויק מ־5 matches/6 teams שב־seed migration; adapter
  ו־DB עוברים parity של UUID/season/team/kickoff/status. Manual sync אינו מחזיר
  עוד `skipped/MANUAL_PROVIDER` אלא `MANUAL_APPLIED`/`MANUAL_NO_CHANGE` typed
  אחרי import bounded. conflict לא־זהה, provider-owned row, prediction/latch או
  regression של time/status נכשלים אטומית, ולכן אין overwrite של seed עתידי
  ל־live/finished ישן ואין catalog כפול. כל invocation מוסיף `sync_runs` סופי
  אחד; רק mutation ראשון מוסיף business audit, ו־no-change replay אינו מכפיל
  rows/audit. manual/synthetic rows נשארים ללא provider
  identity; API-Football upsert נשאר לפי `(external_provider, external_id)`
  בלבד. שם תצוגה לעולם אינו merge key, ומיפוי עתידי הוא reconciliation מפורש.
- Regression: Vitest validators; pgTAP AuthZ/atomicity/replay/audit/provider
  isolation; Playwright provider-outage/manual-demo path.
- Dependencies/order: אחרי S9-DEF-002 ולפני lifecycle completion; Waiver: N/A;
  Status: `Open`.

`CLAUDE-NEW-001 — MERGED INTO S9-DEF-003`. הראיה ש־MATCH-03 היה orphan בחוזה
הטכני וכל תנאי הקבלה שלו נמצאים ברשומה זו; אין P2 או finding נוסף.

### S9-DEF-004 — Hosted confirmation/recovery אינו בר־הדגמה אמינה

- Type: `RELEASE_BLOCKER`; Category: `HOSTED_CONFIG_GAP`
- Severity: `P1`; Confidence: `CONFIRMED` לגבי configuration/evidence gap;
  Release blocking: `Yes`.
- Affected requirements/slices: AUTH-01/02 וה־internal evaluator-release gate,
  Slice 1. ה־PDF דורש מוצר live ובר־הדגמה, אך אינו דורש במפורש custom SMTP,
  Preview Auth או ספק Email מסוים.
- Environment/SHA: Hosted read-only config + docs, `a14edfc4…`.
- Roles/routes/data: evaluator/new user; Production/local signup, recovery,
  Email delivery, redirects, templates ו־sessions. אין שימוש בחשבון אמיתי
  בביקורת.
- Preconditions/reproduction: dashboard מציג no custom SMTP, built-in sender
  team-address-only ושתי הודעות/שעה; אין current Production evidence ל־
  delivery→session→update→reuse denial. drift של aliases/README ב־Preview נשאר
  DEF-014 docs-only; אם Preview Auth נשמר כ־internal QA path, יישור Hosted שלו
  הוא child dependency לא־נספר בתוך DEF-004 ולא finding נוסף.
- Expected: arbitrary approved evaluator/test recipient יכול לאשר ולהשלים
  recovery באופן אמין, ללא credential committed וללא enumeration.
- Actual: בסיס יכול לשלוח best-effort רק לנמעני team; Hosted mutation נאסרה
  בצדק ללא disposable non-Production authorization. README עצמו מזהיר על
  best-effort. אין proof ל־old-password rejection או token reuse.
- Impact/root cause: registration/recovery — core course flow — עלול להיכשל
  בזמן demo. default SMTP אינו production contract.
- Minimal fix boundary: custom SMTP עם sender/domain בטוחים או חלופה מאושרת
  שמוכיחה arbitrary evaluator delivery; exact Production/local redirect,
  template ו־rate config; אין לפרסם password. Preview Auth נדרש רק אם ייבחר
  כנתיב QA פנימי.
- Required changes: Hosted Auth/SMTP/redirect config, safe evidence/runbook,
  README/security/testing; אין secret ב־Git.
- Acceptance: authorized disposable Hosted E2E: request known+unknown with
  comparable handling, delivery, same-browser callback, session, password
  update, link reuse denied, logout, old password denied, new login success;
  429/cooldown actionable; Production וה־local callback origins מדויקים.
  Preview נבדק בנפרד רק אם הוא חלק מ־internal release runbook.
- Regression: manual Hosted evidence + local Playwright/Mailpit; config
  screenshots/logs sanitized and tied to final SHA.
- Dependencies/order: S9-DEF-001 קודם; child docs/config alignment מתוך
  DEF-014 נסגר כחלק מאותו Hosted pass. Waiver: N/A; Status: `Open`.

### S9-DEF-005 — terminal league נשאר mutable דרך membership/proof

- Type: `LIFECYCLE_PREREQUISITE`; Severity: `Unscored`; Release blocking: `No independent
  blocker`; Status: **`MERGED INTO S9-REQ-001`**.
- Disposition: הראיה המקורית נשמרת: RPCs של upload/finalize/approve/reject אינם
  מחילים כיום terminal-league guard, משום ש־`completed` טרם reachable דרך
  המוצר. לכן אין defect עצמאי לפני מימוש lifecycle; זהו prerequisite בלתי־נפרד
  מהטרנזקציה שמכניסה ליגה ל־`completed`.
- Absorbed contract: `completeLeague` נועל לפי הסדר הגלובלי
  `leagues → profiles → join_requests(id) → payment_proofs(id) →
  league_members(id) → matches(id) → match_result_reviews(match_id, result_version) →
  league_match_snapshots(league_id, match_id) → league_match_reconciliations(id)`,
  בסדר UUID לכל `id` ובסדר לקסיקוגרפי למפתחות הזוגיים; הוא סוגר את שני מצבי ה־pending באופן אטומי
  ל־`rejected` עם `rejection_reason='LEAGUE_COMPLETED'`, משמר proofs/history/
  audit וחוסם terminal upload/finalize/approve/reject. levels שאינם נדרשים
  ניתנים לדילוג, וכל leaf path אסור שירכוש parent מאוחר יותר.
- Absorbed acceptance/regression: negative manager/other/anonymous cases;
  completion מול upload/finalize/approve/reject, replay ו־double completion
  בחיבורים אמיתיים; final member count נשאר immutable ו־report אינו משתנה
  אוטומטית/ללא הרשאה (explicit reconciliation הוא החריג); UI terminal read-only;
  flow סופי ללא direct DB fixture transition. כל אלה נספרים פעם אחת ב־REQ-001.

### S9-DEF-006 — חוזה lifecycle אינו מוכרע

- Type: `DECISION_REQUIRED`; Category: `PRODUCT_DECISION`; Severity: `Unscored`; Release blocking: `Resolved
  decision, runtime work remains in S9-REQ-001`; Status: **`VERIFIED RESOLVED —
  PRODUCT DECISION CONTRACT`**.
- Owner/date: product owner, 26.8.2026. ההכרעות נרשמו ב־`docs/product.md`
  וב־`docs/technical-plan.md` כ־S9-PDEC-001–005.
- Resolved contract: מנהל רשאי להפעיל מוקדם; fallback אוטומטי אטומי,
  idempotent ומתועד חייב לקבע status/audit לא יאוחר מ־kickoff הראשון. tick
  מאוחר מחיל DB-time guard מיד, אך recovery עם `activated_at` של הגבול,
  `recorded_at` אמיתי ו־`ACTIVATION_PERSIST_LATE` הוא כשל SLA ולא PASS לחוזה.
  השלמה מותרת רק כאשר כל included fixture
  terminal/resolved: `canceled`, או `finished` עם FT רשמי/הכרעת system admin;
  `scheduled/live/postponed`, durable review שעדיין pending, unknown provider
  status וכן AET/PEN לא־פתור חוסמים. `review` אינו `match_status`.
  correction אחרי completion אינו משנה final league בשקט אלא עובר review/
  reconciliation מפורש של system admin. completion סוגר pending requests לפי
  החוזה שב־REQ-001. `/members` כולל active-member list read-only; removal/
  reactivation נשאר post-MVP.
- No runtime claim: ב־SHA המבוקר אין עדיין Actions/RPCs/flow. lock order,
  idempotency, audit, negative cases ו־real concurrency נשארים acceptance של
  REQ-001; רשומה זו אינה defect או blocker נספר.

### S9-DEF-007 — מסך הגדרות ליגה אינו משנה הגדרות

- Type: `BUG`
- Severity: `P2`; Confidence: `CONFIRMED`; Release blocking: `Yes`
- Affected requirements/slices: LEAGUE-02/03/04/06, Slice 2.
- Environment/SHA: static + local UI, `a14edfc4…`.
- Roles/routes/data: manager, `/leagues/[leagueId]/settings`; league fields,
  joins, scoring/prizes.
- Preconditions/reproduction: לפתוח settings כמנהל. הדף מכיל invite בלבד;
  אין Action ל־edit, ו־create service מכריח `joins_close_at=null`.
- Expected: manager של הליגה או system admin יכול לעדכן שדות מותרים, join
  close וחוקים לפני lock; member/other manager/anonymous נדחים opaquely.
- Actual/evidence:
  `src/app/(app)/leagues/[leagueId]/settings/page.tsx:14-110`,
  `src/features/leagues/actions.ts:31-67`,
  `src/features/leagues/service.ts:21-24`; `updateLeagueSettings` מופיע בתכנית
  אך אינו קיים.
- Impact/root cause: דרישות שהוגדרו ביצירה אינן ניתנות לניהול והצטרפות לא ניתנת
  לסגירה לפי זמן. Slice 2 מסר create vertical בלבד בלי לסגור edit contract.
- Minimal fix boundary: manager-or-system-admin explicit fields; no real
  payment; scoring/prizes atomic/versioned ונעולים לפי DB state.
- Required changes: schema/Action/service/RPC/migration/RLS/grants/types/UI/docs.
- Acceptance: valid pre-lock update; invalid 100%/negative/locked/foreign actor
  denied atomically; joins_close_at משפיע על request eligibility; opaque errors.
- Regression: Vitest schemas; pgTAP other-manager/active/locked/replay/concurrent;
  Playwright settings mobile/RTL/error/success.
- Dependencies/order: אחרי S9-DEF-002; Waiver: none; Status: `Open`.

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

- Type: `OPERABILITY_RISK`
- Severity: `P3`; Confidence: `PROBABLE` overall — ה־numeric mismatch
  `CONFIRMED`, השפעת runtime לא שוחזרה; Release blocking: `No, tracked until the controlled
  slow-path gate`.
- Affected requirements/slices: MATCH-06, deployment/operations Slice 7b.
- Environment/SHA: Hosted read-only dashboard + code, `a14edfc4…`.
- Roles/routes/data: scheduled Cron `/api/cron/sync`, lease/finalization.
- Preconditions/reproduction: outer `pg_net timeout_milliseconds=10000`; client
  יכול לצרוך 30s בשלושה attempts, lease 120s. normal 200 logs אינם slow proof.
- Expected: outer timeout > measured app worst case + margin, < lease/function
  limit, או app budget נמוך ומוכח; finalize exactly once.
- Actual/evidence: job יחיד כל דקה ל־Production;
  `src/features/sports/api-football-client.ts:291-306`; ה־effective lease של
  120s נקבע ב־
  `supabase/migrations/20260824090000_slice7b_review_hardening.sql:328-346`.
  שם ה־job הוא `predictor-slice7-manual-sync` אף שהספק API-Football.
- Impact/root cause: `pg_net` יכול לסיים את חלון התצפית שלו לפני Route חוקי
  של 30s, אך לא הוכח ש־Vercel מפסיק את העבודה, שנשאר orphan lease או שיש
  finalization חסר/כפול. הצלחת pg_cron מוכיחה enqueue בלבד, לא completion;
  לכן זו השערת operability שנדרשת לשחזור ולא defect מאומת.
- Minimal fix boundary: align numbers and rename job provider-neutrally; לא לשנות
  Hosted במהלך audit.
- Required changes: controlled Supabase Cron config, runbook/docs, slow fake test.
- Acceptance: controlled slow response completes/fails and finalizes once; timeout
  עם margin ומתחת ל־lease ול־Vercel max duration המאומת; ראיית response של
  `pg_net` מקושרת לאותה שורת `sync_runs` terminal יחידה ול־lease משוחרר;
  sanitized scheduled Hosted evidence after deploy.
- Regression: Vitest fake transport/route + pgTAP fencing/expiry; manual Hosted.
- Promotion condition: להעלות ל־P2 defect רק אם controlled slow path מוכיח
  response truncation, orphaned lease, failed finalization או duplicate
  finalization. failure שאינו יוצר אחת מארבע התוצאות נשאר evidence תפעולי P3.
- Dependencies/order: אחרי S9-DEF-011/002; Waiver: none; Status: `Open risk`.

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
- Severity: `P3`; Confidence: `CONFIRMED`; Release blocking: `No, tracked`
- Affected requirements/slices: AUTH-01/02/05 וה־internal Preview QA runbook,
  Slices 1/7c. ה־PDF אינו דורש Preview Auth או aliases מסוימים.
- Environment/SHA: README/code + Hosted Auth/Vercel read-only, `a14edfc4…`.
- Roles/routes/data: new/recovery user on Preview/Production; callback URL.
- Preconditions/reproduction: להשוות `README.md:340-353`, Vercel aliases ו־
  Supabase Redirect URLs. Hosted כולל local, old Slice1, Production ו־old
  Slice3 wildcard; README מזכיר old Slice1 ומחזיק שני `/**` wildcards על
  aliases ישנים של Slice3/Slice5, וכן Slice7c באופן אחר. current Preview
  origin ש־Action בוחר אינו exact allowlisted.
- Expected: README/runbook מבדילים במדויק בין local, Production ו־Preview
  פנימי; aliases ישנים נמחקים או מסומנים historical, בלי להבטיח callback שלא
  הוגדר. Actual: drift תיעודי בין המקורות; Preview Auth עשוי להידחות.
- Impact/root cause: stale per-slice aliases נשארו אחרי merges ו־README עודכן
  חלקית; confirmation/recovery Preview אינו אמין.
- Minimal fix boundary: README ו־runbook בלבד עבור stale aliases ו־Preview
  policy. Production/local Hosted configuration/evidence אינו נספר כאן ונבלע
  ב־DEF-004; אם Preview Auth נשמר, יישור config שלו הוא child dependency של
  אותו Hosted pass.
- Split disposition: **(a)** stale README + stale/wildcard Preview aliases הם
  DEF-014 `DOC_CONFLICT`, P3, וזו הרשומה הנספרת; **(b)** Supabase Hosted
  redirect configuration/evidence ל־Production/local הוא child dependency
  `CONFIGURATION`, P2 unverified, של DEF-004 ואינו מקבל ID או ספירה נוספת.
  Preview Auth עצמו נשאר internal QA concern ואינו course-submission blocker.
- Required changes: README/deployment docs; sanitized config evidence רק כאשר
  Preview Auth נבחר בפועל.
- Acceptance: המסמכים מציגים origins ויכולות אמיתיים; obsolete entries
  נמחקים/מנומקים; אין open redirect או הבטחת Preview flow לא־מאומתת.
- Regression: link/config-name review; Auth tests ו־Production/local proof תחת
  DEF-004.
- Dependencies/order: לצד DEF-004 docs pass; Waiver: none; Status: `Open`.

### S9-DEF-015 — שמות לא־מהימנים מאפשרים bidi spoofing ואינם מבודדים

- Type: `SECURITY`
- Severity: `P3`; Confidence: `CONFIRMED` code-level; Release blocking: `No,
  tracked for final RTL/security pass`
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
- Severity: `P3`; Confidence: `CONFIRMED`; Release blocking: `No, tracked for
  final accessibility pass`
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

- Type: `ACCEPTED_RISK`; Category: `GOVERNANCE_CONTROL`
- Severity: `P3`; Confidence: `CONFIRMED` plan
  limitation; Release blocking: `No — approved manual control`.
- Affected requirements/slices: internal release governance, all slices.
- Environment/SHA: GitHub API read-only, `a14edfc4…`.
- Roles/routes/data: repository maintainers, PR merge path.
- Preconditions/reproduction: branch-protection ו־ruleset endpoints מחזירים 403
  עם הודעת private-repo plan limitation; green CI קיים אך אינו מוכיח enforcement.
- Decision/owner/date: repository owner `talzantkeren`, 26.8.2026 — המאגר נשאר
  private ובתכנית הנוכחית; אין public-repo conversion או plan purchase כחלק
  מ־Slice 9. rationale: single-maintainer course repository וה־API מחזיר 403.
- Approved control: אין direct push ל־`main`; merge רק מ־reviewed PR; נרשמים
  exact candidate SHA והצלחת `Lint, typecheck, unit tests and build`,
  `Supabase database tests` ו־`Playwright core flows` על אותו SHA; לאחר מכן
  מאומתים Production commit, immutable URL וה־Production alias.
- Residual risk: ההליך אינו platform-enforced ולכן maintainer עדיין יכול
  לעקוף אותו. final Production SHA/URL evidence נשאר REQ-003 ואינו נסגר כאן.
- Reopen triggers: collaborator חדש, שינוי visibility/plan, ניסיון direct
  push, כשל בביצוע ה־control או דרישת evaluator ל־enforcement.
- Evidence/status: API 403 + decision ledger S9-TDEC-001; **`RESOLVED —
  ACCEPTED RESIDUAL RISK`**. אין finding פתוח או waiver לא־מוגדר.

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

- Type: `DOC_CONFLICT`; Category: `RESOLVED_PRODUCT_DECISION / MERGED_RECORD`;
  Severity: `Unscored`;
  Release blocking: `No independent blocker`.
- Decision/owner/date: S9-PDEC-005, product owner, 26.8.2026 — `/members` ב־MVP
  כולל active-member list read-only לצד queue/proofs הקיימים; general removal/
  reactivation נשאר post-MVP.
- Disposition: policy/docs **`VERIFIED RESOLVED`** ב־`docs/product.md` וב־
  `docs/technical-plan.md`. ה־query/UI/RLS privacy/pagination/cross-league
  acceptance של הרשימה **`MERGED INTO S9-REQ-001`** ואינו finding נוסף.
- No mutation claim: לא נוסף runtime במסמך זה, ו־`removeMember` אינו חלק מ־
  Slice 9. Status: `Resolved decision; implementation tracked by REQ-001`.

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

- Type: `DOCUMENTATION_PROVENANCE`; Category: `RESOLVED_TECHNICAL_DECISION`;
  Severity: `Unscored`; Confidence: `CONFIRMED`; Release blocking: `No — resolved`.
- Affected requirements/slices: documentation provenance, all slices.
- Environment/SHA: docs + separately delivered external PDF, `a14edfc4…`.
- Affected data: `AGENTS.md`, `docs/product.md`, `docs/course-source.md` וה־audit.
- Resolution/evidence: `docs/course-source.md` קיים כ־provenance manifest ולא
  כ־specification. הוא מזהה את Google Document upstream, תאריך verification,
  filename מדויק, 9 עמודים, `407508` bytes ו־SHA-256
  `19b5dabc8e3f359d69b82bd0a0674740ba8704273b80602d3d7a25706557f39c`.
  `AGENTS.md` ו־`docs/product.md` מפנים ליעד tracked ו־portable.
- Delivery policy: ה־PDF הוא חומר צד שלישי, אינו נכלל ב־Git ונמסר בנפרד דרך
  ערוץ הקורס/evaluator הרשמי. אין Email אישי או טקסט מהותי מן המקור ב־manifest.
- Impact/root cause: לפני הסגירה agent/evaluator היה עלול לא למצוא את המקור;
  manifest + fingerprint מאפשרים לזהות את ה־export המדויק בלי redistribution.
- Minimal fix boundary: manifest וקישורים בלבד; לא שוכתב מסמך הקורס.
- Required migration/RLS/grant/config/doc changes: `N/A`; docs/provenance בלבד.
- Acceptance: manifest tracked; fingerprint ו־page count מדויקים; אין absolute
  path או live broken source link; export נמסר out-of-band וניתן להשוואה.
- Regression: link/date/version checker, `rg` לנתיבים שבורים ואימות hash/page
  של ה־export שנמסר.
- Dependencies/order: final docs; Waiver: N/A; Status: **`Closed —
  S9-TDEC-003 RESOLVED, 2026-08-26`**. אינו open delivery count.

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

- Type: `CONFIGURATION`; Category: `HOSTED_ACCEPTANCE`; Severity: `P3`;
  Confidence: `CONFIRMED` scope; Release blocking: `No, tracked`.
- Affected requirements/slices: least privilege, Slice 7b deployment.
- Environment/SHA: Vercel env names/scopes read-only, `a14edfc4…`.
- Affected roles/data: Preview deployments; `SPORTS_API_KEY` (value not read).
- Preconditions/reproduction: Vercel environment settings מציגים
  `SPORTS_API_KEY` ב־Production+Preview, אך `SPORTS_API_PROVIDER` Production-only
  ולכן Preview defaults Manual; values לא נקראו.
- Selected policy: `S9-TDEC-002 — RESOLVED, 2026-08-26` —
  `SPORTS_API_KEY` הוא Production-only; Production משתמשת ב־
  `SPORTS_API_PROVIDER=api-football`; Preview, Local ו־CI משתמשים ב־
  `SPORTS_API_PROVIDER=manual`, recorded fixtures ו־fake transport, ללא key.
  אין live provider canary ב־Preview ב־MVP.
- Expected/actual: unused Production credential אינו מוזרק ל־Preview; בפועל
  ה־scope הנצפה עדיין רחב ולכן finding זה נשאר פתוח עד שינוי Hosted וראיה.
- Impact/root cause: Preview code/PR compromise יכול לקרוא credential production;
  env scopes drifted after provider selection.
- Minimal fix boundary: להסיר את `SPORTS_API_KEY` מ־Preview scope, לסמן אותו
  Sensitive ב־Production ככל שנתמך, ולא לשנות provider/runtime.
- Required migration/RLS/grant/config/doc changes: `N/A` migration/RLS/grant;
  Vercel env scope + deployment/security evidence בלבד.
- Acceptance: מטריצת env-name/scope מסוננת ללא values; key אינו קיים ב־Preview;
  client bundle ולוגים נקיים; CI ירוק עם Manual; Production Cron ממשיך לפעול
  עם `api-football`. אין טענה ששני keys היו חולקים או מבודדים quota: בידוד
  מכסה נפרד אינו מאומת, ורכישת subscription נוסף רק ל־Preview אינה מוצדקת
  ב־MVP. אפשר לשקול key/subscription נפרדים רק אם דרישת live-provider QA
  מהימנה עתידית תצדיק זאת.
- Regression: final sanitized env-name/scope matrix + client/log secret scan +
  Manual CI + Production Cron observation.
- Dependencies/order: TDEC-002 resolved; שינוי Hosted תחת final env review.
  Waiver: N/A; Status: **`Open`** עד configuration/evidence.

## 11. דרישות Slice 9 שעדיין חסרות

אלה עבודות מתוכננות/מסמכי הגשה, לא regressions של Slice שכבר נמסר.

### S9-REQ-001 — מימוש lifecycle מלא דרך המוצר

- Type: `RELEASE_BLOCKER`; Severity: `P1`; Confidence: `CONFIRMED` missing;
  Release blocking: `Yes`.
- Source/affected requirements: Slice 9 planned scope, LEAGUE-05/08/09,
  JOIN-14/15, MATCH-09, REPORT-05 ו־COURSE-01; `open→active→completed`.
- Environment/SHA/roles/data: `a14edfc4…`; manager, system sync, members;
  leagues/join requests/members/matches/predictions/scoring/audit.
- Preconditions/evidence: אין `startLeague`/`completeLeague` Action/RPC/UI;
  אין active-member list; report E2E משתמש fixture DB להדגמת final בלבד.
- Expected/actual: product path אטומי/authorized/idempotent עם audit; בפועל
  transitions אינם קיימים. זה planned Slice 9, ולכן אינו `BUG`.
- Minimal boundary: לאחר DEF-002 ואחרי DEF-003/008, Server Actions צרים +
  services + forward RPCs; no generic status update. DEF-005 ו־DEF-021 נבלעו
  כאן; DEF-006 כבר הוכרע ואינו dependency פתוח.
- Included-set contract: לפני completion כל match עם
  `matches.season_id=leagues.season_id` נכלל. completion מקפיא באותה טרנזקציה
  `league_match_snapshots` עם match id, terminal status, scores,
  result version וזמן completion; final match/report reads משתמשים ב־snapshot,
  לכן fixture חדש מאוחר לעולם אינו נכנס לסט, ותיקון של match שכבר נמצא בו
  משנה תוצאה רק דרך reconciliation.
- Activation contract: manager רשאי `startLeague` מוקדם. worker מתוזמן עם
  DB-time lookahead/retry מקבע אטומית/idempotently status/audit לפני הגבול
  ולא יאוחר ממנו; זהו תנאי קבלה, לא best effort. הוא רץ בתחילת ה־
  `/api/cron/sync` הקיים, לפני Manual/API-Football
  branching ולפני provider I/O; אין Cron שני, וכשל provider אינו מבטל
  activation. אם tick התעכב, כל boundary עסקי מחיל effective-active החל מ־
  first kickoff; boundary שרוכש league ראשון או ה־Cron הבא מבצע reconciliation:
  `activated_at=first_kickoff_at`, `recorded_at` נשאר זמן הכתיבה האמיתי ונרשם
  `ACTIVATION_PERSIST_LATE`. אין backdated audit או open behavior, אך late הוא
  כשל תפעולי/alert ואינו סוגר את בדיקת ה־deadline.
- Completion contract: `completeLeague` מצליח רק כאשר כל included fixture
  resolved terminal. `canceled` פתור; `finished` פתור רק עם provider FT רשמי
  או הכרעת system admin מתועדת. scheduled/live/postponed או
  `matches.requires_review=true` עם review code ל־AET/PEN/unknown חוסמים; review
  אינו enum status. `match_result_reviews(match_id,result_version)` שומר
  provider/candidate result, pending/resolved disposition, תוצאת זמן חוקי או
  ביטול שנבחרו, `applied_result_version`, actor ו־created/decided timestamps עם
  constraints. Action צר `resolveMatchResultReview` נועל match→review ומאמת
  pending/current version; success אטומי כותב canonical finished+legal-time
  score או canceled, מעלה result version, מסמן review resolved ומנקה את שלושת
  review flags רק לגרסה שהוכרעה. הוא מנקד רק ליגות שאינן completed ויוצר
  pending reconciliation רק לליגה completed שכבר מכילה snapshot לאותו match;
  רק `reconcileCompletedLeague`
  רשאי לשנות snapshot סופי. actor זר, stale/replay, version חדש ומירוץ provider
  נבדקים, ו־success מוכיח שהוא אכן פותח completion.
- Membership contract absorbed from DEF-005/021: באותה טרנזקציה completion
  סוגר את שני מצבי ה־pending ל־existing `rejected`/closed representation עם
  `rejection_reason='LEAGUE_COMPLETED'` ו־display copy "הליגה הושלמה", תוך
  שמירת proofs/history/audit; terminal proof/join mutations נדחות. `/members`
  מציג active-member list read-only עם privacy, pagination ו־cross-league
  authorization; אין removal/reactivation mutation.
- Correction contract: result correction אחרי `completed` אינו משכתב final
  score/standings בשקט. unique durable
  `league_match_reconciliations` כולל `id` UUID server-issued ו־unique
  `(league_id,match_id,result_version)`, שומר snapshot ו־pending/applied/dismissed;
  composite FK אל `league_match_snapshots(league_id,match_id)` מונע יצירת queue
  עבור fixture שנוסף אחרי completion. system admin מחיל/דוחה אטומית ומתועד
  ורק אם snapshot קיים; אחרת מתקבל not-found/no-op אטום. mixed
  completed+active leagues sharing a season ו־provider replay נשארים בטוחים.
- Global lock order: `leagues → profiles → join_requests(id) →
  payment_proofs(id) → league_members(id) → matches(id) →
  match_result_reviews(match_id, result_version) →
  league_match_snapshots(league_id, match_id) → league_match_reconciliations(id)`.
  טבלאות `id` ננעלות בסדר UUID והמפתחות הזוגיים בסדר לקסיקוגרפי; מותר לדלג
  על level; אסור לרכוש parent מאוחר. rate-limit הוא leaf
  profile→request; finalize league→request→proof; approve league→request→member;
  `score_match` match-only ואינו רוכש league.
- Required changes: migration/RPCs/RLS/grants/generated types, Actions/services/
  UI, audit/error contracts, ומסמכי architecture/testing/security מסונכרנים
  באותו implementation change. סנכרון `docs/architecture.md` §10.2 עם
  PDEC-003 הוא הצעד הראשון לפני migration/runtime; omission זה נרשם כאן ואינו
  החלטה טכנית רביעית.
- Acceptance: actors/preconditions/DB-time/locks/replay/audit עומדים בחוזה;
  scoring rules locked; final report מוגן משינוי אוטומטי/לא־מורשה ורק explicit
  reconciliation יכול לעדכנו; opaque cross-user denial;
  E2E `open→active/current→completed/final` ללא direct DB mutation.
- Regression: Vitest state/terminal rules; pgTAP negative permissions ו־real
  multi-session races עבור manual-vs-scheduled fallback/delayed tick,
  pending match review מול provider correction/replay,
  כולל assertion ש־on-time שומר status/audit עד הגבול וש־delayed מסומן
  `ACTIVATION_PERSIST_LATE` ואינו נספר כהצלחת deadline,
  completion-vs-upload/finalize/approve/reject, double completion,
  create/sync-after-completion, mixed active+completed leagues ו־post-completion
  correction כולל ליגה ללא ניחוש מדויק/ללא ניחושים; fixture חדש אחרי completion
  אינו יוצר reconciliation ואינו נכנס לסט הקפוא; Playwright full flow +
  active-members/frozen-final view; Hosted/manual proof after deploy.
- Dependencies/order: `S9-DEF-002→{S9-DEF-003,S9-DEF-008}→S9-REQ-001`;
  שני הפריטים בסוגריים מקבילים. Waiver: N/A; Status: `Open`.

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
  drift defects DEF-013/014; provenance ‏S9-TDEC-003/DEF-023 כבר נסגר.
- Preconditions/reproduction: full text/link inventory + DOCX 4/4 render מפיקים
  את ה־drift המתועד ברשומות אלה.
- Expected: one consistent current status/date/version, setup/env/deploy URLs,
  architecture/DB/flows/tests/scale/security/residual risks and project book.
- Actual: canonical supporting docs mostly current, members scope הוכרע ו־
  source provenance קיבל manifest; derived book/redirect ו־safe evaluator/demo
  instructions עדיין חסרים.
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
- Dependencies/order: אחרי content fixes, לפני REQ-002/003; manifest ה־course
  נשאר חלק מ־link/hash verification אך אינו dependency פתוח.
  Waiver: none; Status: `Open`.

### S9-REQ-005 — hardening וראיית בדיקה סופית

- Type: `RELEASE_BLOCKER`; Severity: `P2`; Confidence: `CONFIRMED` planned;
  Release blocking: `Yes unless explicitly waived`.
- Source: Slice 9 plan, internal release standard, WCAG/OWASP/official checklists.
- Environment/SHA/roles/data: maintainers/evaluator; local/Hosted/manual final
  candidate, כל routes/tables/config.
- Preconditions/reproduction/current evidence: Hosted Auth ושני ה־Advisors
  נקראו בפועל; 48 items קיבלו disposition; פער 128/72 ותפקציית event-trigger
  חשופה תוקנו ונבדקו. native zoom נשאר אך ורק ב־S9-DEF-022.
- Expected/actual/root cause: hardening evidence נדרש להיות נצפה ולא מוסק;
  ה־CLI/Management API סיפקו את הראיה וה־post-fix rerun.
- Minimal boundary: validation + migration הרשאות אחת + evidence/checker;
  ללא indexes ספקולטיביים וללא פריסת 19 migrations של feature.
- Acceptance: zero open P0/P1 and no unwaived P2; every advisor item disposition;
  exact authz negative לכל שינוי; all multi-session/scoring/state cases;
  lint/type/build, type parity ו־Advisor rerun ירוקים. Accessibility/native 200%
  נשארים acceptance נפרד של S9-DEF-022.
- Required evidence: command logs/counts/durations, Playwright artifacts sanitized,
  Preview/Production manual gates, accepted-risk owner/date/trigger.
- Required migration/RLS/grant/config/doc changes: לפי כל finding בלבד; כל Advisor
  מקבל add/no-add/waive disposition, אין שינוי schema עיוור. leaked-password
  protection נסגר כ־accepted residual risk דרך S9-TDEC-004 ונצפה כבוי;
  מדיניות Hosted תועדה ותקרת היישום יושרה ל־72 UTF-8 bytes. ‏DEF-025 נשאר
  רשומה נפרדת ל־scope matrix/secret scan/Cron continuity.
- Regression: full canonical verify פעם אחת + targeted reruns לפי failure;
  real multi-session, clean clone, Hosted/manual matrix על exact final SHA.
- Dependencies/order: אחרי כל fixes ואחרי acceptance ה־Hosted/manual שנותר
  מהחלטות S9-TDEC-002/004, לפני REQ-003; כל ארבע ההחלטות עצמן כבר סגורות.
  Waiver: none; Status: `VERIFIED` ב־28.8.2026.

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
| manual start vs first kickoff | `VERIFIED RESOLVED` decision; runtime open | DEF-006/PDEC-001 resolved; REQ-001 implements |
| completion terminal statuses | `VERIFIED RESOLVED` decision; runtime open | DEF-006/PDEC-002–004 resolved; REQ-001 implements |
| stale technical/product/testing status | `VERIFIED RESOLVED` | technical/testing היו current; product header תוקן מכנית ב־PR audit |
| project book Slice 8/old counts/finance | Open | rendered/extracted, DEF-013 |
| README aliases/deployment SHA | חלקי | deployment SHA verified; redirects DEF-014 |
| `main` protection | `RESOLVED — ACCEPTED RESIDUAL RISK` | GitHub plan 403; approved manual release control, DEF-017/TDEC-001 |
| PR #9 Slice 10 | `VERIFIED HISTORICAL` | open/non-draft/DIRTY; לא מוזג; SMTP migrated independently |
| Hosted demo password ב־Git | `VERIFIED RESOLVED` | scoped scan לא מצא credential; instructions עדיין REQ-002/003 |

## 13. שערים חסומים/ידניים

יש **10 שערי implementation/configuration/evidence פתוחים** ו־**3 שערי
policy/provenance/governance סגורים**. סגירת החלטה אינה מתחזה לשינוי Hosted:
ה־acceptance של DEF-025 ושל מדיניות password נשאר פתוח. באותה מידה, סגירת
branch control כ־accepted risk אינה מחליפה את ביצוע ה־control על ה־candidate
הסופי תחת REQ-003.

| שער | סטטוס | מדוע אינו PASS עכשיו / תנאי סגירה |
| --- | --- | --- |
| Hosted signup/recovery | `OPEN` | mutation/email אסורים ללא disposable authorization; DEF-004 acceptance על Production/local |
| Preview Auth callback/private-flow | `OPEN — INTERNAL ONLY` | DEF-014 מיישר docs/policy; אם נשמר מסלול Preview, child Hosted alignment + E2E נסגרים ב־DEF-004. אינו course blocker ישיר |
| Cron slow path | `OPEN` | DEF-011 fake + DEF-012 controlled slow path ו־sanitized Hosted run; DEF-012 מקודם רק בתנאי המוגדר |
| Production sports credential scope | `OPEN` | TDEC-002 הכריעה Production-only, אך DEF-025 דורש הסרה מ־Preview, Sensitive ב־Production ככל שנתמך, matrix ללא values, scan, Manual CI ו־Production Cron proof |
| Hosted password-policy/control evidence | `VERIFIED — INTERNAL ONLY` | REQ-005 קרא Auth/Advisors, יישר את היישום לשמונה תווים/72 בתים, תיעד rate controls והשאיר leaked-password כבוי כ־accepted risk |
| final deployment SHA | `OPEN` | Slice 9 טרם מומש; REQ-003 |
| evaluator private GitHub access | `OPEN` | זהות evaluator אינה ידועה; confirmation out-of-band תחת REQ-003 |
| native 200%/contrast/full keyboard | `OPEN` | smoke אינו manual audit מלא; REQ-005 manual matrix |
| presentation rehearsal | `OPEN` | artifacts חסרים; REQ-002 |
| project-book regeneration | `OPEN` | אין workflow deterministic ב־repo; DEF-013/REQ-004 |
| course-source provenance | `RESOLVED` | TDEC-003/DEF-023: manifest tracked, fingerprint+9 pages recorded וה־PDF נמסר בנפרד |
| enforced branch protection | `RESOLVED — ACCEPTED RESIDUAL RISK` | plan limitation; TDEC-001/DEF-017 קובעים manual reviewed-PR/exact-SHA control, והוא מבוצע שוב ב־REQ-003 |
| leaked-password protection availability | `RESOLVED — ACCEPTED RESIDUAL RISK` | TDEC-004: אין plan upgrade רק עבור היכולת ואין client lookup; reopen triggers מתועדים. שורת ה־evidence הפתוחה לעיל נשארת נפרדת |

## 14. סיכונים שהתקבלו בעבר ו־post-MVP

| סיכון retained | owner/מקור אישור | mitigation נוכחי | revisit trigger |
| --- | --- | --- | --- |
| אין malware scanner כללי ל־proof | project architecture/security, 25.8.2026 | JPEG/PNG/WebP synthetic בלבד, magic/decode/pixel cap/re-encode/private bucket | שינוי סוגי קובץ, משתמשים ציבוריים או דרישת compliance |
| private proof orphan בתוצאה עמומה | architecture/security/testing, 25.8.2026 | replay finalizer פעם אחת; אין מחיקה מסוכנת; object נשאר private ואירוע sanitized מפנה ל־manual reconciliation | אירוע ראשון, orphan מזדקן, נפח Storage או צורך באוטומציה |
| shared Vercel egress/Provider 429; אין proactive quota cutoff | `docs/scale.md` + sports POC | quota headers + bounded client + durable backoff לאחר DEF-011; אין static egress/threshold ללא מדידה | remaining quota נמוך, exhaustion, blocked shared IP או אירוע 429 ראשון |
| אין lease renewal | architecture/scale | 120s lease ו־30s app budget, fencing | measured run מתקרב ל־lease או batch גדל |
| אין retention job/materialized leaderboard/cache | scale document | bounded history ו־small private leagues | plans/latency/storage חוצים thresholds מתועדים |
| Hosted `NS→live→FT` observation opportunistic | canary plan | recorded fixtures + Manual path + fail-closed review | חלון משחק חוקי זמין ללא בזבוז quota |
| אין platform-enforced protection על `main` | repository owner `talzantkeren`, 26.8.2026; S9-TDEC-001 | private repo; no direct push; merge reviewed PR בלבד; exact candidate SHA + שלושת checks הנקובים + Production commit/immutable URL/alias | collaborator/visibility/plan משתנים, direct-push attempt, control failure או דרישת evaluator |
| leaked-password protection אינה זמינה/מופעלת | repository owner `talzantkeren`, 26.8.2026; S9-TDEC-004 | validation של שמונה תווים לפחות/72 UTF-8 bytes; Hosted policy evidence אומתה ב־REQ-005; rate limits, recovery enumeration-safe אחרי DEF-001, monitoring ו־Demo-only; אין client-side breached-password lookup | plan כולל את היכולת מסיבה אחרת, הרחבה לנתונים רגישים מהותית, incident/credential-stuffing evidence או דרישת evaluator |

אין waiver חדש ל־P2 בביקורת זו. P4/post-MVP בלבד: export/charts/BI, malware
scanning רחב, materialized leaderboard/Redis/queue לפי מדידה, ושילוב model
generative רק לאחר submission ואישור scope. Real-money/payment/prize operation
נשאר חסום על ידי compliance gate ואינו suggestion לביצוע.

## 15. Critical path של Slice 9

1. לאשר את audit PR וה־register; חמש החלטות המוצר וארבע ההחלטות הטכניות כבר
   סגורות ואין decision blocker לפני תחילת engineering. סגירת decision אינה
   סוגרת את acceptance ה־Hosted שמסומן להלן.
2. לתקן forward-only את DEF-002 ולכתוב את בדיקות ה־DB הרב־session.
3. לתקן DEF-001 ולסגור DEF-004 ב־Production/local Hosted evidence; ליישר את
   DEF-014 docs/policy באותו pass בלי להפוך Preview לדרישת קורס.
4. לאחר DEF-002 לקדם את capability work המפורש: DEF-003, DEF-007, DEF-008
   ו־DEF-009. DEF-003/008 הם dependencies ישירים של lifecycle.
5. לממש REQ-001 לפי PDEC-001–005; הוא סופג את DEF-005/021 וכולל terminal
   matrix, lock order, races אמיתיים, active-members ו־post-completion review.
6. לתקן sports reliability: DEF-010/011/018/019; לשחזר DEF-012 ב־controlled
   slow path ולהעלות priority רק אם תנאי הקידום מתקיים. באותו workstream
   לסגור את DEF-025 לפי TDEC-002: להסיר `SPORTS_API_KEY` מ־Preview, לסמן אותו
   Sensitive ב־Production ככל שנתמך, ללכוד matrix מסוננת, להוכיח שאין key
   ב־bundle/logs, להשאיר CI על Manual ולאמת ש־Production Cron ממשיך לפעול.
7. לסגור RTL/invite/accessibility: DEF-015/016/020/022 ו־native 200% matrix.
8. לסנכרן README/docs/project book וליצור deck/demo/rehearsal: DEF-013/014,
   REQ-002/004; manifest ה־provenance שכבר נסגר נכלל ב־link/hash check.
9. `COMPLETED` תחת REQ-005: מדיניות Hosted ו־rate controls נצפו, validation
   יושר לשמונה תווים/72 UTF-8 bytes, ואין plan upgrade, client lookup או claim
   שה־leaked-password feature הופעלה.
10. לפתור כל P3 או לתעד defer מפורש, ואז להריץ REQ-005 full verification,
    Advisors, plans ו־clean clone על candidate נקי.
11. לפרוס אותו SHA ל־Preview/Production לפי המדיניות המאושרת, לאמת evaluator
    access ולבצע את manual branch control המאושר תחת REQ-003.
12. לבצע final audit: אפס P0/P1 וללא P2 שאינו waived במפורש.

## 16. החלטות מוצר וטכניות

חמש החלטות המוצר סגורות; **אין product decision פתוחה**:

| ID | סטטוס | חוזה מאושר — product owner, 26.8.2026 |
| --- | --- | --- |
| `S9-PDEC-001` | `RESOLVED` | manager רשאי להפעיל מוקדם; fallback מתוזמן אטומי/idempotent/audited חייב לשמור active+audit לא יאוחר מ־first included kickoff. late guard מונע open behavior אך נרשם `ACTIVATION_PERSIST_LATE` ואינו PASS |
| `S9-PDEC-002` | `RESOLVED` | completion רק כשכל included fixture resolved terminal: canceled או finished עם FT רשמי/הכרעת system admin; nonterminal/pending durable review/unknown/AET/PEN לא־פתור חוסם |
| `S9-PDEC-003` | `RESOLVED` | correction אחרי completion דורש explicit system-admin review/reconciliation; אין silent final rewrite |
| `S9-PDEC-004` | `RESOLVED` | completion סוגר אטומית את שני pending states ל־existing rejected/closed representation עם `LEAGUE_COMPLETED` ושומר proofs/history/audit |
| `S9-PDEC-005` | `RESOLVED` | `/members` מציג active-member list read-only; removal/reactivation post-MVP |

ארבע ההחלטות הטכניות סגורות ואפס פתוחות. החלטה סגורה אינה טענת Hosted
configuration: acceptance שלא בוצע נשאר finding/gate פתוח במפורש.

| ID | סטטוס | owner/options/תנאי סגירה |
| --- | --- | --- |
| `S9-TDEC-001` | `RESOLVED — ACCEPTED RESIDUAL RISK` | repository owner `talzantkeren`, 26.8.2026; manual reviewed-PR/exact-SHA/three-check/Production-proof control; reopen triggers ב־DEF-017 |
| `S9-TDEC-002` | `RESOLVED`, 26.8.2026 | `SPORTS_API_KEY` Production-only; Production `api-football`; Preview/Local/CI Manual ללא key/live canary. quota isolation בין credentials unverified ורכישה רק ל־Preview אינה מוצדקת. DEF-025 נשאר פתוח עד Vercel change/evidence |
| `S9-TDEC-003` | `RESOLVED`, 26.8.2026 | manifest tracked; exact PDF export נמסר בנפרד; אין commit של חומר צד שלישי ללא redistribution permission. DEF-023 closed |
| `S9-TDEC-004` | `RESOLVED — ACCEPTED RESIDUAL RISK`, 26.8.2026 | אין upgrade רק עבור leaked-password protection ואין client lookup; mitigations ו־reopen triggers ב־§14/`docs/security.md`. Hosted password-policy evidence נשאר gate פתוח תחת REQ-005 |

## 17. מקורות רשמיים שנבדקו

כל הקישורים הבאים נפתחו ונבדקו ב־26 באוגוסט 2026:

- קורס: [`docs/course-source.md`](./course-source.md) מזהה את Google Document
  upstream המוגבל גישה ואת export ה־PDF המדויק שנבדק באמצעות filename,
  9 pages, bytes ו־SHA-256. ה־export נמסר בנפרד ואינו ב־Git.
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
כל החלטות המוצר וההחלטות הטכניות סגורות, אך יש להשלים את critical path ואת
שערי ה־Hosted/manual הפתוחים — לרבות DEF-025 וראיית password-policy — ולהריץ
ביקורת סופית חדשה על SHA אחד שגם עבר CI וגם פרוס בפועל.
