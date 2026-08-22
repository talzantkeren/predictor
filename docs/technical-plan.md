# Predictor1 — תכנית טכנית מפורטת

| שדה | ערך |
| --- | --- |
| גרסה | 3.2 |
| תאריך עדכון | 22 באוגוסט 2026 |
| סטטוס | Slice 7 manual-only observability delivered; Slice 8 next |
| דדליין | 6 בספטמבר 2026 |

## 1. מטרת המסמך

מסמך זה מתרגם את [`product.md`](./product.md) ואת [`architecture.md`](./architecture.md) לתכנית מימוש שאפשר לבצע לפי סדר. הוא מכסה את מבנה התיקיות, הקומפוננטות, בסיס הנתונים, CRUD, פעולות שרת, APIs, state, validation, שגיאות, UX, בדיקות, פריסה ותוצרי הקורס.

זה אינו מסמך ארכיטקטורה נוסף. אם נדרש שינוי גבול מערכת, טכנולוגיה, מודל נתונים מהותי או חוק עסקי — מעדכנים קודם את המסמך הקנוני המתאים.

**החלטת גבול מאושרת — 15 באוגוסט 2026:** בהתאם לחוזה B26, Slice 3 מסתיים
בבקשת `pending_approval` ובהוכחת Demo פרטית. Slice 4 כולל את תור המנהל, הצפייה
המורשית בהוכחה, approve/reject ויצירת חברות פעילה. PR #4 מוסר את שני ה־Slices.
תחזוקת חברות כללית לאחר ההצטרפות, כגון הסרה והפעלה מחדש, היא היקף עתידי ואינה
חלק מתנאי הסיום של Slice 4.

## 2. מצב התחלתי ושערי התחלה

נכון למועד כתיבת המסמך טרם קיים קוד אפליקציה במאגר. לפני פיצ'ר ראשון יש להשלים:

1. מאגר GitHub פרטי/ציבורי לפי דרישות הקורס, עם branch `main` מוגן ככל האפשר.
2. פרויקט Supabase hosted עבור Production.
3. פרויקט Vercel המקושר למאגר.
4. סביבת Node.js 24.x. פיתוח מקומי ו־CI ננעלים ל־24.16.0 דרך `.nvmrc`; פרויקט Vercel מוגדר ל־24.x.
5. Supabase local ו־CI משתמשים ב־PostgreSQL 17, בהתאם לגרסה המרכזית של פרויקט ה־hosted.
6. Docker Desktop לצורך Supabase local development, אם המחשב תומך; אחרת migrations נבדקות בפרויקט development נפרד ולא ב־Production.
7. החלטת POC מתועדת לגבי Sports provider. כשל POC מפעיל מיד `ManualSportsProvider` ו־seed — הוא לא עוצר פיתוח.
8. `DEMO_MODE=true` בפריסה הציבורית. אין תשלום, פרס כספי או מסמך פיננסי אמיתי.

### 2.1 Bootstrap מומלץ

את `create-next-app` מריצים בתיקיית repository ריקה, ולאחר מכן מעתיקים אליה את `docs/`, `AGENTS.md` ו־`CLAUDE.md` לפני ה־commit הראשון:

```bash
npx create-next-app@latest predictor1 --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
cd predictor1
npm install @supabase/supabase-js @supabase/ssr zod file-type sharp server-only
npm install --save-dev supabase vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @playwright/test
npx supabase init
npx playwright install
```

אין להריץ `create-next-app` לתוך תיקייה לא־ריקה בלי לבדוק מה יידרס. אין לבחור גרסאות beta/canary.

### 2.2 Scripts נדרשים ב־`package.json`

| Script | פעולה |
| --- | --- |
| `dev` | `next dev` |
| `build` | `next build` |
| `start` | `next start` |
| `lint` | `eslint .` |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:db` | `supabase test db` |
| `test:e2e` | production build ולאחריו `playwright test` |
| `test:e2e:preview` | smoke ציבורי מפורש מול `PLAYWRIGHT_BASE_URL`; אינו מתחזה לזרימת Auth מלאה |
| `test:e2e:run` | `playwright test` מקומי מול build קיים |
| `types:db` | יצירת `src/types/database.generated.ts` מה־DB המקומי |
| `verify` | lint → typecheck → unit → DB → generated types drift → `test:e2e` שבונה production build ומריץ E2E |

## 3. מבנה תיקיות יעד

```text
.
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── docs/
│   ├── product.md
│   ├── architecture.md
│   ├── technical-plan.md
│   ├── testing.md              # ייכתב תוך כדי ה־slices
│   ├── security.md             # ייכתב תוך כדי ה־slices
│   └── scale.md                # ייכתב לפני ההגשה
├── e2e/
│   ├── auth.spec.ts
│   ├── leagues.spec.ts
│   ├── league-join.spec.ts
│   ├── prediction-lock.spec.ts
│   └── scoring.spec.ts
├── public/
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   ├── page.tsx
│   │   │   └── invite/[publicId]/page.tsx
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   └── update-password/page.tsx
│   │   ├── (app)/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── profile/page.tsx
│   │   │   ├── leagues/new/page.tsx
│   │   │   ├── leagues/[leagueId]/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── matches/page.tsx
│   │   │   │   ├── standings/page.tsx
│   │   │   │   ├── members/page.tsx
│   │   │   │   ├── finance/page.tsx
│   │   │   │   └── settings/page.tsx
│   │   │   └── matches/[matchId]/page.tsx
│   │   ├── admin/
│   │   │   ├── matches/page.tsx
│   │   │   └── sync/page.tsx
│   │   ├── api/
│   │   │   ├── cron/sync/route.ts
│   │   │   ├── join-requests/[requestId]/proofs/route.ts
│   │   │   ├── matches/[matchId]/analysis/route.ts
│   │   │   └── payment-proofs/[proofId]/route.ts
│   │   ├── auth/confirm/route.ts
│   │   ├── error.tsx
│   │   ├── global-error.tsx
│   │   ├── layout.tsx
│   │   ├── loading.tsx
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── ui/
│   │   ├── forms/
│   │   └── layout/
│   ├── features/
│   │   ├── auth/
│   │   ├── leagues/
│   │   ├── membership/
│   │   ├── predictions/
│   │   ├── scoring/
│   │   ├── sports/
│   │   ├── ai/
│   │   ├── files/
│   │   └── reports/
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── browser.ts
│   │   │   ├── server.ts
│   │   │   └── admin.ts
│   │   ├── auth/
│   │   ├── env.ts
│   │   ├── errors.ts
│   │   ├── result.ts
│   │   └── time.ts
│   ├── types/
│   │   ├── database.generated.ts
│   │   └── domain.ts
│   └── proxy.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── seed.sql
│   └── tests/
│       ├── schema.test.sql
│       ├── rls.test.sql
│       ├── membership.test.sql
│       └── scoring.test.sql
├── playwright.config.ts
├── vitest.config.ts
└── .env.example
```

### 3.1 מבנה Feature

Feature יכול להכיל רק קבצים שנדרשים לו:

```text
features/predictions/
├── actions.ts       # Server Actions דקים
├── queries.ts       # קריאות typed ומסוננות
├── schemas.ts       # Zod schemas
├── service.ts       # לוגיקה עסקית ללא Request/Response
├── types.ts
├── components/
└── __tests__/
```

אין ליצור `utils.ts` כללי שמצטבר בו קוד מכל הדומיינים. קוד משותף באמת עובר ל־`src/lib`; קוד עסקי נשאר ב־feature.

## 4. משתני סביבה

`.env.example` מכיל שמות וערכי placeholder בלבד:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
CRON_SECRET=
SYNC_SYSTEM_ACTOR_ID=
SPORTS_API_PROVIDER=manual
SPORTS_API_KEY=
AI_API_KEY=
AI_MODEL=
DEMO_MODE=true
```

כללים:

- `DEMO_MODE` חייב להיות `true` בפריסת הקורס.
- `SPORTS_API_KEY` אינו נדרש כאשר provider הוא `manual`.
- `AI_API_KEY` אינו נדרש לבדיקות; משתמשים ב־fake adapter.
- `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `SYNC_SYSTEM_ACTOR_ID`, מפתחות ספק וסיסמת DB אינם מופיעים ב־client bundle, logs או Git. עותק ה־Cron לסביבת Supabase נשמר ב־Vault אחרי ה־deploy, לא ב־migration.
- `SYNC_SYSTEM_ACTOR_ID` optional ב־schema הכללית כדי לא להפיל build שאינו
  מפעיל Cron, אך נדרש בזמן קריאת Route של Slice 7. הוא מכיל UUID קנוני של
  principal לא־אינטראקטיבי ייעודי ב־`auth.users` שקיים ב־`system_admins`, נטען
  בשרת בלבד, אינו מתקבל מהבקשה ואינו credential להתחברות.
- `SUPABASE_SECRET_KEY` נשמר עבור פעולות מערכת עתידיות, אך אינו נדרש ואינו מיובא ב־Slice 1. כל פעולת Auth/Profile רגילה משתמשת ב־publishable key וב־session המשתמש תחת RLS.
- `env.ts` מאמת env בצד שרת עם Zod; גבול Cron ייעודי נכשל סגור בזמן הבקשה אם
  `CRON_SECRET` או actor חסרים, או אם `SPORTS_API_PROVIDER=api` הוגדר במפורש.
  provider שלא הוגדר מקבל את ברירת המחדל `manual`, בלי להפיל build שאינו
  מפעיל את ה־Route.
- `admin.ts` כולל `import 'server-only'` ונבדק בבדיקת import boundary.

## 5. תכנית migrations

שמות הקבצים כוללים timestamp אמיתי בעת יצירתם. הסדר הלוגי:

| Migration | תוכן | תנאי סיום |
| --- | --- | --- |
| 001 `extensions_and_enums` | extensions, enums ו־default privileges | reset מקומי מצליח |
| 002 `identity` | `profiles`, trigger פרופיל ו־RLS | פרופיל נוצר בהרשמה; משתמש קורא/מעדכן רק את עצמו |
| 003 `sports_core` | competitions, seasons, teams, matches, indexes ו־RLS; prerequisite שמגיע ב־Slice 2 | catalog עונה זמין בלי fixtures מומצאים |
| 004 `leagues` | leagues, scoring rules, prize rules, minimal creator membership, `create_league` ו־RLS | יצירה אטומית; סכום פרסים וחוקי ניקוד תקינים |
| 005 `secure_join_and_proofs` | invite links, join requests, proofs, bucket פרטי ללא גישת client ישירה, audit מצומצם ו־rate-limit durable | invite rotation אטומי, בקשה אידמפוטנטית, upload פרטי ו־IDOR חסום |
| 006 `manager_join_decisions` | תור בקשות למנהל, צפייה מורשית, approve/reject, יצירת חברות ו־audit אטומי | החלטה אטומית ואידמפוטנטית; מנהל זר נדחה; חברות יחידה נוצרת רק באישור |
| 007 `predictions_and_scoring` | נמסר בשני שלבים: Slice 5 הוסיף `predictions`, RLS, `save_prediction` ונעילה; Slice 6 הוסיף `score_match`, metadata ניקוד ו־`league_leaderboard` | נעילה/חשיפה ומטריצת ניקוד מלאה, כולל retry, correction, cancel ושוויון |
| 008 `operations_and_ai` | טבלת `system_admins` המינימלית הוקדמה ל־Slice 6 כדי לאכוף `applyManualResult` בצד השרת; אין לה CRUD למשתמש רגיל. Slice 7 מוסיף ב־migration חדשה את `sync_runs` ואת RPC התיעוד הידני; analyses נשארים ל־Slice 8, על בסיס טבלאות audit/rate-limit שנמסרו ב־Slice 3 | Slice 6: זהות מנהל מערכת מצומצמת; Slice 7: observability ידני והרשאות; Slice 8: AI ו־cleanup מתועד |
| 009 `seed_current_season` | נמסר ב־Slice 5 כקטלוג Demo ידני, מסומן וסינתטי עם מועדים עתידיים וללא provider IDs; ספק אמיתי נשאר לשער Slice 7 | האפליקציה עובדת ללא ספק חיצוני ואינה טוענת לאימות fixture אמיתי |

כל migration כוללת rollback מחשבתי בתיאור ה־PR, גם אם Supabase migrations הן forward-only בפועל. אין לערוך migration שכבר הופעלה ב־Production; יוצרים migration חדשה.

## 6. סכימת בסיס הנתונים

### 6.1 Enums

| Enum | ערכים |
| --- | --- |
| `league_status` | `draft`, `open`, `active`, `completed`, `archived` |
| `join_request_status` | `pending_proof`, `pending_approval`, `approved`, `rejected` |
| `member_status` | `active`, `removed` |
| `invite_status` | `active`, `revoked` |
| `match_status` | `scheduled`, `live`, `finished`, `postponed`, `canceled` |
| `outcome` | `HOME`, `DRAW`, `AWAY` |
| `sync_status` | `running`, `succeeded`, `failed`, `skipped` |

`running` נשמר בחוזה עבור מסלול ספק חי עתידי, אך אינו נכתב במסלול הידני של
Slice 7. כל שורת Sync שנכתבת ב־Slice זה היא סופית.

### 6.2 זהות

#### `profiles`

- `id uuid primary key references auth.users(id) on delete cascade`
- `display_name text not null` — 2–50 תווים אחרי trim.
- `created_at`, `updated_at timestamptz`.
- משתמש יכול לעדכן רק `display_name` של עצמו.
- trigger על `auth.users` יוצר את הרשומה אוטומטית. פונקציית `SECURITY DEFINER`, אם נדרשת, משתמשת ב־`search_path = ''`, בשמות schema מלאים ובהרשאות מצומצמות.

#### `system_admins`

- `user_id uuid primary key references auth.users(id)`.
- `granted_by uuid not null references auth.users(id)`, `granted_at timestamptz`.
- אין CRUD דרך משתמש רגיל; seed ידני מאובטח או migration ייעודית בלבד.

### 6.3 ספורט

#### `competitions`

- `id`, `name`, `slug`, `country_code`, `external_provider`, `external_id`.
- unique על `slug` ועל provider/id כאשר קיימים.

#### `seasons`

- `id`, `competition_id`, `name`, `starts_on`, `ends_on`, `is_current`.
- unique על `(competition_id, name)`.

#### `teams`

- `id`, `name`, `short_name`, `logo_url`, `external_provider`, `external_id`.
- unique על provider/id.

#### `matches`

- `id`, `season_id`, `round_number`, `home_team_id`, `away_team_id`.
- `kickoff_at timestamptz not null`, `status match_status`.
- `home_score smallint`, `away_score smallint` עם check 0–30 כאשר אינם null.
- `result_version integer not null default 0`.
- `is_manually_overridden boolean default false`.
- `external_provider`, `external_id`, timestamps.
- checks: קבוצות שונות; score קיים רק ל־`finished`; canceled ללא score.

### 6.4 ליגות

#### `leagues`

- `id`, `manager_id`, `season_id`, `name`, `description`.
- `status league_status default 'draft'`.
- `demo_entry_fee_agorot integer default 0` — ערך סימולציה בלבד.
- `demo_payment_instructions text` — ללא קישור תשלום אמיתי בפריסת הקורס.
- `joins_close_at timestamptz null`, `allow_late_join boolean default true`.
- timestamps.
- checks: שם 3–80, תיאור עד 500, סכום Demo לא־שלילי.

#### `league_scoring_rules`

- `league_id uuid primary key`.
- `exact_points smallint default 3`.
- `correct_outcome_points smallint default 1`.
- `incorrect_points smallint default 0`.
- `version integer default 1`, `locked_at timestamptz null`, timestamps.
- checks: `exact >= correct_outcome >= incorrect >= 0`, ערכים עד תקרה מתועדת.

#### `prize_rules`

- `id`, `league_id`, `position smallint`, `percentage_bps integer`.
- unique `(league_id, position)`.
- position חיובי; bps בין 1 ל־10000.
- סכום 10000 נאכף ב־Service/transaction בעת פתיחת ליגה, כי CHECK רגיל אינו חוצה רשומות.

#### `invite_links`

- `id`, `public_id uuid unique`, `league_id`, `token_hash text unique`, `status`, `expires_at`, `created_by`, timestamps.
- פונקציית DB מייצרת 32 bytes אקראיים ומחזירה token גולמי base64url פעם אחת; נשמר רק SHA-256 hash.
- הקישור הוא `/invite/[publicId]#invite=[secret]`. ה־Fragment אינו חלק מבקשת
  HTTP; Client Component מסיר אותו מהיסטוריית הכתובת, מחשב SHA-256 בדפדפן
  ושולח ל־exchange רק digest. resolve/submit מעבירים ל־RPC את
  `p_public_id` ואת `p_token_hash` הקנוני; ה־DB מאמת digest של 64 תווי hex ואת
  התאמת הזוג לפני lookup.
- תוקף קבוע של שבעה ימים; rotation נועל את הליגה, מבטל כל הזמנה פעילה קודמת ופותח ליגה במצב `draft` ל־`open` באותה transaction.

### 6.5 הצטרפות ואסמכתאות

#### `join_requests`

- `id`, `league_id`, `user_id`, `status`.
- `rejection_reason text null`, `decided_by uuid null`, `decided_at timestamptz null`.
- timestamps.
- partial unique `(league_id, user_id)` כאשר status ב־`pending_proof`, `pending_approval`, `approved`.
- rejection reason חובה רק ב־`rejected`.

#### `payment_proofs`

- `id`, `join_request_id`, `uploaded_by`.
- `storage_path text unique`.
- `mime_type text not null default 'image/webp'`.
- `size_bytes integer`, `sha256 text`, `uploaded_at`, `deleted_at null`.
- אין `original_filename`; אין URL ציבורי.
- latest `uploaded_at` עבור הבקשה הוא ה־current proof.
- עד חמש רשומות לבקשה; `(join_request_id, idempotency_key)` ייחודי מונע כפילות retry.

#### `league_members`

- `id`, `league_id`, `user_id`, `status`.
- `approved_by`, `approved_at`, `removed_by`, `removed_at`.
- unique `(league_id, user_id)`.
- membership אינה נמחקת; עוברת ל־`removed`.

### 6.6 ניחושים וניקוד

#### `predictions`

- `id`, `league_id`, `match_id`, `user_id`.
- `predicted_home_score`, `predicted_away_score smallint` עם check 0–30.
- `predicted_outcome outcome not null` — נגזר בשרת/DB מהציונים.
- `points smallint not null default 0`.
- `is_exact boolean`, `is_correct_outcome boolean` — null עד ניקוד.
- `scored_at timestamptz`, `scored_result_version integer`, `scored_rule_version integer`.
- timestamps.
- unique `(league_id, match_id, user_id)`.
- foreign-key consistency נבדקת: הליגה והמשחק חייבים להשתייך לאותה עונה.
- מצב "טרם נוקד" מזוהה באמצעות `scored_at is null`: `points` נשאר
  `0` וכל metadata הניקוד נשאר `null`.
- כתיבה עוברת דרך `save_prediction` בלבד. ה־RPC גוזר actor מ־`auth.uid()`,
  נועל את שורות הליגה, החברות והמשחק, דורש חברות `active`, מאמת התאמת עונה
  ומאפשר upsert רק בליגה `draft`/`open`/`active` ועבור משחק
  `scheduled` או `postponed` כאשר `now() < kickoff_at`.
  ליגות `completed` ו־`archived` הן read-only; הבדיקה מתבצעת אחרי אימות חברות
  כדי שלא לחשוף קיום או סטטוס של ליגה פרטית דרך הבדל שגיאות.
  `live`, `finished` ו־`canceled` אינם ניתנים לכתיבה גם אם המועד עתידי.
- RLS של `SELECT` דורשת חברות פעילה: הבעלים רואה את שורתו לפני ואחרי הנעילה;
  חברים פעילים אחרים באותה ליגה רואים אותה רק כאשר `now() >= kickoff_at`.
  חבר שהוסר, מבקש pending/rejected ומשתמש זר רואים אפס שורות.

#### `league_leaderboard` View

מתחיל מכל `league_members` הפעילים ומבצע `LEFT JOIN` לניחושים, כדי להחזיר גם חבר ללא ניחושים עם 0. הוא מחזיר per league/member:

- `total_points`.
- `correct_outcomes`.
- `exact_scores`.
- `predictions_submitted`.
- `rank()` לפי points ואז correct outcomes. אין `dense_rank()`: שני חברים במקום 1 גורמים למקום הבא להיות 3, בהתאם לחלוקת מקומות הפרס.

ארבעת האגרגטים כוללים רק ניחושים של משחקים שעבורם `now() >= kickoff_at`.
הספירה של ניחוש עתידי נשארת 0 גם לבעל הניחוש, ולכן ה־View אינו מחזיר totals
תלויי־צופה ואינו חושף השתתפות לפני חלון החשיפה. כאשר שורת חברות גלויה אך
`profiles` מוסתרת ב־RLS, מוחזרת תווית ניטרלית בטוחה לשם התצוגה.

ה־View נמסר ב־Slice 6 כ־`security_invoker`, עם `SELECT` ל־`authenticated` בלבד;
הוא נשען על RLS של החברות והניחושים ואינו עוקף אותה. שאילתת השרת מאמתת חברות
בליגה המבוקשת לפני הקריאה. אין `SECURITY DEFINER VIEW` חשופה.

### 6.7 תפעול ו־AI

#### `ai_match_analyses`

- `match_id primary key`, `content jsonb`, `provider`, `model`.
- `data_as_of`, `generated_at`, `source_result_version`.
- content נכתב רק אחרי Zod validation.

#### `sync_runs`

- `id`, `provider`, `status`, `started_at`, `finished_at`.
- `fixtures_seen`, `matches_changed`, `results_changed`, `error_code`, `error_message_safe`.
- כל הספירות אינן שליליות; `finished_at` נדרש לכל status סופי ומותר להיות
  `null` רק ב־`running` העתידי.
- `error_code` הוא שם legacy של קוד תוצאה: הוא עשוי להכיל גם
  `CONCURRENT_ATTEMPT` או `MANUAL_PROVIDER` כאשר `status = 'skipped'`.
  `COMMENT ON COLUMN` מתעד זאת, ו־status הוא המבחין היחיד בין כשל לדילוג.
- RLS מאפשרת קריאה למנהל מערכת בלבד. אין insert/update/delete ישיר ל־anon או
  authenticated; append מתבצע רק דרך RPC המערכת המצומצם.

#### `audit_logs`

- `id`, `actor_id`, `action`, `entity_type`, `entity_id`, `metadata jsonb`, `created_at`.
- append-only; metadata ללא secret או קובץ.

#### `rate_limit_events`

- `id`, `user_id`, `join_request_id`, `action`, `created_at`.
- משמש למכסות AI/upload ב־MVP; cleanup יומי לאירועים ישנים.

## 7. פונקציות ופעולות אטומיות

### 7.1 `create_league(...)`

חוזה:

- caller הוא `auth.uid()`; אין פרמטר `manager_id` מהלקוח.
- נוצרים ליגה, חוקי ניקוד בגרסה 1, חוקי פרסים וחברות `active` של היוצר.
- היוצר נשמר גם ב־`leagues.manager_id` וגם ב־`league_members`.
- סכום אחוזי הפרסים הוא 10000 basis points וכל ערכי הניקוד עוברים validation.
- כל הפעולות מתבצעות בטרנזקציה אחת; כשל מחזיר error code צפוי ואינו משאיר נתונים חלקיים.

### 7.2 `approve_join_request(p_request_id uuid)`

חוזה:

- caller חייב להיות מנהל הליגה של הבקשה או system admin.
- `pending_approval` עובר ל־`approved`.
- upsert/activate ל־`league_members`.
- audit באותה transaction.
- קריאה חוזרת אחרי הצלחה מחזירה את אותה חברות ולא נכשלת בכפילות.
- כל סטטוס אחר מחזיר error code צפוי.

### 7.3 `reject_join_request(p_request_id uuid, p_reason text)`

- אותה בדיקת הרשאה.
- reason לאחר trim באורך 3–300.
- `pending_approval` עובר ל־`rejected`, decision fields ו־audit באותה transaction.

### 7.4 `score_match(...)`

פרמטרים מינימליים:

- `p_match_id`.
- `p_status` (`finished` או `canceled`).
- `p_home_score`, `p_away_score` כאשר finished.
- `p_is_manual_override boolean`.
- `p_source text` לצורכי audit.

התנהגות:

1. caller הוא secret/system operation בלבד. `applyManualResult` מאמת session
   ו־`system_admins`; gateway שרתי סגור מעביר את actor המאומת לקריאת
   service-role, וה־RPC מאמת שוב שה־actor עדיין מנהל מערכת.
   ב־Slice 7 ה־Cron משתמש ב־`SYNC_SYSTEM_ACTOR_ID` של principal ייעודי,
   לא־אינטראקטיבי וללא session UI, שמוקם באופן מאובטח לכל סביבה ב־
   `auth.users` וב־`system_admins`. חסרון env או הסרת ההרשאה מכשילים סגור;
   direct `pg_cron`/SQL invocation ללא context אינו מסלול נתמך.
2. lock על match בלבד. אין lock על `leagues` או על `league_scoring_rules`, כדי
   לא להפוך את סדר `leagues → league_members → matches` של `save_prediction`
   וליצור מעגל deadlock.
3. validation של score/status ושל זמן DB לאחר השגת ה־lock; `finished` לפני
   `kickoff_at` נדחה, ו־`canceled` לפני kickoff נשאר מותר.
4. עדכון result ו־version רק כאשר השתנו.
5. set-based overwrite של כל prediction fields לפי חוקי כל ליגה.
6. canceled מאפס נקודות ומסמן flags false בלי למחוק תחזיות.
7. audit תוצאה ותיקון.
8. commit אחד.

`SECURITY DEFINER` functions משתמשות ב־`set search_path = ''`, שמות schema מלאים והרשאות EXECUTE מצומצמות.

### 7.5 `record_sync_attempt()`

הפונקציה היא גבול המוטציה היחיד של Slice 7 ונקראת פעם אחת בלבד מ־Cron דרך
Data API:

1. קוראת את `x-predictor-system-actor` מ־`request.headers`, מאמתת UUID קנוני
   ובודקת שה־principal עדיין קיים ב־`system_admins`. אין actor בפרמטרים.
2. מנסה `pg_try_advisory_xact_lock` עם מפתח קבוע. אין session-level advisory
   lock ואין המתנה חוסמת.
3. אם הנעילה תפוסה, מוסיפה שורת `skipped` סופית עם
   `CONCURRENT_ATTEMPT`. זו כתיבת log append-only ללא אינווריאנט משותף.
4. אם הנעילה הושגה, מוסיפה שורת `skipped` סופית עם `MANUAL_PROVIDER`.
   אין due-window פעיל במסלול הידני; `OUTSIDE_DUE_WINDOW` שמור לספק עתידי.
5. שני המסלולים מחזירים id, status, code וזמנים מתוך אותה טרנזקציה. אין שורת
   `running`, קריאת adapter, upsert או קריאת `score_match`.

הפונקציה היא `SECURITY DEFINER` עם `search_path = ''`, שמות schema מלאים,
EXECUTE ל־`service_role` בלבד ואימות actor נוסף בתוך הפונקציה. בקשה לא מורשית
נכשלת לפני כתיבה ואינה מוסיפה גם `audit_logs`.

## 8. CRUD ופעולות אפליקטיביות

| Domain | Create | Read | Update | Delete/Deactivate |
| --- | --- | --- | --- | --- |
| Profile | trigger בהרשמה | self ב־Slice 1; active shared-league לאחר המודל המינימלי ב־Slice 2 | display name של עצמי | דרך מחיקת Auth בעתיד |
| League | `createLeague` | member/manager | `updateLeagueSettings` | archive, לא hard delete |
| Scoring rules | עם הליגה | member/manager | manager לפני lock | אין delete |
| Prize rules | עם הליגה | member/manager | manager לפני completion | replace transactionally |
| Invite | `createInvite` | manager; bootstrap עם public ID + Fragment secret | אין edit token | `revokeInvite` |
| Join request | `submitJoinRequest` | owner/manager | approve/reject ב־Slice 4 דרך RPC מנהל בלבד | אין delete |
| Proof | upload Handler | signed access אחרי AuthZ | אין overwrite | retention job בלבד |
| Membership | approval RPC | same league/manager | activate/remove | status `removed` |
| Match | provider/admin | authenticated scoped | provider/admin override | cancel, לא hard delete |
| Prediction | upsert לפני lock | policy תלוי זמן | upsert לפני lock | אין delete ב־MVP |
| AI analysis | on-demand Handler | authorized member | regenerate only when stale | admin maintenance |

## 9. Server Actions

| Action | קלט | Service/DB | הצלחה |
| --- | --- | --- | --- |
| `createLeague` | league + scoring + prizes | RPC `create_league` | redirect לליגה חדשה; creator active |
| `updateLeagueSettings` | fields allowed by status | league service | revalidate settings/summary |
| `createInvite` | league id | RPC אטומי עם expiry קבוע | public ID + raw secret פעם אחת |
| `revokeInvite` | invite id | invite service | link disabled |
| `submitJoinRequest` | public ID; digest נקרא מ־cookie HttpOnly | membership service + RPC | status `pending_proof` |
| `approveJoinRequest` | request id | RPC approve | member active |
| `rejectJoinRequest` | request id + reason | RPC reject | request rejected |
| `savePrediction` | league, match, two scores | RPC `save_prediction` + RLS SELECT-only; actor/time/match+league status/season נאכפים במסד | saved timestamp |
| `removeMember` | league + member | membership service | status removed + audit |
| `applyManualResult` | match + result/status | `score_match` via admin client | result and ranking updated |
| `completeLeague` | league id | report/league service | final report read-only |

כל action מגדיר schema קלט, בודק session ומשאב, ואינו מקבל actor/user id סמכותי מהלקוח.

## 10. Route Handlers

### 10.1 `POST /api/invites/[publicId]/exchange`

1. הנתיב מכיל UUID ציבורי בלבד; secret הזמנה נמצא ב־Fragment ולכן אינו מגיע
   ל־Vercel, ל־Proxy או ל־Route Handler.
2. Client Component קורא Fragment קנוני יחיד, מסיר אותו מיד באמצעות
   `history.replaceState`, מחשב SHA-256 ב־Web Crypto ושולח JSON חסום של digest
   בלבד. raw secret אינו נשלח גם בגוף הבקשה.
3. ה־Handler דורש Origin מדויק של האפליקציה/Preview, body עד 256 bytes,
   `application/json`, public ID קנוני ו־digest קטן־אותיות בן 64 hex.
4. user-scoped Supabase client קורא `resolve_invite(p_public_id,p_token_hash)`;
   UUID בלבד, זוג שגוי, revoke או expiry מחזירים אותה תשובת unavailable.
5. הצלחה מציבה `predictor_invite_access` כ־HttpOnly, `SameSite=Lax`, Secure
   בפריסה, מוגבל ל־`/invite/[publicId]` ול־30 דקות. ערכו כולל public ID ו־digest
   בלבד. ה־DB נשאר מקור האמת ובודק מחדש בכל resolve/submit.
6. כל התגובות הן `private, no-store`, `no-referrer` ו־`nosniff`; אין token,
   digest או פרטי ליגה בתגובה. ללא JavaScript אין exchange ולכן פרטי ההזמנה
   אינם נחשפים.

### 10.2 `POST /api/join-requests/[requestId]/proofs`

הקובץ מגדיר `export const runtime = 'nodejs'`.

1. reject אם `DEMO_MODE` אינו מוגדר כמצופה בפריסת הקורס או אם המשתמש אינו owner של בקשה מתאימה.
2. בדיקת Origin מדויק מול `NEXT_PUBLIC_APP_URL`, session והקשר הבקשה; גוף הבקשה נקרא כ־stream חסום עד 4,250,000 bytes לפני parsing, גם כש־`Content-Length` חסר או שקרי.
3. קובץ יחיד, עד 4,000,000 bytes, allowlist JPEG/PNG/WebP.
4. בדיקת extension, MIME ו־magic bytes.
5. ספירת rate limit durable לפני decoding: עד 5 ניסיונות למשתמש ולבקשה ב־15 דקות ועד 20 למשתמש ב־24 שעות; תשובת `429` כוללת `Retry-After` בטוח.
6. `sharp` מפענח תמונה חד־עמודית עם `limitInputPixels: 20_000_000`, מבצע orientation, resize בתוך 2000×2000 ללא הגדלה, מסיר metadata ומקודד ל־WebP.
7. SHA-256 מחושב על הפלט המסונן. UUID של proof ונתיב Storage נגזרים בשרת; ה־bucket קבוע ואין API ל־bucket/path שרירותיים.
8. upload ל־Storage עם `upsert: false`, ואז RPC finalizer אטומי מאמת object/נתיב, idempotency ומכסה, מוסיף metadata ומעביר `pending_proof` ל־`pending_approval` עם audit.
9. retry עם אותו idempotency key ואותו digest מחזיר אותה הצלחה; digest שונה מחזיר conflict. object מירוץ שלא ניצח נמחק.
10. rejection של DB נחשב definitive ומאפשר מחיקת פיצוי רק עבור `P0001`, מחלקות SQLSTATE `22`/`23`, או מחלקה `40` למעט `40003`. מחלקה `08`, `40003`, shutdown וקוד חסר/לא מוכר הם תוצאה עמומה, משום שה־commit אולי כבר הושלם: ה־Handler משחזר פעם אחת בדיוק את אותה קריאת finalizer האידמפוטנטית. replay מוצלח שומר את ה־object שאליו מצביעה רשומת ה־DB; אם גם ה־replay אינו מכריע, ה־object הפרטי נשמר ונשלח אירוע reconciliation מסונן ללא path רגיש. כשל במחיקת פיצוי נשלח לאותו מסלול reconciliation.
11. רק rejection של Storage עם status ברשימה הסגורה `400/401/403/404/409/411/413/415/422/429` הוא definitive ואינו מפעיל finalizer או reconciliation. `408`, `425`, `499`, כל `5xx`, transport ו־status חסר/לא מוכר הם תוצאת upload עמומה: אין finalization ואין מחיקה של הנתיב החדש, משום ש־`upsert: false` אינו מוכיח אם ה־object נוצר בקריאה הזו או היה collision קיים. נשמרת פרטיות ונשלח signal מסונן לסריקת orphan; מחיקה מדויקת תדרוש בעתיד ownership marker וחוזה Gateway מותנה.

### 10.3 `GET /api/payment-proofs/[proofId]`

1. session.
2. lookup metadata לפי proof id.
3. AuthZ ב־Slices 3–4: uploader או manager של הליגה המדויקת. מנהל מערכת אינו חריג לפני שמודל התמיכה ימומש.
4. השער הקבוע גוזר את הנתיב מתוך IDs שמקורם ב־DB ויוצר signed URL ל־60 שניות. ה־path אינו מופיע בטבלאות/DTOs ציבוריים או בתגובת upload, אך לאחר AuthZ הוא בהכרח נכלל ב־`Location` של Supabase ונראה למחזיק/ת ה־URL הקצר; אין לרשום אותו בלוגים או artifacts.
5. `Cache-Control: private, no-store`.

### 10.4 `POST /api/cron/sync`

1. secret, method ו־content-type צפויים; ה־job קורא את הסוד מ־Supabase Vault והוא תואם ל־`CRON_SECRET` ב־Vercel.
2. טעינת `SYNC_SYSTEM_ACTOR_ID` server-only; אין actor בפרמטרי הבקשה ואין
   fallback לזהות אנושית. env חסר נכשל סגור לפני Data API.
3. קריאת Data API יחידה ל־`record_sync_attempt` דרך client מערכת שמזריק את
   actor השרת. ה־RPC מבצע אימות actor, xact lock קצר וכתיבת log סופית באותה
   טרנזקציה.
4. תוצאה `MANUAL_PROVIDER` או `CONCURRENT_ATTEMPT` מחזירה HTTP 200 ו־payload
   קצר ללא secrets. בקשה לא מורשית אינה כותבת ל־`sync_runs` או `audit_logs`.
5. ה־Handler אינו מחזיק lock, אינו מעריך due-window, אינו קורא adapter, אינו
   מנהל `running`, אינו מבצע upsert ואינו נוגע ב־`score_match` או ב־gateway
   של Slice 6.

### 10.5 `POST /api/matches/[matchId]/analysis`

1. session וחברות פעילה בליגה הכוללת את המשחק.
2. cache lookup ו־freshness.
3. rate limit.
4. DB input בלבד → provider adapter → Zod output.
5. upsert cache והחזרה.
6. כשל מחזיר cache ישן עם timestamp או error לא־חוסם.

## 11. Validation

| קלט | כלל |
| --- | --- |
| Display name | trim, 2–50 |
| League name | trim, 3–80 |
| Description | 0–500 |
| Scores | integer, 0–30 |
| Scoring points | integer, 0–100; exact ≥ outcome ≥ incorrect |
| Prize positions | consecutive positive integers |
| Prize percentages | basis points; total exactly 10000 |
| Rejection reason | trim, 3–300 |
| Invite expiry | בעתיד ובתקרה סבירה |
| IDs | UUID; לעולם לא authorization בפני עצמו |
| Uploaded image | one file, ≤4 MB, type/signature/decoding valid |

Zod נותן UX ושגיאות מוקדמות. PostgreSQL checks, unique/FK constraints ו־RLS נותנים נכונות ואבטחה גם בעקיפה.

## 12. State, rendering ו־UX

### 12.1 State

- Server Components כברירת מחדל.
- `useActionState`/pending UI לטפסי Actions.
- local state בלבד ל־dialog, file preview ו־countdown.
- round/date ב־search params.
- אין React Context גלובלי לנתוני שרת ואין Redux.

### 12.2 Loading ושגיאות

- `loading.tsx` למסכים כבדים ו־skeleton מקומי לטבלאות.
- `error.tsx` לשגיאה recoverable; `global-error.tsx` רק לכשל מעטפת.
- errors צפויים מוצגים בתוך הטופס ולא זורקים exception כללית.
- mutation button disabled בזמן pending כדי לצמצם לחיצה כפולה; DB עדיין חייב להיות idempotent.

### 12.3 UX מרכזי

- `lang="he" dir="rtl"` ב־root layout.
- Mobile-first; טבלאות גדולות הופכות לכרטיסים או scroll נגיש.
- labels אמיתיים, focus states, keyboard navigation ו־ARIA רק כשנדרש.
- countdown מציג גם שעה מוחלטת, timezone וסטטוס נעילה.
- ניחוש שנשמר מציג timestamp מהשרת.
- מסכי Demo מסומנים באופן קבוע ואינם כוללים קישור תשלום אמיתי.
- AI מציג מקור נתונים/מועד וגילוי נאות; אינו מקבל עיצוב סמכותי יותר מנתוני המשחק.

## 13. טיפול בשגיאות

`AppError` מכיל `code`, `messageKey`, `status`, `detailsSafe` אופציונלי ו־`cause` לשרת בלבד.

| Code | HTTP/Action behavior | הודעת UI |
| --- | --- | --- |
| `UNAUTHENTICATED` | redirect/sign-in או 401 | יש להתחבר |
| `FORBIDDEN` | 403 | אין הרשאה לפעולה |
| `VALIDATION_ERROR` | 400/field errors | תיקון שדות |
| `PREDICTION_LOCKED` | 409 | המשחק כבר ננעל |
| `MATCH_NOT_STARTED` | 409 | אפשר להזין תוצאת סיום רק לאחר מועד הפתיחה |
| `STATE_CONFLICT` | 409 | המידע השתנה; רענון |
| `RATE_LIMITED` | 429 + retry hint | נסה מאוחר יותר |
| `UPLOAD_REJECTED` | 400/413/415 | סוג/גודל קובץ לא תקין |
| `PROVIDER_UNAVAILABLE` | 503 או fallback | נתונים אחרונים מוצגים |
| `INTERNAL_ERROR` | 500 + request id | אירעה שגיאה; ללא פרטים טכניים |

לוגים מסננים Email, tokens, secrets, signed URLs, proof paths ותוכן אסמכתאה.
`CONCURRENT_ATTEMPT` ו־`MANUAL_PROVIDER` הם קודי תוצאת Sync, לא error codes
אפליקטיביים: שניהם מלווים ב־`status = 'skipped'` וב־HTTP 200. מסכים והתראות
מזהים כשל Sync רק לפי `status = 'failed'`.

## 14. אסטרטגיית בדיקות

### 14.1 Vitest

בודקים מודולים טהורים:

- outcome classification כולל תיקו.
- טבלת 3/1/0 וחוקי ניקוד מותאמים שונים בשתי ליגות.
- prize split במקומות משותפים.
- Zod schemas ומקרי גבול.
- סיווג תוצאות upload/finalization: SQLSTATE `40003`/`08007` ו־Storage
  `408`/`425`/`499` נשארים עמומים, עוברים replay/reconciliation ואינם גוררים
  מחיקת object שאולי כבר committed; מחלקות rollback ורשימת Storage הסגורה
  מפעילות פיצוי רק כאשר הכשל definitive.
- adapter mapping מ־fixtures מוקלטים.
- תכנון Sync טהור מול fixtures checked-in, כולל החרגת משחק עם
  `is_manually_overridden`; המודול אינו מחובר ל־Cron או למסד.
- cache freshness ו־AI fallback.

Async Server Components אינם יעד ל־Vitest; בודקים את ה־Service/queries בנפרד ואת העמוד ב־Playwright.

מטריצת הניקוד ב־Vitest היא specification executable שממוקמת תחת
`src/features/scoring/__tests__`; קוד הייצור אינו מייבא אותה. הסמכות להתאמה
בין החוזה לבין SQL הייצור היא בדיקת pgTAP שמפעילה את `score_match` האמיתי.

### 14.2 pgTAP / DB integration

- כל טבלה קיימת עם RLS enabled.
- grants ופונקציות EXECUTE מצומצמים.
- משתמש A אינו קורא/כותב נתוני משתמש B או ליגה זרה.
- public-ID/hashed-secret pairing, invite rotation/revoke/expiry, hash-only persistence ו־submit אידמפוטנטי; בקשה קיימת נשארת תקפה גם אחרי ביטול ההזמנה.
- bucket `payment-proofs` פרטי ובעל מגבלת 4,000,000 bytes; CRUD ישיר ב־`storage.objects` נדחה עבור anon/authenticated.
- proof ownership/manager isolation, מכסת חמש הוכחות, idempotency ורישום rate-limit/audit ללא מידע רגיש.
- prediction מותר לפני kickoff ונדחה ב־/אחרי kickoff לפי DB time.
- visibility לפני/אחרי kickoff.
- unique constraints תחת concurrency.
- approve/reject atomicity ו־idempotency.
- `score_match`: מדויק, בית, חוץ, תיקו, טעות, canceled, retry ותיקון תוצאה.
- `score_match` דוחה `finished` לפני kickoff ואינו משנה את המשחק או הניחושים.
- שתי ליגות עם חוקי ניקוד שונים מקבלות `points` שונים לאותו משחק.
- leaderboard אינו סופר ניחוש עתידי גם לבעליו, ולכן האגרגט זהה בין צופים.
- `sync_runs`: schema, checks, RLS/grants, קריאת מנהל מערכת בלבד ו־EXECUTE
  מצומצם ל־`record_sync_attempt`.
- actor חסר/שגוי/שהוסר נדחה ללא כתיבת `sync_runs` או `audit_logs`.
- שתי sessions מוכיחות `CONCURRENT_ATTEMPT` בזמן xact lock מוחזק,
  `MANUAL_PROVIDER` לאחר שחרורו, ושאין session lock דולף.

### 14.3 Playwright

זרימות חובה:

1. הרשמה → login → logout → password reset smoke.
2. מנהל יוצר ליגה עם חוקים ופרסים.
3. מנהל יוצר/מסובב invite; הדפדפן פותח public-ID path עם Fragment secret,
   מוכיח שאין secret ב־network target ומנקה את ה־Fragment; המשתמש נרשם או
   מתחבר עם `next` ציבורי שמור, מגיש בקשה ומעלה תמונת Demo פרטית. תרחיש מקומי
   נוסף מפקיע fixture אחרי render ומוכיח שה־Server Action מחזיר הודעה בטוחה,
   שהעמוד עובר ל־unavailable ושמסך המנהל מציג expiry לפי זמן DB.
4. משתמש לא מאושר מנסה URL/API ישיר ונדחה.
5. שני חברים מנחשים; לפני פתיחה אין חשיפה, אחרי פתיחה יש.
6. שמירה לפני/אחרי נעילה.
7. מנהל מערכת מזין תוצאה; דירוג ושוויון מתעדכנים.
8. proof ID של בקשה אחרת אינו נגיש.
9. AI provider mocked נופל והניחוש עדיין עובד.
10. Cron ללא secret/עם secret שגוי נדחה ללא כתיבה; קריאה מורשית במצב manual
    נרשמת כ־`skipped`/`MANUAL_PROVIDER`; מנהל מערכת רואה את מסך ה־Sync
    ומשתמש רגיל נדחה.

### 14.4 Contract tests

- חוזה Sports וה־sync planner נבדקים מול JSON fixtures דטרמיניסטיים שנשמרו
  במאגר. fixtures של ספק חי יתווספו רק לאחר POC מאושר.
- CI אינה מבצעת קריאות live לספק Sports או AI.
- שינוי mapping שמפר fixture נכשל לפני deploy.

### 14.5 CI gates

בכל pull request:

1. `npm ci`.
2. lint ו־typecheck.
3. unit tests.
4. Supabase local reset + DB tests.
5. production build.
6. Playwright core flows ב־job נפרד.
7. בדיקה ש־generated DB types מעודכנים.

## 15. תכנית מימוש לפי Vertical Slices

### Slice 0 — Bootstrap, deploy ו־Sports POC

**תוצר:** אפליקציית Next.js ריקה אך תקינה ב־Vercel, Supabase מקומי/hosted, CI בסיסי, health page ודו"ח POC קצר.

- scaffold, scripts, env validation ו־error shell.
- Supabase init ומ migration ראשונה.
- Vercel deployment ראשון.
- `SportsProvider` interface, `ManualSportsProvider` ו־script POC חד־פעמי.
- תיעוד שש שאלות ה־POC ב־`docs/sports-provider-poc.md`.

**Exit:** URL חי, build/CI ירוקים, provider נבחר על בסיס ראיות או fallback ידני הופעל.

### Slice 1 — Auth ופרופיל

**תוצר:** flow אנכי עובד של הרשמה → אישור Email → יצירת פרופיל → התחברות → Dashboard מוגן → עדכון שם תצוגה → התנתקות, יחד עם שחזור סיסמה.

- Email + Password בלבד. OAuth, תמונת פרופיל, תפקידי מנהל מערכת וחברויות ליגה אינם חלק מה־slice.
- עמודים: `/login`, `/register`, `/forgot-password`, `/update-password`, `/profile` ו־`/dashboard`; Route Handler ב־`/auth/confirm`.
- טפסי Auth שולחים מוטציות ל־Server Actions עם Zod ו־Server client; Browser client נשאר בתשתית אך אינו גבול אכיפה. SSR cookies ו־`src/proxy.ts` משמשים ל־session, ללא Auth Context או Redux גלובלי.
- כל לקוחות Supabase מחוברים ל־`Database` generated. זרימת Email משתמשת ב־PKCE של `@supabase/ssr`; ב־Free tier עם ספק האימייל המובנה פתיחה במכשיר אחר מאשרת את הכתובת אך דורשת login ידני, ושחזור דורש בקשה חדשה באותו דפדפן. ה־UI מסביר זאת במפורש.
- `proxy.ts` מרענן session ומבצע redirect בסיסי בלבד. כל Server Action/Query מאמת משתמש והרשאה מחדש.
- identity migration יוצרת `profiles(id → auth.users.id, display_name, created_at, updated_at)`, trigger יצירה אוטומטי, constraints, RLS ו־least-privilege grants באותה migration.
- מדיניות Slice 1: משתמש authenticated קורא ומעדכן רק את הפרופיל שלו; אין client insert/delete ואין קריאת פרופילים אחרים עד שקיימת טבלת חברות.
- Zod בגבול ה־Server Action: Email תקין, סיסמה באורך 8 לפחות, התאמת אישור סיסמה ושם תצוגה באורך 2–50 אחרי trim. Supabase Auth אוכף בנפרד מינימום 8 תווים ב־Local ובפרויקט המארח.
- redirects מאומתים: אורח בעמוד מוגן → `/login`; משתמש מחובר בעמוד Auth → `/dashboard`; אישור Email → `/dashboard`; שחזור תקף → `/update-password`.
- `SUPABASE_SECRET_KEY` ו־admin client אינם בשימוש בפעולות Slice 1.
- Vitest ל־validation ול־safe redirect, pgTAP ל־trigger/constraints/RLS כולל משתמש זר, ו־Playwright ל־signup/login/profile/logout/protected route/reset, התנהגות פתיחה בהקשר דפדפן חדש ובידוד שני משתמשים.
- README מעודכן עם setup מקומי, Redirect URLs ופקודות הבדיקה.

**Exit:** ה־flow עובד ב־Local וב־Vercel; פרופיל נוצר אוטומטית; אורח חסום מעמודים מוגנים; משתמש אינו קורא או מעדכן פרופיל זר; lint, typecheck, unit, DB, build ו־E2E הרלוונטיים ירוקים.

### Slice 2 — יצירת ליגה, ניקוד ופרסים

**תוצר:** מנהל יוצר ליגה תקינה עם חוקי ניקוד ופרסי Demo.

- sports-core prerequisite: catalog tables עם RLS ונתוני reference ל־ליגת העל 2026/27, ללא provider IDs, קבוצות או fixtures מומצאים.
- league migrations/policies ומודל `league_members` מינימלי לחברות הפעילה של היוצר בלבד.
- form, schemas, service ו־Action.
- `create_league` RPC אטומי שמוסיף את היוצר גם כחבר פעיל.
- סכום פרסים 10000 bps.
- נעילת scoring rules לאחר התחלה נבדקת ב־DB/Service.

הקדמת sports core והחברות המינימלית היא dependency הכרחי ליצירת ליגה אמיתית
ואטומית. Invite links, בקשות הצטרפות, אסמכתאות וניהול חברים כללי אינם מוקדמים
ל־Slice זה ונשארים ב־Slices 3–4.

**Exit:** כשל חלקי אינו משאיר ליגה; היוצר חבר פעיל; משתמש אחר אינו משנה ליגה; שתי ליגות יכולות להחזיק חוקים שונים.

### Slice 3 — Invite, בקשה ו־upload מאובטח

**תוצר:** קישור הזמנה, בקשה, upload Demo פרטי וסטטוס `pending_approval`.

- token אקראי של 32 bytes, `public_id` אקראי נפרד, שמירת hash בלבד, תוקף קבוע של שבעה ימים ו־rotation של active link יחיד; יצירה ראשונה פותחת ליגה `draft` אטומית.
- הקישור הוא public-ID path עם Fragment secret. bootstrap בדפדפן מסיר את
  ה־Fragment לפני רשת, שולח רק digest ל־exchange ומקבל cookie HttpOnly
  קצר־חיים ומוגבל לנתיב. כך Runtime Logs של Vercel רואים UUID ציבורי בלבד ולא
  bearer secret. login משתמש ב־`next` יחסי שמכיל public ID בלבד; registration
  שומר אותו ב־cookie callback נפרד, וכתובת אישור ה־Email נטולת secret.
- submit אידמפוטנטי ל־request פעילה; revoke/expiry חוסמים submission חדש אך אינם מבטלים request קיימת.
- bucket `payment-proofs` פרטי ללא policies ל־client. שער server-only קבוע הוא consumer היחיד של secret ב־Slice 3.
- Node runtime, hard request/file/pixel/page limits, התאמת extension/MIME/magic, re-encode WebP, hash, history של עד חמש הוכחות ו־idempotency key.
- rate limit durable של 5 ניסיונות למשתמש+בקשה ב־15 דקות ו־20 למשתמש ב־24 שעות, עם audit לא־רגיש ופיצוי orphan.
- signed access route ל־60 שניות עבור uploader או manager של אותה ליגה בלבד.
- unit/DB/Playwright tests לקבצים, race/retry, Data API denial והרשאות cross-user/cross-league.
- תור ההחלטות, approve/reject ויצירת חברות אינם חלק מ־Slice 3 ונמסרים ב־Slice 4.

**Exit:** rotate/revoke/expired/idempotent submit עובדים; SVG/exe מוסווים ו־oversize נדחים, ו־payload נלווה לתמונה תקינה מנוטרל כי רק פלט ה־decode/re-encode נשמר; retry בטוח; IDOR proof ו־Storage CRUD ישיר נכשלים; אין bucket ציבורי או raw object נשמר.

### Slice 4 — החלטת מנהל וחברות

**תוצר:** manager queue, צפייה מורשית, approve/reject וחברות פעילה.

- תור מנהל מוגבל ומצומצם עם קישור ברור ממסך הליגה ו־signed access הקיים להוכחה.
- RPCs אטומיים ואידמפוטנטיים ל־approve/reject; אישור יוצר או מפעיל חברות יחידה,
  ודחייה שומרת סיבה בטוחה ו־audit יחיד.
- בדיקות הרשאה שליליות למנהל ליגה זרה ולמשתמש רגיל, ובדיקות replay בין מצבים
  סופיים כדי למנוע approve אחרי reject או reject אחרי approve.
- E2E לזרימת ההחלטה ולחברות הפעילה.

**Exit:** אישור כפול מייצר חבר אחד; החלטה סופית אינה מתהפכת; מנהל ליגה זרה
ומשתמש רגיל נדחים; דחייה אינה יוצרת חברות.

### Slice 5 — משחקים ידניים, ניחושים ונעילה

**תוצר:** seed/מסך משחקים, save prediction, lock ו־visibility.

**סטטוס: נמסר ב־15 באוגוסט 2026.**

- seed ידני קטן ומסומן של קבוצות ומשחקי Demo עתידיים על גבי sports core, ללא
  `external_provider`/`external_id` וללא טענה שמדובר בלוח אמיתי מאומת.
- `/leagues/[leagueId]/matches` עם סינון מחזור/תאריך, סטטוסים, תוצאה רשמית רק
  ל־finished, שעה מוחלטת מקומית, countdown ושורת הניחוש של הצופה בלבד.
- `/matches/[matchId]` עם הקשר ליגה מאומת, בחירה מפורשת כאשר יש כמה ליגות
  זכאיות, יצירה/עריכה, מצב נעול וחשיפת ניחושי חברים פעילים אחרי kickoff.
- `predictions`, outcome generated, התאמת עונה, indexes, RLS, grants ו־RPC
  `save_prediction` אטומי. ה־RPC נועל גם את הליגה ודוחה כתיבה לאחר
  `completed`/`archived`; ה־Action נשאר session → Zod → resource AuthZ → RPC.
- שאילתות העונה מוגבלות מפורשות ל־500 משחקים, עם שורת sentinel שמחזירה שגיאה
  במקום רשימה חלקית; התקרה גבוהה מלוח MVP מלא ונשארת גבול בטיחות עד pagination.
- Vitest לגבולות קלט/זמן/אזור זמן, pgTAP למטריצת הרשאה ונעילה, ו־Playwright
  דטרמיניסטי לשני משתמשים ב־Desktop Chrome וב־Pixel 5.

**Exit:** הושלם — DB מכריע את גבול הזמן והסטטוס; ניחושי אחרים מחזירים אפס
שורות לפני הפתיחה ונחשפים רק לחברים פעילים אחרי הפתיחה.

Slice 5 אינו כולל ואינו טוען ל־scoring/leaderboard (Slice 6), Sports Sync/Cron
או override (Slice 7), AI (Slice 8) או finance (Slice 9).

### Slice 6 — תוצאות, ניקוד ודירוג

**תוצר:** manual result → atomic scoring → standings → prize split.

- `score_match`, result versions ו־leaderboard view.
- unit/pgTAP matrix מלאה כולל שתי ליגות עם חוקים שונים.
- correction/cancel flows.

**Exit:** retry אינו משנה נקודות; correction מחשב מחדש; tie rules מדויקים.

נמסר ב־16 באוגוסט 2026: הזנה ידנית מורשית, ניקוד overwrite אטומי לפי חוקי כל
ליגה, correction/cancel, audit, דירוג member-only וחלוקת פרסי Demo טהורה
ב־basis points. בדיקת DB מקבילית מוכיחה שאין deadlock מול `save_prediction`.
ביקורת 17 באוגוסט הוסיפה דחיית `finished` לפני kickoff, אגרגטים עקביים לפני
חשיפה, fallback בטוח לשם חסר וחוזה principal ייעודי ל־Cron של Slice 7.

### Slice 7 — Sports Sync אמיתי או adapter ידני סופי

**תוצר:** תיעוד ניסיונות Sync ידניים, Cron מאומת ו־admin status, ללא צנרת ספק
מדומה.

- שער ה־POC נסגר ללא ספק חי; Manual provider והזנת תוצאות דרך Slice 6 נשארים
  המסלול הקנוני ל־MVP.
- `sync_runs` עם RLS ו־grants, ו־`record_sync_attempt` אטומי שמחזיק xact lock
  רק בתוך ה־RPC הקצר.
- כל ניסיון מורשה נרשם סופית: `MANUAL_PROVIDER`, או
  `CONCURRENT_ATTEMPT` כאשר ה־lock תפוס. בקשה לא מורשית אינה נכתבת.
- Cron route דק מבצע RPC יחיד ומחזיר 200 לדילוג; `/admin/sync` זמין רק למנהל
  מערכת ומציג קוד תוצאה כסיבת דילוג.
- מודול תכנון טהור מוכיח ש־manual override יוחרג בעתיד, אך אינו מחובר ל־route
  או ל־DB. אין due-window חצי־מחווט.
- upsert, lifecycle של `running`, adapter call ו־`p_source='sync'` נדחים יחד
  עם ספק חי. המסלול העתידי מחייב claim/lease עמיד עם fencing token; advisory
  xact lock רשאי להגן רק על יצירת ה־claim.
- מסך הסטטוס קורא לכל היותר 100 שורות אחרונות. מדיניות retention וניקוי
  `sync_runs`/`rate_limit_events` ישנים נשארת חוב מפורש ל־Slices 8–10.

**Exit:** כפילות בטוחה ומתועדת ללא נעילה דולפת; אין שורת run לא־סופית; שום
מסלול Slice 7 אינו משנה משחקים, ניחושים או נקודות; Manual provider והחוב
המדויק לחיבור ספק עתידי מתועדים.

נמסר ב־22 באוגוסט 2026: migration forward-only עם RLS/grants ו־RPC יחיד,
Route מאומת, מסך `/admin/sync`, planner טהור לא־מחובר, fixtures מוקלטים וכיסוי
Vitest/pgTAP/Playwright ללא קריאות ספק חיות.

### Slice 8 — AI analysis

**תוצר:** authorized on-demand analysis עם cache, schema, rate limit ו־fallback.

- DB input builder.
- provider adapter ו־fake provider.
- Route Handler, cache ו־UI disclosure.

**Exit:** אין עובדות שלא הגיעו מה־DB; משתמש לא מאושר נדחה; provider failure אינו חוסם ניחוש.

### Slice 9 — דוחות Demo

**תוצר:** finance summary ודוח prize allocation פשוטים.

- queries בלבד, ללא BI או charts מיותרים.
- approved/pending formulas.
- shared-position examples.
- סימון Demo בכל מסך.

**Exit:** נתונים שנדחו אינם בקופה; חישוב פרסים תואם unit tests.

### Slice 10 — Hardening, מסמכים והצגה

**תוצר:** מוצר שניתן להגיש ולהסביר.

- E2E core suite, accessibility smoke ו־responsive pass.
- Security/Performance Advisors ו־`EXPLAIN ANALYZE` לשאילתות מרכזיות.
- השלמת `docs/testing.md`, `docs/security.md`, `docs/scale.md` ו־README.
- env/deployment instructions, links ו־seeded demo accounts.
- מצגת 10–15 דקות וחזרה מלאה.

**Exit:** Definition of Done בסעיף 18.

## 16. לוח זמנים מוצע

| תאריכים | יעד |
| --- | --- |
| 11–12 באוגוסט | Slice 0 |
| 13–14 באוגוסט | Slice 1 |
| 15–17 באוגוסט | Slice 2 |
| 18–20 באוגוסט | Slice 3 |
| 21 באוגוסט | Slice 4 |
| 22–24 באוגוסט | Slice 5 |
| 25–26 באוגוסט | Slice 6 |
| 27–28 באוגוסט | Slice 7 |
| 29 באוגוסט | Slice 8 |
| 30 באוגוסט | Slice 9 |
| 31 באוגוסט–3 בספטמבר | Slice 10 ומסמכי הגשה |
| 4–5 בספטמבר | תיקוני blocker, rehearsal ו־submission checklist |
| 6 בספטמבר | הגשה |

המסמכים והבדיקות נכתבים בכל slice; התאריכים האחרונים הם השלמה ואימות, לא התחלה שלהם.

## 17. מדיניות חיתוך היקף

אם הלו"ז מחליק, חותכים לפי הסדר:

1. עיצוב AI עשיר; נשאר כרטיס נתונים ו־fallback.
2. provider אוטומטי; נשאר Manual adapter מלא ומתועד.
3. finance UI מתקדם; נשארת טבלה/מספרים נכונים.
4. ליטושי animation ועיצוב.

לא חותכים:

- AuthN/AuthZ ו־RLS.
- העלאת קובץ בטוחה או פרטיות.
- ניחוש, נעילה והסתרה.
- `points`, ניקוד אידמפוטנטי ודירוג.
- בדיקות לזרימות המרכזיות.
- מסמכי הקורס, deploy ויכולת להסביר את הקוד.
- חסימת כסף אמיתי בגרסת הקורס.

## 18. Definition of Done

שינוי נחשב גמור רק אם:

- הוא תואם לדרישת מוצר ממוספרת או מסביר למה אין דרישה.
- אין סטייה מהארכיטקטורה; החלטה חדשה תועדה.
- migration, RLS, grants ו־indexes נכתבו יחד עם הטבלה.
- generated DB types עודכנו.
- כל input לא־מהימן עבר validation; כל פעולה רגישה בדקה session ו־resource authorization.
- נוספו בדיקות ברמה המתאימה והן נכשלו לפני התיקון/מימוש במידת האפשר.
- lint, typecheck, unit, DB, build וה־E2E הרלוונטי ירוקים.
- שגיאות, loading, empty state ו־mobile/RTL נבדקו.
- secrets, proof paths ו־PII אינם בלוגים או ב־client bundle.
- מסמכי testing/security/scale/README עודכנו כאשר השינוי משפיע עליהם.
- ה־slice זמין ב־Preview/Production URL וניתן להדגים אותו מתחילתו ועד סופו.

## 19. תוצרי הקורס ומיקום

| דרישה | קובץ/תוצר |
| --- | --- |
| אפיון מוצר | `docs/product.md` |
| ארכיטקטורה | `docs/architecture.md` |
| תכנון טכני | `docs/technical-plan.md` |
| אפיון בדיקות | `docs/testing.md` |
| קוד בדיקות | `src/**/__tests__`, `supabase/tests`, `e2e` |
| סקייל בסיסי | `docs/scale.md` |
| אבטחה בסיסית | `docs/security.md` |
| הוראות הרצה ומשתני סביבה | `README.md`, `.env.example` |
| Vercel URL ו־GitHub | `README.md` ועמוד ההגשה |
| מצגת 10–15 דקות | `presentation/` או קישור מצורף להגשה |

## 20. המשימה הבאה לסוכן הקידוד

לאחר מסירת Slice 7 המשימה הבאה היא **Slice 8 — AI analysis**: ניתוח on-demand
לחבר פעיל בלבד, input מנתוני DB שמורים, output מובנה שעובר Zod, cache לפי
גרסת נתונים, rate limit ו־fallback שאינו חוסם ניחוש. CI משתמש ב־fake provider
ואינו מבצע קריאת AI חיה.

## 21. מקורות טכניים — אומתו ב־15 באוגוסט 2026

- [Next.js — Installation and Node.js requirement](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js — Vitest](https://nextjs.org/docs/app/guides/testing/vitest)
- [Next.js — Playwright](https://nextjs.org/docs/app/guides/testing/playwright)
- [Supabase — Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase — Database migrations](https://supabase.com/docs/guides/local-development/database-migrations)
- [Supabase — Generate TypeScript types](https://supabase.com/docs/guides/api/rest/generating-types)
- [Supabase — Database testing and pgTAP](https://supabase.com/docs/guides/local-development/testing/overview)
- [Supabase — Performance and Security Advisors](https://supabase.com/docs/guides/database/database-advisors)
- [Playwright — webServer configuration](https://playwright.dev/docs/test-webserver)
- [Playwright — best practices](https://playwright.dev/docs/best-practices)
- [IETF RFC 3986 §3.5 — Fragment מופרד לפני dereference](https://datatracker.ietf.org/doc/html/rfc3986#section-3.5)
- [Next.js — `cookies`](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [Vercel — Runtime Logs ו־Request Path](https://vercel.com/docs/logs/runtime)
