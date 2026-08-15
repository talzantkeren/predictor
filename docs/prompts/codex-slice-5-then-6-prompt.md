# פרומפט ל־Codex — השלמת Slice 5 ואז Slice 6

> העתיקו את הטקסט שמתחת לקו כפרומפט אחד ל־Codex. הוא נגזר מ־`AGENTS.md`,
> `docs/product.md`, `docs/architecture.md` ו־`docs/technical-plan.md` (גרסה 2.7)
> ואינו מחליף אותם.

---

אתה סוכן קידוד שעובד על **Predictor1** — אפליקציית Next.js 16 App Router בעברית
RTL לליגות ניחושי כדורגל פרטיות, עם Supabase (PostgreSQL/Auth/Storage) ופריסה
ב־Vercel. פרויקט גמר לקורס RUNI Internet Technologies 2026; דדליין 6 בספטמבר.

לפני כל תכנון או עריכה קרא לפי הסדר: `AGENTS.md`, `docs/product.md`,
`docs/architecture.md`, `docs/technical-plan.md`. המסמכים האלה קנוניים וגוברים
על הפרומפט הזה. אם מצאת סתירה בין הפרומפט למסמכים — עצור והסבר לפני שינוי קוד.

## מצב המאגר הנוכחי

- Slices 0–4 נמסרו ומוזגו ל־`main` (PR #4 סגר את Slices 3–4: invite, בקשת
  הצטרפות, אסמכתאות, תור מנהל ו־approve/reject).
- **Slice 5 (משחקים, ניחושים ונעילה) עדיין לא נבנה.** אין migration של
  `predictions` ואין flows של שמירת ניחוש.
- טבלאות הספורט (`competitions`, `seasons`, `teams`, `matches`) קיימות כבר
  מ־Slice 2 (migration `sports_core`).

לכן סדר העבודה שלך: **קודם Slice 5, ואז Slice 6.** כל slice בענף feature נפרד
וב־PR נפרד — כל slice חייב להישאר deployable בפני עצמו. אל תערבב את שניהם
ב־commit אחד ואל תממש את Slice 6 לפני ש־Slice 5 שלם וירוק.

## שלב 1 — Slice 5: משחקים ידניים, ניחושים ונעילה

לפי סעיף 15 בתכנית הטכנית:

> **תוצר:** seed/מסך משחקים, save prediction, lock ו־visibility.
> **Exit:** ה־DB מכריע את גבול הזמן; ניחושי אחרים מוסתרים לפני הפתיחה.

### היקף

1. **Migration `predictions`** לפי סעיף 6.6 בתכנית: שדות
   `league_id`, `match_id`, `user_id`, `predicted_home_score`,
   `predicted_away_score` (check 0–30), `predicted_outcome` (נגזר בשרת/DB,
   לא מהלקוח), `points default 0`, `is_exact`/`is_correct_outcome` (null עד
   ניקוד), שדות `scored_*`, timestamps. unique
   `(league_id, match_id, user_id)`. בדיקת עקביות FK: הליגה והמשחק חייבים
   להשתייך לאותה עונה. RLS ו־grants מצומצמים באותה migration.
2. **מדיניות נעילה לפי זמן DB** (PRED-03/04): יצירה ועדכון של ניחוש מותרים רק
   כאשר `now()` של מסד הנתונים מוקדם מ־`kickoff_at`. ה־countdown ב־UI הוא עזר
   בלבד; ההכרעה ב־DB (RLS/constraint/RPC), לא בצד לקוח ולא בשרת האפליקציה בלבד.
3. **מדיניות visibility** (PRED-05): לפני הפתיחה משתמש רואה רק את הניחוש שלו;
   אחרי הפתיחה חברי אותה ליגה רואים את ניחושי האחרים. חבר שאושר מאוחר מנחש רק
   משחקים שטרם התחילו (PRED-06).
4. **seed משחקי העונה** והזנה ידנית על גבי sports core הקיים — רק מידע מאומת;
   אין fixtures מומצאים ואין provider IDs מזויפים.
5. **עמודי משחקים** `/leagues/[leagueId]/matches` עם round/date ב־search
   params; Server Components; RTL ומובייל.
6. **`savePrediction` Server Action** לפי סעיף 9: קלט ליגה, משחק ושני ציונים;
   Zod validation; upsert דרך ה־user client תחת RLS (לא admin client);
   ה־outcome נגזר בשרת; הצלחה מציגה timestamp שמירה מהשרת. `useActionState`
   ו־pending UI; כפתור disabled בזמן pending אבל ה־DB עדיין idempotent.
7. **Countdown** שמציג גם שעה מוחלטת, timezone וסטטוס נעילה.

### בדיקות Slice 5

- Vitest: Zod schemas ומקרי גבול של הקלט.
- pgTAP: prediction מותר לפני kickoff ונדחה ב־/אחרי kickoff לפי זמן DB;
  visibility לפני/אחרי; משתמש B לא קורא/כותב ניחוש של A או של ליגה זרה; unique
  תחת concurrency; עקביות ליגה/משחק/עונה.
- Playwright (`e2e/prediction-lock.spec.ts`): שני חברים מנחשים — לפני פתיחה אין
  חשיפה הדדית, אחרי פתיחה יש; שמירה לפני נעילה מצליחה ואחרי נעילה נדחית עם
  הודעה בטוחה.

### Exit Slice 5

ה־DB מכריע את גבול הזמן גם בעקיפת UI; ניחושי אחרים מוסתרים לפני הפתיחה; כל
השערים ירוקים; ה־slice ניתן להדגמה ב־URL פרוס.

## שלב 2 — Slice 6: תוצאות, ניקוד ודירוג

רק אחרי ש־Slice 5 מוזג וירוק. ההוראות המלאות נמצאות במאגר בקובץ
**`docs/prompts/slice-6-implementation-prompt.md`** — קרא אותו במלואו ופעל
לפיו. תמצית:

- `score_match(...)` אטומית לפי סעיף 7.4: `SECURITY DEFINER` עם
  `search_path = ''`, EXECUTE נשלל מ־`anon`/`authenticated`, lock על המשחק,
  overwrite דטרמיניסטי set-based של כל שדות הניקוד לפי חוקי כל ליגה — לעולם לא
  increment. `canceled` מאפס נקודות בלי למחוק ניחושים. audit באותה transaction.
- `league_leaderboard` view עם `security_invoker` ו־`rank()` בשיטת competition
  ranking (שניים במקום 1 ⇒ הבא במקום 3); שובר שוויון הוא correct outcomes בלבד;
  חבר בלי ניחושים מוחזר עם 0.
- `applyManualResult` Server Action דרך admin client, עם הרשאת מנהל מערכת —
  הקדם `system_admins` מינימלית ועדכן את סעיף 5 בתכנית באותו PR.
- מסך `/leagues/[leagueId]/standings` ומודול prize split טהור (basis points,
  מקום משותף מאחד אחוזים ומחלק שווה).
- מטריצת בדיקות מלאה: Vitest (כולל שתי ליגות עם חוקים שונים), pgTAP
  (מדויק/בית/חוץ/תיקו/טעות/canceled/retry/תיקון + הרשאות שליליות), Playwright
  (מפעיל מורשה מזין תוצאה, דירוג ושוויון מתעדכנים, משתמש רגיל נדחה).

**Exit:** retry אינו משנה נקודות; correction מחשב מחדש; tie rules מדויקים.

## כללים מחייבים לשני השלבים

- Server Components לקריאות, Server Actions למוטציות UI; Actions דקים:
  session → validation → authorization → service/RPC → typed result.
- ה־actor נגזר מה־session בלבד; לעולם לא סומכים על `user_id`, role, נקודות או
  סטטוס נעילה מהלקוח. אכיפה בצד לקוח בלבד היא באג אבטחה.
- RLS ו־grants מצומצמים באותה migration שיוצרת כל טבלה חשופה. migrations הן
  forward-only — אל תערוך migration שהופעלה; צור חדשה עם timestamp אמיתי.
- אחרי כל שינוי סכימה הרץ `npm run types:db` ועדכן את
  `src/types/database.generated.ts`; drift מפיל verification.
- זמנים כ־UTC `timestamptz`. שגיאות עם קודי `AppError` יציבים והודעות בטוחות;
  אין stack traces, SQL, secrets או PII בלוגים ובלקוח.
- קוד, migrations ו־commit messages באנגלית; טקסט למשתמש בעברית, RTL,
  mobile-first, עם loading/empty/error states נגישים.
- כתוב בדיקות שנכשלות לפני המימוש ככל האפשר. כל שינוי הרשאה מחייב בדיקה
  שלילית עם משתמש/ליגה זרים.
- לפני מסירת כל slice הרץ: `npm run lint && npm run typecheck && npm run test
  && npm run test:db && npm run build && npm run test:e2e`. אל תדווח על בדיקה
  שלא רצה בפועל.
- עדכן באותו PR את `docs/testing.md`, `docs/security.md` כשנוספות החלטות,
  ואת סעיף 20 ("המשימה הבאה") בתכנית הטכנית. כלול rollback מחשבתי בתיאור ה־PR.
- לעולם אל תריץ פקודות הרסניות מול פרויקט Supabase מקושר/Production;
  `supabase db reset --linked` אסור.
