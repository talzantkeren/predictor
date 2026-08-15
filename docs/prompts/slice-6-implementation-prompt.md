# פרומפט מימוש — Slice 6: תוצאות, ניקוד ודירוג

> העתיקו את הפרומפט הזה כהוראת עבודה לסוכן קידוד. הוא נגזר מ־`AGENTS.md`,
> `docs/product.md`, `docs/architecture.md` ו־`docs/technical-plan.md` (גרסה 2.7)
> ואינו מחליף אותם.

---

## הפרומפט

אתה סוכן קידוד שעובד על Predictor1 — אפליקציית Next.js 16 App Router בעברית RTL
לליגות ניחושי כדורגל פרטיות, עם Supabase (PostgreSQL/Auth/Storage) ופריסה ב־Vercel.

לפני כל תכנון או עריכה קרא לפי הסדר: `AGENTS.md`, `docs/product.md`,
`docs/architecture.md`, `docs/technical-plan.md`. כל החלטה קנונית שם גוברת על
הפרומפט הזה; אם מצאת סתירה — עצור והסבר לפני שינוי קוד.

### משימה

ממש את **Slice 6 — תוצאות, ניקוד ודירוג** לפי סעיף 15 בתכנית הטכנית:

> **תוצר:** manual result → atomic scoring → standings → prize split.
> **Exit:** retry אינו משנה נקודות; correction מחשב מחדש; tie rules מדויקים.

### שער כניסה — בדוק לפני שאתה מתחיל

Slice 6 תלוי ב־Slice 5 (ניחושים ונעילה). ודא שקיימים במאגר: migration של
`predictions` עם unique `(league_id, match_id, user_id)`, מדיניות נעילה לפי זמן
DB, ו־flows של שמירת ניחוש. **אם Slice 5 לא נמסר — עצור ודווח; אל תממש את
Slice 5 בהיחבא בתוך Slice 6.** כמו כן ודא ש־`matches` כבר כולל
`result_version`, `is_manually_overridden`, `home_score`/`away_score` ו־checks
לפי סעיף 6.3; אם חסר משהו — השלם ב־migration חדשה, לא בעריכת migration קיימת.

### היקף Slice 6

1. **`score_match(...)`** — פונקציית DB אטומית לפי החוזה בסעיף 7.4 של התכנית:
   - פרמטרים: `p_match_id`, `p_status` (`finished`/`canceled`), `p_home_score`,
     `p_away_score`, `p_is_manual_override`, `p_source`.
   - caller הוא פעולת מערכת בלבד: `SECURITY DEFINER` עם `set search_path = ''`,
     שמות schema מלאים, `REVOKE` execution כברירת מחדל ו־grant מצומצם; אין
     EXECUTE ל־`anon`/`authenticated`.
   - lock על המשחק, validation של score/status, עדכון result ו־`result_version`
     רק כשהשתנו, ואז **overwrite דטרמיניסטי set-based** של
     `points`, `is_exact`, `is_correct_outcome`, `scored_at`,
     `scored_result_version`, `scored_rule_version` על כל הניחושים, לפי חוקי
     הניקוד של כל ליגה בנפרד. לעולם לא increment.
   - `canceled` מאפס נקודות ומסמן flags כ־false בלי למחוק תחזיות.
   - audit באותה transaction; commit אחד.

2. **`league_leaderboard` View** לפי סעיף 6.6:
   - מתחיל מכל ה־`league_members` הפעילים ו־`LEFT JOIN` לניחושים, כך שחבר בלי
     ניחושים מוחזר עם 0 (SCORE-03).
   - עמודות: `total_points`, `correct_outcomes`, `exact_scores`,
     `predictions_submitted`.
   - **`rank()` בלבד** לפי points ואז correct outcomes — competition ranking:
     שניים במקום 1 ⇒ הבא במקום 3 (SCORE-07). אין `dense_rank()`. מספר תוצאות
     מדויקות הוא מידע בלבד ואינו שובר שוויון (SCORE-08).
   - `security_invoker`; אין `SECURITY DEFINER VIEW` חשופה ואין עקיפת RLS.

3. **`applyManualResult` Server Action** לפי סעיף 9: קלט משחק + תוצאה/סטטוס,
   Zod validation, אימות session והרשאת מפעיל, ואז `score_match` דרך ה־admin
   client. ה־actor נגזר מה־session בלבד; אין `user_id`/role מהלקוח.
   - **נקודת החלטה מתועדת:** ההרשאה למזין תוצאה ידנית היא "מנהל מערכת"
     (זרימת Playwright ‎7 בתכנית), אבל `system_admins` משויכת בתכנית ל־migration
     008 (Slice 7–8). בחר את המסלול המינימלי: הקדם טבלת `system_admins`
     מינימלית (ללא CRUD למשתמש רגיל, seed מאובטח בלבד) לתוך migration של
     Slice 6, ועדכן את סעיף 5 בתכנית הטכנית באותו PR. אל תפתור זאת בהרשאה
     רופפת או בבדיקת צד־לקוח.

4. **מסך דירוג** `/leagues/[leagueId]/standings` — Server Component, נגיש
   לחבר/מנהל של אותה ליגה בלבד; טבלה שהופכת לכרטיסים/scroll נגיש במובייל; RTL;
   מציג מקומות משותפים לפי competition ranking.

5. **חישוב חלוקת פרסים** — מודול טהור ב־`features/scoring` (או `reports` לפי
   המבנה הקיים): מקום מזכה משותף מאחד את אחוזי המקומות שנתפסו ומחלק שווה בשווה
   (דרישה 9 בחוקי העסק). basis points בלבד, בלי floating point. ב־Slice הזה
   נדרשים המודול ובדיקות היחידה שלו; דוחות ה־UI המלאים נשארים ל־Slice 9.

6. **זרימות correction ו־cancel** — תיקון תוצאה מעלה `result_version`, מחשב
   מחדש ומחליף את הניקוד הקודם בכל הניחושים (SCORE-05, SCORE-06); ביטול משחק
   מאפס נקודות בלי למחוק ניחושים.

### דרישות מוצר שה־Slice חייב לספק

SCORE-01 עד SCORE-08, ובנוסף: `points` נשמר על הניחוש ואינו נגזר בכל טעינת
דירוג (חוק עסקי 5); התוצאה הקובעת היא בתום הזמן החוקי (חוק 13); שוויון אחרי
שובר השוויון ⇒ מקום משותף וחלוקת פרסים לפי סעיף 7 במוצר.

### בדיקות — נכשלות לפני המימוש ככל האפשר

- **Vitest:** סיווג outcome כולל תיקו; מטריצת 3/1/0 וחוקי ניקוד מותאמים שונים
  בשתי ליגות; prize split במקומות משותפים; Zod schemas של הקלט.
- **pgTAP (`supabase/tests/scoring.test.sql`):** `score_match` — מדויק, בית,
  חוץ, תיקו, טעות, canceled, retry אידמפוטנטי, תיקון תוצאה; שתי ליגות עם חוקים
  שונים מקבלות `points` שונים לאותו משחק; EXECUTE נדחה ל־`anon`/`authenticated`;
  ה־View לא חושף ליגה זרה למשתמש B; RLS enabled על כל טבלה חדשה.
- **Playwright (`e2e/scoring.spec.ts`):** מפעיל מורשה מזין תוצאה; דירוג, שוויון
  ומקום משותף מתעדכנים; משתמש רגיל שמנסה להזין תוצאה נדחה (בדיקת הרשאה
  שלילית חובה).

### כללים שאין לחצות

- ניקוד overwrite דטרמיניסטי מהתוצאה וגרסת החוקים הנוכחיות; לעולם לא increment.
- תיקו הוא outcome מדרגה ראשונה; שובר שוויון הוא correct outcomes בלבד ואז
  מקום משותף.
- ה־admin client נשאר ב־`src/lib/supabase/admin.ts` עם `server-only`; אין
  להשתמש בו מחוץ למודולי scoring/sync/system מורשים.
- אין חוקי ניקוד ניתנים לשינוי אחרי תחילת הליגה; אין לוגיקת דירוג שסותרת את
  שובר השוויון הקנוני.
- זמנים כ־UTC `timestamptz`; שגיאות עם קודים יציבים (`AppError`) והודעות
  בטוחות; אין stack traces או SQL ללקוח וללוגים רגישים.
- קוד, migrations ו־commits באנגלית; טקסט למשתמש בעברית, RTL.

### תהליך ותוצרים

1. עבוד בענף feature ייעודי; migration חדשה עם timestamp אמיתי; אל תערוך
   migrations שהופעלו.
2. עדכן `src/types/database.generated.ts` (`npm run types:db`) — drift מפיל
   verification.
3. עדכן באותו PR: `docs/testing.md`, `docs/security.md` אם נוספו החלטות אבטחה,
   סעיף 5 בתכנית אם הוקדמה `system_admins`, וסעיף 20 ("המשימה הבאה") בתכנית
   הטכנית.
4. לפני מסירה הרץ: `npm run lint && npm run typecheck && npm run test &&
   npm run test:db && npm run build && npm run test:e2e`. אל תדווח על בדיקה
   שלא רצה בפועל.
5. כתוב בתיאור ה־PR את ה־rollback המחשבתי של ה־migration.

### קריטריוני יציאה (Definition of Done ל־Slice)

- הרצת `score_match` חוזרת עם אותה תוצאה ואותה גרסת חוקים אינה משנה אף נקודה.
- תיקון תוצאה מחשב מחדש ומחליף את כל הניחושים הרלוונטיים; ביטול מאפס בלי למחוק.
- דירוג, שובר שוויון ומקום משותף תואמים בדיוק ל־SCORE-07/08 ולדוגמאות הבדיקה.
- שתי ליגות עם חוקי ניקוד שונים מקבלות נקודות שונות לאותו משחק.
- משתמש לא מורשה אינו יכול להזין תוצאה או לקרוא דירוג של ליגה זרה.
- כל הבדיקות והשערים ירוקים; ה־slice ניתן להדגמה מקצה לקצה ב־URL פרוס.
