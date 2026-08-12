# Predictor1

Predictor1 היא אפליקציית Web בעברית וב־RTL לליגות פרטיות של חיזוי תוצאות
כדורגל. הפריסה הציבורית של הקורס היא **Demo בלבד**: אין בה גביית כסף, סליקה,
העברת פרסים כספיים או הצגה של מסמך פיננסי אמיתי.

- Production: [https://predictor-swart.vercel.app](https://predictor-swart.vercel.app)
- GitHub: [https://github.com/talzantkeren/predictor](https://github.com/talzantkeren/predictor)
- Supabase project ref: `zthqqxsbtioaacvpmqna`

## דרישות

- Node.js 24.16.0 (זהה לסביבת הפיתוח ול־CI, ותואם ל־Node.js 24.x ב־Vercel)
- npm ו־`package-lock.json`
- Docker Desktop לצורך Supabase מקומי ובדיקות pgTAP
- Chromium של Playwright לצורך בדיקות E2E

ה־Supabase CLI מותקן כ־dev dependency של הפרויקט, ולכן אין צורך בהתקנה
גלובלית נפרדת.

## הרצה מקומית

```powershell
nvm use 24.16.0
npm ci
Copy-Item .env.example .env.local
npm exec -- supabase start
npm run dev
```

יש למלא ב־`.env.local` ערכי פיתוח מקומיים בלבד. הקובץ עצמו חסום ב־Git;
`.env.example` מתעד רק שמות משתנים ו־placeholders ריקים.

המשתנים הדרושים ל־Slice 0 הם:

| משתנה | שימוש |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | כתובת האפליקציה המקומית או הציבורית |
| `NEXT_PUBLIC_SUPABASE_URL` | כתובת פרויקט Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | מפתח ציבורי המותר בדפדפן |
| `SPORTS_API_PROVIDER=manual` | Manual fallback ללא ספק חי |
| `DEMO_MODE=true` | מסמן את פריסת הקורס כ־Demo |

`SUPABASE_SECRET_KEY` נדרש רק כאשר קוד server-only יוצר admin client.
`SPORTS_API_KEY` נדרש רק לאחר מעבר מכוון ל־`SPORTS_API_PROVIDER=api`.
`CRON_SECRET` שמור ל־Slice 7, ומפתחות AI שמורים ל־Slice 8. אין להכניס אף
secret ל־Git או למשתנה שמתחיל ב־`NEXT_PUBLIC_`.

## בדיקות

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run types:check
npm run build
npm run test:e2e
```

`npm run verify` מריץ את כל השרשרת לעיל. בדיקות DB דורשות Docker פעיל.
להתקנת הדפדפן הרשמית של Playwright פעם אחת:

```powershell
npx playwright install chromium
```

בדיקת ה־Sports POC החד־פעמית משתמשת ב־ManualSportsProvider וב־fixtures
מוקלטים בלבד; היא אינה פונה לספק חי ואינה חלק מ־CI:

```powershell
npm run poc:sports
```

## Supabase ופריסה

ה־migration הקנונית נמצאת ב־`supabase/migrations/`. להפעלה מקומית בלבד אפשר
להשתמש ב־`npm exec -- supabase db reset --local`; אסור להריץ reset מול פרויקט
מקושר או Production. טיפוסי TypeScript נוצרים מהמסד המקומי באמצעות
`npm run types:db`, ו־CI נכשל אם הקובץ שנוצר שונה מהגרסה שב־Git.

האתר נבנה כאפליקציית Next.js 16 אחת ונפרס ב־Vercel. ה־feature branch אינו
נמזג אוטומטית ל־`main`; Production מתעדכן רק דרך תהליך ה־GitHub/CI המאושר.
