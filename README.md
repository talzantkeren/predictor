# Predictor1

Predictor1 היא אפליקציית Web בעברית וב־RTL לליגות פרטיות של חיזוי תוצאות
כדורגל. הפריסה הציבורית של הקורס היא **Demo בלבד**: אין בה גביית כסף, סליקה,
העברת פרסים כספיים או הצגה של מסמך פיננסי אמיתי.

- Production: [https://predictor-swart.vercel.app](https://predictor-swart.vercel.app)
- Slice 3 Preview: [https://predictor-git-feature-slice-3-joi-bfc58f-tals-projects-19902e47.vercel.app](https://predictor-git-feature-slice-3-joi-bfc58f-tals-projects-19902e47.vercel.app)
- GitHub: [https://github.com/talzantkeren/predictor](https://github.com/talzantkeren/predictor)
- Supabase project ref: `zthqqxsbtioaacvpmqna`

## דרישות

- Node.js 24.16.0
- npm ו־`package-lock.json`
- Docker Desktop לצורך Supabase מקומי ובדיקות pgTAP
- Chromium של Playwright לצורך בדיקות E2E

ה־Supabase CLI מותקן כ־dev dependency, ולכן אין צורך בהתקנה גלובלית.

## הרצה מקומית

```powershell
nvm use 24.16.0
npm ci
Copy-Item .env.example .env.local
npm exec -- supabase start
npm run dev
```

לאחר `supabase start`, העתיקו מ־`supabase status -o env` אל `.env.local` את
`API_URL` בתור `NEXT_PUBLIC_SUPABASE_URL`, את `PUBLISHABLE_KEY` בתור
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ואת `SECRET_KEY` בתור
`SUPABASE_SECRET_KEY`. הסוד נדרש רק ל־gateway הפרטי של Storage ב־Slice 3;
אין להדפיס או לשמור ב־Git את ערכו, JWTs או סיסמת מסד הנתונים. `.env.local`
חסום ב־Git.

המשתנים הפעילים ב־Slice 3:

| משתנה | שימוש |
| --- | --- |
| `NEXT_PUBLIC_APP_URL=http://localhost:3000` | כתובת האפליקציה המקומית |
| `NEXT_PUBLIC_SUPABASE_URL` | כתובת Supabase המקומית או hosted |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | מפתח ציבורי המותר בדפדפן עם RLS |
| `SUPABASE_SECRET_KEY` | server-only; gateway מצומצם ל־`payment-proofs` בלבד |
| `SPORTS_API_PROVIDER=manual` | fallback ידני ללא ספק חי |
| `DEMO_MODE=true` | מצב ההדגמה של הקורס |

`SUPABASE_SECRET_KEY` אינו מיובא ב־Auth/Profile/Leagues, אינו נשלח לדפדפן
ואינו משמש לכתיבות עסקיות. `CRON_SECRET`, מפתח Sports ומפתחות AI שמורים
ל־slices מאוחרים יותר.

## זרימת Auth ופרופיל

הנתיבים הקנוניים של Slice 1:

- `/register` — הרשמה עם Email, סיסמה ושם תצוגה.
- `/auth/confirm` — השלמת אישור Email או callback של שחזור סיסמה.
- `/login` — התחברות; משתמש מחובר מופנה ל־`/dashboard`.
- `/forgot-password` — בקשת קישור שחזור עם הודעה אחידה למניעת enumeration.
- `/update-password` — בחירת סיסמה לאחר callback שחזור תקף בלבד.
- `/dashboard` — עמוד מוגן.
- `/profile` — קריאה ועדכון של שם התצוגה האישי בלבד.

זרימת ההדגמה: הרשמה → פתיחת Mailpit → אישור ההודעה → Dashboard → פרופיל →
עדכון שם → התנתקות → התחברות. שחזור סיסמה מתחיל ב־`/forgot-password`, ממשיך
בקישור Mailpit ומסתיים בהתחברות מחדש עם הסיסמה החדשה. בגלל PKCE, השלמת session
אוטומטית דורשת את הדפדפן שבו התחילה הבקשה. אישור שנפתח במכשיר אחר עדיין מאשר
את הכתובת ומציג התחברות ידנית; בשחזור יש לבקש קישור חדש בדפדפן שבו ייפתח.

טפסי Auth נשלחים ל־Server Actions ומאומתים שם באמצעות Zod. בנוסף,
`supabase/config.toml` והפרויקט המארח אוכפים מינימום של 8 תווים ברמת Supabase
Auth, גם עבור קריאה ישירה שאינה מגיעה מה־UI.

## זרימת Slice 2: ליגות

הנתיבים החדשים מוגנים ודורשים session תקף:

- `/dashboard` — ברכה אישית, empty state או רשימת הליגות הפעילות של המשתמש.
- `/leagues/new` — יצירת ליגה עם עונת 2026/27, סכום/הוראות Demo, הצטרפות
  מאוחרת, חוקי ניקוד לכל ליגה וחלוקת פרסים שמסתכמת ב־100%.
- `/leagues/[leagueId]` — סיכום פרטי לחבר פעיל: עונה, סטטוס, תפקיד, סכומי
  Demo, ניקוד ופרסים. משתמש שאינו חבר מקבל not-found ללא חשיפת נתונים.

זרימת ההדגמה: הרשמה/התחברות → Dashboard ריק → יצירת ליגה → תיקון שדות לא
תקינים לדוגמה → שמירה → סיכום הליגה → חזרה ל־Dashboard. פעולת השמירה קוראת
ל־`create_league` אטומי: היוצר נגזר מה־session ונשמר גם כמנהל וגם כחבר פעיל.
כשל בעונה, בניקוד או בפרסים אינו משאיר רשומות חלקיות.

ה־catalog נמסר ב־migrations forward-only וכולל את ליגת העל הישראלית ועונת
`2026/27` בלבד. teams, fixtures, scores ו־provider IDs נשארים ריקים עד למסלול
הידני/המאומת ב־slice הייעודי.

## זרימת Slice 3: הזמנה והוכחת Demo

- מנהל הליגה נכנס ל־`/leagues/[leagueId]/settings`, יוצר קישור הזמנה ומעתיק
  אותו מהתצוגה החד־פעמית. הקישור תקף שבעה ימים; refresh מציג רק metadata בטוח,
  ו־rotation מבטל אטומית את הקישור הקודם. revoke חוסם בקשות חדשות.
- אורח פותח `/invite/[token]`, רואה פרטי ליגה מצומצמים ואזהרת Demo, ומשלים
  login/register תוך חזרה לאותו נתיב פנימי מאומת. בהרשמה היעד נשמר ב־cookie
  HttpOnly קצר ומוגבל ל־callback; קישור אישור ה־Email עצמו אינו כולל invite token.
  שרת Next מאמת את הצורה המדויקת ומעביר ל־Supabase Data API רק SHA-256 hash,
  לא את ה־token הגולמי.
  בקשה חדשה נוצרת כ־
  `pending_proof`; refresh/double-submit מחזירים את אותה בקשה.
- המשתמש מעלה רק תמונה סינתטית מסוג JPEG/PNG/WebP. זהו דמו בלבד — אין להעביר
  כסף ואין להעלות מסמך פיננסי אמיתי. אין תשלום, סליקה, אימות קבלה או קישור
  לספק תשלום.
- ה־Route Handler מגביל בקשה ל־4,250,000 bytes, קובץ ל־4,000,000 bytes ותמונה
  מפוענחת ל־20,000,000 pixels; הוא מתאים לתיבה 2000×2000, מסיר metadata ושומר
  WebP חדש בלבד ב־bucket הפרטי `payment-proofs`.
- כל החלפה מכוונת מוסיפה proof חדש, עד חמש לבקשה. retry משתמש במפתח
  idempotency, והמסד אוכף מכסות של 5 ניסיונות ב־15 דקות לבקשה ו־20 ב־24 שעות
  למשתמש. העלאה תקינה מעבירה את הבקשה ל־`pending_approval`.
- Dashboard מציג את בקשות המשתמש ואת הפעולה הבאה. תוכן proof נפתח רק דרך
  `/api/payment-proofs/[proofId]`, לאחר הרשאת uploader או מנהל הליגה ובאמצעות
  signed access של עד 60 שניות. כתיבה ישירה ל־Data API ו־CRUD ישיר ב־Storage
  אינם מורשים; קריאת עמודות סיכום בטוחות בלבד מוגנת ב־RLS, ולעולם אינה חושפת
  token hash, נתיב Storage, digest או מפתח idempotency.

Slice 3 אינו כולל approve/reject, תור מנהל או יצירת חברות; פעולות אלה נשארות
ל־Slice 4 ואין קיצור דרך להדגמה.

### Mailpit

Supabase CLI לוכד הודעות מקומיות ב־Mailpit. הכתובת מופיעה בשדה `MAILPIT_URL`
של `supabase status -o env` (ברירת המחדל היא
[http://localhost:54324](http://localhost:54324)). CI משתמש באותו מנגנון ולא
שולח Email אמיתי.

שירות ה־Email המובנה של Supabase hosted מיועד לניסוי, מוגבל בקצב וזמין על
בסיס best-effort. לפני שימוש אמיתי יידרש SMTP ייעודי; מגבלה זו אינה נעקפת
בפריסת הקורס.

## הגדרות Redirect ב־Supabase hosted

ב־Authentication → URL Configuration יש להגדיר ללא wildcard רחב:

- Site URL: `https://predictor-swart.vercel.app`
- Redirect URL: `http://localhost:3000/auth/confirm`
- Redirect URL: `https://predictor-swart.vercel.app/auth/confirm`
- Redirect URL: `https://predictor-git-feature-slice-1-auth-tals-projects-19902e47.vercel.app/auth/confirm`

טפסי ההרשמה והשחזור משתמשים ב־origin הנוכחי, ולכן Preview עובד רק אחרי
הוספת הכתובת המדויקת שלו ל־allowlist.

## Migrations וטיפוסים

ה־migrations הקנוניות נמצאות ב־`supabase/migrations/`. להפעלה מקומית בלבד:

```powershell
npm exec -- supabase db reset --local
npm run test:db
npm run types:db
npm run types:check
```

אסור להריץ `supabase db reset --linked`. שינוי schema חדש חייב להגיע
ב־migration אדיטיבית, ו־CI נכשל אם `database.generated.ts` סוטה מהמסד המקומי.

## בדיקות

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run types:check
npm run build
npm run test:e2e
npm run test:e2e:preview
npm run verify
```

`npm run test:e2e` דורש Supabase מקומי פעיל, בונה production build עם הכתובת
והמפתח הציבורי המקומיים ומריץ Desktop + Mobile. `npm run preview:local` מפעיל
את ה־build האחרון מול אותה סביבה לצורך בדיקה ידנית. `test:e2e:preview` דורש
`PLAYWRIGHT_BASE_URL` ומריץ רק smoke ציבורי מסומן; הפקודה המקומית נכשלת במכוון
אם מנסים להפנות אותה ל־URL חיצוני, כדי לא להסתיר דילוג על זרימות Auth.

פירוט מטריצת הבדיקות נמצא ב־[`docs/testing.md`](./docs/testing.md), וגבולות
האבטחה של Auth, פרופילים וליגות ב־[`docs/security.md`](./docs/security.md).

## פריסה

האפליקציה היא Next.js 16 יחידה שנפרסת ב־Vercel. הענף אינו מתמזג אוטומטית
ל־`main`; Production מתעדכן רק לאחר ביקורת PR ו־CI ירוק. כל סביבת Preview
חייבת להישאר ב־`DEMO_MODE=true` ולהשתמש ב־Supabase המורשה עבורה.
