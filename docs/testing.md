# Predictor1 — בדיקות

## Slice 1: Auth ופרופיל

הבדיקות של Slice 1 אינן פונות ל־Supabase Production, לשירות Email אמיתי או
לספק חיצוני. Supabase CLI המקומי מספק PostgreSQL, Auth ו־Mailpit, וה־runner של
Playwright קורא ממנו בזמן הריצה רק את כתובת ה־API והמפתח הציבורי המקומי.

### מטריצת כיסוי

| שכבה | כיסוי |
| --- | --- |
| Vitest | נרמול ואימות Email, אורך סיסמה, התאמת סיסמאות, trim וגבולות שם תצוגה, allowlist ל־redirects; תוצאה זהה ל־success/unknown address; מיפוי typed ל־429, outage ו־callback invalid/expired/reused/session mismatch בלי provider copy |
| pgTAP | מבנה `profiles`, FK, constraints כולל Unicode whitespace, מקרי metadata/fallback, התנהגות `updated_at`, RLS, column grants, הרשאות פונקציות, self access וחסימת משתמש זר/anon |
| Playwright | חסימת אורח, אכיפת מינימום סיסמה ישירות ב־Auth, הרשמה ואישור בהקשר דפדפן חדש עם login ידני, Dashboard, עדכון פרופיל, redirects של משתמש מחובר ועוין; שחזור ידוע/לא־ידוע עם copy זהה, delivery דרך Mailpit, mismatch בין דפדפנים, callback באותו דפדפן, עדכון, replay שנדחה, logout, דחיית הסיסמה הישנה והתחברות בחדשה; בידוד קריאה/כתיבה בין משתמשים |
| Visual | עברית ו־RTL, labels, autocomplete, focus states והיעדר overflow ב־390px וב־1440px |

### הרצה מקומית

```powershell
npm ci
npm exec -- supabase start
npm run test
npm run test:db
npm run types:check
npm run test:e2e
```

`npm run test:e2e` בונה build ייצור עם ערכי ה־Supabase המקומיים ואז מריץ את
הזרימות ב־Desktop Chrome וב־Pixel 5. `npm run verify` מריץ את כל שערי האיכות.
אין להריץ `supabase db reset --linked`; reset מותר רק עם `--local`.

בדיקת Preview היא smoke ציבורי נפרד ואינה כוללת Mailpit או משתמשי בדיקה:

```powershell
$env:PLAYWRIGHT_BASE_URL = "https://preview.example"
npm run test:e2e:preview
```

הרצת `npm run test:e2e` עם `PLAYWRIGHT_BASE_URL` נכשלת במכוון, כדי שלא ניתן
יהיה לקבל suite ירוק שמדלג בשקט על זרימות Auth המקומיות.

### Mailpit

כתובת Mailpit מופיעה ב־`supabase status`. בבדיקה האוטומטית מתקבלת ההודעה דרך
ה־API המקומי ונשלף קישור PKCE. בדיקת האישור פותחת אותו תחילה ב־browser context
חדש ומוודאת שהכתובת אושרה ושאפשר להתחבר ידנית. בדיקת השחזור מוודאת שבהקשר חדש
מוצגת הנחיה מדויקת, ואז מבקשת ופותחת קישור חדש באותו context. כך CI מכסה גם
את מגבלת PKCE, נשאר דטרמיניסטי ואינו שולח Email אמיתי. ה־URL הרגיש נשמר רק
בזיכרון הבדיקה; trace, screenshots, video ו־DOM error snapshot כבויים. לאחר
העדכון הבדיקה פותחת שוב את אותו callback, מאמתת `recovery-link-reused`, בודקת
שה־session נסגר, שהסיסמה הישנה נדחית ושהחדשה מתקבלת.

### Slice 9 W2 — תוצאות Auth ו־recovery

ב־26 באוגוסט 2026 הורצו לאחר השינוי `auth-flow-results.test.ts` יחד עם
`auth-rules.test.ts` — 96/96 עברו — ולאחר build הורצה `auth.spec.ts` בשני
הפרויקטים — 6/6 עברו. הראיה המסוננת והפקודות המדויקות נמצאות ב־
[`docs/evidence/slice-9/w2/S9-DEF-001.md`](./evidence/slice-9/w2/S9-DEF-001.md).
המסירה ב־Hosted, חשבון disposable, rate limit וה־callback origins נשארים gate
נפרד שאינו PASS עד לביצוע owner; ראו
[`S9-DEF-004.md`](./evidence/slice-9/w2/S9-DEF-004.md).

## Slice 2: יצירת ליגה, ניקוד ופרסי Demo

Slice 2 ממשיך להשתמש רק ב־Supabase וב־Mailpit המקומיים. אין קריאה ל־Sports,
תשלום או Email hosted. ה־catalog מכיל competition ועונת reference בלבד;
אין teams, fixtures, provider IDs או תוצאות מומצאות.

### מטריצת כיסוי

| שכבה | כיסוי |
| --- | --- |
| Vitest | trim וגבולות שם/תיאור, דחיית תווי בקרה ומפרידי שורה בשם ותווי בקרה בשדות הרב־שורתיים, סכום Demo שלם ולא־שלילי, טווח וסדר חוקי ניקוד, ברירת מחדל 3/1/0 וחוקים שונים לשתי ליגות, המרת אחוזים ל־bps ללא float, מיקומים רצופים/ייחודיים, סכום 10000, קלט malformed/over-precision, מיפוי שגיאות בטוח ו־allowlist ההפניות כולל נתיבי `/leagues/new` וסיכום ליגה עם UUID |
| pgTAP | טבלאות, עמודות, enums, FKs, checks, unique/indexes, reference data, RLS לכל טבלה, grants לטבלאות ולפונקציות, `search_path`, יצירה אטומית, creator manager+active member, גרסה 1, חוקים נפרדים, rollback לקלט שגוי, anon/משתמש זר, מנהל של ליגה אחרת, חבר שהוסר, מנהל ללא חברות פעילה, קריאה ללא subject claim, JSON פרסים malformed, תווי בקרה ומפרידי שורה בשם, חסימת כתיבה ישירה, revoke ל־`service_role`, שיתוף פרופיל מצומצם, policy ללא recursion, נעילת חוקים לפי DB time, triggers של `updated_at` והעברת פרס בין ליגות תחת ה־constraint הנדחה |
| Playwright | empty Dashboard, פתיחת `/leagues/new`, שגיאות מייצגות עם `aria-invalid` ושיוך הודעה, הסרת שורת פרס אמצעית עם מספור אוטומטי רציף, יצירה עם 5/2/0 ושני מיקומי פרס, redirect וסיכום Demo, הופעה ב־Dashboard, deep-link לליגה שחוזר לנתיב המקורי אחרי התחברות, משתמש שני מבודד וחסימת URL מנוחש |
| Visual | Desktop Chrome ו־Pixel 5, עברית/RTL, labels ושיוך הודעות שגיאה ב־aria, empty/error states והיעדר overflow בטופס סביב 390px. מצבי focus ו־pending/disabled נבדקים ידנית ואינם נטענים ככיסוי אוטומטי |

בדיקת ה־Preview נשארת smoke ציבורי בלבד עם `@preview`; בדיקת הליגה אינה מסומנת
כך ואינה תלויה במכסת Email hosted.

מקביליות אמיתית של שתי קריאות `create_league` בו־זמנית אינה ניתנת לבדיקה
ב־pgTAP חד־חיבורי; ההגנה היא האטומיות של הפונקציה וה־constraints, כך שגם
בקשות חוזרות אינן משאירות מצב חלקי.

## Slices 3–4: הזמנה, אסמכתאת Demo והחלטת מנהל

לפי גבול B26 המאושר, כיסוי invite, בקשת ההצטרפות וה־upload הפרטי שייך ל־Slice 3;
כיסוי תור המנהל, הצפייה המורשית, approve/reject והחברות שייך ל־Slice 4. PR #4
מאמת את שני ה־Slices באותה זרימה מקצה לקצה.

כל תמונות הבדיקה מיוצרות בזיכרון בזמן הריצה באמצעות `sharp` או buffers
סינתטיים. אין fixture של קבלה, מסמך פיננסי או קובץ משתמש אמיתי במאגר. בדיקות
ה־route וה־E2E משתמשות רק ב־Supabase/Auth/Storage/Mailpit המקומיים ואינן פונות
ל־hosted Storage.
Playwright מבטל trace, screenshots ו־video, וה־runner מבטל snapshot אוטומטי של
מצב העמוד בשגיאה, מפני שזרימות Auth/invite/signed-access נוגעות ב־bearer URLs.
הבדיקות משתמשות בהשוואות boolean, המתנות UI עם שגיאה קבועה ובעטיפות navigation
מסוננות כדי ש־matcher snapshot או דו"ח כשל לא ידפיסו token. קריאות עם JWT,
cookie, signed URL או proof path משתמשות ב־`fetch` של Node עם שגיאה מסוננת ולא
ב־`APIRequestContext` המתועד של Playwright. אין בדיקת canary ייעודית לדוח HTML;
ההגנה הקיימת היא ביטול trace, screenshots, video ו־page snapshots, יחד עם
שגיאות מסוננות והימנעות מצעדי Playwright שמקבלים URL רגיש. דוחות כשל ו־artifacts
עדיין נסרקים כחלק מבדיקת הדליפה לפני מסירה. כל invite פעיל מבוטל ב־cleanup ככל
שה־session המקומי זמין, ו־fixture התפוגה נמחק ישירות מהמסד המקומי ב־`finally`.

בקישור invite ה־bearer נמצא רק ב־URL Fragment. helper הניווט מבצע browser-side
navigation, מאזין לכל בקשות הרשת עד שה־bootstrap מסיר את ה־Fragment ומכשיל את
הבדיקה בשגיאה קבועה אם secret מופיע ב־request target, headers או body. התרחיש פותח את
אותו קישור שוב עם cookie תקף ומוודא שגם המסך המאומת מנקה את ה־Fragment. בדיקות Route מאמתות
שה־exchange מקבל רק public ID ו־digest, מציב cookie HttpOnly מוגבל לנתיב,
חוסם Origin/body עוינים ומחזיר תשובה אטומה לזוג לא תואם.

### מטריצת כיסוי

| שכבה | כיסוי |
| --- | --- |
| Vitest | secret base64url באורך/entropy הנדרשים, URL Fragment קנוני, public ID/digest/cookie binding, Origin ו־redirect allowlist; mapping שגיאות; DTO מנהל שאינו שומר path/digest; validation לסיבת דחייה; מיפוי RPC אישור/דחייה; request-body bounded גם בלי `Content-Length`; UUID/idempotency; סיומת/MIME/magic; empty/duplicate/missing fields; Sharp decode, WebP, orientation, dimensions, no-enlarge, metadata stripping, multi-page/pixel/size limits; path derivation וגבול admin import |
| pgTAP | schema, public-ID+hash pairing, checks, indexes, RLS/grants ו־`search_path`; one-active invite ו־request; rotation/revoke/expiry/late join/close boundary; actor/status spoofing; בקשה קיימת אחרי revoke; rejected retry; proof append-only/quota/idempotency/current ordering; rate windows; finalizer מאמת object מדויק ואטומיות; bucket פרטי ומגבלותיו; CRUD ישיר ב־Storage נדחה ל־anon/authenticated; תור מנהל מצומצם, חסימת מנהל ליגה זרה, approve אטומי שיוצר חברות יחידה, reject עם reason, replay אידמפוטנטי ו־audit יחיד |
| Route integration | invite exchange עם Origin/body/public-ID/digest/cookie/opaque denial; JPEG/PNG/WebP תקינים; spoofed SVG/HTML/PDF/executable, mismatch, corrupt/empty/oversize/extreme/multi-page; Origin/session/UUID; owner מול IDOR/manager-upload; replace/retry/rate limit; Storage/finalize/cleanup failures; signed access owner/manager מול opaque denial וכותרות no-store |
| Playwright | יצירה/הצגה חד־פעמית/refresh/rotate/revoke של invite; Fragment secret אינו מופיע בשום network target ונמחק מהכתובת; expiry שמתרחש אחרי render נבדק דרך UI → Server Action → DB ומחזיר שגיאה בטוחה ומצב מנהל מדויק; guest → register/login עם public-ID return path → חזרה בטוחה; submit, `pending_proof`, upload סינתטי, `pending_approval`, dashboard, retry והחלפה; קישור ותור מנהל, proof signed access, חסימת מנהל זר, approve דרך UI ו־replay מקבילי שמוביל לחברות פעילה; request/proof substitution ומניעת Storage ישיר; Desktop Chrome ו־Pixel 5 |
| Visual/manual | 390px ו־desktop, RTL, keyboard/focus, labels ו־error summary, `aria-live`, preview מקומי, loading/empty/success/failure וללא overflow |

pgTAP רץ בחיבור יחיד ואינו מוכיח race אמיתי לבדו. בדיקות Playwright/API
משתמשות ב־`Promise.all` עבור rotate, submit ו־upload retry, בעוד constraints,
locks ו־RLS נבדקים בנוסף במסד.

תרחיש ה־expiry של Playwright משנה רק fixture סינתטי בתוך מכולת PostgreSQL של
Supabase המקומי והחד־פעמי. הוא מאמת UUID קנוני, משתמש ב־timestamp יחיד כדי
לשמור על אילוצי lifecycle, דורש בדיוק `UPDATE 1` ואינו מציג stderr של PostgreSQL
שעלול להכיל שורת invite רגישה. העזר אינו קורא URL או credentials ואינו מסוגל
לפנות לפרויקט Supabase מקושר.

### הכנת הסביבה והרצה

```powershell
npm ci
npm exec -- supabase start
npm exec -- supabase db reset --local
npm run lint
npm run typecheck
npm run test
npm run test:db
npm exec -- supabase db lint --local --schema public,private --level warning --fail-on error
npm run types:check
npm run build
npm run test:e2e
```

ה־runner קורא מ־`supabase status -o json` את `API_URL`, `PUBLISHABLE_KEY` ואת
`SECRET_KEY`, ומעביר את הסוד רק לתהליך Node המהימן שמריץ את build, שרת הבדיקה
ו־Playwright כ־`SUPABASE_SECRET_KEY`; הוא אינו נשלח לדפדפן, לדוח או ל־stdout.
ה־gateway נטען lazy כדי ש־build שאינו מפעיל Storage יישאר בטוח, אך route
העלאה/צפייה נכשל סגור ללא הסוד.

לבדיקה ידנית: יוצרים ליגה, נכנסים ל־settings, יוצרים קישור בצורת
`/invite/[publicId]#invite=[secret]`, פותחים אותו בחלון פרטי ומוודאים שה־Fragment
נעלם מיד אך פרטי הליגה נטענים. משלימים Auth דרך Mailpit, מגישים בקשה ומעלים
תמונה סינתטית. מאמתים
`pending_approval` גם ב־Dashboard ופותחים את התמונה דרך endpoint ההרשאה בלבד.
לאחר מכן נכנסים כמנהל/ת דרך קישור "ניהול בקשות הצטרפות", צופים בהוכחה, מאשרים
או דוחים ומוודאים את מצב הבקשה והחברות משני החשבונות.
אין להשתמש ב־`supabase db reset --linked` או בתמונה פיננסית אמיתית.

## Slice 5: משחקים, ניחושים, נעילה וחשיפה

בדיקות Slice 5 משתמשות רק ב־Supabase המקומי וב־fixtures שנוצרים בתוך transaction
או בתוך מכולת PostgreSQL המקומית. אין קריאה לספק Sports ואין שימוש בשעון
הדפדפן כגבול קבלה. בדיקות Slice 5 הרגילות אינן ממתינות ל־kickoff; בדיקת W1
הייעודית משתמשת בכמה חיבורי PostgreSQL אמיתיים כדי לחצות אותו. ה־seed הקבוע הוא Demo ידני בלבד;
בדיקות הניחושים יוצרות קבוצות ומשחקים משלהן ולכן אינן תלויות בו.

### מטריצת כיסוי

| שכבה | כיסוי |
| --- | --- |
| Vitest | parsing קשיח של ציונים שלמים 0–30; דחיית ריק/שלילי/31/fraction; מיפוי חמשת הסטטוסים ומצבי open/editable/locked/unavailable; `draft`/`open`/`active` לעומת `completed`/`archived`; גבול millisecond לפני/בדיוק/אחרי; countdown טהור עם יחיד/רבים תקינים; UTC→`Asia/Jerusalem` ואזור זמן נוסף; גבולות תאריך DST; round/date search params; allowlist לנתיבי המשחקים ומיפוי `PREDICTION_LOCKED` בטוח |
| pgTAP | enum/generated outcome, schema/checks/unique/indexes, RLS/grants/function privileges/`search_path`; active create/update/retry ושינוי `updated_at`; HOME/DRAW/AWAY; season consistency גם בכתיבה privileged; direct INSERT/UPDATE/DELETE denial; בדיוק/אחרי kickoff ו־fixture עתידי מרווח; scheduled/postponed לעומת live/finished/canceled; `completed`/`archived` read-only ו־FORBIDDEN אטום לזר; pending proof/approval, rejected, removed, outsider, other league ו־cross-season denial; owner-only לפני kickoff, שתי שורות לחברים פעילים ב־/אחרי kickoff ואפס לזר; late join; stale RPC replay; `points=0` וכל metadata הניקוד `NULL` |
| Playwright | שני חברים מאומתים ב־Desktop Chrome/UTC וב־Pixel 5/`Asia/Jerusalem`; רשימת משחקים וכל חמשת הסטטוסים/תוצאה/שעה מקומית/נעילה; create→refresh timestamp→edit; `Promise.all` כפול שמחזיר שורה אחת; UI, תוכן ה־RSC ו־PostgREST שמסתירים ניחוש אחר לפני kickoff; שינוי kickoff מקומי לעבר ללא sleep; stale create/edit וה־RPC הישיר נדחים; reveal לשני החברים; outsider ולאחר מכן pending requester מקבלים not-found ואפס שורות; RTL וללא overflow |
| Manual/Preview | כניסה כחבר פעיל, בדיקת רשימה ומסנן, שמירה ועריכה, שעה מוחלטת + timezone, stale-tab בטוח וחשיפה בשני חשבונות. Preview דורש שה־migrations החדשות יוחלו בפרויקט Supabase המורשה לפני בדיקה מאומתת |

`now()` של PostgreSQL קבוע בתוך transaction ולכן אינו סמכות תקינה ל־commit
שהמתין על lock. ה־RPC דוגם `clock_timestamp()` אחרי נעילת match; fixture עם
`kickoff_at := now()` עדיין מוכיח דחייה מדויקת, ו־fixture עתידי מרווח מוכיח
הרשאה רגילה ללא תלות במשך ה־suite. Playwright משנה fixture סינתטי לדקה בעבר דרך helper
שמקבל UUIDs קנוניים בלבד, דורש בדיוק `UPDATE 1` ואינו מדפיס stderr. כך גם טופס
שכבר פתוח נבדק מול זמן המסד בפעולת השמירה.

`predictions.test.sql` הוא חיבור יחיד; ה־unique constraint, נעילת שורת המשחק
וה־upsert נבדקים בו, ו־Playwright מוסיף שתי קריאות `save_prediction` מקבילות.
ה־race על זמן נבדק בנפרד ב־`slice9-time-serialization.test.sql` עם dblink
אסינכרוני ו־row lock אמיתי — לא באמצעות `Promise.all` או שעון Node.

ה־seed הקבוע כולל רק מועדים עתידיים (`scheduled`, `postponed`, `canceled`) ולכן
אינו נועל מיד את חוקי הניקוד. trigger `enforce_scoring_rule_lock` עדיין בוחן את
המועד המוקדם ביותר בעונה: לאחר שמועד ה־Demo הראשון יעבור, עדכון חוקי ניקוד לכל
ליגה באותה עונה יידחה. אין ב־seed תוצאה finished או kickoff עבר; תצוגת finished
נבדקת רק ב־fixtures המבודדים של pgTAP/Playwright.

בדיקת `leagues.test.sql` לעריכת חוקי ניקוד משתמשת בעונה ובליגה מבודדות שנוצרות
בתוך ה־transaction. לכן הגעת ה־seed הקבוע למועד kickoff בעתיד אינה שוברת את
ה־suite; הבדיקה עצמה מזיזה רק את משחק ה־fixture המבודד אל `now()`.

הרצה ממוקדת בזמן פיתוח:

```powershell
npm run test -- src/features/predictions/predictions-rules.test.ts src/features/auth/auth-rules.test.ts
npm exec -- supabase test db supabase/tests/predictions.test.sql
npm run test:e2e -- prediction-lock.spec.ts
```

## Slice 6: תוצאות, ניקוד ודירוג

בדיקות Slice 6 משתמשות בתוצאות ובחוקי ליגה סינתטיים בלבד. אין קריאת Sports
חיה ואין תלות בתוצאה אמיתית. כל fixture של pgTAP נגלל לאחור; Playwright יוצר
משתמשים, ליגה ומשחק ייעודיים ב־Supabase המקומי ומסיר אותם בסיום.

### מטריצת כיסוי

| שכבה | כיסוי |
| --- | --- |
| Vitest | specification executable בדיקתי לסיווג HOME/DRAW/AWAY ול־exact/correct/wrong ב־3/1/0 ובחוקים מותאמים; Zod ל־finished/canceled וציונים 0–30; מיפוי שגיאת kickoff ושם חסר בטוחים; חלוקת אחוזי מקומות משותפים ב־basis points ללא floating point |
| pgTAP | schema/RLS/grants של `system_admins`; בדיקת admin עצמי; חתימה והרשאות מדויקות של `score_match`; exact, בית, חוץ, תיקו וטעות; דחיית `finished` לפני kickoff ללא mutation; חוקים שונים לשתי ליגות באותו משחק; retry ששומר נקודות/metadata/timestamps/audit; correction שמחליף; cancel שמאפס flags ונקודות בלי למחוק; `security_invoker` leaderboard, ספירת הגשות רק אחרי kickoff, חבר ללא ניחוש, exact כתצוגה בלבד ודירוג 1,1,3; denial ל־anon/authenticated, actor חסר/זר ודירוג ליגה זרה |
| DB concurrency | שני חיבורי `dblink` אמיתיים מפעילים `score_match` ו־`save_prediction` במקביל. ה־score נועל match בלבד; השמירה ממתינה לו ומסתיימת ב־`PREDICTION_LOCKED` הצפוי, ללא deadlock או lock timeout |
| Playwright | מנהל מערכת מאומת מזין 2–1 דרך `/admin/matches`; משתמש רגיל נדחה גם מהנתיב וגם מקריאת RPC ישירה; `/leagues/[leagueId]/standings` מציג לחבר דירוג 1,1,3 ב־Desktop וב־Mobile; RTL וללא overflow |

בדיקת המקביליות משתמשת רק במכולת PostgreSQL המקומית וב־credentials המקומיים
הקבועים של Supabase CLI. היא חוסמת זמנית את שורת actor של audit כדי ליצור סדר
מתוזמן: `score_match` מחזיקה את match, ובאותו זמן `save_prediction` מחזיקה את
league ואת membership וממתינה ל־match. שחרור החסימה מוכיח ששני התהליכים
מסתיימים בלי מעגל נעילות. אין להריץ את קובץ הבדיקה מול פרויקט linked/hosted.

קובץ `src/features/scoring/__tests__/scoring-specification.ts` הוא חוזה בדיקתי
בלבד ואינו מיובא בקוד הייצור. הוא מגן על דוגמאות SCORE-01/02 ועל מטריצת
החוקים; בדיקת pgTAP שמפעילה את `public.score_match` האמיתי היא הסמכות לכך
שמימוש SQL הייצורי תואם לחוזה.

הרצה ממוקדת בזמן פיתוח:

```powershell
npm run test -- src/features/scoring/scoring-rules.test.ts src/features/scoring/prize-allocation.test.ts src/features/scoring/schemas.test.ts src/features/scoring/errors.test.ts src/features/scoring/queries.test.ts
npm exec -- supabase test db supabase/tests/scoring.test.sql
npm run test:e2e -- scoring.spec.ts
```

### S9-DEF-008 — החזרת ownership ידני ל־API-Football

הגבול החדש אינו מקבל match ID סמכותי מהטופס. Server Component לוכד את ה־UUID
שנטען מהמסד, ה־mutation דורשת confirmation ו־resource AuthZ, ורק RPC מצומצמת
ל־service role משנה ownership. הבדיקות משמרות את התוצאה הנוכחית עד snapshot
ספק מאומת עתידי; אין קריאת רשת חיה לספק.

| שכבה | כיסוי |
| --- | --- |
| Vitest | confirmation literal מדויק; missing/null/blank/forged נדחים; קוד provider-ownership ממופה להודעה בטוחה |
| pgTAP | חתימה, `SECURITY DEFINER`, `search_path`, grants ו־actor קבוע; ordinary user/actor חסר או מבוטל; API-Football בלבד; completed/archived fail-closed; result/status/version/provider metadata/latch/predictions נשמרים; clear ראשון typed+audit יחיד ו־replay typed ללא timestamp/audit נוסף |
| dblink | sessions PostgreSQL אמיתיות עם timeouts חסומים מוכיחות duplicate clear יחיד, clear מול apply מגודר שלא מאבד תוצאה ומאפשר provider resume, ו־revocation מול clear ללא deadlock |
| Playwright | Desktop Chrome ו־Pixel 5: checkbox confirmation, focus על שגיאה, יעד UUID שנלכד בשרת מול hidden `matchId` מזויף, direct-RPC denial למשתמש רגיל, תיקון provider-owned ואז clear, תוצאה/ניקוד/provenance/latch נשמרים, audit יחיד, RTL וללא overflow |

הרצה ממוקדת בזמן פיתוח, על Supabase מקומי בלבד:

```powershell
npm run test -- src/features/scoring/schemas.test.ts src/features/scoring/errors.test.ts
npm exec -- supabase test db supabase/tests/manual-override-clear.test.sql supabase/tests/manual-override-clear-concurrency.test.sql
npm run test:e2e -- e2e/scoring.spec.ts
```

הרצה ממוקדת שנצפתה ב־27.8.2026 על schema שנבנה מחדש מקומית:

```text
manual-override-clear.test.sql + manual-override-clear-concurrency.test.sql:
91/91 PASS
scoring.test.sql + sync-api-football.test.sql: 148/148 PASS
schemas.test.ts + errors.test.ts: 26/26 PASS
e2e/scoring.spec.ts: Desktop Chrome 1/1, Pixel 5 1/1 PASS
```

גם generated DB types היו זהים ל־schema, `tsc --noEmit`, ESLint וה־production
build הסתיימו ב־exit 0. הפירוט המדויק והכשלים הראשונים שתוקנו נשמרים ב־
`docs/evidence/slice-9/w3/S9-DEF-008.md`.

## Slice 7 baseline ו־S9-DEF-003: Cron במסלול ידני

ה־baseline שנמסר ב־Slice 7 החזיר `skipped/MANUAL_PROVIDER`. S9-DEF-003 הסיר את
ה־RPC הישן והחליף אותו ב־import מקומי, חסום ואידמפוטנטי של
`manual-catalog-v1`. בדיקות הרגרסיה משתמשות רק ב־Manual provider וב־Supabase
המקומי; המסלול החי וה־planner מתועדים בסעיף Slice 7b להלן.

### מטריצת כיסוי

| שכבה | כיסוי |
| --- | --- |
| Vitest | parity מדויק של 6 teams ו־5 matches בין adapter ל־manifest, rejection של catalog זר, payload יחיד ל־gateway ו־APPLIED/NO_CHANGE/CONFLICT; validator UTC דוחה תאריך קלנדרי בלתי אפשרי; Route נשאר מסונן ו־server-only |
| pgTAP | הסרת ה־RPC הישן; wrapper payload-only מסוג `SECURITY DEFINER`; core מלא `SECURITY INVOKER` ללא grant ל־PUBLIC/anon/authenticated/service role; actor חסר/malformed/שהוסר ללא mutation; זמן owner-only מפורש מוכיח APPLIED לפני kickoff ו־conflict אחריו; parity לכל שדות הזהות וה־provider; APPLIED/replay/audit/run counts; conflict אטומי ל־provider-owned/drift/latch/completed/archived; prediction קיים אינו מפריע ל־catalog replay זהה; create/correct חוסם שינוי זהות עם prediction או latch |
| dblink | שתי sessions אמיתיות מוכיחות שסדר `leagues → matches` חוסם completion-vs-create ו־completion-vs-catalog. מרוץ ה־catalog קורא ל־core המלא בזמן בטוח קבוע, ולכן lifecycle guard ולא תאריך ההרצה מסביר את ה־conflict ואת שורת ה־run הסופית |
| Route | method/content-type, secret חסר/שגוי, env חסר, actor שנדחה ושגיאת DB לא צפויה; אין קריאת gateway לפני הרשאה, קריאה אחת בלבד בהצלחה ותגובות `private, no-store` ללא secret/actor/SQL |
| Playwright | provider outage אינו משפיע על Manual; Cron משחזר leaf חסר, replay מהמסך מחזיר no-change, שתי שורות terminal נשמרות, אין browser request לספק; מסך מנהל יוצר match עם UUID יציב ו־replay אינו יוצר כפילות |

קריאות ה־public RPC ב־pgTAP וב־Playwright משתמשות תמיד בזמן המסד האמיתי. מאחר
שלאחר kickoff קטלוג חסר חייב להיכשל סגור, הבדיקות מקבלות רק אחד משני outcomes
עקביים (`MANUAL_APPLIED` עם כל ה־rows וה־audit, או conflict אטומי) ואינן מסיקות
את ההחלטה מ־`started_at`/`finished_at`. אין test header או clock override ציבורי.

בדיקת המקביליות ב־`supabase/tests/manual-match-concurrency.test.sql` פותחת שתי
sessions מקומיות דרך dblink ומסנכרנת אותן בעזרת advisory locks בדיקה. היא פועלת
רק מול מכולת PostgreSQL החד־פעמית של Supabase CLI, מתקינה ומסירה נתוני בדיקה,
ואינה מורשית מול `--linked` או hosted.

ה־E2E runner מייצר `CRON_SECRET` אקראי בזיכרון לכל הרצה ומעביר אותו רק
לתהליכי build, server ו־Playwright. actor מקומי קבוע נוצר ב־seed; הסוד, actor
header ו־admin key אינם נכתבים לדוח או ל־stdout. קריאת Cron נעשית ב־Node
`fetch` עם שגיאה מסוננת, לא בצעד Playwright שמתעד headers.

הרצה ממוקדת בזמן פיתוח:

```powershell
npm run test -- src/app/api/cron/sync/route.test.ts src/features/sports/sync-planner.test.ts src/features/sync/display.test.ts src/features/sync/errors.test.ts src/features/sync/queries.test.ts
npm exec -- supabase test db supabase/tests/sync.test.sql supabase/tests/manual-match-fallback.test.sql supabase/tests/manual-match-concurrency.test.sql
npm run test:e2e -- e2e/sync.spec.ts e2e/scoring.spec.ts
```

## Slice 7b: API-Football Sync חי עם fixtures מוקלטים

בדיקות Slice 7b אינן מקבלות `SPORTS_API_KEY` ואינן פונות לרשת הספק. ה־client
מקבל fake transport, וכל responses הן fixtures מסוננים תחת
`src/features/sports/__fixtures__/api-football`. E2E רץ עם `manual`, ונתוני
provider-owned שהוא מציג נזרעים ישירות במסד המקומי; אין fallback לקריאה חיה.

### מטריצת כיסוי

| שכבה | כיסוי |
| --- | --- |
| Vitest client | envelope array/object errors, invalid JSON/schema, paging, duplicate IDs, 8 MiB cap, abort/timeout, 403, 429, 499/5xx, `Retry-After` קצר שמבצע retry מוצלח ו־45/120/date שחוזרים מיד כ־rate limit, hint חסום ל־3,600, retry/backoff/jitter חסומים, `Accept`, ביטול body שלא נצרך, quota תקין בלבד ו־redaction ללא key/URL/header גולמי |
| Vitest adapter | league 383, כל 14 team IDs והמיפוי העברי, codes כפולים, unknown team fallback, 26 round labels, future-stage review, NS/FT, כל status מתועד, live score→null, `score.fulltime`, score חסר, AET/PEN review ו־UTC consistency |
| Vitest planning | catalog/targeted/reconciliation plans, no-due, quota backoff, batches של עד 20 IDs, עד 20 קבוצות ועד 50 fixtures ל־apply, fixturesSeen עד 1,000, operator notes עד 100 עם overflow marker, קבוצה חדשה מתוך fixture, retry/correction ו־manual override exclusion; provider/planner/apply/finalize מקבלים קודים נפרדים, safe counters וללא secret/PII, ו־finalizer שנכשל נקרא פעם אחת בלבד |
| pgTAP | schema/RLS/grants; browser denial; actor validation; claim מקביל בשתי sessions אמיתיות; `NOT_DUE` ללא row; force cooldown/backoff; reclaim ו־abandoned run; generation/token/provider/run/expiry fencing; atomic apply/finalize; בידוד regression בתוך batch; ביטול מוקדם ללא חשיפת ניחוש; reactivation עם איפוס metadata/leaderboard; provider-ID upsert idempotent; Demo isolation; AET review והחרגה מ־targeted; FT/correction/retry דרך `score_match` ואודיט source |
| Route/Action | Cron auth/content type/env; manual/API-Football/not-due/concurrent/success/failure; קריאת orchestration יחידה; trigger של system admin בלבד; safe response ללא סוד/token/generation |
| Playwright | ordinary user מול system admin, status page ו־manual trigger, שורות observability שנזרעו ישירות, provider AET fixture שנזרע ומוצג כ־"דורש בדיקה" בלי לפתוח prediction, ו־Desktop/Pixel RTL. אין כאן fake live-provider flow; הפרדת key נבדקת non-vacuously ב־build API-Football עם sentinel וסריקת HTML/client artifacts לפני הפעלת השרת ב־manual. |

S9-DEF-010 מוסיף pgTAP דטרמיניסטי עם 25 stale ומשחק live אחד. שלושה claims
עוקבים חייבים לבחור targeted → catalog → reconciliation, לשמור live בראש
מכסת 20, generation מונוטוני ו־tokens שונים, ולסיים דרך fencing הקיים.
`NOT_DUE` ו־`PROVIDER_BACKOFF` אינם מוסיפים run; בדיקת orchestrator מאמתת שגם
transport, apply ו־finalize אינם נקראים כאשר ה־claim מחזיר `NOT_DUE`.

S9-DEF-011 מכסה את מסלול ברירת המחדל של שלושה ניסיונות ב־Vitest,
orchestration/finalize ללא provider חי, ו־pgTAP שמוכיח שמירת quota, ‏backoff
מדויק וחסימת scheduled/force. הפקודות והפלט המצונזר נמצאים ב־
[`docs/evidence/slice-9/w5/S9-DEF-011.md`](./evidence/slice-9/w5/S9-DEF-011.md).

S9-DEF-012 מוסיף fake transport של שלושה ניסיונות בני 7 שניות תחת שעון Vitest
מבוקר; הוא נכשל סופית אחרי 21.75 שניות לוגיות ומוכיח finalize יחיד. בדיקת
Route קושרת את 30/45/60/120, ו־pgTAP מתקין fixture של job ישן ללא HTTP, מוכיח
rename/timeout/preservation/idempotency/duplicate denial וכן denial אפקטיבי
ל־Data API. ראיית Hosted לאחר deploy נשארת owner action מפורשת ב־
[`docs/evidence/slice-9/w5/S9-DEF-012.md`](./evidence/slice-9/w5/S9-DEF-012.md).

S9-DEF-018 מוסיף fixture מדויק של שורת RPC ‏`NOT_DUE/FORCE_COOLDOWN` ל־parser
הטהור, בדיקת orchestrator ללא transport/apply/finalize, Route ‏200 ו־Action
עם copy cooldown. ‏pgTAP מאמת את השורה האמיתית ואת היעדר שורת run חדשה. parser
הופרד ממודול ה־admin כדי ש־import sentinel יישאר ללא allowlist חדש. הראיה ב־
[`docs/evidence/slice-9/w5/S9-DEF-018.md`](./evidence/slice-9/w5/S9-DEF-018.md).

### Slice 9 W1 — serialization וזמן מסד

`supabase/tests/slice9-time-serialization.test.sql` פותח חיבור control, holder,
worker ו־system-admin אמיתיים אל PostgreSQL המקומי. הוא צופה ב־
`wait_event_type = 'Lock'`, חוצה גבול לפי `clock_timestamp()` של המסד ורק אז
משחרר את השורה.
119 assertions מכסים: שמירת ניחוש שמתחילה לפני kickoff ומשתחררת אחריו; ביטול
שחוצה kickoff ו־reactivation עתידי; ביטול מוקדם שמועדו המקורי חל; latch גם תחת
manual override; apply אמיתי שמחזיק match במקביל ל־`save_prediction` שמחזיק את
prefix הנעילות league/member, עם probe עצמאי שמוכיח ב־`NOWAIT` ששורות ה־prefix
טרם ננעלו על ידי apply; due של reconciliation; forced cooldown; provider
backoff; lease expiry/reclaim; claimant זכאי שממתין שלוש שניות ועדיין מקבל יותר
מ־118 שניות זמינות; ו־120 שניות מדויקות מ־`sync_runs.started_at`. לכל waiter יש
`statement_timeout`/`lock_timeout`, והבדיקה שוללת deadlock או timeout.

הרצה ממוקדת שנצפתה ב־26.8.2026:

```powershell
npx supabase test db supabase/tests/slice9-time-serialization.test.sql
npx supabase test db supabase/tests/predictions.test.sql
npx supabase test db supabase/tests/scoring.test.sql
npx supabase test db supabase/tests/sync-api-football.test.sql
npm run types:check
```

התוצאות שנצפו: 119/119, 81/81, 73/73 ו־75/75 בהתאמה, ו־generated types ללא
drift. אין להריץ את ה־dblink suite מול פרויקט linked/Hosted.

### הרצה

```powershell
npm ci
npm exec -- supabase start
npm exec -- supabase db reset --local
npm run lint
npm run typecheck
npm run test
npm run test:db
npm exec -- supabase db lint --local --schema public,private --level warning --fail-on error
npm run types:check
npm run build
npm run test:e2e
```

`SPORTS_API_PROVIDER=manual` נשאר ברירת המחדל ל־build רגיל. בדיקות env מאמתות
ש־`api-football` ללא key נכשל סגור, אך fake transport tests מזריקות key דמה
שאינו credential ואינו מגיע לדוח. live canary אינו חלק מ־CI ומבוצע רק לאחר
merge, migration ו־Vercel provisioning מאושרים.

ראיות ה־Hosted canary המסוננות נמצאות ב־
[`evidence/api-football-canary-2026-08-24.md`](./evidence/api-football-canary-2026-08-24.md).

## Slice 7c: Design System ורענון UI

Slice 7c אינו משנה schema או חוקים עסקיים. בדיקות העיצוב מתווספות מעל
הכיסוי הפונקציונלי וההרשאתי הקיים ואינן מחליפות אותו.

### מטריצת כיסוי

| שכבה | כיסוי |
| --- | --- |
| Review לפני קוד | ארבעה מסכי עוגן ב־390px וב־1440px, token sheet, inventory רכיבים וכיוון חזותי אחד שאינו מוסיף route או feature |
| Playwright | `/dashboard`, תקציר ליגה, משחקים ודירוג ב־Desktop Chrome וב־Pixel 5; app shell, RTL, סדר בית/חוץ, טקסט עברי/לטיני, labels, focus והיעדר overflow; הזרימות הקיימות לניחוש, חשיפה, דירוג ו־proof נשארות ירוקות |
| Visual/manual | 390px, 768px ו־1440px; loading/empty/error/success/disabled/locked; keyboard מלא, touch targets, ניגודיות AA ו־`prefers-reduced-motion` |
| Security regression | אין SDK/key של כלי עיצוב ב־bundle; אין טעינה מוקדמת של proof פרטי; צפייה ממשיכה דרך Route ההרשאה; אין שינוי ב־RLS/AuthZ או ב־negative tests |
| Scope audit | אין `/leagues` חדש, תמונת פרופיל, היסטוריית דירוג, התראות, theme גלובלי או dependency UI/אייקונים/אנימציה לא מאושרת |

### שער יציאה

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

`npm run test:db` ו־`npm run types:check` אינם אמורים להשתנות ב־Slice 7c,
אך מורצים ב־verify המלא לפני merge כדי להוכיח שלא נוצר drift. תוצאות הבדיקה
הידנית נרשמות ב־PR עם רוחב, מסך ומצב שנבדקו; אין לשמור screenshot שמכיל PII,
אסמכתאה, signed URL או secret.

### תוצאת אימות — 24 באוגוסט 2026

- `lint`, `typecheck` ו־`build` עברו.
- Vitest: כל 460 הבדיקות עברו, כולל הכרזת countdown תחומה למשחקים רחוקים.
- pgTAP: כל 646 הבדיקות בעשרה קבצים עברו; בדיקת drift ישירה מול Supabase
  המקומי אישרה ש־`database.generated.ts` עדכני.
- Playwright: כל 20 התרחישים עברו ב־Desktop Chrome וב־Pixel 5, כולל AuthZ,
  נעילה, חשיפה, דירוג, Sync ו־proof פרטי.
- Visual QA: ארבעת מסכי העוגן צולמו ונבדקו עם נתוני Demo מסוננים ב־390px,
  ב־768px וב־1440px. ה־RTL, Heebo, סדר בית/חוץ והיעדר overflow נשמרו.
- ביקורת המשך אימתה יחס ניגודיות של לפחות 5.30 ל־`ink-muted` על לבן, רקע
  האפליקציה ושורת המשתמש בדירוג; שלדי המשחקים והעלאת האסמכתאה עברו ל־tokens.
- סגירת הביקורת ב־25 באוגוסט הוסיפה `control-border` ביחס של לפחות 3:1 לכל
  בקר טופס גלוי. Playwright מאמת את ערך המסגרת המחושב בשדות הניחוש ואת בידוד
  שמות הבית והחוץ בכותרת המשחק. מסכי החברים וההגדרות נבדקו מול אותה מעטפת
  ו־tokens בלי שינוי ב־AuthZ, ב־queries או ב־Actions.
- סגירת הערות S3 מאמתת ב־Playwright שרקע שדה מיקום הפרס ורקע שדה/מקטע קישור
  ההזמנה הם לבנים ושמסגרת שניהם היא `rgb(127, 144, 164)`. כך היחס הוא 3.27:1
  משני צדי המסגרת; מצבי focus ו־disabled בקובצי Auth והתוצאה הידנית משתמשים
  רק ב־tokens המשותפים.
- בדיקות ההמשך מקבעות גם accent אמרלד בעובי 4px במקטע הקישור, focus גלובלי
  עקבי ל־`summary`, כפתור Auth ראשי ב־`action` ושדה Auth לבן עם
  `control-border`. בדיקות הזרימה המלאות נשארות אותן בדיקות ולא מוחלפות
  בבדיקות צבע.
- `npm run test:e2e` כולל build עם sentinel server-only וסריקת primitive
  `test:client-secrets:scan` לפני הפעלת השרת. `npm run test:client-secrets`
  הוא שער עצמאי שבונה וסורק בעצמו; `npm run verify` מריץ אותו במפורש ואז מפעיל
  `test:e2e:run` מול אותו build. כך גם CI וגם verify אוכפים את הסריקה ישירות
  בלי build כפול.

## Slice 8: דוח מנהל לא־כספי

בדיקות Slice 8 קוראות רק את Supabase המקומי דרך session משתמש ו־RLS. אין
admin client, migration, RPC חדש, ספק חיצוני, AI, תשלום, קופה, פרס כספי או
חישוב payout. ה־E2E יוצר משתמשים ונתוני ליגה סינתטיים במסד המקומי החד־פעמי;
אין שינוי Hosted או Production.

### מטריצת כיסוי

| שכבה | כיסוי |
| --- | --- |
| Vitest — queries | count exact של חברויות `active` בלבד; `pending_approval`, `pending_proof` ו־`rejected` כשאילתות נפרדות; אין קריאת `payment_proofs`; filter מדויק של league ID; ordinary member/manager אחר, שורה שמוסתרת ב־RLS וכשל query נעצרים לפני counts; `null`, שלילי, fraction, `NaN`, infinity ו־unsafe integer נכשלים סגור, ו־501 תקין נשאר זמין |
| Vitest — service | creator-only, אפס חברים ודירוג ריק, ספירות סטטוס נפרדות, ranking `1,1,3`, שמות תצוגה כפולים עם keys שונים לפי `userId`, authorization לפני standings, שגיאת limit מן ה־standings הקיים ו־`completed` בלבד כדירוג סופי |
| רגרסיית scoring | `mapStanding` ממשיך לדחות aggregate חסר או unsafe; `getLeagueStandings` וה־view הקיימים נשארים מקור האמת ואין ranking משוכפל בדוח |
| Playwright | guest מוחזר ל־login עם `next` מאומת; המנהל המדויק מגיע דרך tab "דוחות" ורואה 2 חברים פעילים וספירה נפרדת אחת לכל סטטוס; חברות `removed` אינה נספרת; חבר פעיל ומנהל ליגה אחרת מקבלים not-found אטום; fixtures מבודדים של `active` ו־`completed` מוכיחים current/final rendering בלבד עד שזרימת lifecycle תושלם ב־Slice 9; notice קבוע; אין currency/percentage/AI/payment link; table+caption בדסקטופ, cards ב־Pixel 5, RTL וללא overflow |
| Visual/manual | 390px ו־1440px, loading/error/empty, keyboard/focus, headings סמנטיים, caption לטבלה, טקסט ארוך ושמות כפולים ללא overflow |

העובדה שקבצי proof מרובים אינם משפיעים על הספירה מוכחת גם מבנית: query הדוח
קוראת רק `join_requests` עם count exact לפי status ואינה מצרפת או קוראת את
`payment_proofs`. ה־RLS הקיימת נשארת הגנת עומק; בדיקת ה־Service אינה מחליפה
את בדיקות ה־manager/other-manager ב־Playwright.

### הרצה ממוקדת

```powershell
npm run test -- src/features/reports/queries.test.ts src/features/reports/service.test.ts src/features/scoring/queries.test.ts src/features/auth/auth-rules.test.ts
npm run test:e2e -- e2e/reports.spec.ts
```

לפני מסירה מורצים גם `npm ci`, reset מקומי, pgTAP הקיים, drift, build,
`npm run verify` ו־`git diff --check`. אין לסמן את Slice 8 כנמסר אם אחד מן
ה־gates לא רץ בהצלחה בפועל.

### תוצאת אימות — 25 באוגוסט 2026

- `npm ci`: 425 packages הותקנו, audit מצא 0 vulnerabilities.
- `lint`, `typecheck`, build, DB lint ו־generated-types drift עברו.
- Vitest: כל 489 הבדיקות ב־36 קבצים עברו.
- pgTAP: כל 646 הבדיקות בעשרה קבצים עברו לאחר reset מקומי מלא.
- Playwright ממוקד לדוח: 2/2 עברו; `npm run verify` המלא: 22/22 עברו
  בדסקטופ וב־Pixel 5, כולל AuthZ, current/final והיעדר overflow.
- client-secret scan עבר על 50 build artifacts. לא בוצעה קריאת ספק חיה,
  mutation Hosted, deploy או merge.

## Slice 9 — S9-DEF-007: עריכת הגדרות ליגה

| שכבה | כיסוי ממוקד ותוצאה ב־27 באוגוסט 2026 |
| --- | --- |
| Vitest | 45/45: validators, UTC עד microseconds, שנת אפס/זמן לא סופי, scoring/prizes, version/error adapters ו־lock helper |
| pgTAP | 56/56: schema/check/ACL, ללא UPDATE ישיר או admin policy רחב, manager/admin/foreign/revoked/opaque denial, valid/invalid/stale/replay, join close, exact timestamp, locks/status/audit |
| dblink | 75/75: conflicting וגם identical writers, validation לפני lock, details fast path, fixture-first/settings-first, latch, waiter שחוצה kickoff עם DB time טרי וביטול admin מתחרה |
| Playwright | 2/2 ב־Desktop Chrome וב־Pixel 5: RTL/overflow, validation→version carry, שמירה/replay, `.123456` אחרי reload, outsider/admin isolation, active/completed, keyboard focus ויעדי מגע 44px |

הפקודות, פלטי ה־PASS, reset מקומי, parity של generated types, build ו־
`git diff --check` מתועדים ללא ערכי סוד ב־
`docs/evidence/slice-9/w3/S9-DEF-007.md`. לא בוצעו בדיקות Hosted או mutation
בפרויקט linked.

## Slice 9 — S9-REQ-001 checkpoints 4–8

השלמה, review ויישוב נבדקים מול Supabase מקומי seeded בלבד. ה־fixtures
סינתטיים ונגללים לאחור; אין provider חי, linked project, proof content או
secret אמיתי. בדיקת provider משתמשת payload מצומצם שנבנה בתוך pgTAP.

| שכבה | כיסוי ממוקד ותוצאה ב־27 באוגוסט 2026 |
| --- | --- |
| pgTAP completion | 23/23: exact manager/foreign, terminal/review/scoring gates, rollback אטומי, snapshots, שתי בקשות pending, proof/history/audit, replay, manual decision ו־frozen list/detail |
| pgTAP review/reconciliation | 30/30: ACL/actor, AET+replay, FT-while-pending, stale resolution, mixed active/completed, completion unblocked, apply/dismiss/replay, manual correction ו־fixture ללא snapshot |
| Vitest | 571/571 מלא; מתוכם 36/36 ב־scoring schemas כוללים finished/canceled review ו־apply/dismiss validation |
| pgTAP מלא | 1277/1277 ב־23 קבצים לאחר forward reset מקומי seeded |
| Playwright regression | `e2e/scoring.spec.ts` עבר 2/2 ב־Desktop וב־Mobile לאחר תיקון copy; lifecycle E2E המלא נשאר checkpoint 8 ואינו נטען כאן |
| Gates | lint, typecheck, generated-types drift, DB lint, build וסריקת 52 client artifacts עברו |

Checkpoint 6 מוסיף RPC תחום של חברים פעילים בלבד ו־UI משותף למנהל ולחבר
פעיל. pgTAP ממוקד עבר 9/9 ומוכיח return shape ללא email/user ID/proof,
הרשאת manager/member, דחייה אטומה של ליגה זרה, cursor תקין והיעדר UPDATE ישיר.
Vitest מלא עבר 572/572 ו־pgTAP מלא עבר 1286/1286 ב־24 קבצים. תרחיש
`e2e/pagination.spec.ts` עבר 2/2 ב־Desktop וב־Mobile ומוכיח 25+2 שורות,
keyboard/RTL/no-overflow, היעדר manager controls לחבר פעיל ו־not-found לליגה
זרה. אין בתרחיש פעולת removal/reactivation או קריאת proof.

Checkpoint 7 מוסיף שתי בדיקות dblink אמיתיות עם backends נפרדים. הראשונה
עברה 74/74 ומכסה manual-vs-scheduled activation, ‏tick מאוחר, effective-active
בגבול prediction, completion מול upload/finalize/approve/reject ו־double
completion. השנייה עברה 35/35 ומכסה provider FT מול review, replay אחרי הכרעת
מנהל מערכת, active exact מול completed non-exact וליגה ללא predictions,
ליגה ללא snapshot ו־fixture חדש אחרי completion. יחד הן עברו 109/109; בדיקת
Route נוספת מוכיחה compensation של object נגזר כאשר completion מנצח לפני
finalize. המטריצה המלאה עברה 573/573 Vitest ו־1395/1395 pgTAP ב־26 קבצים.

תיקון attribution של הביקורת מוסיף binding פרטי ל־system actor. בדיקת
activation מאמתת ACL, actor קבוע, דחיית replacement שקט, cascade בעת revocation
ו־rotation מפורש. בדיקת ה־lifecycle מאמתת שב־scheduled וב־business-boundary
ה־`audit_logs.actor_id` הוא principal המערכת, בעוד החבר המפעיל נשמר רק ב־
`metadata.triggering_actor_id`. probe מרובה־חיבורים מחזיק את tuple ה־binding
ומחייב boundary בליגה אחרת להסתיים לפני שחרורו; כך חזרה לנעילת binding אחרי
league תיכשל ולא תוכל להחזיר את היפוך הסדר מול Cron.

תיקון הביקורת המאוחר מוסיף את
`supabase/tests/slice9-league-lock-scope.test.sql`. הוא מחזיק transaction של
`save_prediction` ושל completion אידמפוטנטי בליגה A, מוכיח שפעולה באותה ליגה
ממתינה וש־save/completion בליגה B מסתיימות לפני commit של A. assertions
מבניים מאמתים את שמונת גבולות ה־lifecycle, היעדר ה־global lock מן completion,
סדר registry→league keys בכותבי catalog ו־shared registry ב־`create_league`.
חבילת multi-session המלאה כוללת עשרה קבצי dblink: keyset pagination, league
settings, manual match, manual override clear, scoring, league-lock scope,
lifecycle, review, database-time serialization ו־API-Football sync.

Checkpoint 8 מוסיף `e2e/lifecycle.spec.ts`, שמבצע דרך המוצר בלבד את המעבר
Draft → Open → Active/current → Completed/final ואת תיקון ה־post-completion,
ה־freeze וה־reconciliation המפורש. setup ישיר מוגבל לקטלוג ריק ולהרשאת
system-admin ואינו מזייף אף שלב גלוי. התרחיש עבר 1/1 בנפרד ב־Desktop וב־Pixel
5. הוא חשף ותיקן פער audit שמנע completion אחרי דיווח Manual דרך המסך;
רגרסיית pgTAP ייעודית ושלושה קבצים ממוקדים עברו 131/131. לאחר התיקון המטריצה
המלאה עברה 573/573 Vitest ו־1400/1400 pgTAP ב־27 קבצים, וה־client scan עבר על
52 artifacts שנבנו עם sentinel סינתטי.

### Slice 9 W6 — S9-DEF-015 bidi hardening

| שכבה | כיסוי ותוצאה ב־27 באוגוסט 2026 |
| --- | --- |
| Vitest ממוקד | 193/193: כל 12 תווי `Bidi_Control` המסוכנים, RLO/LRE/RLI/PDI בגבולות display/league/provider, טקסט ארוך ומעורב עברית/ערבית/Latin, ו־DOM מדויק של `<bdi dir="auto">` |
| pgTAP ממוקד | 16/16 בקובץ החדש; יחד עם exact-contract של membership עברו 114/114. ‏11 constraints validated, טקסט מעורב נשמר וכל עמודת תצוגה דוחה controls |
| Playwright | `e2e/leagues.spec.ts` עבר 2/2 ב־Desktop Chrome וב־Pixel 5: RLO נדחה דרך Server Action, ושם mixed תקין עטוף ב־`bdi dir="auto"` בסיכום וב־Dashboard ללא overflow |
| Gates | reset קדימה מקומי, types:db/types:check, ‏lint, typecheck ו־build עברו; Vitest מלא 617/617 ו־pgTAP מלא 1443/1443 |

DB lint הוחזר בהצלחה עבור `public`/`private`; הפלט ממשיך לכלול findings ידועים
של פונקציות pgTAP תחת schema ‏`extensions`, ואינו מייחס אותם למיגרציית המוצר.

### Slice 9 W6 — semantic loading ושגיאת דחייה

שני מסכי ה־loading של מנהל המערכת נבדקים ב־Vitest כ־busy regions בעלי שם,
ללא `aria-live`/`role=status` כפול ועם כיבוד reduced motion. תרחיש
`e2e/join-and-proofs.spec.ts` שולח דרך ה־UI סיבת דחייה שנדחית רק בגבול השרת,
ומאמת שה־textarea מקבל focus, ‏`aria-invalid`, תיאור help+error יחיד ו־focus
indicator; כפתור הדחייה נמדד כיעד 44×44 CSS px לפחות ב־Desktop וב־Pixel 5.
בדיקת native 200% מתועדת בנפרד בראיית S9-DEF-022 ואינה מוחלפת ב־CSS zoom.

רגרסיית `e2e/accessibility-matrix.spec.ts` מריצה בנוסף את דפי הכניסה הציבוריים
`/`, ‏`/login`, ‏`/register` ו־`/forgot-password` בכל אחד מהרוחבים
360/390/768/1024/1440, בשני פרויקטי Chromium. בכל שילוב נבדקים axe WCAG
A/AA כולל contrast, סדר מקלדת ו־focus indicator בכל תחנה, 44×44 ליעדי פעולה
שאינם קישורי טקסט inline, ‏RTL, overflow ו־reduced motion. הרגרסיה חשפה תחילה
שדות Auth בגובה 42px וקישור שחזור בגובה 20px; לאחר התיקון עברה 10/10 והפיקה
40 screenshots מקומיים מסוננים תחת `tmp/final-accessibility`.

### Slice 9 W6 — WebServer error signal

`scripts/run-e2e.ts` מעביר את פלט Playwright המקומי כרגיל אך מכשיל run שבו
מופיעה שורת `[WebServer] … Error:`; test count ירוק אינו יכול עוד להסתיר server
error. תרחיש `prediction-lock` ממתין בסוף בלבד להשלמת response streams לפני
סגירת contexts. הרגרסיה הצרה שוחזרה תחילה עם `destination stream closed early`,
ולאחר התיקון עברה שלוש פעמים רצופות ב־Desktop וב־Mobile ללא WebServer error.

פקודות ההרצה והפלטים המצונזרים נשמרים ב־
`docs/evidence/slice-9/w4/S9-REQ-001.md`. מרוצי dblink של lifecycle נדרשים
בנפרד ב־checkpoint 7; הצלחת הבדיקות האטומיות כאן אינה מוצגת כראיית race.

## Snapshot מסירה — S9-REQ-004

המטריצה הבאה נמדדה מחדש ב־27 באוגוסט 2026 מול Supabase מקומי בלבד, אחרי
סנכרון מסמכי ההגשה. ספירות checkpoint מדויקות נשמרות בראיות ההיסטוריות ואינן
מוצגות כאן כטוטאל נוכחי, משום שה־suite ממשיך לגדול.

| שכבה | תוצאה טרייה | הערה |
| --- | --- | --- |
| Vitest | PASS — RULES suite מלאה | ללא רשת ספק וללא credential אמיתי |
| pgTAP | PASS — DATA suite מלאה | `Result: PASS`; מסד מקומי בלבד |
| Playwright | PASS — FLOWS matrix מלאה | Desktop Chrome ו־Mobile Chromium; lifecycle מוצרי מלא; הריצה נקייה מ־`[WebServer] Error` |

ריצת Playwright קודמת סיימה את assertions המוצריים אך נכשלה בצדק משום שה־runner
זיהה `The destination stream closed early`. ה־lifecycle המתין לאחר מכן לסיום
שני RSC response streams לפני סגירת contexts. הרגרסיה הממוקדת עברה 2/2,
והמטריצה המלאה החוזרת עברה ללא אות server error. אין להציג את הספירה
הראשונה כ־PASS.

בדיקת `repository-path-hygiene.test.ts` עוברת על כל קובץ טקסט tracked ומכשילה
נתיבי home/workspace מוחלטים של macOS, Linux, WSL ו־Windows עם דיווח
`file:line`. דוגמאות הבדיקה מורכבות בזמן ריצה כדי שה־guard יסרוק גם את המקור
של עצמו בלי allowlist. פלטים היסטוריים משתמשים ב־`<repo>` או ב־placeholder של
runtime מקומי ואינם מפרסמים את פרופיל המפתח.
