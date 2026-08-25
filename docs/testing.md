# Predictor1 — בדיקות

## Slice 1: Auth ופרופיל

הבדיקות של Slice 1 אינן פונות ל־Supabase Production, לשירות Email אמיתי או
לספק חיצוני. Supabase CLI המקומי מספק PostgreSQL, Auth ו־Mailpit, וה־runner של
Playwright קורא ממנו בזמן הריצה רק את כתובת ה־API והמפתח הציבורי המקומי.

### מטריצת כיסוי

| שכבה | כיסוי |
| --- | --- |
| Vitest | נרמול ואימות Email, אורך סיסמה, התאמת סיסמאות, trim וגבולות שם תצוגה, allowlist ל־redirects ומיפוי שגיאות Auth בטוח |
| pgTAP | מבנה `profiles`, FK, constraints כולל Unicode whitespace, מקרי metadata/fallback, התנהגות `updated_at`, RLS, column grants, הרשאות פונקציות, self access וחסימת משתמש זר/anon |
| Playwright | חסימת אורח, אכיפת מינימום סיסמה ישירות ב־Auth, הרשמה ואישור בהקשר דפדפן חדש עם login ידני, Dashboard, עדכון פרופיל, redirects של משתמש מחובר ועוין, חסימה אחרי logout, הודעת mismatch ושחזור PKCE תקף, מחיקת recovery marker ובידוד קריאה/כתיבה בין שני משתמשים |
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
את מגבלת PKCE, נשאר דטרמיניסטי ואינו שולח Email אמיתי.

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
או בתוך מכולת PostgreSQL המקומית. אין קריאה לספק Sports, אין המתנה אמיתית עד
kickoff ואין שימוש בשעון הדפדפן כגבול קבלה. ה־seed הקבוע הוא Demo ידני בלבד;
בדיקות הניחושים יוצרות קבוצות ומשחקים משלהן ולכן אינן תלויות בו.

### מטריצת כיסוי

| שכבה | כיסוי |
| --- | --- |
| Vitest | parsing קשיח של ציונים שלמים 0–30; דחיית ריק/שלילי/31/fraction; מיפוי חמשת הסטטוסים ומצבי open/editable/locked/unavailable; `draft`/`open`/`active` לעומת `completed`/`archived`; גבול millisecond לפני/בדיוק/אחרי; countdown טהור עם יחיד/רבים תקינים; UTC→`Asia/Jerusalem` ואזור זמן נוסף; גבולות תאריך DST; round/date search params; allowlist לנתיבי המשחקים ומיפוי `PREDICTION_LOCKED` בטוח |
| pgTAP | enum/generated outcome, schema/checks/unique/indexes, RLS/grants/function privileges/`search_path`; active create/update/retry ושינוי `updated_at`; HOME/DRAW/AWAY; season consistency גם בכתיבה privileged; direct INSERT/UPDATE/DELETE denial; `now()` ו־`now()+1 second`; exact/after lock; scheduled/postponed לעומת live/finished/canceled; `completed`/`archived` read-only ו־FORBIDDEN אטום לזר; pending proof/approval, rejected, removed, outsider, other league ו־cross-season denial; owner-only לפני kickoff, שתי שורות לחברים פעילים ב־/אחרי kickoff ואפס לזר; late join; stale RPC replay; `points=0` וכל metadata הניקוד `NULL` |
| Playwright | שני חברים מאומתים ב־Desktop Chrome/UTC וב־Pixel 5/`Asia/Jerusalem`; רשימת משחקים וכל חמשת הסטטוסים/תוצאה/שעה מקומית/נעילה; create→refresh timestamp→edit; `Promise.all` כפול שמחזיר שורה אחת; UI, תוכן ה־RSC ו־PostgREST שמסתירים ניחוש אחר לפני kickoff; שינוי kickoff מקומי לעבר ללא sleep; stale create/edit וה־RPC הישיר נדחים; reveal לשני החברים; outsider ולאחר מכן pending requester מקבלים not-found ואפס שורות; RTL וללא overflow |
| Manual/Preview | כניסה כחבר פעיל, בדיקת רשימה ומסנן, שמירה ועריכה, שעה מוחלטת + timezone, stale-tab בטוח וחשיפה בשני חשבונות. Preview דורש שה־migrations החדשות יוחלו בפרויקט Supabase המורשה לפני בדיקה מאומתת |

`now()` של PostgreSQL קבוע בתוך transaction של pgTAP. לכן fixture עם
`kickoff_at := now()` מוכיח דחייה מדויקת, ו־`now() + interval '1 second'`
מוכיח הרשאה ללא `sleep`. Playwright משנה fixture סינתטי ל־דקה בעבר דרך helper
שמקבל UUIDs קנוניים בלבד, דורש בדיוק `UPDATE 1` ואינו מדפיס stderr. כך גם טופס
שכבר פתוח נבדק מול זמן המסד בפעולת השמירה.

pgTAP הוא חיבור יחיד ואינו מוכיח race רשת אמיתי. unique constraint, נעילת שורת
המשחק וה־upsert נבדקים במסד; Playwright מוסיף שתי קריאות `save_prediction`
מקבילות עם `Promise.all` ומאמת שנשארת רשומה יחידה.

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

## Slice 7: Cron ו־observability במסלול ידני

סעיף זה מתעד את baseline הידני שנמסר לפני Slice 7b. בדיקות הרגרסיה שלו עדיין
משתמשות רק ב־Manual provider וב־Supabase המקומי; המסלול החי וה־planner שנוסף
לאחר מכן מתועדים בסעיף Slice 7b להלן.

### מטריצת כיסוי

| שכבה | כיסוי |
| --- | --- |
| Vitest | נרמול כל חמשת הסטטוסים, ניקוי score חי, דחיית status לא מוכר, תוצאה finished, cancel, תיקון ו־retry; החרגה מלאה וללא mutation של `is_manually_overridden`; זהויות provider כפולות; env חסר/malformed ו־manual בלבד; השוואת Route וסיווג שגיאות בטוח; `status` בלבד כמבחין כשל וקוד דילוג ניטרלי; מיפוי שורת query וגבול admin client `server-only` |
| pgTAP | enum/table/columns/comments/checks/index; RLS/grants וקריאת admin לעומת משתמש רגיל; חתימת RPC, `SECURITY DEFINER`, `search_path` ו־EXECUTE service-only; actor חסר/malformed/שהוסר ללא כתיבת `sync_runs` או `audit_logs`; שורה סופית `MANUAL_PROVIDER` ללא שינוי matches/predictions; שתי sessions אמיתיות שמוכיחות `CONCURRENT_ATTEMPT`, אחריו `MANUAL_PROVIDER`, ושאין advisory lock דולף |
| Route | method/content-type, secret חסר/שגוי, env חסר, actor שנדחה ושגיאת DB לא צפויה; אין קריאת gateway לפני הרשאה, קריאה אחת בלבד בהצלחה, HTTP 200 לדילוג ותגובות `private, no-store` ללא secret/actor/SQL |
| Playwright | secret חסר ושגוי מחזירים 401 ומספר שורות DB אינו משתנה; secret נכון יוצר בדיוק שורה סופית אחת; מנהל רואה ב־`/admin/sync` את `MANUAL_PROVIDER` כסיבת דילוג, משתמש רגיל מקבל not-found; Desktop Chrome ו־Pixel 5, RTL וללא overflow |

בדיקת המקביליות ב־`supabase/tests/sync.test.sql` פותחת חיבור control, חיבור
שמחזיק `pg_advisory_xact_lock` וחיבור service-role שקורא ל־RPC. היא פועלת רק
מול מכולת PostgreSQL החד־פעמית של Supabase CLI, מתקינה ומסירה principal
סינתטי ושתי שורות run committed, ואינה מורשית מול `--linked` או hosted. קריאת
RPC רגילה בתוך transaction הבדיקה מתבצעת רק אחרי תרחיש המקביליות כדי שה־xact
lock של pgTAP עצמו לא ישבש את שתי ה־sessions.

ה־E2E runner מייצר `CRON_SECRET` אקראי בזיכרון לכל הרצה ומעביר אותו רק
לתהליכי build, server ו־Playwright. actor מקומי קבוע נוצר ב־seed; הסוד, actor
header ו־admin key אינם נכתבים לדוח או ל־stdout. קריאת Cron נעשית ב־Node
`fetch` עם שגיאה מסוננת, לא בצעד Playwright שמתעד headers.

הרצה ממוקדת בזמן פיתוח:

```powershell
npm run test -- src/app/api/cron/sync/route.test.ts src/features/sports/sync-planner.test.ts src/features/sync/display.test.ts src/features/sync/errors.test.ts src/features/sync/queries.test.ts
npm exec -- supabase test db supabase/tests/sync.test.sql
npm run test:e2e -- e2e/sync.spec.ts
```

## Slice 7b: API-Football Sync חי עם fixtures מוקלטים

בדיקות Slice 7b אינן מקבלות `SPORTS_API_KEY` ואינן פונות לרשת הספק. ה־client
מקבל fake transport, וכל responses הן fixtures מסוננים תחת
`src/features/sports/__fixtures__/api-football`. E2E רץ עם `manual`, ונתוני
provider-owned שהוא מציג נזרעים ישירות במסד המקומי; אין fallback לקריאה חיה.

### מטריצת כיסוי

| שכבה | כיסוי |
| --- | --- |
| Vitest client | envelope array/object errors, invalid JSON/schema, paging, duplicate IDs, 8 MiB cap, abort/timeout, 403, 429, 499/5xx, `Retry-After`, retry/backoff/jitter חסומים, `Accept`, ביטול body שלא נצרך, quota headers ו־redaction ללא key/URL |
| Vitest adapter | league 383, כל 14 team IDs והמיפוי העברי, codes כפולים, unknown team fallback, 26 round labels, future-stage review, NS/FT, כל status מתועד, live score→null, `score.fulltime`, score חסר, AET/PEN review ו־UTC consistency |
| Vitest planning | catalog/targeted/reconciliation plans, no-due, quota backoff, batches של עד 20 IDs, עד 20 קבוצות ועד 50 fixtures ל־apply, fixturesSeen עד 1,000, operator notes עד 100 עם overflow marker, קבוצה חדשה מתוך fixture, retry/correction ו־manual override exclusion |
| pgTAP | schema/RLS/grants; browser denial; actor validation; claim מקביל בשתי sessions אמיתיות; `NOT_DUE` ללא row; force cooldown/backoff; reclaim ו־abandoned run; generation/token/provider/run/expiry fencing; atomic apply/finalize; בידוד regression בתוך batch; ביטול מוקדם ללא חשיפת ניחוש; reactivation עם איפוס metadata/leaderboard; provider-ID upsert idempotent; Demo isolation; AET review והחרגה מ־targeted; FT/correction/retry דרך `score_match` ואודיט source |
| Route/Action | Cron auth/content type/env; manual/API-Football/not-due/concurrent/success/failure; קריאת orchestration יחידה; trigger של system admin בלבד; safe response ללא סוד/token/generation |
| Playwright | ordinary user מול system admin, status page ו־manual trigger, שורות observability שנזרעו ישירות, provider AET fixture שנזרע ומוצג כ־"דורש בדיקה" בלי לפתוח prediction, ו־Desktop/Pixel RTL. אין כאן fake live-provider flow; הפרדת key נבדקת non-vacuously ב־build API-Football עם sentinel וסריקת HTML/client artifacts לפני הפעלת השרת ב־manual. |

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
- `npm run test:e2e` כולל build עם sentinel server-only וסריקת
  `test:client-secrets` לפני הפעלת השרת; אין צורך בהרצה נפרדת שאינה קשורה
  לאותו build.

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
