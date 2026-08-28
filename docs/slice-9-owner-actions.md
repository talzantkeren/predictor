# פעולות owner לסגירת Slice 9

Status: `OWNER_ACTION_REQUIRED`.

זהו סדר העבודה המהיר ביותר לפתיחת התלויות. נשארו כאן **בדיוק חמש רשומות
פתוחות**, אך רק ארבע דורשות פעולה או קלט אנושיים; S9-DEF-012 executable כולו
בידי agent לאחר merge. שתי רשומות שנסגרו נשמרות ברשימה לצורך traceability.
בצעו את השערים הפתוחים על אותו final SHA, אך אל תסמנו PASS
לפני תצפית אמיתית. אין למזג, לאשר, להעביר ל־Ready או להפעיל auto-merge ב־PR
#14. אין לפתוח, להעתיק, לצלם או לשמור secret, כתובת נמען, זהות evaluator,
סיסמה, cookie, signed URL או payload של provider.

## 1. S9-DEF-025 — נסגר

`VERIFIED` ב־28 באוגוסט 2026. רשומת ה־Sensitive הקיימת צומצמה ל־Production
בלבד באמצעות עדכון target בלבד, בלי לקרוא, להדפיס, למשוך או להזין מחדש את
הערך. Preview חדש הגיע ל־READY ועבר smoke במצב Manual ללא key; סריקות bundle
ולוגים עברו, ונצפתה המשכיות Cron ב־Production בקריאה בלבד. המטריצה המסוננת
נמצאת ב־`docs/evidence/slice-9/w5/S9-DEF-025-environment-scope-matrix.md`.

אין פעולת owner שנותרה לרשומה זו. אין להריץ listing גולמי שעלול לכלול עמודת
value.

## 2. S9-DEF-022 — spot-check קצר של Chrome page zoom

מטריצת forced browser scale מלאה כבר עברה 10/10 על
360/390/768/1024/1440, עם `--force-device-scale-factor=2`, ‏DPR 2 ובלי
viewport emulation. היא כוללת שמות, contrast, סדר/focus, יעדי 44×44,
clipping/overlap/overflow וכל מצב rejection. דגל device scale אינו אותו
מנגנון כמו פקד page zoom, ולכן נשארת רק בדיקת rounding/reflow קצרה.

**איפה:** Chrome רגיל, על production build מקומי של ה־final SHA; Menu → Zoom →
`200%`. אין להשתמש ב־CSS zoom או ב־DevTools Device Toolbar/device emulation.

**פעולה יחידה (כ־4 דקות):** לעבור keyboard-only על `/admin/matches`, ‏
`/leagues/<owned-league>/members` ו־`/leagues/<owned-league>/settings` כאשר
Zoom נשאר 200%. בכל מסך לבדוק focus גלוי, שאין control/text חתוך או חופף ושאין
horizontal page scroll. ב־members לעבור ב־Tab את כל scroller הניווט ולהפעיל
את rejection הפסול המתועד; textarea, ‏help+error ו־alert חייבים להישאר גלויים.

**ראיה לשמור:** צילום מצונזר אחד של members/error ו־
`S9-DEF-022/01-chrome-page-zoom-200-spot-check.txt` עם SHA, גרסת Chrome,
שלושת שמות המסכים ו־PASS/FAIL בלבד.

**אימות לאחר הפעולה:** Local Supabase בלבד.

```powershell
npm.cmd run test:e2e -- e2e/accessibility-matrix.spec.ts
npm.cmd run test:a11y:native-scale
npx.cmd vitest run src/lib/admin-loading-accessibility.test.ts
```

## 3. S9-REQ-003 — final Production וגישת evaluator (agent + קלט owner אחד)

**איפה:** PowerShell; GitHub Actions/PR; Supabase Production SQL Editor; Vercel
Deployments; חלון Chrome Incognito; GitHub Settings → Collaborators and teams.

**קלט owner יחיד (כ־2 דקות):** למסור מחוץ ל־Git את זהות GitHub המאושרת של
evaluator ואת שיטת ה־out-of-band המאושרת לגישת Demo. אין למסור credential
ב־Git או בראיה.

**פעולת agent לאחר merge:** לבצע מתחילתו ועד סופו את
`docs/runbooks/slice-9-req-003-final-production-review.md`: להקפיא את
final/main SHA ואת merge commit, לקשור אליו CI ירוק בכל שלושת ה־jobs, להשוות
Hosted migrations, לשמור env names/scopes, לקשור את Production לאותו Source
SHA, לאמת immutable URL ו־alias ב־incognito כ־HTTP 200/Demo-only, להזמין את
הזהות שסופקה כ־read-only ולקבל ממנה אישור. אין לבצע דבר מזה כל עוד PR #14
Draft; ה־runbook אינו נותן הרשאת merge.

**ראיה לשמור:** למלא
`docs/evidence/slice-9/w8/S9-REQ-003-owner-template.md` ולשמור רק את קובצי
ה־CI/migrations/env/Production המצונזרים שה־runbook מגדיר. זהות evaluator
וסיסמאות Demo נשארות מחוץ ל־Git.

**אימות לאחר הפעולה:** 

```powershell
gh run view <final-run-id> --json databaseId,attempt,headSha,status,conclusion,jobs,url
gh pr view 14 --json number,isDraft,state,headRefOid,mergeCommit,mergedAt,url
npm.cmd run submission:evidence:check
npm.cmd run owner-runbooks:check
npm.cmd run docs:submission:check -- --online
```

## 4. S9-DEF-012 — tick טבעי אחד של Production Cron (agent אחרי merge)

**איפה:** Vercel → predictor → Deployments → Production → Source; Supabase
Dashboard → SQL Editor → New query.

**קלט owner:** אין. לאחר merge ו־Production deploy, סוכן מאומת מבצע את
`docs/runbooks/slice-9-def-012-production-cron.md`: להוכיח SHA, migration
`20260827170000`, job יחיד `predictor-sports-sync` עם timeout 45s, ואז להמתין
ל־tick טבעי ולחבר response בטוח אחד ל־terminal `sync_runs` יחיד ול־lease
משוחרר. אין להפעיל route עם secret, לשנות schedule או ליצור Cron שני.

**ראיה לשמור:** למלא
`docs/evidence/slice-9/w5/S9-DEF-012-owner-template.md`; לשמור בחבילת owner את
חמשת הארטיפקטים `S9-DEF-012/01-...` עד `05-...` המוגדרים ב־runbook, ורק את
העמודות המסוננות. אפשר לבצע את פעולות 5–6 בזמן ההמתנה ל־tick.

**אימות לאחר הפעולה:** Local Supabase בלבד.

```powershell
npm.cmd run test -- src/app/api/cron/sync/route.test.ts src/features/sync/orchestrator.test.ts
npx.cmd --no-install supabase test db supabase/tests/slice9-sync-cron-budget.test.sql supabase/tests/sync-api-football.test.sql
npm.cmd run owner-runbooks:check
```

## 5. S9-REQ-005 — Hosted password policy ו־Advisors

Status: `VERIFIED` ב־28.8.2026. אין owner action שנותרה.

ה־Management API וה־CLI נקראו בפועל ללא שינוי Auth וללא חשיפת credential.
הפער 8–128 מול תקרת GoTrue של 72 בתים תוקן בקוד ובבדיקות. כל 28 ממצאי
Security Advisor הראשוניים וכל 20 ממצאי Performance Advisor קיבלו disposition.
שתי אזהרות `rls_auto_enable` תוקנו ב־migration קדימה מבודד וה־Advisor הורץ
מחדש; leaked-password protection נצפה כבוי ונשאר accepted risk של
`S9-TDEC-004`.

**ראיה:** `docs/evidence/slice-9/w8/S9-REQ-005.md` ושלושת קובצי ה־export
המקושרים ממנו. הם מכילים רק שדות allowlisted ותוצאות מסוננות, ללא
project/account IDs או ערכי secret.

**אימות הרשומה:**

```powershell
npm.cmd run hardening:check
npm.cmd run lint
git diff --check
```

## 6. S9-DEF-004 — Hosted confirmation/recovery

**איפה:** Supabase Production → Authentication → URL Configuration, SMTP
Settings, Email Templates, Rate Limits; Chrome private profile על Production;
mailbox disposable מאושר.

ה־Email provider נצפה Enabled, השירות המובנה פעיל במכסה של שתי הודעות לשעה
ולא נדרשת רכישת SMTP. שני callback entries היסטוריים של Preview עדיין קיימים;
agent יסיר אותם לאחר merge דרך URL Configuration בלי secret.

**קלט owner עכשיו (2–5 דקות):** למסור מחוץ ל־Git כתובת מדויקת שהיא גם member
ב־Supabase organization וגם חשבון Auth מוכר; לאשר recovery יחיד; ואז להחזיר
את הקישור שהתקבל מן mailbox. כתובת plus-alias מתאימה רק אם אותו alias מדויק
כבר member. אין למסור password.

**פעולת agent:** לבצע את
`docs/runbooks/slice-9-def-004-hosted-auth.md`: pre-merge send יחיד, callback,
password update עם handoff ללחיצה הסופית, replay denial, logout ו־old/new login.
לאחר merge להסיר את ה־Preview callbacks ולצלם מחדש confirmation/recovery/
known-unknown/429 על final SHA. אין לשמור כתובת, password, callback query או
provider response.

**ראיה לשמור:** למלא
`docs/evidence/slice-9/w2/S9-DEF-004-owner-template.md`; לשמור בחבילת owner את
הארטיפקטים המצונזרים `S9-DEF-004/01-...` עד `10-...` לפי ה־runbook.

**אימות לאחר הפעולה:** Local Supabase/Mailpit בלבד.

```powershell
npm.cmd run test:e2e -- e2e/auth.spec.ts
npm.cmd run owner-runbooks:check
git status --short
```

## 7. S9-REQ-002 — חזרה אנושית רציפה 10–15 דקות

**איפה:** Production הסופי, ה־PPTX
`presentation/predictor1-final-project.pptx`, שתי sessions מורשות ושלוש תמונות
`presentation/fallback/` פתוחות מראש.

**פעולה יחידה:** presenter אנושי מבצע פעם אחת את
`presentation/demo-script.md` עם timer רציף, בלי database mutation שמזייף שלב
מוצרי. במקרה outage עוברים לתמונת fallback המתאימה תוך 20 שניות ומצהירים מה
לא נצפה. משך נדרש: 10:00–15:00.

**ראיה לשמור:** למלא את כל השורות ב־`presentation/evaluator-checklist.md` ואת
השורה האנושית ב־`presentation/rehearsal-log.md`: final SHA, זמן התחלה/סיום,
משך, 9/9 slides, Production/GitHub, fallback ותוצאה; ללא account/credential.

**אימות לאחר הפעולה:** 

```powershell
npm.cmd run presentation:check
npm.cmd run docs:submission:check -- --online
git diff --check
```

לאחר חמש הרשומות הפתוחות, כל failure נשאר גלוי ברשומה שלו. אין להמיר כשל
ל־PASS על בסיס כוונה, צילום חסר או תוצאה מ־SHA אחר.
