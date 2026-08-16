# פרומפט מימוש — Slice 6: תוצאות, ניקוד ודירוג

> העתיקו את הטקסט שמתחת לקו כפרומפט אחד לסוכן הקידוד. הוא נגזר מ־`AGENTS.md`,
> `docs/product.md`, `docs/architecture.md` ו־`docs/technical-plan.md` (גרסה 2.7)
> ואינו מחליף אותם.

---

אתה סוכן קידוד שעובד על **Predictor1** — אפליקציית Next.js 16 App Router בעברית
RTL לליגות ניחושי כדורגל פרטיות, עם Supabase (PostgreSQL/Auth/Storage) ופריסה
ב־Vercel. פרויקט גמר לקורס RUNI Internet Technologies 2026; דדליין 6 בספטמבר.

לפני כל תכנון או עריכה קרא לפי הסדר: `AGENTS.md`, `docs/product.md`,
`docs/architecture.md`, `docs/technical-plan.md`. המסמכים האלה קנוניים וגוברים
על הפרומפט הזה. אם מצאת סתירה — עצור והסבר לפני שינוי קוד.

## המשימה

ממש את **Slice 6 — תוצאות, ניקוד ודירוג** לפי סעיף 15 בתכנית הטכנית:

> **תוצר:** manual result → atomic scoring → standings → prize split.
> **Exit:** retry אינו משנה נקודות; correction מחשב מחדש; tie rules מדויקים.

עבוד בענף feature ייעודי מ־`main` המעודכן, ב־PR נפרד.

## מה כבר קיים במאגר — אל תבנה מחדש

Slices 0–5 נמסרו ומוזגו. רלוונטי אליך:

- `public.predictions` קיימת עם **כל** שדות הניקוד מוכנים ומחכים לך:
  `points smallint not null default 0` (check 0–100), `is_exact`,
  `is_correct_outcome`, `scored_at`, `scored_result_version`,
  `scored_rule_version`. אל תוסיף אותם שוב — רק כתוב אליהם.
- `public.outcome` enum כבר קיים (`HOME`/`DRAW`/`AWAY`).
  `predictions.predicted_outcome` הוא **generated stored column** מהציונים —
  אל תנסה לכתוב אליו.
- unique `(league_id, match_id, user_id)` על `predictions`; אינדקסים
  `predictions_match_idx` ו־`predictions_league_user_idx`.
- טריגרים שאוכפים התאמת עונה בין ליגה למשחק, וחוסמים שינוי `season_id`
  כשקיימים ניחושים.
- `public.save_prediction(uuid, uuid, numeric, numeric)` — RPC הכתיבה היחיד של
  ניחושים; `authenticated` מקבל `SELECT` בלבד על `predictions`.
- `private.is_active_league_member(league_id)` — פונקציית עזר קיימת לבדיקת
  חברות פעילה. השתמש בה, אל תשכפל.
- `public.get_prediction_database_time()` — זמן DB ל־render דטרמיניסטי.
- `matches` כולל כבר `result_version`, `is_manually_overridden`,
  `home_score`/`away_score` ו־checks; `league_scoring_rules` כולל
  `exact_points`, `correct_outcome_points`, `incorrect_points` ו־`version`.

## היקף Slice 6

### 1. `score_match(...)` — פונקציית DB אטומית

לפי החוזה בסעיף 7.4:

- פרמטרים: `p_match_id`, `p_status` (`finished`/`canceled`), `p_home_score`,
  `p_away_score`, `p_is_manual_override boolean`, `p_source text`.
- פעולת מערכת בלבד: `SECURITY DEFINER` עם `set search_path = ''`, שמות schema
  מלאים, `REVOKE ALL ... FROM public, anon, authenticated, service_role` ואז
  grant מצומצם בלבד. **אין EXECUTE ל־`anon` או `authenticated`.**
- lock על המשחק, validation של score/status, עדכון התוצאה והעלאת
  `result_version` **רק כאשר התוצאה באמת השתנתה**.
- **overwrite דטרמיניסטי set-based** של `points`, `is_exact`,
  `is_correct_outcome`, `scored_at`, `scored_result_version`,
  `scored_rule_version` בכל הניחושים של המשחק, לפי חוקי הניקוד של כל ליגה
  בנפרד. **לעולם לא increment** ולעולם לא חישוב לפי מצב קודם.
- `canceled` מאפס `points` ומסמן flags כ־false, בלי למחוק תחזיות.
- audit באותה transaction; commit אחד.

> **אילוץ סדר נעילות — חובה.** `save_prediction` נועל בסדר
> `leagues` → `league_members` → `matches`. כדי למנוע deadlock, `score_match`
> חייב לא לנעול שורת `leagues` אחרי שנעל את שורת ה־`matches`. העדף לא לנעול
> `leagues` כלל (קרא `league_scoring_rules` בלי `FOR UPDATE`), או נעל באותו
> סדר בדיוק.

### 2. `league_leaderboard` View

לפי סעיף 6.6:

- מתחיל מכל `league_members` הפעילים ו־`LEFT JOIN` לניחושים, כך שחבר בלי
  ניחושים מוחזר עם 0 (SCORE-03).
- עמודות: `total_points`, `correct_outcomes`, `exact_scores`,
  `predictions_submitted`.
- **`rank()` בלבד** לפי points ואז correct outcomes — competition ranking:
  שניים במקום 1 ⇒ הבא במקום 3 (SCORE-07). אין `dense_rank()`. מספר התוצאות
  המדויקות הוא מידע בלבד ואינו שובר שוויון נוסף (SCORE-08).
- `security_invoker`; אין `SECURITY DEFINER VIEW` חשופה ואין עקיפת RLS.

### 3. `applyManualResult` Server Action

- קלט: משחק + תוצאה/סטטוס. Zod validation, אימות session, ואז `score_match`
  דרך ה־admin client (`src/lib/supabase/admin.ts`, `server-only`).
- ה־actor נגזר מה־session בלבד; אין `user_id`/role/points מהלקוח.
- **נקודת החלטה מתועדת:** ההרשאה היא "מנהל מערכת", אבל `system_admins` משויכת
  בתכנית ל־migration 008. הקדם טבלת `system_admins` מינימלית (ללא CRUD למשתמש
  רגיל; seed מאובטח או migration בלבד), ועדכן את סעיף 5 בתכנית הטכנית באותו PR.
  אל תפתור זאת בהרשאה רופפת או בבדיקת צד־לקוח.

### 4. מסך דירוג

`/leagues/[leagueId]/standings` — Server Component, נגיש לחבר/מנהל של אותה
ליגה בלבד. טבלה שהופכת לכרטיסים או scroll נגיש במובייל, RTL, מצבי
loading/empty/error, ומקומות משותפים מוצגים נכון.

### 5. חישוב חלוקת פרסים

מודול טהור ב־`src/features/scoring/`: מקום מזכה משותף מאחד את אחוזי המקומות
שנתפסו ומחלק שווה בשווה (חוק עסקי 9). basis points בלבד — אין floating point.
ב־Slice הזה נדרשים המודול ובדיקות היחידה; דוחות ה־UI המלאים נשארים ל־Slice 9.

### 6. Correction ו־cancel

תיקון תוצאה מעלה `result_version`, מחשב מחדש ומחליף את הניקוד בכל הניחושים
הרלוונטיים (SCORE-05, SCORE-06). ביטול משחק מאפס נקודות בלי למחוק ניחושים.

## דרישות מוצר

SCORE-01 עד SCORE-08. בנוסף: `points` נשמר על הניחוש ואינו נגזר בכל טעינת דירוג
(חוק 5); התוצאה הקובעת היא בתום הזמן החוקי (חוק 13); שוויון אחרי שובר השוויון
⇒ מקום משותף וחלוקת פרסים לפי סעיף 7 במוצר.

## בדיקות — נכשלות לפני המימוש ככל האפשר

- **Vitest:** סיווג outcome כולל תיקו; מטריצת 3/1/0 וחוקי ניקוד מותאמים שונים
  בשתי ליגות; prize split במקומות משותפים; Zod schemas של הקלט.
- **pgTAP (`supabase/tests/scoring.test.sql`):** `score_match` — מדויק, בית,
  חוץ, תיקו, טעות, canceled, retry אידמפוטנטי, תיקון תוצאה; שתי ליגות עם חוקים
  שונים מקבלות `points` שונים לאותו משחק; EXECUTE נדחה ל־`anon`/`authenticated`;
  ה־View לא חושף ליגה זרה למשתמש B; RLS enabled על כל טבלה חדשה.
- **Playwright (`e2e/scoring.spec.ts`):** מפעיל מורשה מזין תוצאה; דירוג, שוויון
  ומקום משותף מתעדכנים; משתמש רגיל שמנסה להזין תוצאה נדחה (בדיקת הרשאה שלילית
  חובה).

## כללים שאין לחצות

- ניקוד overwrite דטרמיניסטי מהתוצאה וגרסת החוקים הנוכחיות; לעולם לא increment.
- תיקו הוא outcome מדרגה ראשונה; שובר שוויון הוא correct outcomes בלבד ואז
  מקום משותף.
- ה־admin client נשאר ב־`src/lib/supabase/admin.ts` עם `server-only`; אין
  להשתמש בו מחוץ למודולי scoring/sync/system מורשים.
- אין חוקי ניקוד שניתן לשנות אחרי תחילת הליגה; אין לוגיקת דירוג שסותרת את שובר
  השוויון הקנוני.
- RLS ו־grants מצומצמים באותה migration שיוצרת כל טבלה חשופה. migrations הן
  forward-only — אל תערוך migration שהופעלה; צור חדשה עם timestamp אמיתי.
- זמנים כ־UTC `timestamptz`; שגיאות עם קודי `AppError` יציבים והודעות בטוחות;
  אין stack traces, SQL, secrets או PII בלוגים ובלקוח.
- קוד, migrations ו־commit messages באנגלית; טקסט למשתמש בעברית, RTL.
- לעולם אל תריץ פקודות הרסניות מול פרויקט Supabase מקושר/Production;
  `supabase db reset --linked` אסור.

## תהליך ותוצרים

1. אחרי כל שינוי סכימה הרץ `npm run types:db` ועדכן את
   `src/types/database.generated.ts`; drift מפיל verification.
2. עדכן באותו PR: `docs/testing.md`, `docs/security.md` אם נוספו החלטות אבטחה,
   סעיף 5 בתכנית אם הוקדמה `system_admins`, וסעיף 20 ("המשימה הבאה").
3. לפני מסירה הרץ: `npm run lint && npm run typecheck && npm run test &&
   npm run test:db && npm run build && npm run test:e2e`. אל תדווח על בדיקה
   שלא רצה בפועל.
4. כלול בתיאור ה־PR את ה־rollback המחשבתי של ה־migration.

## קריטריוני יציאה

- הרצת `score_match` חוזרת עם אותה תוצאה ואותה גרסת חוקים אינה משנה אף נקודה.
- תיקון תוצאה מחשב מחדש ומחליף את כל הניחושים הרלוונטיים; ביטול מאפס בלי למחוק.
- דירוג, שובר שוויון ומקום משותף תואמים בדיוק ל־SCORE-07/08 ולדוגמאות הבדיקה.
- שתי ליגות עם חוקי ניקוד שונים מקבלות נקודות שונות לאותו משחק.
- משתמש לא מורשה אינו יכול להזין תוצאה או לקרוא דירוג של ליגה זרה.
- אין deadlock בין `score_match` ל־`save_prediction` תחת ריצה מקבילה.
- כל הבדיקות והשערים ירוקים; ה־slice ניתן להדגמה מקצה לקצה ב־URL פרוס.

## חוב ידוע שאינו חלק מה־Slice

- `save_prediction` נועל `leagues` ו־`matches` ב־`FOR UPDATE` במקום `FOR SHARE`;
  שייך ל־`docs/scale.md`, לא לתיקון כאן.
- פוליסי החשיפה של `predictions` חושף לפי `kickoff_at` בלי להתחשב בסטטוס, ולכן
  משחק `canceled` נחשף במועד הפתיחה המקורי. אם Slice 6 משנה זאת — עדכן את
  `docs/security.md` ואת בדיקות ה־RLS יחד עם השינוי.
- עונה עם יותר מ־500 משחקים מחזירה שגיאה בטוחה במקום pagination.
