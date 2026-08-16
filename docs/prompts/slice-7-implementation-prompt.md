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

לפני כל תכנון או עריכה קרא לפי הסדר: `AGENTS.md`, `docs/product.md`,
`docs/architecture.md`, `docs/technical-plan.md`, וכן
`docs/sports-provider-poc.md`. המסמכים האלה קנוניים וגוברים על הפרומפט הזה.
אם מצאת סתירה — עצור והסבר לפני שינוי קוד.

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

לכן ההכרעה עבור ה־Slice הזה היא: **סגירה עם Manual provider מתועד**, ובנייה
מלאה של מנוע ה־Sync כך שספק אמיתי יוכל להתחבר בעתיד בלי לשנות ניקוד או UI:

- אין להוסיף תלות בספק חיצוני, קריאת רשת חיה, או SDK של ספק. CI לעולם אינו
  קורא לספק חי (סעיף 14.4 בתכנית).
- מנוע ה־Sync (Cron route, `sync_runs`, advisory lock, due-window, upsert,
  מעבר תוצאות דרך `score_match`) נבנה **provider-agnostic** ונבדק מקצה לקצה
  עם contract fixtures מוקלטים מול ה־DB המקומי בלבד.
- **בפריסה בפועל, כאשר `SPORTS_API_PROVIDER=manual`, ריצת Cron אינה כותבת
  נתוני משחקים כלל**: היא עוברת את כל שלבי האימות והנעילה ומסיימת בריצת
  `skipped` מתועדת. הסיבה: קטלוג ה־Demo שנמסר ב־Slice 5 הוא סינתטי, ללא
  `external_provider`/`external_id`, ו־upsert של fixtures ידניים היה מזהם את
  הקטלוג ומציג לוח מומצא כלוח מסונכרן. הזנת תוצאות נשארת דרך
  `applyManualResult` של Slice 6. תעד את ההחלטה הזאת (ראה "תהליך ותוצרים").

## מה כבר קיים במאגר — אל תבנה מחדש

Slices 0–6 נמסרו ומוזגו. רלוונטי אליך:

- `public.score_match(p_match_id uuid, p_status match_status, p_home_score
  numeric, p_away_score numeric, p_is_manual_override boolean, p_source text)`
  קיים (migration `20260817005130`), `SECURITY DEFINER` עם `search_path = ''`,
  ומחזיר טבלת תוצאה. הוא גוזר actor מה־header
  `x-predictor-system-actor`, מאמת פורמט UUID ובודק חברות ב־
  `public.system_admins` — fail-closed. **אל תשכתב אותו ואל תוסיף מסלול RPC
  עוקף**; אם נדרש שינוי (למשל guard על override), עשה זאת ב־migration חדשה
  forward-only.
- `src/features/scoring/private-scoring-gateway.ts` — `scoreMatchAsSystem`
  קורא ל־RPC דרך `createSystemActorAdminClient(systemActorId)` שמזריק את
  ה־header. כרגע הוא **מקבע** `p_is_manual_override: true` ו־`p_source:
  "manual"`. הרחב אותו (או הוסף פונקציה מקבילה) כך שמסלול ה־Sync יעביר
  `p_is_manual_override: false` ו־`p_source: 'sync'`, בלי לשבור את המסלול
  הידני ואת בדיקותיו הקיימות.
- `src/lib/supabase/admin.ts` — `server-only`, כולל `createAdminClient` ו־
  `createSystemActorAdminClient`. זה המקום היחיד לשימוש ב־secret key.
- `public.system_admins` קיימת מ־Slice 6 (ללא CRUD למשתמש רגיל).
- `public.matches` כולל `result_version`, `is_manually_overridden`,
  `external_provider`, `external_id` (nullable, unique חלקי על provider/id),
  checks על סטטוס/תוצאה.
- `public.audit_logs` ו־`public.rate_limit_events` קיימות מ־Slice 3.
- **enum `sync_status` וטבלת `sync_runs` עדיין לא קיימים** — הם התוצר שלך.
- `src/features/sports/` כולל `types.ts` (חוזה `SportsProvider`),
  `manual-provider.ts`, `fixtures.ts`, `normalization.ts` ובדיקות. השתמש בחוזה
  הקיים; אל תמציא interface חדש.
- `src/lib/env.ts` מאמת env עם Zod. `CRON_SECRET` ו־`SPORTS_API_KEY` כבר שם
  כ־optional; **`SYNC_SYSTEM_ACTOR_ID` מופיע ב־`.env.example` אך עדיין לא
  ב־`env.ts`** — עליך להוסיפו.
- מסך אדמין קיים ב־`src/app/(app)/admin/matches/page.tsx` עם AuthZ של מנהל
  מערכת — עמוד ה־sync status החדש יושב לצדו תחת `(app)/admin/`.

## היקף Slice 7

### 1. Migration: `sync_status` enum ו־`sync_runs`

- `create type public.sync_status as enum ('running','succeeded','failed','skipped')`.
- `sync_runs`: `id`, `provider text`, `status sync_status`, `started_at`,
  `finished_at`, `fixtures_seen`, `matches_changed`, `results_changed`,
  `error_code`, `error_message_safe` (סעיף 6.7 בתכנית). ספירות לא־שליליות;
  `finished_at` נדרש לכל סטטוס סופי.
- אינדקס `(started_at desc)` (סעיף 12 בארכיטקטורה).
- **באותה migration**: `enable row level security`, `revoke all` מ־`public`,
  `anon`, `authenticated`; קריאה למנהלי מערכת בלבד (policy שנשענת על
  `system_admins`, בדפוס הקיים של Slice 6); אין insert/update/delete ללקוחות —
  כתיבה רק דרך השרת (service role) או פונקציה ייעודית.
- אם תידרש פונקציית DB לנעילה או ל־lifecycle של run — `SECURITY DEFINER` רק
  אם הכרחי, ואז `search_path = ''`, שמות schema מלאים, `revoke` execute
  ו־grant מצומצם, כמו בדפוסי המאגר.

### 2. env: `SYNC_SYSTEM_ACTOR_ID`

- הוסף ל־`env.ts` כערך server-only בפורמט UUID קנוני, optional בסכימה (כדי לא
  להפיל build קיים), אך **חובה בזמן ריצת ה־Cron route** — חסרונו מחזיר כשל
  סגור בלי לחשוף פרטים. עדכן את `env.test.ts`.
- ה־principal הוא משתמש לא־אינטראקטיבי ייעודי ב־`auth.users` שנמצא ב־
  `system_admins`. הוא **אינו** נוצר ב־migration עם ערכים סודיים ואינו
  credential להתחברות. תעד ב־README/`docs/security.md` את שלב ההקמה הידני
  המאובטח לכל סביבה, ובסביבת בדיקות מקומית צור אותו ב־seed/בדיקות בלבד.

### 3. `POST /api/cron/sync` — Route Handler

לפי סעיף 10.4 בתכנית וסעיף 14.3 בארכיטקטורה:

1. אימות `CRON_SECRET` (השוואה בזמן קבוע, למשל `timingSafeEqual`), method
   ו־content-type צפויים. הסוד לעולם לא נכתב ללוג. חסרון `CRON_SECRET` ב־env
   ⇒ כשל סגור.
2. טעינת `SYNC_SYSTEM_ACTOR_ID` server-only. אין actor בפרמטרי הבקשה ואין
   fallback לזהות אנושית. האימות שה־principal עדיין ב־`system_admins` הוא
   fail-closed דרך מסלול `score_match`/gateway — כשל אימות מפיל את הריצה.
3. PostgreSQL advisory lock למניעת ריצה כפולה: `pg_try_advisory_lock` (או
   xact-lock בתוך פונקציה) עם מפתח קבוע ומתועד; אם הנעילה תפוסה — הריצה
   מסתיימת מיד כ־`skipped` בלי לגעת בנתונים. אין המתנה חוסמת.
4. due-window check: האם קיימים משחקים שמצדיקים קריאת ספק. עם provider
   `manual` התשובה תמיד "אין" — ריצת `skipped` מתועדת עם קוד סיבה בטוח.
   > סדר השלבים: lock לפני due-window, לפי סעיף 10.4 בתכנית. סעיף 14.3
   > בארכיטקטורה מונה את השלבים בסדר הפוך — יישר את המסמך בקצרה באותו PR.
5. יצירת `sync_runs` במצב `running` לפני קריאת adapter (במסלול api עתידי);
   קריאת adapter אחת עם timeout מוגדר — לא קריאה פר משחק.
6. upsert לפי `external_provider`/`external_id` בלבד, **בלי לדרוס
   `is_manually_overridden`**: משחק עם override ידני אינו נשלח ל־`score_match`
   ואין מאפסים את הדגל או את תוצאתו. תוצאות חדשות/מתוקנות עוברות **אך ורק**
   דרך ה־gateway עם `p_is_manual_override=false`, `p_source='sync'`.
7. סיום ה־run: `succeeded`/`failed`/`skipped`, ספירות
   `fixtures_seen`/`matches_changed`/`results_changed`, `error_code` יציב
   ו־`error_message_safe` מסונן. כשל ספק אינו משאיר run תקוע ב־`running`
   ואינו פוגע בנתונים שכבר קיימים.
8. תשובת HTTP קצרה (status + מזהה run + ספירות) ללא secrets, headers רגישים
   או payload ספק. `Cache-Control: private, no-store`.

`export const runtime = 'nodejs'` אם נדרש crypto/timing — עקוב אחרי דפוס
ה־handlers הקיימים.

### 4. מסך אדמין: `/admin/sync`

`src/app/(app)/admin/sync/page.tsx` — Server Component, מנהל מערכת בלבד
(אותו דפוס AuthZ של `admin/matches`): רשימת ריצות אחרונות מ־`sync_runs`
(מוגבלת/מדורגת, `order by started_at desc`), סטטוס, ספירות, שגיאה בטוחה,
זמנים בשעה מקומית מוצגת + UTC. עברית, RTL, מצבי loading/empty/error, מובייל.
משתמש רגיל מקבל דחייה — לא רק הסתרת קישור.

### 5. Contract fixtures ו־adapter

- קבע contract fixtures מוקלטים (JSON checked-in) שמכסים את כל הסטטוסים
  הנתמכים, תוצאה רשמית רק ל־`finished`, live ⇒ score `null`, סטטוס לא מוכר
  שאינו הופך ל־`finished`, ותיקון תוצאה (אותו משחק בשני snapshots).
- מנוע ה־Sync נבדק מולם דרך `ManualSportsProvider`/fake provider — אותו קוד
  שירוץ מול ספק אמיתי בעתיד. אין קריאות live ב־CI.
- אל תשנה את חוזה `SportsProvider` באופן ששובר את הבדיקות הקיימות; הרחב רק
  אם חסר משהו למנוע ה־Sync (למשל timeout wrapper) ותעד.

## בדיקות — נכשלות לפני המימוש ככל האפשר

- **Vitest:** מיפוי adapter מ־contract fixtures; לוגיקת due-window; סיווג
  שגיאות ספק/timeout לקוד יציב והודעה בטוחה; ולידציית env ל־
  `SYNC_SYSTEM_ACTOR_ID`; שגיאת gateway ⇒ run `failed` בלי לגעת בנתונים.
- **pgTAP (`supabase/tests/`, קובץ חדש למשל `sync.test.sql`):** `sync_runs`
  קיימת עם RLS enabled; `anon`/`authenticated` נדחים ב־select/insert/update/
  delete; מנהל מערכת קורא, משתמש רגיל לא; upsert של sync אינו משנה משחק עם
  `is_manually_overridden=true` — התוצאה, ה־version והנקודות נשארים זהים;
  תוצאה חדשה דרך `score_match` עם `p_source='sync'` מנקדת מחדש נכון (retry
  אידמפוטנטי); actor שהוסר מ־`system_admins` נדחה.
- **Playwright (`e2e/`, קובץ חדש למשל `sync.spec.ts` או הרחבת קיים):**
  `POST /api/cron/sync` ללא secret / עם secret שגוי ⇒ 401 ללא הדלפת מידע;
  קריאה עם secret נכון בסביבת manual ⇒ ריצת `skipped` נרשמת; שתי קריאות
  מקבילות ⇒ ריצה אחת בלבד פעילה והשנייה `skipped`; מנהל מערכת רואה את
  `/admin/sync`; משתמש רגיל נדחה (בדיקת הרשאה שלילית חובה).

## כללים שאין לחצות

- הסוד וה־actor הם server-only: `CRON_SECRET`, `SYNC_SYSTEM_ACTOR_ID` ו־
  `SUPABASE_SECRET_KEY` לעולם לא בלוג, בתשובת HTTP, ב־client bundle או ב־Git.
  עותק ה־Cron ל־Supabase נשמר ב־Vault אחרי deploy — **לא ב־migration**.
- ה־admin client נשאר ב־`src/lib/supabase/admin.ts` (`server-only`); שימוש רק
  במודולי scoring/sync/system מורשים.
- Sync לעולם אינו דורס manual override ולעולם אינו כותב נקודות ישירות — כל
  תוצאה עוברת דרך `score_match`; ניקוד הוא overwrite דטרמיניסטי, לא increment.
- אל תנעל שורת `leagues` אחרי `matches` בשום transaction חדשה — אילוץ סדר
  הנעילות מ־Slice 6 מונע deadlock מול `save_prediction`.
- migrations הן forward-only; RLS ו־grants באותה migration שיוצרת כל טבלה
  חשופה; `supabase db reset --linked` אסור ואין פקודות הרסניות מול פרויקט
  מקושר.
- זמנים כ־UTC `timestamptz`; שגיאות בקודי `AppError` יציבים והודעות עברית
  בטוחות; אין stack traces, SQL או payload ספק בלוג/לקוח.
- קוד, migrations ו־commit messages באנגלית; טקסט למשתמש בעברית, RTL.
- אין polling עם sleep, אין תור/queue חיצוני ואין dependency חדש בלי הצדקה
  מתועדת.

## תהליך ותוצרים

1. אחרי כל שינוי סכימה הרץ `npm run types:db` ועדכן את
   `src/types/database.generated.ts`; drift מפיל את `types:check`.
2. עדכן באותו PR:
   - `docs/sports-provider-poc.md` — סעיף סגירה: ה־POC לא עבר, Manual הוא
     המסלול הקנוני הסופי ל־MVP, ומה נדרש כדי לחבר ספק אמיתי בעתיד.
   - `docs/technical-plan.md` — סעיף 5 (מסירת חלקה של migration 008), סעיף 15
     (סטטוס Slice 7) וסעיף 20 (המשימה הבאה: Slice 8 — AI analysis).
   - `docs/architecture.md` — יישור סדר השלבים בסעיף 14.3 אם בחרת lock לפני
     due-window.
   - `docs/security.md` — הקמת ה־principal, מודל הסוד של ה־Cron ו־RLS של
     `sync_runs`; `docs/testing.md` — הבדיקות החדשות; `README.md` — הוראות
     הגדרת Cron ב־Supabase (Vault) ו־env חדשים.
3. לפני מסירה הרץ: `npm run lint && npm run typecheck && npm run test &&
   npm run test:db && npm run types:check && npm run build && npm run
   test:e2e` (או `npm run verify`). אל תדווח על בדיקה שלא רצה בפועל.
4. כלול בתיאור ה־PR את ה־rollback המחשבתי של ה־migration ואת נקודות ההחלטה
   שתועדו.

## קריטריוני יציאה

- שתי קריאות Cron מקבילות או עוקבות בטוחות: לכל היותר ריצה פעילה אחת, retry
  אינו משנה נתונים, ואין run שנשאר `running` לנצח.
- secret חסר/שגוי, `SYNC_SYSTEM_ACTOR_ID` חסר או principal שהוסר מ־
  `system_admins` — כולם נכשלים סגור עם תשובה בטוחה.
- כשל ספק/gateway מסומן `failed` עם שגיאה מסוננת ואינו משנה משחקים, ניחושים
  או נקודות קיימים.
- משחק עם `is_manually_overridden=true` אינו מושפע מריצת sync בשום צורה.
- מסך `/admin/sync` מציג ריצות למנהל מערכת בלבד; משתמש רגיל נדחה.
- ה־POC סגור ומתועד עם Manual provider; אין תלות חדשה בספק חיצוני ואין קריאת
  live ב־CI.
- כל הבדיקות והשערים ירוקים; ה־slice ניתן להדגמה מקצה לקצה ב־URL פרוס
  (כולל הדגמת ריצת `skipped` ומסך הסטטוס).

## נקודות החלטה מתועדות וחוב ידוע

- **התנהגות manual בפריסה:** ריצת Cron עם provider `manual` היא `skipped`
  מתועדת ואינה כותבת נתוני משחקים — החלטה שיש לקבע ב־POC doc ובתכנית. אם
  תבחר אחרת, עצור והסבר קודם.
- **guard על override ב־`score_match`:** כיום הכיבוד של override נאכף בשכבת
  ה־Sync (לא לקרוא ל־RPC עבור משחק overridden). אם תוסיף guard גם בתוך
  `score_match` (defense in depth) — migration חדשה + pgTAP + עדכון סעיף 7.4
  בתכנית באותו PR.
- תדירות ה־Cron הסופית כפופה למכסת ספק עתידי; לעת עתה מתעדים לוח שמרני
  (למשל יומי) בהוראות ההקמה בלבד — אין קונפיגורציית תדירות בקוד.
- Cleanup של `sync_runs`/`rate_limit_events` ישנים נשאר חוב מתועד ל־Slice
  8–10 אלא אם הוא זול לצירוף כאן.
