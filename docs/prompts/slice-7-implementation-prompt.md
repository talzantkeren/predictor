# פרומפט מימוש — Slice 7: Sports Sync אמיתי או adapter ידני סופי

> העתיקו את הטקסט שמתחת לקו כפרומפט אחד לסוכן הקידוד. הוא נגזר מ־`AGENTS.md`,
> `docs/product.md`, `docs/architecture.md` (סעיפים 14, 17–18),
> `docs/technical-plan.md` (גרסה 3.1, סעיפים 5, 6.7, 7.4, 10.4, 15, 20)
> ומ־`docs/sports-provider-poc.md`, ואינו מחליף אותם.

---

אתה סוכן קידוד שעובד על **Predictor1** — אפליקציית Next.js 16 App Router בעברית
RTL לליגות ניחושי כדורגל פרטיות, עם Supabase (PostgreSQL/Auth/Storage/Cron)
ופריסה ב־Vercel. פרויקט גמר לקורס RUNI Internet Technologies 2026; דדליין
6 בספטמבר.

לפני כל תכנון או עריכה קרא לפי הסדר: `docs/product.md`, `docs/architecture.md`,
`docs/technical-plan.md`, וכן `AGENTS.md` ו־`docs/sports-provider-poc.md`.

**סדר הסמכות מחייב אותך גם בתוך הפרומפט הזה:** `docs/architecture.md` הוא
המסמך הקנוני היחיד לארכיטקטורה ולגבולות אבטחה, והוא גובר על
`docs/technical-plan.md`. כאשר השניים סותרים, אסור "ליישר" את הארכיטקטורה
לתכנית. או שהתכנית מתוקנת לפי הארכיטקטורה, או שמדובר בשינוי החלטה
ארכיטקטונית — ואז מעדכנים תחילה את `docs/architecture.md` במפורש, עם הנימוק
והאילוץ שהוליד אותו, ורק אחר כך את התכנית. אם מצאת סתירה שאינה מכוסה כאן —
עצור והסבר לפני שינוי קוד.

## המשימה

ממש את **Slice 7 — Sports Sync אמיתי או adapter ידני סופי** לפי סעיף 15
בתכנית הטכנית:

> **תוצר:** sync logs, override, Cron ו־admin status.
> **Exit:** כפילות ריצה בטוחה; ספק שנופל אינו פוגע בנתונים הקיימים. אם POC
> נכשל, ה־slice נסגר עם Manual provider מתועד.

עבוד בענף feature ייעודי מ־`main` המעודכן, ב־PR נפרד.

## הכרעת שער ה־POC — נקודת המוצא של ה־Slice

לפי `docs/sports-provider-poc.md`, **לא בוצע ולא התקבל POC חי לספק חיצוני**;
שש שאלות ההערכה פתוחות ואין credentials. לפי סעיף 20 בתכנית: "אם ה־POC אינו
עובר, המסלול הידני שנמסר ב־Slice 6 נשאר המסלול הקנוני ואין להמציא תלות בספק."

**ההכרעה: ה־slice נסגר עם Manual provider מתועד, בהיקף מצומצם ואמיתי.**

מכאן נגזר גבול שאסור לחצות: **אין לבנות עכשיו צנרת Sync פעילה סביב קריאת רשת
שאינה קיימת.** אין ספק חי, ולכן נעילת ריצה סביב קריאת ספק דמיונית היא מנגנון
מדומה — היא לא תיבדק באמת, לא תוכיח דבר, ותיצור ביטחון שווא במנגנון שקריסתו
מתגלה רק כשיחובר ספק. הסיבה השנייה: קטלוג ה־Demo שנמסר ב־Slice 5 סינתטי, ללא
`external_provider`/`external_id`, ו־upsert של fixtures ידניים היה מזהם אותו
ומציג לוח מומצא כלוח מסונכרן.

לכן ב־Slice הזה:

- `sync_runs`, Cron route מאומת, מסך סטטוס וסגירת ה־POC — **נבנים**.
- upsert של fixtures, lifecycle של `running`, קריאת adapter מה־route
  ו־gateway עם `p_source='sync'` — **אינם נבנים**. הם נכנסים יחד עם בחירת ספק
  אמיתי, לפי חוזה ה־lease שמתועד בסעיף "מסלול הספק העתידי" למטה.
- כיבוד `is_manually_overridden` נמסר כ**מודול תכנון טהור** עם בדיקות
  מ־fixtures — specification executable, לא צנרת פעילה (ראה סעיף 5).

הזנת תוצאות נשארת דרך `applyManualResult` של Slice 6.

## אילוץ תשתית מכריע — קרא לפני שאתה מתכנן נעילה

`src/lib/supabase/admin.ts` יוצר לקוח `supabase-js` מול **Supabase Data API
(PostgREST)**. אין ל־Route Handler חיבור PostgreSQL קבוע, ואין session שנשמר
בין קריאות. כל `.rpc()` הוא בקשת HTTP נפרדת, בטרנזקציה משתמעת נפרדת, על
connection מתוך pool. שתי קריאות `supabase-js` נפרדות **אינן** טרנזקציה
משותפת. מכאן:

- **אסור `pg_try_advisory_lock`** (session-level). הנעילה נשארת על ה־connection
  אחרי סיום הקריאה, ה־connection חוזר ל־pool, וקריאת ה־unlock המאוחרת עלולה
  להגיע ל־connection אחר לגמרי — כלומר נעילה דלופה שלא משוחררת ומנעול שלא
  משתחרר לעולם.
- **`pg_try_advisory_xact_lock` תקף רק בתוך טרנזקציה אחת.** הוא משתחרר
  ב־commit של ה־RPC — כלומר לפני קריאת הספק ולפני ה־upsert. הוא **אינו** מגן
  על ריצה רב־שלבית שחוצה קריאת רשת. אל תשתמש בו כאילו כן.

מסקנה מעשית: כל אמירה על "advisory lock סביב הריצה" בסעיף 14.3 בארכיטקטורה
ובסעיף 10.4 בתכנית אינה ניתנת למימוש נכון בטרנספורט הזה כפי שנוסחה. זו
**סתירה בין המסמך הקנוני לבין אילוץ תשתית אמיתי**, ולכן היא מטופלת כשינוי
החלטה ארכיטקטונית מתועד — ראה "תהליך ותוצרים", סעיף 2.

## מה כבר קיים במאגר — אל תבנה מחדש

Slices 0–6 נמסרו ומוזגו. רלוונטי אליך:

- `public.score_match(p_match_id uuid, p_status match_status, p_home_score
  numeric, p_away_score numeric, p_is_manual_override boolean, p_source text)`
  קיים (migration `20260817005130`), `SECURITY DEFINER` עם `search_path = ''`.
  הוא גוזר actor מה־header `x-predictor-system-actor`, מאמת פורמט UUID ובודק
  חברות ב־`public.system_admins` — fail-closed. **אל תשכתב אותו ואל תוסיף
  מסלול RPC עוקף.**
- `src/features/scoring/private-scoring-gateway.ts` — `scoreMatchAsSystem`
  קורא ל־RPC דרך `createSystemActorAdminClient(systemActorId)` שמזריק את
  ה־header, עם `p_is_manual_override: true` ו־`p_source: "manual"` מקובעים.
  **השאר אותו כפי שהוא.** מסלול `p_source='sync'` מגיע עם הספק, לא כאן.
- `src/lib/supabase/admin.ts` — `server-only`, הטרנספורט היחיד ל־secret key.
- `public.system_admins` קיימת מ־Slice 6 (ללא CRUD למשתמש רגיל).
- `public.matches` כולל `result_version`, `is_manually_overridden`,
  `external_provider`, `external_id`, checks על סטטוס/תוצאה.
- `public.audit_logs` ו־`public.rate_limit_events` קיימות מ־Slice 3.
- **enum `sync_status` וטבלת `sync_runs` עדיין לא קיימים** — הם התוצר שלך.
- `src/features/sports/` כולל `types.ts` (חוזה `SportsProvider`),
  `manual-provider.ts`, `fixtures.ts`, `normalization.ts` ובדיקות. השתמש
  בחוזה הקיים; אל תמציא interface חדש.
- `src/lib/env.ts` מאמת env עם Zod. `CRON_SECRET` ו־`SPORTS_API_KEY` כבר שם
  כ־optional; **`SYNC_SYSTEM_ACTOR_ID` מופיע ב־`.env.example` אך עדיין לא
  ב־`env.ts`** — עליך להוסיפו.
- מסך אדמין קיים ב־`src/app/(app)/admin/matches/page.tsx` עם AuthZ של מנהל
  מערכת — עמוד ה־sync status החדש יושב לצדו תחת `(app)/admin/`.

## היקף Slice 7

### 1. Migration: `sync_status` enum ו־`sync_runs`

- `create type public.sync_status as enum ('running','succeeded','failed','skipped')`
  — לפי סעיף 6.1 בתכנית. `running` נשאר בערכי ה־enum עבור מסלול הספק העתידי
  ואינו בשימוש ב־Slice הזה; תעד זאת ב־`comment on type`.
- `sync_runs`: `id`, `provider text`, `status sync_status`, `started_at`,
  `finished_at`, `fixtures_seen`, `matches_changed`, `results_changed`,
  `error_code`, `error_message_safe` (סעיף 6.7). ספירות לא־שליליות;
  CHECK שמחייב `finished_at` לכל סטטוס סופי ומאפשר `null` רק ב־`running`.
- אינדקס `(started_at desc)` (סעיף 12 בארכיטקטורה).
- **באותה migration**: `enable row level security`, `revoke all` מ־`public`,
  `anon`, `authenticated`; `select` למנהלי מערכת בלבד (policy שנשענת על
  `system_admins`, בדפוס הקיים של Slice 6); **אין** insert/update/delete
  ללקוחות — כתיבה רק דרך ה־RPC של סעיף 2.

### 2. `record_sync_attempt(...)` — RPC אטומי יחיד

זהו לב ה־Slice, והוא נכתב **מתוך** אילוץ ה־Data API ולא סביבו. טרנזקציה אחת,
קריאה אחת, בלי מצב שנשמר בין קריאות:

1. אימות actor זהה לדפוס `score_match`: קריאת `x-predictor-system-actor`
   מ־`request.headers`, אימות פורמט UUID קנוני ובדיקת חברות ב־
   `system_admins`. כשל ⇒ `FORBIDDEN`. אין פרמטר actor מהלקוח.
2. `pg_try_advisory_xact_lock` עם מפתח קבוע ומתועד (קבוע מספרי מוצהר בקוד
   ובתיעוד). **הנעילה חוקית כאן בדיוק משום שכל מה שהיא מגנה עליו נמצא בתוך
   אותה טרנזקציה.** אם לא הושגה — אין המתנה חוסמת ואין עיבוד; נכתבת שורה
   סופית `status=skipped`, `error_code='CONCURRENT_ATTEMPT'`.
3. במסלול הנוכחי אין ספק חי, ולכן אין הערכת חלון זמנים אמיתית: נכתבת שורה
   סופית `status=skipped`, `error_code='MANUAL_PROVIDER'`. הקוד
   `OUTSIDE_DUE_WINDOW` שמור למסלול הספק העתידי ואינו בשימוש כאן.
4. כל שורה נכתבת **סופית** כולל `finished_at`; `error_message_safe` נשאר
   `null` בדילוג. במסלול הנוכחי לא נוצרת שורת `running` לעולם.

> **MATCH-06 — הוכרע: תיעוד מלא.**
>
> `docs/product.md` הוא המסמך הקנוני העליון, ו־MATCH-06 דורש ש"כל ריצת סנכרון
> מתועדת, וריצות מקבילות אינן מעבדות אותו חלון פעמיים". ההכרעה: **כל קריאת
> Cron מורשית שהגיעה ל־RPC היא ניסיון Sync שחייב בתיעוד**, כולל זו שהפסידה
> בנעילה. לא מצמצמים ולא משנים את MATCH-06.
>
> הנימוק: המחצית השנייה של הדרישה עוסקת במפורש בריצות מקבילות, ולכן הוצאת
> המקרה הזה מחובת התיעוד הייתה מרוקנת אותה בדיוק במקום שבשבילו נכתבה, ומוחקת
> את הראיה היחידה ל־contention בפרודקשן. העלות היא שורת לוג append-only חסרת
> אינווריאנט, ולכן כתיבתה מחוץ להגנת הנעילה בטוחה.
>
> **שני קודי הדילוג מדויקים בכוונה:**
>
> - `CONCURRENT_ATTEMPT` — ולא "run". המחזיק בנעילה עלול להיכשל ולבצע
>   rollback, ולכן הידוע הוא שהיה ניסיון מקביל, לא שהתקיימה ריצה שהושלמה.
> - `MANUAL_PROVIDER` — ולא `OUTSIDE_DUE_WINDOW`. במסלול הנוכחי אין חלון
>   שטרם הגיע, אלא החלטה קבועה שאין ספק חי. `OUTSIDE_DUE_WINDOW` שמור למסלול
>   הספק העתידי.
>
> ההבחנה הזאת גם מפרידה בין overlap אמיתי לרעש סדרתי: רק התנגשות אמיתית
> ב־xact-lock מניבה `CONCURRENT_ATTEMPT`, בעוד retry שהגיע אחרי שחרור הנעילה
> מקבל `MANUAL_PROVIDER`.
>
> **דילוג מתועד מחזיר HTTP 200**, לא 409/429 — כדי לא לעודד retry נוסף מצד
> ה־Cron.
>
> **שלוש נגזרות מחייבות:**
>
> 1. **`error_code` נושא כאן קוד שאינו שגיאה.** השם מטעה קורא עתידי, ולכן
>    חובה `comment on column` שמסביר שהעמודה נושאת קוד תוצאה, ו־`status` הוא
>    המבחין היחיד. כל שאילתה, מסך או התראה מסננים כשל לפי `status='failed'`
>    ולעולם לא לפי "`error_code` אינו null".
> 2. **בקשה לא מורשית אינה ניסיון Sync ואינה נכתבת לשום טבלה.** `CRON_SECRET`
>    שגוי או actor שנדחה ⇒ אין שורת `sync_runs` ואין `audit_logs`. זו החלטה
>    מכוונת נגד ניפוח מכוון של טבלה מנקודת קצה שכתובתה עלולה להתגלות;
>    התצפית נשארת ב־runtime logs של הפלטפורמה, בלי הסוד ובלי ה־actor.
> 3. **ה־UI מציג את הקוד כ"סיבת דילוג", לא כשגיאה** — טקסט עברי ניטרלי, בלי
>    צביעת כשל.

### 3. env: `SYNC_SYSTEM_ACTOR_ID`

- הוסף ל־`env.ts` כערך server-only בפורמט UUID קנוני, optional בסכימה (כדי לא
  להפיל build קיים), אך **חובה בזמן ריצת ה־Cron route** — חסרונו מחזיר כשל
  סגור בלי לחשוף פרטים. עדכן את `env.test.ts`.
- ה־principal הוא משתמש לא־אינטראקטיבי ייעודי ב־`auth.users` שנמצא ב־
  `system_admins`. הוא **אינו** נוצר ב־migration עם ערכים סודיים ואינו
  credential להתחברות. תעד ב־README ו־`docs/security.md` את שלב ההקמה הידני
  המאובטח לכל סביבה; בסביבת בדיקות מקומית צור אותו ב־seed/בדיקות בלבד.

### 4. `POST /api/cron/sync` — Route Handler דק

`export const runtime = 'nodejs'`.

1. אימות `CRON_SECRET` בהשוואה בזמן קבוע (`timingSafeEqual` על buffers באורך
   זהה), method ו־content-type צפויים. הסוד לעולם לא נכתב ללוג. חסרון
   `CRON_SECRET` ב־env ⇒ כשל סגור.
2. טעינת `SYNC_SYSTEM_ACTOR_ID` server-only. אין actor בפרמטרי הבקשה ואין
   fallback לזהות אנושית.
3. קריאה **אחת** ל־`record_sync_attempt` דרך `createSystemActorAdminClient`.
   ה־Handler לא מנהל נעילה, לא מנהל lifecycle ולא קורא לספק.
4. תשובת HTTP קצרה (סטטוס, מזהה ריצה, סיבה בטוחה) ללא secrets, headers רגישים
   או payload ספק. `Cache-Control: private, no-store`.

### 5. כיבוד manual override — מודול תכנון טהור

`src/features/sports/` (למשל `sync-planner.ts`): פונקציה טהורה שמקבלת snapshot
מנורמל מהספק ואת מצב המשחקים מה־DB, ומחזירה את רשימת התוצאות שהיו נשלחות
ל־`score_match` — **תוך החרגה מלאה של כל משחק עם `is_manually_overridden=true`**,
בלי לאפס את הדגל ובלי לגעת בתוצאתו.

זהו specification executable שנבדק ב־Vitest מול contract fixtures מוקלטים
(JSON checked-in): כל הסטטוסים הנתמכים, תוצאה רשמית רק ל־`finished`, live ⇒
score `null`, סטטוס לא מוכר שאינו הופך ל־`finished`, ותיקון תוצאה (אותו משחק
בשני snapshots). **הוא אינו מחובר ל־route ואינו כותב ל־DB ב־Slice הזה** — אמור
זאת במפורש ב־PR ובמסמכים; אל תתאר אותו כצנרת פעילה.

### 6. מסך אדמין: `/admin/sync`

`src/app/(app)/admin/sync/page.tsx` — Server Component, מנהל מערכת בלבד (אותו
דפוס AuthZ של `admin/matches`): רשימת ריצות אחרונות מ־`sync_runs` (מוגבלת,
`order by started_at desc`), סטטוס, ספירות, שגיאה בטוחה, זמנים בשעה מקומית
מוצגת + UTC. עברית, RTL, מצבי loading/empty/error, מובייל. משתמש רגיל מקבל
דחייה — לא רק הסתרת קישור.

## מסלול הספק העתידי — חוזה מתועד, לא קוד

תעד ב־`docs/architecture.md` (ובקצרה ב־POC doc) את החוזה שנדרש כדי לחבר ספק
אמיתי, כדי שלא יאולתר בעתיד:

- **claim/lease עמיד במסד**, לא advisory lock: שורת claim עם `lease_token`
  (fencing token), `expires_at` ו־`holder`.
- ה־advisory xact lock משמש **רק** ליצירת ה־claim באופן אטומי, ומשתחרר מיד
  בסיום אותה טרנזקציה קצרה.
- קריאת הספק מתבצעת **מחוץ** לטרנזקציה, עם timeout.
- כל apply/finalize מותנה ב־`lease_token` תקף שעדיין לא פג ולא הוחלף; token
  ישן נדחה — כך ריצה תקועה שהתעוררה אינה כותבת מעל ריצה חדשה.
- reclaim של lease שפג, וסגירת `running` יתום לפי `expires_at`.

אל תממש את זה עכשיו. ספק אינו קיים, והמימוש בלי יעד אמיתי לא ייבדק.

## בדיקות — נכשלות לפני המימוש ככל האפשר

- **Vitest:** מודול התכנון מול contract fixtures, כולל החרגת משחק
  `is_manually_overridden`; מיפוי סטטוסים ותיקון תוצאה; ולידציית env ל־
  `SYNC_SYSTEM_ACTOR_ID`; סיווג שגיאות לקוד יציב ולהודעה בטוחה.

  > **due-window:** מכיוון שהמסלול הנוכחי מחזיר `MANUAL_PROVIDER` בלי להעריך
  > חלון זמנים, אין לכתוב לוגיקת due-window פעילה ב־RPC ואין להשאיר חצי־חיווט
  > מת. אם אתה כותב חישוב חלון בכלל — הוא חי באותו מעמד של מודול התכנון:
  > פונקציה טהורה עם בדיקות, מסומנת במפורש כלא־מחוברת ושייכת למסלול הספק.
  > אחרת השמט אותו לגמרי מה־Slice. אל תיצור מסלול שמתחזה להערכת חלון.
- **pgTAP (`supabase/tests/sync.test.sql`):**
  - `sync_runs` קיימת עם RLS enabled; `anon`/`authenticated` נדחים
    ב־select/insert/update/delete; מנהל מערכת קורא, משתמש רגיל לא.
  - `record_sync_attempt`: EXECUTE נדחה ל־`anon`/`authenticated`; actor חסר,
    לא־UUID, או שהוסר מ־`system_admins` ⇒ `FORBIDDEN` ואף שורה לא נכתבת.
  - **בדיקת מקביליות אמיתית**: שני sessions; הראשון מחזיק את הטרנזקציה עם
    ה־xact lock, השני קורא ל־`record_sync_attempt` ומקבל שורה סופית אחת
    `skipped`/`CONCURRENT_ATTEMPT`; החלון אינו מעובד פעמיים (MATCH-06).
    אחרי commit של הראשון, קריאה נוספת מצליחה ומקבלת `MANUAL_PROVIDER` —
    כלומר הנעילה שוחררה ולא דלפה, ורעש סדרתי מובחן מ־overlap אמיתי.
  - קריאה בודדת ⇒ `MANUAL_PROVIDER`; `error_message_safe` נשאר `null` בשני
    הדילוגים, ו־`finished_at` מלא בשניהם.
  - CHECK של `finished_at` נאכף; שורה סופית בלי `finished_at` נדחית.
- **Playwright (`e2e/sync.spec.ts`):** `POST /api/cron/sync` ללא secret / עם
  secret שגוי ⇒ 401 ללא הדלפת מידע; קריאה עם secret נכון בסביבת manual ⇒
  נרשמת ריצת `skipped` **סופית אחת**; מנהל מערכת רואה אותה ב־`/admin/sync`;
  משתמש רגיל נדחה מהמסך (בדיקת הרשאה שלילית חובה).

> אין לכתוב קריטריון של "ריצה אחת פעילה והשנייה `skipped`". במסלול הנוכחי לא
> נוצרת שורת `running` כלל, ולכן קריטריון כזה אינו ניתן למימוש או לבדיקה.
> המקבילות נבדקת ברמת ה־DB כמתואר למעלה.

## כללים שאין לחצות

- הסוד וה־actor הם server-only: `CRON_SECRET`, `SYNC_SYSTEM_ACTOR_ID` ו־
  `SUPABASE_SECRET_KEY` לעולם לא בלוג, בתשובת HTTP, ב־client bundle או ב־Git.
  עותק ה־Cron ל־Supabase נשמר ב־Vault אחרי deploy — **לא ב־migration**.
- אין `pg_try_advisory_lock` session-level בשום מסלול. `pg_try_advisory_xact_lock`
  רק בתוך טרנזקציה שמכילה את כל מה שהוא מגן עליו.
- ה־admin client נשאר ב־`src/lib/supabase/admin.ts` (`server-only`).
- אין כתיבת נקודות ישירה בשום מסלול; כל תוצאה עוברת דרך `score_match`. ניקוד
  הוא overwrite דטרמיניסטי, לא increment.
- אל תנעל שורת `leagues` אחרי `matches` בשום transaction חדשה — אילוץ סדר
  הנעילות מ־Slice 6 מונע deadlock מול `save_prediction`.
- migrations הן forward-only; RLS ו־grants באותה migration שיוצרת כל טבלה
  חשופה; `supabase db reset --linked` אסור ואין פקודות הרסניות מול פרויקט
  מקושר.
- זמנים כ־UTC `timestamptz`; שגיאות בקודי `AppError` יציבים והודעות עברית
  בטוחות; אין stack traces, SQL או payload ספק בלוג/לקוח.
- קוד, migrations ו־commit messages באנגלית; טקסט למשתמש בעברית, RTL.
- אין dependency חדש בלי הצדקה מתועדת.

## תהליך ותוצרים

1. אחרי כל שינוי סכימה הרץ `npm run types:db` ועדכן את
   `src/types/database.generated.ts`; drift מפיל את `types:check`.
2. **עדכון מסמכים לפי סדר הסמכות הנכון.** `docs/architecture.md` מתעדכן
   ראשון וכהחלטה מפורשת, לא כ"יישור" לתכנית:
   - `docs/architecture.md` §14.3 — נמק שהטרנספורט הוא Data API ללא חיבור
     קבוע; החלף את רצף השלבים 3–5 בחוזה ה־RPC האטומי; קבע ש־advisory lock
     ברמת session אסור; הוסף את חוזה ה־claim/lease כמסלול הספק העתידי. עדכן
     בהתאם את שורת ה־Cron בסעיף 18 (מודל האיומים).
   - `docs/technical-plan.md` §10.4 — יישר לארכיטקטורה המעודכנת; §5 (מסירה
     חלקית של migration 008); §15 (סטטוס Slice 7 וההיקף המצומצם המנומק);
     §20 (המשימה הבאה: Slice 8 — AI analysis).
   - `docs/sports-provider-poc.md` — סגירת השער: ה־POC לא עבר, Manual הוא
     המסלול הקנוני ל־MVP, ומה נדרש כדי לחבר ספק בעתיד.
   - `docs/security.md` (הקמת ה־principal, מודל הסוד, RLS של `sync_runs`),
     `docs/testing.md` (הבדיקות החדשות), `README.md` (הגדרת Cron ב־Supabase
     Vault ו־env חדשים).
3. לפני מסירה הרץ `npm run verify` (או השרשרת המלאה: lint, typecheck, test,
   test:db, types:check, build, test:e2e). אל תדווח על בדיקה שלא רצה בפועל.
4. כלול בתיאור ה־PR את ה־rollback המחשבתי של ה־migration, את שינוי ההחלטה
   הארכיטקטונית ואת ההיקף שהוצא במפורש מה־Slice.

## קריטריוני יציאה

- קריאות Cron חוזרות ומקבילות בטוחות: החלון אינו מעובד פעמיים, כל ניסיון
  מורשה מתועד בשורה סופית עם קוד מובחן (MATCH-06), אין נעילה שדולפת מעבר
  לטרנזקציה, ואין שורת `sync_runs` שנשארת לא־סופית.
- בקשה לא מורשית אינה כותבת שורה בשום טבלה, ודילוג מתועד מחזיר 200.
- secret חסר/שגוי, `SYNC_SYSTEM_ACTOR_ID` חסר, או principal שהוסר מ־
  `system_admins` — כולם נכשלים סגור עם תשובה בטוחה ובלי כתיבה.
- אף מסלול ב־Slice אינו משנה משחקים, ניחושים או נקודות קיימים.
- מודול התכנון מחריג משחק `is_manually_overridden` בכל fixture, ומתועד
  במפורש כלא־מחובר.
- מסך `/admin/sync` מציג ריצות למנהל מערכת בלבד; משתמש רגיל נדחה.
- ה־POC סגור ומתועד עם Manual provider; אין תלות חדשה בספק חיצוני ואין קריאת
  live ב־CI.
- הארכיטקטורה עודכנה כהחלטה מנומקת, והתכנית עודכנה אחריה — לא להפך.
- כל הבדיקות והשערים ירוקים; ה־slice ניתן להדגמה מקצה לקצה ב־URL פרוס.

## נקודות החלטה מתועדות וחוב ידוע

- **היקף מצומצם מנומק:** upsert, lifecycle של `running`, קריאת adapter
  מה־route ו־`p_source='sync'` נדחו לבחירת ספק. הסיבה היא היעדר יעד אמיתי
  לבדיקה, לא חוסר זמן. אם תבחר אחרת — עצור והסבר קודם.
- **guard על override ב־`score_match`:** כיום הכיבוד מתוכנן בשכבת התכנון. אם
  תוסיף guard גם בתוך `score_match` (defense in depth) — migration חדשה +
  pgTAP + עדכון §7.4 בתכנית באותו PR.
- תדירות ה־Cron הסופית כפופה למכסת ספק עתידי; לעת עתה לוח שמרני בהוראות
  ההקמה בלבד — אין קונפיגורציית תדירות בקוד.
- Cleanup של `sync_runs`/`rate_limit_events` ישנים נשאר חוב מתועד ל־Slices
  8–10.
