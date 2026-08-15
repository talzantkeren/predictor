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
AI, תשלום או Email hosted. ה־catalog מכיל competition ועונת reference בלבד;
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

## Slice 3: הזמנה, בקשת הצטרפות ואסמכתאת Demo פרטית

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
| Vitest | secret base64url באורך/entropy הנדרשים, URL Fragment קנוני, public ID/digest/cookie binding, Origin ו־redirect allowlist; mapping שגיאות; request-body bounded גם בלי `Content-Length`; UUID/idempotency; סיומת/MIME/magic; empty/duplicate/missing fields; Sharp decode, WebP, orientation, dimensions, no-enlarge, metadata stripping, multi-page/pixel/size limits; path derivation וגבול admin import |
| pgTAP | schema, public-ID+hash pairing, checks, indexes, RLS/grants ו־`search_path`; one-active invite ו־request; rotation/revoke/expiry/late join/close boundary; actor/status spoofing; בקשה קיימת אחרי revoke; rejected retry; proof append-only/quota/idempotency/current ordering; rate windows; finalizer מאמת object מדויק ואטומיות; bucket פרטי ומגבלותיו; CRUD ישיר ב־Storage נדחה ל־anon/authenticated; בידוד owner/manager/outsider/ליגה אחרת וללא decision/membership mutation |
| Route integration | invite exchange עם Origin/body/public-ID/digest/cookie/opaque denial; JPEG/PNG/WebP תקינים; spoofed SVG/HTML/PDF/executable, mismatch, corrupt/empty/oversize/extreme/multi-page; Origin/session/UUID; owner מול IDOR/manager-upload; replace/retry/rate limit; Storage/finalize/cleanup failures; signed access owner/manager מול opaque denial וכותרות no-store |
| Playwright | יצירה/הצגה חד־פעמית/refresh/rotate/revoke של invite; Fragment secret אינו מופיע בשום network target ונמחק מהכתובת; expiry שמתרחש אחרי render נבדק דרך UI → Server Action → DB ומחזיר שגיאה בטוחה ומצב מנהל מדויק; guest → register/login עם public-ID return path → חזרה בטוחה; submit, `pending_proof`, upload סינתטי, `pending_approval`, dashboard, retry והחלפה; request/proof substitution ומניעת Storage ישיר; Desktop Chrome ו־Pixel 5 |
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
אין להשתמש ב־`supabase db reset --linked` או בתמונה פיננסית אמיתית.
