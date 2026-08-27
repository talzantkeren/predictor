# מרשם hardening סופי — Slice 9

Status: `OWNER_ACTION_REQUIRED`

המרשם הוא ראיית `S9-REQ-005`. כל item מקומי קיבל disposition נצפה על
checkpoint נקי; אין כאן הסקה מ־Local ל־Hosted. נותרה **single remaining owner
action** אחת: read-only password-policy + Advisor export באותו session של
Supabase Production. שאר השערים האנושיים/Hosted ממופים לרשומות שלהם ואינם
נספרים כפעולות owner של `S9-REQ-005`.

## זיהוי checkpoint

| שדה | ערך |
| --- | --- |
| ID | `S9-REQ-005` |
| Branch | `feature/slice-9-implementation` |
| Candidate SHA | `a0610df0c0dad8634cbf512f9ff0b74b1bde728b` |
| Clean-clone SHA | `a0610df0c0dad8634cbf512f9ff0b74b1bde728b` |
| Draft review | Draft PR #14 — נשאר Draft ולא ממוזג |
| Scope | Local Supabase בלבד; אין linked reset או Hosted mutation |

## מטריצת שערים מקומיים ו־disposition

כל התוצאות הבאות נצפו ב־27.8.2026. ההרצה הראשונה של `npm.cmd run verify`
חשפה failure אמיתי: spec הנגישות ייבא `Page` ישירות מ־Playwright ולכן הפר את
fixture ה־stream-safe. הייבוא הועבר לגבול ה־fixture, הרגרסיה הממוקדת עברה
4/4, ואז כל המטריצה הורצה מחדש בלי דילוג או ריכוך.

| Gate | פקודה מדויקת | תוצאה נצפית | Disposition |
| --- | --- | --- | --- |
| Install | `npm.cmd ci` | PASS — 427 packages added; 428 audited; 0 vulnerabilities | closed locally |
| Full verify | `npm.cmd run verify` | PASS — lint; strict typecheck; 49 Vitest files/631 tests; 30 pgTAP files/1443 tests; types current; production build; 52-artifact client scan; 38 Playwright tests in 5.9m; no `[WebServer] Error` | closed locally |
| Standalone build | `npm.cmd run build` | PASS — Next.js 16.3.0 compile, TypeScript, page data and static generation | closed locally |
| Client-secret bundle | `$env:CLIENT_SECRET_SENTINEL='<synthetic>'; npm.cmd run test:client-secrets` | PASS — sentinel absent from 52 client/rendered artifacts | closed locally |
| Dependency audit | `npm.cmd audit --audit-level=low` | PASS — 0 vulnerabilities | closed locally |
| Local DB lint | `npx.cmd --no-install supabase db lint --local --schema public,private --level warning --fail-on error` | PASS — `results=[]`; no public/private schema errors | closed locally |
| Forward migration reset | `npx.cmd --no-install supabase db reset --local` | PASS — 36 forward migrations through `20260827180000`, seed and restart | closed locally |
| Generated DB types | `npm.cmd run types:check` | PASS — no drift after reset | closed locally |
| Representative scale | `npm.cmd run scale:plans` | PASS — four bounded plans: 0.163/2.173/0.456/0.830ms; rows 51/51/51/26 | closed locally |
| Accessibility/viewport | included in `npm.cmd run verify` via `e2e/accessibility-matrix.spec.ts` | PASS — 10/10 across 360 / 390 / 768 / 1024 / 1440, Desktop+Mobile; axe/keyboard/focus/contrast/touch/RTL/overflow | automated portion closed; native 200% routed to S9-DEF-022 |
| three clean E2E repeats | `npm.cmd run test:e2e:run -- e2e/prediction-lock.spec.ts` ×3 | PASS — 2/2 in 27.3s, 2/2 in 27.1s, 2/2 in 27.1s; no `[WebServer] Error` | closed locally |
| clean-clone | `npm.cmd ci`; `npm.cmd run verify`; `npm.cmd run build`; `git status --short` | PASS on exact SHA — 631/1443/38; E2E 6.1m; second build green; Git status empty | closed locally; copied `.env.local` removed after run |

## P0/P1/P2 disposition

| Priority | Finding set | Disposition |
| --- | --- | --- |
| P0 | אין finding מקומי פתוח אחרי שתי ריצות מלאות | no waiver; finding חדש עוצר את המועמד |
| P1 | אין finding מקומי פתוח; ה־CI על checkpoint קודם ירוק ומתועד ב־S9-REQ-003 | no waiver; final external gates נשארים ברשומות הייעודיות |
| P2 | `S9-REQ-005` נשאר פתוח רק בגלל ראיית Hosted למטה | not waived; `OWNER_ACTION_REQUIRED` עד פעולה אחת |

אין P2 waived. היעדר `leaked-password protection` נשאר accepted residual risk
לפי `S9-TDEC-004`; אין כאן claim שהיכולת קיימת או מופעלת. Local מוכיח את חוזה
8–128 והזרימות, אך אינו מוכיח את policy ב־Hosted. `supabase db lint --local`
אינו תחליף ל־Security Advisor או Performance Advisor של Production.

## הפעולה היחידה שנותרה לבעלים

Contract marker: `single remaining owner action`; the combined evidence covers
`Hosted password policy` and both Advisor tabs.

| Gate | הוראת owner מדויקת | Status | Owner | Target date | Trigger |
| --- | --- | --- | --- | --- | --- |
| Hosted hardening read/export | באותו session read-only ב־Supabase Production: (1) לפתוח Auth configuration, לצלם באופן מצונזר min/max password ‏8–128 ואת rate-limit/monitoring הרלוונטיים בלי שינוי; אין לטעון ש־leaked-password protection מופעלת. (2) לפתוח Database Advisors, לייצא את רשימות Security Advisor ו־Performance Advisor על final SHA, ולתת לכל item disposition: fixed, informational/no-action עם נימוק, או accepted risk עם Owner/Target date/Trigger ואישור. לשמור את ה־artifacts בנתיבי ה־owner packet ולהריץ `npm.cmd run hardening:check`. | OWNER_ACTION_REQUIRED | Project owner | 2026-09-02 | final migrations present in Production |

אם אחד משני המסכים אינו נגיש או item נשאר ללא disposition, הפעולה היחידה לא
הושלמה והרשומה נשארת פתוחה. אין לבצע שינוי Hosted כחלק מאיסוף הראיה.

## שערים המנוהלים ברשומות אחרות

השורות הבאות אינן פעולות owner של `S9-REQ-005`; הן מופיעות כאן רק כדי למנוע
כפל ownership או claim שסגירת hardening המקומי סגרה אותן.

| Gate | רשומה/ראיה סמכותית | Status | גבול |
| --- | --- | --- | --- |
| Native 200% zoom | `S9-DEF-022` | TRACKED_BY_RECORD | human Chrome native zoom בלבד |
| Vercel secret scope | `S9-DEF-025` | TRACKED_BY_RECORD | uncheck Preview בלי Reveal |
| Production Cron | `S9-DEF-012` | TRACKED_BY_RECORD | final sanitized pg_net/run/lease observation |
| Hosted migration parity | `S9-REQ-003` | TRACKED_BY_RECORD | read-only versions; no reset |
| Evaluator access | `S9-REQ-003` | TRACKED_BY_RECORD | approved identity, out-of-band access |
| Human rehearsal | `S9-REQ-002` | TRACKED_BY_RECORD | one measured 10–15 minute run |
| Final Production SHA | `S9-REQ-003` | TRACKED_BY_RECORD | immutable deployment/alias parity |

GitHub billing is no longer an owner gate: unchanged CI ran on real runners and
both push `33097585902` and PR `33097590476` completed green on
`223de65f083fcbf954c082c6e83c6df2ed14bdca`. Final-head CI remains part of the
S9-REQ-003 runbook, not this Hosted hardening read/export action.

## Accepted-risk fields

| Risk | Owner | Target date | Trigger | Current mitigation |
| --- | --- | --- | --- | --- |
| leaked-password protection unavailable/not enabled | repository owner (approval in `S9-TDEC-004`) | revisit on trigger | plan gains feature, sensitive-scope expansion, credential-stuffing incident/evidence or evaluator demand | validation 8–128; enumeration-safe recovery; rate/monitor evidence requested; Demo-only |
| no broad malware scanner for synthetic proof images | project architecture/security | revisit on trigger | file types/public users/compliance scope changes | magic/decode/pixel cap/re-encode/private bucket |
| no cache/queue/materialized leaderboard | architecture/scale | measurement threshold | bounded plans/latency/storage exceed documented thresholds | keyset pagination, bounded sync and indexes |

## Regression contract

`npm.cmd run hardening:check` verifies the local command matrix, five viewport
widths, four representative plan labels, P0/P1/P2 and risk fields, exactly one
`OWNER_ACTION_REQUIRED` table row, and routing of every other owner gate to its
own record. It rejects stale candidate/count text, JWT-like strings and secret
assignments. No workflow, test, lint rule or threshold is disabled by this
register.
