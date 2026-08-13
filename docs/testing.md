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
| Vitest | trim וגבולות שם/תיאור, סכום Demo שלם ולא־שלילי, טווח וסדר חוקי ניקוד, ברירת מחדל 3/1/0 וחוקים שונים לשתי ליגות, המרת אחוזים ל־bps ללא float, מיקומים רצופים/ייחודיים, סכום 10000, קלט malformed/over-precision ומיפוי שגיאות בטוח |
| pgTAP | טבלאות, עמודות, enums, FKs, checks, unique/indexes, reference data, RLS לכל טבלה, grants לטבלאות ולפונקציות, `search_path`, יצירה אטומית, creator manager+active member, גרסה 1, חוקים נפרדים, rollback לקלט שגוי, anon/משתמש זר, חסימת כתיבה ישירה, שיתוף פרופיל מצומצם, policy ללא recursion ונעילת חוקים לפי DB time |
| Playwright | empty Dashboard, פתיחת `/leagues/new`, שגיאות מייצגות, יצירה עם 5/2/0 ושני מיקומי פרס, redirect וסיכום Demo, הופעה ב־Dashboard, משתמש שני מבודד וחסימת URL מנוחש |
| Visual | Desktop Chrome ו־Pixel 5, עברית/RTL, labels, focus, pending/disabled, empty/error states והיעדר overflow בטופס סביב 390px |

בדיקת ה־Preview נשארת smoke ציבורי בלבד עם `@preview`; בדיקת הליגה אינה מסומנת
כך ואינה תלויה במכסת Email hosted.
