# מרשם hardening סופי — Slice 9

Status: `OWNER_ACTION_REQUIRED`

המרשם הוא ראיית S9-REQ-005 למועמד ההגשה. הוא מפריד בין שערים שנמדדו מקומית
בדיוק על ה־SHA המתועד, לבין שערי Hosted/אנוש שאין להריץ או להסיק ללא פעולת
הבעלים. אין במסמך claim על Production סופי, CI סופי או Advisor שלא נצפו.

## זיהוי מועמד

| שדה | ערך |
| --- | --- |
| ID | `S9-REQ-005` |
| Branch | `feature/slice-9-implementation` |
| Candidate SHA | `2a692242c795b3129792b7b7f7cd203c1776f9f9` |
| Pushed SHA | `2a692242c795b3129792b7b7f7cd203c1776f9f9` (implementation checkpoint; evidence-only follow-up may advance HEAD) |
| Clean-clone SHA | `2a692242c795b3129792b7b7f7cd203c1776f9f9` |
| Draft review | Draft PR #14 — נשאר Draft, לא ממוזג |

## מטריצת שערים מקומיים

כל תוצאת PASS למטה נצפתה ישירות בריצה המקומית מ־27.8.2026. השדה
`Candidate SHA` ייקבע ל־checkpoint הדחוף לפני ריצת ה־clean clone; שערי Hosted
נשארים פתוחים גם כשהמטריצה המקומית ירוקה.

| שער | פקודה מדויקת | Result | ראיה מצונזרת |
| --- | --- | --- | --- |
| Install | `npm.cmd ci` | PASS | 425 packages; 29s; 0 vulnerabilities |
| Full verify | `npm.cmd run verify` | PASS | lint + typecheck; Vitest 48 files/627; DB 30 files/1443; types current; build; client scan 52; E2E 28/28 in 6.0m; no `[WebServer] Error` |
| Production build | `npm.cmd run build` | PASS | Next.js 16.3.0 compiled; TypeScript/static generation completed; exit 0 |
| Client-secret scan | `$env:CLIENT_SECRET_SENTINEL='slice9-final-client-secret-sentinel-never-ship-20260827'; npm.cmd run test:client-secrets` | PASS | 52 client/rendered artifacts; synthetic sentinel absent |
| Dependency audit | `npm.cmd audit --audit-level=low` | PASS | 0 vulnerabilities; exit 0 |
| Local DB lint | `npx.cmd --no-install supabase db lint --local --schema public,private --level warning --fail-on error` | PASS | public/private; no schema errors; empty results |
| Forward migration reset | `npx.cmd --no-install supabase db reset --local` | PASS | 36 forward migrations through `20260827180000`; seed and restart completed |
| Generated DB type drift | `npm.cmd run types:check` | PASS | generated database types current after reset |
| Representative scale | `npm.cmd run scale:plans` | PASS | ארבעה plans: 0.153/2.182/0.464/0.834ms; rows 51/51/51/26 |
| Viewports | `$env:FINAL_VIEWPORT_AUDIT='true'; npm.cmd run test:e2e:run -- e2e/home.spec.ts --project=desktop-chromium` | PASS | 1/1 in 2.7s; 360 / 390 / 768 / 1024 / 1440 inspected; no clipping/overlap/overflow |
| S9-DEF-024 repeats | `npm.cmd run test:e2e:run -- e2e/prediction-lock.spec.ts` | PASS | three clean E2E repeats: 2/2 in 26.6s, 2/2 in 26.6s, 2/2 in 26.8s; no `[WebServer] Error` |
| Clean clone | `npm.cmd ci` ואז `npm.cmd run verify` ו־`npm.cmd run build` ב־clean-clone | PASS | SHA מדויק; install 425/0 vulnerabilities; 627/1443/28 passed; E2E 5.8m; client scan 52; build exit 0; Git status clean |

## חוזי regression חדשים

- `npm.cmd run hardening:check` נכשל כאשר מרשם זה חסר ובודק שהשערים המקומיים,
  בעלות הסיכונים ופעולות הבעלים נשארים מפורשים.
- `npm.cmd run scale:plans` מריץ fixture מייצג של מאות רשומות ו־`EXPLAIN
  (ANALYZE, BUFFERS)` על ארבעת RPCs המדופדפים. הוא דורש לכל plan זמן מקומי
  קטן מ־500ms ותוצאה תחומה לעמוד אחד; הפלט המלא נשמר רק ב־`tmp/`.
- `FINAL_VIEWPORT_AUDIT=true` מרחיב את `e2e/home.spec.ts` לחמישה viewports,
  RTL, overflow, contrast, touch targets, keyboard focus וצילומי בדיקה מקומיים.
  בדיקת native 200% אינה מוחלפת ב־CSS zoom או emulation.

## ממצאים ועדיפויות

| Priority | מצב מועמד מקומי | Disposition |
| --- | --- | --- |
| P0 | אין finding מקומי ידוע לאחר המטריצה המקומית | אין waiver; כל finding חדש עוצר מועמד |
| P1 | אין finding מקומי ידוע; שערי Hosted/CI למטה פתוחים | אין waiver; owner חייב לסגור לפני הגשה |
| P2 | S9-REQ-005 עצמו פתוח עד השלמת שערי owner | אינו waived ואינו VERIFIED |

אין P2 waived במרשם. אם מתקבלת החלטת סיכון עתידית, נדרשים Owner, Target date
ו־Trigger מפורשים, ובנוסף אישור בעלים מתועד לפני שינוי הסטטוס.

## Advisors וסיסמאות Hosted

אין גישת Hosted מאושרת בריצה המקומית ולכן אין רשימת Advisor עדכנית ברמת item.
הספירה ההיסטורית אינה ראיית סגירה. הבעלים חייב לייצא snapshot מצונזר של
Security Advisor ושל Performance Advisor על final Production SHA, ולתת לכל item
אחד משלושה dispositions: fixed; informational/no-action עם נימוק; או accepted
risk עם Owner, Target date ו־Trigger. כל error, warning או advice ללא disposition
משאיר את S9-REQ-005 פתוח.

יש לאמת read-only שה־Hosted password policy הוא 8–128 תווים ותואם את ה־UI,
ולצרף rate-limit/monitoring רלוונטיים. אין claim ש־leaked-password protection
מופעלת: הסיכון השיורי נשאר בהתאם ל־S9-TDEC-004 עד לשינוי מאושר.

## פעולות בעלים מחייבות

| Gate | הוראת owner מדויקת | Status | Owner | Target date | Trigger |
| --- | --- | --- | --- | --- | --- |
| Hosted password policy | ב־Supabase Dashboard של Production, לקרוא בלבד את min/max password ולצרף צילום מצונזר המוכיח 8–128; לצרף גם הגדרות rate-limit/monitoring. אין לשנות config במהלך האיסוף. | OWNER_ACTION_REQUIRED | Project owner | 2026-09-02 | final Production SHA deployed |
| Hosted Advisors | על final Production SHA לייצא Security Advisor ו־Performance Advisor מצונזרים, ולרשום disposition לכל item; accepted risk מחייב owner/date/trigger ואישור מתועד. | OWNER_ACTION_REQUIRED | Project owner | 2026-09-02 | final migrations applied |
| Native 200% zoom | ב־Chrome native Zoom=200% לבדוק keyboard-only, focus, clipping, overlap ו־horizontal scroll בתרחישי הבית, auth, dashboard, lifecycle ו־members; לצרף SHA וצילומים מצונזרים. | OWNER_ACTION_REQUIRED | Accessibility owner | 2026-09-02 | final Preview deployed |
| GitHub CI billing | לפתור את Billing/Spending limit, להריץ את workflow על final candidate SHA ולצרף run URL ותוצאה ירוקה; אין לעקוף או להשבית job. | OWNER_ACTION_REQUIRED | Repository owner | 2026-09-02 | final candidate pushed |
| Vercel secret scope | להסיר `SPORTS_API_KEY` מ־Preview, לשמור Sensitive Production-only, לפרוס מחדש ולצרף matrix של שמות/types/scopes בלבד וסריקת Preview ללא secret. אין לקרוא את הערך. | OWNER_ACTION_REQUIRED | Vercel owner | 2026-09-02 | secret scope corrected |
| Production Cron | לאחר deploy, לקשר response מצונזר של ה־Cron ל־run סופי יחיד, timeout תקין ו־lease משוחרר; אין לחשוף header או secret. | OWNER_ACTION_REQUIRED | Operations owner | 2026-09-02 | final Production deployment READY |
| Hosted migration parity | להשוות read-only את רשימת המיגרציות ב־Hosted לרשימה המקומית עד המיגרציה האחרונה ולצרף רק versions/status; אין reset או destructive command. | OWNER_ACTION_REQUIRED | Database owner | 2026-09-02 | final migrations applied |
| Evaluator access | לוודא ב־incognito שה־Production URL וה־repository הפרטי נגישים לזהות evaluator המאושרת ולצרף בדיקה מצונזרת ללא פרטי חשבון. | OWNER_ACTION_REQUIRED | Course submission owner | 2026-09-03 | evaluator identity supplied |
| Human rehearsal | לבצע חזרה אנושית מתוזמנת של 10–15 דקות על candidate SHA לפי script, כולל fallback ו־outage; לתעד משך, SHA ובעיות/תיקונים. | OWNER_ACTION_REQUIRED | Presenter | 2026-09-03 | final Preview deployed |
| Final Production SHA | לפרוס את final pushed SHA, לוודא immutable deployment ו־Production alias, ולתעד התאמת SHA מלאה לפני הקפאת ההגשה. | OWNER_ACTION_REQUIRED | Release owner | 2026-09-03 | CI green and owner gates complete |

## סיכון שיורי

- leaked-password protection נשאר סיכון שיורי מאושר ב־S9-TDEC-004 בלבד; אין
  להסיק מכך שהמדיניות Hosted או ההגנות המפצות נבדקו בריצה זו.
- יכולת Sports חיה נשארת תלויה ב־Production-only credential וב־POC המתועד;
  manual adapter ו־seed path נשארים fallback חובה.
- כל שער OWNER_ACTION_REQUIRED למעלה משאיר את המועמד חלקי. אין במסמך זה
  טענת מוכנות לשחרור ואין שינוי במצב Draft של PR #14.
