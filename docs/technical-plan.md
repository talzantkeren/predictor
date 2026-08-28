# Predictor1 — תכנית טכנית מפורטת

| שדה | ערך |
| --- | --- |
| גרסה | 3.19 |
| תאריך עדכון | 26 באוגוסט 2026 |
| סטטוס | Slice 8 — דוח מנהל לא־כספי — הושלם; השלב הבא הוא Slice 9 — סגירת lifecycle, Hardening, מסמכים והצגה |
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
7. החלטת POC מתועדת לגבי Sports provider. API-Football נבחר ב־23 באוגוסט
   2026; `ManualSportsProvider`, catalog/seed דטרמיניסטי ו־admin create/correct
   חייבים להישאר fallback תפעולי. S9-DEF-003 מחבר את ה־adapter ל־persistence.
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
| `test:client-secrets` | build עם sentinel סינתטי וסריקת artifacts; נכשל אם לא נסרק פלט |
| `test:client-secrets:scan` | סורק build קיים מול חוזה sentinel סינתטי הקשור ל־`BUILD_ID`; נכשל על חוזה חסר או ישן |
| `types:db` | יצירת `src/types/database.generated.ts` מה־DB המקומי |
| `docs:book:check` | regeneration זמני והשוואת bytes ל־`docs/project-book.docx` |
| `docs:submission:check` | בדיקת סנכרון וקישורי מסמכי ההגשה |
| `verify` | lint → typecheck → unit → שערי evidence/hardening/runbooks/Sports → DB → scale plans → generated types drift → שערי docs → build+client-secret scan → סריקה ישירה → E2E מול אותו build |

## 3. מבנה תיקיות יעד

```text
.
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── docs/
│   ├── product.md
│   ├── architecture.md
│   ├── course-source.md        # provenance בלבד; ה־PDF נמסר בנפרד
│   ├── technical-plan.md
│   ├── design-brief.md         # קלט עיצובי מאושר ל־Slice 7c
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
│   │   │   │   ├── reports/page.tsx
│   │   │   │   └── settings/page.tsx
│   │   │   └── matches/[matchId]/page.tsx
│   │   ├── admin/
│   │   │   ├── matches/page.tsx
│   │   │   └── sync/page.tsx
│   │   ├── api/
│   │   │   ├── cron/sync/route.ts
│   │   │   ├── join-requests/[requestId]/proofs/route.ts
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
DEMO_MODE=true
```

כללים:

- `DEMO_MODE` חייב להיות `true` בפריסת הקורס.
- ערכי `SPORTS_API_PROVIDER` היחידים הם `manual` ו־`api-football`; הערך הישן
  והעמום `api` אינו תקין.
- `SPORTS_API_KEY` אינו נדרש כאשר provider הוא `manual`, ונדרש בזמן ריצה כאשר
  provider הוא `api-football`.
- **`S9-TDEC-002` — מדיניות סביבות מאושרת, 26 באוגוסט 2026:** Production
  חייבת להשתמש ב־`SPORTS_API_PROVIDER=api-football`, ו־`SPORTS_API_KEY` יוגדר
  בה בלבד ויסומן Sensitive במקום שבו Vercel תומכת בכך. Preview, Local ו־CI
  חייבות להשתמש ב־`SPORTS_API_PROVIDER=manual`, recorded fixtures ו־fake
  transport, ללא `SPORTS_API_KEY`. אין live-provider canary ב־Preview ב־MVP הקורס.
  subscription/key נפרדים ל־Preview יישקלו רק אם דרישת QA חיה ומהימנה עתידית
  תצדיק זאת. בידוד מכסה בין credentials נפרדים אינו מאומת, ואין הצדקה לרכוש
  subscription נוסף רק עבור Preview ב־MVP.
- `S9-DEF-025` אומת ב־28 באוגוסט 2026: הרשומה הקיימת צומצמה באמצעות target-only
  update ל־Production בלבד ונשארה Sensitive, ללא קריאת הערך. Preview חדש עבר
  ב־Manual ללא key, מטריצת names/scopes וסריקות bundle/logs נשמרו, והמשכיות
  Production Cron נצפתה בקריאה בלבד.
- `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `SYNC_SYSTEM_ACTOR_ID`, מפתחות ספק וסיסמת DB אינם מופיעים ב־client bundle, logs או Git. עותק ה־Cron לסביבת Supabase נשמר ב־Vault אחרי ה־deploy, לא ב־migration.
- `SYNC_SYSTEM_ACTOR_ID` optional ב־schema הכללית כדי לא להפיל build שאינו
  מפעיל Cron, אך נדרש בזמן קריאת Route של Slice 7. הוא מכיל UUID קנוני של
  principal לא־אינטראקטיבי ייעודי ב־`auth.users` שקיים ב־`system_admins`, נטען
  בשרת בלבד, אינו מתקבל מהבקשה ואינו credential להתחברות.
- `SUPABASE_SECRET_KEY` נשמר עבור פעולות מערכת עתידיות, אך אינו נדרש ואינו מיובא ב־Slice 1. כל פעולת Auth/Profile רגילה משתמשת ב־publishable key וב־session המשתמש תחת RLS.
- `env.ts` מאמת env בצד שרת עם Zod; גבול Cron ייעודי נכשל סגור בזמן הבקשה אם
  `CRON_SECRET` או actor חסרים. provider שלא הוגדר מקבל `manual`; ערך
  `api-football` ללא `SPORTS_API_KEY` נכשל סגור לפני claim או קריאת רשת.
- Base URL של API-Football קבוע במודול server-only ואינו משתנה env, כדי לא
  ליצור SSRF boundary. בדיקות מזריקות fake transport ולא URL ייצור חלופי.
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
| 008 `operations` | טבלת `system_admins` הוקדמה ל־Slice 6. Slice 7 יצר `sync_runs` ו־RPC ידני; Slice 7b מוסיף forward-only את lease/fencing, lifecycle וקאונטרים לספק חי | זהות מערכת מצומצמת, manual fallback, claim/apply/finalize מגודרים והרשאות browser חסומות |
| 009 `seed_current_season` | נמסר ב־Slice 5 כקטלוג Demo ידני, מסומן וסינתטי עם מועדים עתידיים וללא provider IDs; ספק אמיתי נשאר לשער Slice 7 | האפליקציה עובדת ללא ספק חיצוני ואינה טוענת לאימות fixture אמיתי |
| 010 `slice7b_api_football_sync` | external identity לעונה, round label, irreversible prediction lock, `sync_leases`, הרחבת `sync_runs` ו־RPCs claim/apply/finalize | upsert לפי provider ID בלבד, token ישן/פג נדחה, RLS/grants ופונקציות service-only נבדקים |
| 011 `slice7b_review_hardening` | תיקון forward-only ל־cancellation latch/reactivation, quarantine של regression, cooldown ל־force והרחבה צרה של `score_match` לאיפוס מצב unscored | ביטול מוקדם אינו חושף; reactivation בטוח; fixture חריג אינו מפיל batch; אין retry storm |
| 012 `slice9_database_time_serialization` | תיקון forward-only: `save_prediction` ו־`claim_sports_sync` דוגמות wall-clock רק לאחר נעילת שורת ההכרעה; apply מקדים fencing ונעילת match להכרעת ביטול | waiter שחוצה kickoff/due/backoff/expiry מוכרע לפי הזמן שלאחר ההמתנה |
| 013 `slice9_database_time_serialization_review` | helper פרטי ללא Data API EXECUTE מכריע cancellation תחת match lock מול kickoff שמור ונכנס, משמר latch גם ב־manual override ודורש שני מועדים עתידיים ל־reactivation | reschedule אינו פותח ניחושים אחרי גבול שחל; apply/save מקביליים אינם יוצרים deadlock |
| 014 `slice9_full_sync_lease_duration` | מפריד ב־claim בין דגימת decision שלאחר lock לבין issuance לאחר תכנון העבודה | `sync_runs.started_at` הוא זמן ההנפקה ו־`locked_until = started_at + 120 seconds` גם לאחר המתנה |
| 017 `slice9_clear_manual_override` | RPC forward-only, service-only ואידמפוטנטי שמסיר ownership ידני רק ממשחק API-Football ומוסיף audit יחיד | result/provenance/latch/predictions נשמרים; ordinary user נדחה; provider apply רשאי להתחדש לאחר clear |
| 024 `slice9_sync_cron_budget` | מתקינה `pg_cron`, מסירה Data API schema usage ומיישרת אטומית את ה־job הקיים לשם provider-neutral ול־45s בלי לקרוא/להחזיר command | local reset; job חסר הוא no-op, כפול/לא־מוכר נכשל סגור, ו־schedule/active/target נשמרים |
| 025 `slice9_bidi_text_hardening` | checks קדימה על שמות וטקסט תצוגה של user/league/provider; אין טבלה או grant חדשים | Unicode bidi controls נדחים במסד, טקסט עברי/Latin מעורב נשמר, ו־UI מבודד ב־`bdi dir="auto"` |
| 026 `slice9_system_actor_bootstrap` | designation יחיד `sports_sync`, trigger binding מבוקר ו־fallback עסקי לקריאה בלבד כאשר cache ה־binding חסר | migration קיימת מקדמת binding אטומית; Hosted חדש מחייב grant לפני traffic; late approval במצב UNBOUND מצליח בלי לייחס אוטומציה למנהל |
| 027 `slice9_review_registry_barrier` | מכניס את הכרעת review למחסום registry בלעדי לפני גילוי ליגות העונה, ולאחריו נועל את כל מפתחות הליגה בסדר יציב | יצירת ליגה שלא הושלמה אינה יכולה להופיע ל־`score_match` אחרי שלב הגילוי בלי שמפתח הליגה שלה מוחזק |
| 028 `slice9_reconciliation_lock_reverify` | מאמת ומגלה work item, נכשל מיד אם חסר, לוקח את מפתח הליגה ואז קושר post-lock re-read לאותה ליגה לפני delegate | work item שנעלם או שויך מחדש בזמן ההמתנה נכשל `RECONCILIATION_NOT_FOUND`; delegate אינו רץ תחת מפתח של ליגה אחרת |
| 029 `slice9_hosted_rls_helper_hardening_contract` | maintenance function פרטית, invoker-rights וללא app/Data API EXECUTE ACL שמחילה idempotently path ריק וביטול EXECUTE על `rls_auto_enable` רק אם אובייקט Hosted קיים | אותה לוגיקה רצה ב־migration ונבדקת מול fixture event-trigger אמיתי; Vitest מקבע את קריאת ה־migration; היעדר האובייקט הוא no-op |

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

`running` נכתב רק במסלול `api-football` לאחר claim מגודר. המסלול הידני של
Slice 7 ממשיך לכתוב שורות סופיות בלבד.

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
- `automation_purpose text null` — ערך יחיד מותר `sports_sync`, עם unique חלקי;
  זהו designation מפורש ל־principal הלא־אינטראקטיבי ולא role שמגיע מהלקוח.
- אין CRUD דרך משתמש רגיל; seed ידני מאובטח או migration ייעודית בלבד.

### 6.3 ספורט

#### `competitions`

- `id`, `name`, `slug`, `country_code`, `external_provider`, `external_id`.
- unique על `slug` ועל provider/id כאשר קיימים.

#### `seasons`

- `id`, `competition_id`, `name`, `starts_on`, `ends_on`, `is_current`,
  `external_provider`, `external_id`.
- unique על `(competition_id, name)`.
- unique חלקי על `(external_provider, external_id)` כאשר שניהם קיימים; עונת
  API-Football `2026` נפרדת מעונת ה־Demo ואינה נקשרת אליה לפי שם.

#### `teams`

- `id`, `name`, `short_name`, `logo_url`, `external_provider`, `external_id`.
- unique על provider/id.

#### `sports_provider_rounds`

- `season_id`, `provider`, `provider_label`, `round_number null`,
  `requires_review`, timestamps.
- unique על `(season_id, provider, provider_label)`; label נשמר lossless.
- `Regular Season - N` מקבל מספר חיובי. stage לא מוכר נשמר עם
  `round_number=null` ו־`requires_review=true`, ללא מיפוי מומצא.
- RLS פעיל ואין CRUD ישיר ל־browser או ל־`service_role`; רק apply המגודר כותב.

#### `matches`

- `id`, `season_id`, `round_number`, `home_team_id`, `away_team_id`.
- `kickoff_at timestamptz not null`, `status match_status`.
- `home_score smallint`, `away_score smallint` עם check 0–30 כאשר אינם null.
- `result_version integer not null default 0`.
- `is_manually_overridden boolean default false`.
- `provider_round_label text null` — label lossless של הספק; `round_number`
  נשאר לתאימות UI של `Regular Season - N`.
- `provider_status text null` — קוד הסטטוס האחרון שאומת מהספק, כולל
  `AET`/`PEN` review-only שאינם תוצאה רשמית אוטומטית.
- `predictions_locked_at timestamptz null` — latch בלתי־הפיך שנקבע עם
  live/interrupted/FT/AET/PEN. ביטול מוכרע תחת נעילת המשחק לפי wall-clock טרי
  מול ה־kickoff השמור והנכנס: latch קודם או כל גבול שכבר חל נשמרים, גם כאשר
  `manual override` מונע שינוי תוצאה. ביטול מוקדם לבדו אינו חושף ניחושים,
  ו־reactivation אפשרי רק כאשר שני המועדים עדיין עתידיים.
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
  `scheduled` או `postponed`. סדר הנעילות הוא
  `leagues → league_members → matches`; רק לאחר נעילת המשחק נדגם
  `clock_timestamp()` טרי ונדרש שהוא קטן מ־`kickoff_at` וש־latch החשיפה ריק.
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
- `rank()` לפי points ואז correct outcomes. אין `dense_rank()`: שני חברים במקום 1 גורמים למקום הבא להיות 3, בהתאם ל־competition ranking.

ארבעת האגרגטים כוללים רק ניחושים של משחקים שעבורם `now() >= kickoff_at`.
הספירה של ניחוש עתידי נשארת 0 גם לבעל הניחוש, ולכן ה־View אינו מחזיר totals
תלויי־צופה ואינו חושף השתתפות לפני חלון החשיפה. כאשר שורת חברות גלויה אך
`profiles` מוסתרת ב־RLS, מוחזרת תווית ניטרלית בטוחה לשם התצוגה.

ה־View נמסר ב־Slice 6 כ־`security_invoker`, עם `SELECT` ל־`authenticated` בלבד;
הוא נשען על RLS של החברות והניחושים ואינו עוקף אותה. שאילתת השרת מאמתת חברות
בליגה המבוקשת לפני הקריאה. אין `SECURITY DEFINER VIEW` חשופה.

### 6.7 תפעול

#### `sync_runs`

- `id`, `provider`, `status`, `started_at`, `finished_at`.
- `sync_kind`, `lease_generation`, `locked_until` עבור ריצה חיה.
- `fixtures_seen`, `rows_inserted`, `teams_changed`, `matches_changed`,
  `results_changed`, `manual_overrides_skipped`, `quota_remaining`,
  `operator_notes`, `error_code`, `error_message_safe`.
- כל הספירות אינן שליליות; `finished_at` נדרש לכל status סופי ומותר להיות
  `null` רק ב־`running` העתידי.
- `error_code` הוא שם legacy של קוד תוצאה: הוא עשוי להכיל גם
  `CONCURRENT_ATTEMPT` או `MANUAL_PROVIDER` כאשר `status = 'skipped'`.
  `COMMENT ON COLUMN` מתעד זאת, ו־status הוא המבחין היחיד בין כשל לדילוג.
- RLS מאפשרת קריאה למנהל מערכת בלבד. אין insert/update/delete ישיר ל־anon או
  authenticated; append מתבצע רק דרך RPC המערכת המצומצם.

#### `sync_leases`

- שורה אחת לכל provider: `provider primary key`, `generation bigint`,
  `run_id`, `lease_token uuid`, `locked_until`, זמני catalog/targeted/reconcile,
  `backoff_until` ו־quota metadata מצומצם.
- generation עולה בכל claim ולעולם אינו קטן או ממוחזר; token חדש נוצר בכל
  claim ונמחק ב־finalize/reclaim.
- RLS מופעלת אך אין policy או table grant ל־browser roles או ל־service role.
  כל גישה עוברת RPC service-only שמאמת actor ו־fencing.

#### `audit_logs`

- `id`, `actor_id`, `action`, `entity_type`, `entity_id`, `metadata jsonb`, `created_at`.
- append-only; metadata ללא secret או קובץ.

#### `rate_limit_events`

- `id`, `user_id`, `join_request_id`, `action`, `created_at`.
- משמש למכסות upload ב־MVP; cleanup יומי לאירועים ישנים.

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
- `p_status` (`finished` או `canceled`; `scheduled`/`postponed` מותרים רק
  ל־reactivation צר של API-Football).
- `p_home_score`, `p_away_score` כאשר finished.
- `p_is_manual_override boolean`.
- `p_source text` לצורכי audit.

התנהגות:

1. caller הוא secret/system operation בלבד. `ManualMatchFormBoundary` לוכד
   operation ו־match ID מהשרת ב־inline Server Action וקורא ל־helper
   `mutateManualMatch` המוגן ב־`server-only`; ה־helper מאמת session ו־
   `system_admins`. gateway שרתי סגור מעביר את actor המאומת לקריאת service-role,
   וה־RPC מאמת שוב שה־actor עדיין מנהל מערכת.
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
5. עד Slice 8 מתבצע set-based overwrite של כל prediction fields לפי חוקי כל
   ליגה. Slice 9 יוסיף boundary מחייב: provider/global correction מעדכן רק
   ליגות שאינן `completed`; ליגה סופית נשארת ללא שינוי ומקבלת review. רק RPC
   reconciliation מפורש של system admin, לאחר נעילת league ואז matches, רשאי
   לחשב מחדש את אותה ליגה באמצעות אותה נוסחת scoring קנונית.
6. canceled מאפס נקודות ומסמן flags false בלי למחוק תחזיות.
7. reactivation מותר רק מ־`canceled`, ללא latch/manual override, עם source
   `api-football`, ורק כאשר wall-clock טרי קטן גם מן ה־kickoff השמור וגם מן
   המועד הנכנס. הוא מחזיר `points=0` וכל metadata הניקוד ל־null באותה
   transaction; אין כתיבה ישירה מ־apply.
8. audit תוצאה, תיקון ו־reactivation.
9. commit אחד.

`SECURITY DEFINER` functions משתמשות ב־`set search_path = ''`, שמות schema מלאים והרשאות EXECUTE מצומצמות.

### 7.5 `record_sync_attempt()` — baseline שהוסר ב־S9-DEF-003

הפונקציה הייתה גבול המוטציה היחיד של Slice 7 ונקראה פעם אחת בלבד מ־Cron דרך
Data API. S9-DEF-003 מסיר אותה forward-only ומחליף אותה בחוזה שב־§14; הרשימה
להלן נשמרת כתיעוד baseline היסטורי ואינה מתארת callable נוכחי:

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

### 7.6 `claim_sports_sync(...)`

- מקבלת provider קנוני ו־`force` בלבד; actor נקרא מה־header הפנימי ונבדק מול
  `system_admins`.
- נועלת את שורת `sync_leases` ורק אז דוגמת `clock_timestamp()` להכרעות
  expiry/due/backoff/cooldown, מסיימת run נטוש אחרי expiry ומגדילה generation.
- בודקת due עבור catalog (12 שעות), reconciliation (6 שעות) ו־targeted
  (כדקה, עד 20 fixture IDs). quota/backoff יכולים לדחות עבודה משנית.
- אם יותר מסוג אחד due, בוחרת את הסוג בעל ה־claim המגודר הישן ביותר מתוך
  `sync_runs`; attempt נכשל עדיין משתתף ברוטציה. כך כל targeted/catalog/
  reconciliation due מקבל claim בתוך שלושה claims זכאים, בלי queue נוסף.
  בתוך targeted, כל `live` קודם ל־stale/near-live ורק אחריו kickoff ו־external
  ID קובעים את 20 ה־IDs. `CONCURRENT_ATTEMPT` חסר generation אינו נחשב שירות.
- force של מנהל עוקף due-window בלבד; הוא אינו עוקף `backoff_until` ומוגבל
  באמצעות `last_forced_at` עמיד לניסיון אחד בדקה. ניסיון מוקדם חוזר כ־
  `NOT_DUE/FORCE_COOLDOWN`; parser ו־union של TypeScript מקבלים אותו כ־skip,
  וה־Action מציגה copy ייעודי שאינו נראה ככשל.
- `NOT_DUE` אינו יוצר run. lease פעיל יוצר skip סופי `CONCURRENT_ATTEMPT`.
- לאחר בחירת ה־plan נדגמת דגימת issuance נפרדת. claim מוצלח יוצר `running`,
  token UUID חדש, `started_at` מזמן ההנפקה ו־
  `locked_until = started_at + 120 seconds`, ומחזיר plan typed. אין קריאת ספק
  או mutation לקטלוג ב־RPC הזה.

### 7.7 `apply_api_football_sync_batch(...)`

- מקבלת run/generation/token ו־JSON פנימי מנורמל בלבד; batch מוגבל לעד 20
  קבוצות ולכל היותר 50 fixtures, עם validation חוזר במסד.
- ה־planner מאחד קבוצות גם מתוך fixtures של targeted/reconciliation לפי
  provider ID, ומקדים batches של עד 20 קבוצות ל־fixture batches. קבוצה חדשה
  מקבלת label מסונן ומסומן כלא־ממופה ואינה חוסמת את כל הריצה.
- מאמתת lease בתחילת ובסוף הטרנזקציה. expiry בסוף גורם rollback מלא.
- לפני טיפול ב־fixture קיים, ה־wrapper מקבע את סדר
  `sync_leases → sync_runs → matches`; משפחת cancellation נועלת את המשחק,
  דוגמת wall-clock טרי ומשווה גם למועד השמור וגם למועד הנכנס. latch של
  `manual override` נכתב בנפרד אף ששינוי תוצאת הספק מדולג.
- upsert נעשה רק לפי `(external_provider, external_id)`; Demo rows עם IDs
  ריקים אינם מועמדים לעדכון. season, round label, teams ו־matches נשמרים
  provider-owned.
- manual override מדולג ונמדד. reactivation בטוח מאפס scoring דרך
  `score_match`; regression אחר שומר את מצב המשחק, מעדכן `provider_status`,
  מוסיף note חסום ומדלג רק על ה־fixture במקום להפיל batch. `AET/PEN` שומרים
  provider status ו־latch עם operator note, אך אינם מחילים result או scoring
  ואינם נשארים ב־targeted polling.
- `FT` תקין קורא ל־`score_match(..., false, 'api-football')` באותה transaction.
  אין כתיבת points אחרת ואין לוגיקת ניקוד משוכפלת.

### 7.8 `finalize_sports_sync(...)`

- מאמתת את אותו fencing ואת ה־lease שלא פג, כותבת counters וקוד/הודעה בטוחים,
  מעבירה את run ל־`succeeded` או `failed` ומשחררת את ה־lease באותה transaction.
- ה־planner מגביל operator notes ל־100 עם marker מפורש של truncation ומאמת את
  `fixtures_seen` לפני apply, כך ש־validation של finalize אינו נכשל אחרי commit
  של batches. כשל finalize במסלול recovery ממופה לתוצאה typed ואינו דולף.
- קודי הכשל typed לפי גבול: `PROVIDER_*`, ‏`SYNC_PLAN_FAILED`,
  `SYNC_APPLY_FAILED` ו־`SYNC_FINALIZE_FAILED`. provider/planner מסיימים עם
  `fixtures_seen=0`; apply רשאי לשמור רק counters/quota/operator notes שכבר
  עברו validation בתכנית. אם finalizer נכשל, אין קריאת recovery נוספת לאותו
  finalizer ואין raw exception בתוצאה; fencing/reclaim מסיימים את ה־run בהמשך.
- הצלחה מעדכנת את זמן ה־catalog/targeted/reconciliation המתאים. 429 מסווג לפני
  wait-budget: hint קצר יכול retry, ו־hint שאינו נכנס בתקציב מסיים מיד בלי
  sleep כ־`PROVIDER_RATE_LIMITED`. רק `Retry-After` שלם ולא־שלילי החסום
  ל־`0..3600` ו־quota remaining שלם ולא־שלילי עוברים ל־finalize; הוא שומר את
  המכסה ומגדיר `backoff_until`, שנאכף גם ב־scheduled וגם ב־force.
- token ישן, provider/run שגויים או finalize כפול נדחים ללא mutation.

תקציבי ה־runtime הם contract אחד: 30s client, ‏45s `pg_net`, ‏60s Route
ו־120s lease. ה־Route מפרסם `maxDuration=60` סטטי; migration מיישרת את job
ה־Cron היחיד בלי לשמור secret ובלי ליצור schedule שני. בדיקת fake transport
מריצה שלושה ניסיונות איטיים מבוקרים ומוכיחה failure סופי ו־finalize יחיד.

## 8. CRUD ופעולות אפליקטיביות

| Domain | Create | Read | Update | Delete/Deactivate |
| --- | --- | --- | --- | --- |
| Profile | trigger בהרשמה | self ב־Slice 1; active shared-league לאחר המודל המינימלי ב־Slice 2 | display name של עצמי | דרך מחיקת Auth בעתיד |
| League | `createLeague` | member/manager | `updateLeagueSettings` | archive, לא hard delete |
| Scoring rules | עם הליגה | member/manager | manager או system admin לפני נעילת התחרות | אין delete |
| Prize rules | עם הליגה | member/manager | manager או system admin לפני אותה נעילת תחרות | replace transactionally |
| Invite | `createInvite` | manager; bootstrap עם public ID + Fragment secret | אין edit token | `revokeInvite` |
| Join request | `submitJoinRequest` | owner/manager | approve/reject ב־Slice 4 דרך RPC מנהל בלבד | אין delete |
| Proof | upload Handler | signed access אחרי AuthZ | אין overwrite | retention job בלבד |
| Membership | approval RPC | same league/manager; רשימת active לקריאה בלבד ב־MVP | approval מפעיל; completion סוגר בקשות פתוחות; removal/reactivation post-MVP | status `removed` שמור ל־post-MVP, לא לפעולת UI ב־MVP |
| Match | provider או `create_or_correct_match` של system admin מתוך teams קיימות | authenticated scoped | provider/admin correction + override מפורש | cancel, לא hard delete |
| Prediction | upsert לפני lock | policy תלוי זמן | upsert לפני lock | אין delete ב־MVP |

נעילת התחרות המשותפת לחוקי הניקוד ולחלוקת פרסי ה־Demo היא בלתי הפיכה: היא
חלה עם `locked_at`, מעבר מ־`draft/open`, הגעה לפי זמן מסד הנתונים ל־kickoff
הראשון שנכלל, או כל latch/status `live`/`finished` של משחק נכלל. עד לנעילה
החלפת הניקוד והפרסים מתבצעת במסמך אטומי וממוספר; לאחריה אין חלון מאוחר לשינוי
פרסים עד completion. פרטי ליגה שאינם תחרותיים נשארים ניתנים לעריכה עד
`completed`, ו־`archived` נשאר read-only. גישת system admin נעשית ב־RPC צר
לליגה שהתבקשה במפורש ואינה מוסיפה policy של SELECT רוחבי לטבלאות הליגה.

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
| `removeMember` (post-MVP; לא ממומש ב־Slice 9) | league + member | membership service עתידי | status removed + audit רק לאחר שינוי scope מאושר |
| `create_or_correct_match` (Slice 9) | operation + existing match id לתיקון או server-issued stable create UUID, season, שתי team IDs קיימות, round, kickoff, status/result | system-admin service + RPC אטומי, idempotency ואודיט; manual ownership מסומן | match ידני יחיד נוצר/תוקן בלי team CRUD ובלי merge לפי display name |
| `resolveMatchResultReview` (Slice 9) | match id + result version + disposition ותוצאת זמן חוקי/ביטול לפי disposition | system-admin service + RPC אטומי; row עמיד ב־`match_result_reviews`, revalidation ואודיט | valid review נפתר פעם אחת, canonical match נכתב וה־flags מתנקים; non-completed leagues מנוקדות, ורק completed leagues שכבר מכילות snapshot לאותו match מקבלות pending reconciliation |
| `clearManualOverride` (Slice 9) | confirmation בלבד; match id נלכד מה־row ב־Server Action | session + resource AuthZ + system-admin gateway + `clear_manual_match_override` service-only | ownership חוזר רק ל־API-Football בלי לשנות result/provenance/latch/predictions; replay typed ללא audit נוסף |
| `reconcileCompletedLeague` (Slice 9) | league id + reviewed match/version | system-admin lifecycle service + RPC אטומי לפי league advisory key וסדר row locks קנוני | explicit audited recalculation של final league או no-op אידמפוטנטי; אין silent provider rewrite |
| `startLeague` (Slice 9) | league id | league lifecycle service + RPC אטומי | manager רשאי `open` → `active` מוקדם; fallback חייב לשמור status/audit לא יאוחר מ־kickoff הראשון; recovery מאוחר מסומן כהפרת SLA |
| `completeLeague` (Slice 9) | league id | league lifecycle service + RPC אטומי | `active` → `completed` רק אחרי terminal/reconciliation; בקשות פתוחות נסגרות אטומית והדוח מוגן משינוי שקט, עם reconciliation מפורש בלבד |

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
3. לפני כל provider branch, ה־Handler קורא דרך gateway server-only קבוע ל־
   `activate_due_leagues()` המורשה ל־service role/system actor בלבד. ה־RPC
   משתמש ב־DB time, horizon קבוע של שתי דקות ו־batch עד 500, נועל leagues
   בסדר UUID, מקבע activation/audit אידמפוטנטיים ומחזיר counters נפרדים ל־
   on-time ול־`ACTIVATION_PERSIST_LATE`; late הוא ראיית כשל SLA, לא success
   שקט. כשל
   activation נכשל סגור לפני provider I/O; הצלחה נשמרת גם אם שלב הספורט נכשל.
   זהו שימוש חוזר ב־Cron הקיים, לא job/Route/secret חדשים.
4. orchestration משותפת בוחרת `manual` או `api-football`. אחרי S9-DEF-003,
   manual מפעיל את `ManualSportsProvider` ומעביר payload דטרמיניסטי וחסום ל־
   `apply_manual_fixture_catalog` — wrapper אטומי, payload-only ו־service-only,
   עם UUIDs יציבים ו־teams מה־catalog. ה־wrapper גוזר actor מ־header שרתי וקורא
   ל־core פרטי `SECURITY INVOKER` שאין לו grant ל־Data API; רק ה־core מחזיק את
   actor lock, advisory/row locks, ה־preflight, inserts, run וה־audit. אין
   overload granted שמקבל actor או clock. מיד לפני החלטת insert חסר, קריאת
   production עם clock `NULL` דוגמת DB time טרי; fixture חסר שמועדו הגיע מחזיר
   `MANUAL_CATALOG_CONFLICT`. כל invocation תקין שהגיע ל־RPC אחרי בניית ה־payload
   השרתית מוסיף `sync_runs` סופי אחד; כשל validation/config לפני ה־RPC אינו
   invocation מסדי. רק mutation אמיתי מוסיף business-audit יחיד, ו־no-change
   replay אינו מכפיל rows/audit.
   אין קריאת HTTP.
   API-Football מבצע claim RPC ורק outcome `CLAIMED` ממשיך לספק. activation רץ
   לפני שני הענפים.
5. `NOT_DUE`, `CONCURRENT_ATTEMPT`, `MANUAL_APPLIED` ו־`MANUAL_NO_CHANGE`
   מחזירים HTTP 200 ו־payload קצר ללא secrets. `MANUAL_PROVIDER` הוא ראיית
   base/מצב זמני בלבד ואינו outcome מותר אחרי יציאת DEF-003. בקשה לא מורשית
   אינה כותבת `sync_runs` או audit; `MANUAL_CATALOG_CONFLICT` נכשל אטומית בקוד
   בטוח ואינו משנה catalog קיים.
6. לאחר claim, adapter server-only קורא רק endpoints allowlisted עם timeout,
   size cap, validation ו־retry חסום. HTTP מתבצע מחוץ ל־DB transaction.
7. snapshots של API-Football מחולקים ל־batches, מועברים ל־apply המגודר
   ומסתיימים ב־finalize; הם נשענים רק על provider/external ID. ה־manual RPC
   הקטן משאיר provider identity ריק ונשען רק על UUIDs יציבים. כשל ספק בטוח
   מנסה finalize failed עם אותו token; stale/expired worker אינו רשאי לבצע
   recovery mutation.
8. ה־Handler נשאר `auth → env → lifecycle activation → sports orchestration →
   typed private response`. הוא
   אינו מכיל mapping ספק, upsert או ניקוד, ואינו חושף key/token/generation.

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
- טקסט תצוגה לא־מהימן עטוף דרך `IsolatedText` שמפיק `bdi dir="auto"`.
  Unicode `Bidi_Control` בלתי־נראה נדחה ב־Zod, בנרמול הספק וב־check constraints;
  טקסט עברי/ערבי/Latin מעורב רגיל נשאר מותר.
- Mobile-first; טבלאות גדולות הופכות לכרטיסים או scroll נגיש.
- labels אמיתיים, focus states, keyboard navigation ו־ARIA רק כשנדרש.
- countdown מציג גם שעה מוחלטת, timezone וסטטוס נעילה.
- ניחוש שנשמר מציג timestamp מהשרת.
- מסכי Demo מסומנים באופן קבוע ואינם כוללים קישור תשלום אמיתי.

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
`CONCURRENT_ATTEMPT` ו־`MANUAL_PROVIDER` הם קודי תוצאת Sync legacy, לא error
codes אפליקטיביים: ב־base שניהם מלווים ב־`status = 'skipped'` וב־HTTP 200.
אחרי DEF-003 הענף הידני מחזיר `MANUAL_APPLIED`/`MANUAL_NO_CHANGE`; מסכים
והתראות מזהים כשל Sync רק לפי `status = 'failed'`.

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
- API-Football client מול fake transport: envelopes, paging, duplicates,
  timeout/abort, size cap, 403/429/499/5xx, `Retry-After`, bounded retry,
  rate-limit headers ו־redaction.
- adapter mapping מ־fixtures provider-specific: 14 teams, 26 rounds, status
  map מלא, `FT` מ־`score.fulltime`, AET/PEN review, round collision ושם fallback.
- due/request planning טהור, batches של 20 IDs והחרגת manual override.

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
- `sync_runs`: schema, checks, RLS/grants וקריאת מנהל מערכת בלבד; ה־RPC הידני
  היחיד הוא `apply_manual_fixture_catalog` עם EXECUTE ל־service role בלבד,
  ו־`record_sync_attempt` הישן אינו קיים.
- actor חסר/שגוי/שהוסר נדחה ללא כתיבת `sync_runs` או `audit_logs`.
- שתי sessions מוכיחות completion-vs-create ו־completion-vs-catalog לפי סדר
  נעילות `leagues → matches`, כולל fail-closed בעונה completed. מרוץ ה־catalog
  קורא ל־core המלא בזמן owner-only קבוע לפני cutoff, כדי שהוכחת lifecycle לא
  תירקב עם הזמן.
- Slice 9 מוסיף replay/concurrency ל־manual import: `MANUAL_APPLIED` פעם אחת,
  אחריו `MANUAL_NO_CHANGE`, ללא כפילות team/match/audit וללא merge בשם תצוגה.
- core owner-only בזמן מפורש מוכיח באופן קבוע apply לפני kickoff ו־conflict
  אטומי אחריו; PUBLIC/anon/authenticated/service role אינם יכולים להריץ אותו.
- `sync_leases` ו־RPCs החיים: `NOT_DUE` ללא run, claim יחיד בשתי sessions אמיתיות, concurrent,
  reclaim שמסיים abandoned run, generation/token ישן או פג, apply/finalize
  atomicity והרשאות service-only.
- upsert provider-owned idempotent, Demo/name collision לא מתמזגים, round label
  נשמר, override מדולג, regression יחיד מבודד, cancellation מוקדם אינו חושף,
  reactivation מאפס scoring metadata ו־live/reschedule אינו פותח predictions.
- `FT`, correction ו־retry מפעילים את `score_match` הקיים; כשל batch אינו
  משנה points ו־audit source הוא `api-football`.

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
9. Cron ללא secret/עם secret שגוי נדחה ללא כתיבה; manual מחיל catalog/fixtures
    דטרמיניסטיים פעם אחת ואז מחזיר no-change בריפליי. מנהל רואה lifecycle seeded
    ו־trigger ומשתמש רגיל נדחה. success/not-due/concurrent/failure של ספק
    נבדקים בשילוב Vitest+pgTAP, לא באמצעות מתג provider מזויף בתהליך Production.
11. provider-owned fixture seeded מוצג במחזור הנכון, `AET/PEN` מוצג כ־review
    ולא כ־live ואינו פותח ניחוש, ו־build עם key sentinel מוכיח שאין key
    ב־HTML/client bundle.
    transport tests מוכיחים בנפרד שאין browser/provider fallback חי.

### 14.4 Contract tests

- חוזה Sports, API-Football client/adapter וה־sync planner נבדקים מול JSON
  fixtures מסוננים ודטרמיניסטיים שנשמרו במאגר לאחר ה־POC.
- CI אינה מבצעת קריאות live לספק Sports.
- שינוי mapping שמפר fixture נכשל לפני deploy.

### 14.5 CI gates

בכל pull request:

1. `npm ci`.
2. lint, ‏typecheck ו־unit tests.
3. `submission:evidence:check`, ‏`hardening:check`, ‏`owner-runbooks:check`
   ו־`sports:secret-boundaries` ב־quality job.
4. Supabase local reset + DB tests, אחריהם `scale:plans` לפני כיבוי המסד.
5. בדיקה ש־generated DB types מעודכנים ו־production build ב־quality job.
6. build עם sentinel סינתטי, חוזה מקומי הקשור ל־`BUILD_ID`, סריקת artifacts
   בזמן ה־build וסריקה ישירה נוספת ב־E2E job. חוזה חסר/ישן נכשל סגור, ולכן
   הסריקה הישירה אינה יכולה לעבור על build מקרי שלא נבנה עם ה־sentinel.
7. Playwright core flows ב־job נפרד מול אותו build סרוק.

אותם ששת שערי ההקשחה נקראים ישירות גם מ־`npm run verify`; אין שער ידני בין
השישה, משום שכולם דטרמיניסטיים ונתמכים ב־CI המקומי.

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
- כל לקוחות Supabase מחוברים ל־`Database` generated. זרימת Email משתמשת ב־PKCE של `@supabase/ssr`; ב־Free tier עם ספק האימייל המובנה פתיחה במכשיר אחר מאשרת את הכתובת אך דורשת login ידני, ושחזור דורש בקשה חדשה באותו דפדפן. ה־UI מסביר זאת במפורש. חוזה Slice 9 מחזיר תוצאות typed: success/unknown address שקולים; `429` ו־outage מובחנים; callback invalid/expired/reused/session mismatch/provider unavailable ממופה ל־copy allowlisted בלבד ולתפקיד ARIA מתאים.
- `proxy.ts` מרענן session ומבצע redirect בסיסי בלבד. כל Server Action/Query מאמת משתמש והרשאה מחדש.
- identity migration יוצרת `profiles(id → auth.users.id, display_name, created_at, updated_at)`, trigger יצירה אוטומטי, constraints, RLS ו־least-privilege grants באותה migration.
- מדיניות Slice 1: משתמש authenticated קורא ומעדכן רק את הפרופיל שלו; אין client insert/delete ואין קריאת פרופילים אחרים עד שקיימת טבלת חברות.
- Zod בגבול ה־Server Action: Email תקין, סיסמה בת שמונה תווים לפחות ועד
  72 בתים בקידוד UTF-8, התאמת אישור סיסמה ושם תצוגה באורך 2–50 אחרי trim.
  גבול הבתים תואם ל־GoTrue הפעיל ונאכף שוב ב־Hosted; מדיניות Hosted נבדקת
  לקריאה בלבד תחת S9-REQ-005 לפני טענת PASS.
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
או override (Slice 7) או דוח המנהל (Slice 8).

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

### Slice 7 — בסיס ידני שנמסר

נמסר ב־22 באוגוסט 2026: `sync_runs`, `record_sync_attempt`, Cron מאומת ומסך
`/admin/sync`. במצב `manual` כל ניסיון מורשה נשאר סופי כ־`MANUAL_PROVIDER` או
`CONCURRENT_ATTEMPT`, ללא mutation למשחקים או לניקוד.

### Slice 7b — API-Football Sync מלא

**תוצר:** `Cron → due claim → durable lease/fencing → API-Football → validated
normalized batches → atomic provider upsert/scoring → finalize → admin UI`.

- POC חי עבר ב־23 באוגוסט: API-Football, league 383, season 2026, 14 teams,
  26 regular-season rounds ו־182 fixtures בזמן הבדיקה. המספרים אינם hard limit.
- client server-only עם URL קבוע, GET allowlist, key header יחיד, timeout,
  response cap, Zod, paging, duplicate detection, rate headers ו־bounded retry.
- `ApiFootballProvider` ו־factory מפורש `manual|api-football`; recorded fixtures
  ו־fake transport בלבד בבדיקות וב־CI.
- competition/season/team/match provider-owned נפרדים מקטלוג ה־Demo. team ID
  הוא הזהות; כל 14 השמות העבריים ממופים במפורש ו־unknown team מקבל fallback
  בטוח ו־operator note.
- full provider round label נשמר. רק `Regular Season - N` נכנס אוטומטית ל־
  `round_number`; stage עתידי לא מוכר נכנס ל־review בלי collision.
- status map מפורש לכל הקודים המתועדים. live scores אינם official; `FT` משתמש
  רק ב־`score.fulltime`; AET/PEN שומרים provider status/latch כ־review ללא
  scoring, מוצגים כ־"דורש בדיקה" ואינם נשארים ב־targeted עד החלטת מוצר.
- `predictions_locked_at` מונע re-open אחרי live/SUSP/INT/FT/AET/PEN. משפחת
  הביטול מוכרעת תחת match lock ונועלת אם ה־kickoff השמור או הנכנס כבר הגיעו,
  או אם היה latch; ביטול מוקדם אינו חושף, ו־reactivation ללא latch מאפס
  scoring metadata רק כאשר שני המועדים עתידיים.
- row lease עם generation מונוטוני, token UUID ו־120s מלאים מזמן issuance;
  decision נדגם אחרי נעילת שורת ה־lease, HTTP מחוץ ל־DB,
  fencing בתחילת וסוף apply/finalize, reclaim ל־abandoned run ו־`NOT_DUE` ללא
  שורת run.
- apply חסום ואידמפוטנטי, אינו נוגע ב־Demo או override, ו־FT/reactivation
  קוראים לחוזה הניקוד של Slice 6 באותה transaction. regression חריג מבודד ולא
  מפיל batch; batches יכולים להשאיר catalog חלקי אך עקבי וניתן ל־retry, ותוצאה
  וניקוד של משחק יחיד אינם חלקיים.
- `/admin/sync` מוסיף trigger מאומת באותה orchestration ומציג lifecycle,
  counters, quota ו־operator notes בטוחים. הרשימה נשארת מוגבלת ל־100.

**Exit:** הושלם ב־24 באוגוסט 2026. כל דרישות
provider/lease/fencing/upsert/scoring/lock/observability מכוסות ב־Vitest,
pgTAP ו־Playwright ללא רשת חיה; lint/typecheck/build/types drift ירוקים וה־CI
של ה־merge עבר. שתי migrations ה־forward-only הוחלו על Hosted, ו־Production
נפרס מ־`main` ב־commit `b7c58a5` עם `api-football`.

Canary מורשה קלט 14 קבוצות, 26 מחזורים ו־182 משחקים; retry זהה ראה את כל 182
המשחקים ושינה אפס שורות ואפס תוצאות. קטלוג ה־Demo נשאר מבודד עם שש קבוצות
וחמישה משחקים ללא מזהי ספק. קיימת משימת Cron פעילה אחת בלבד, בתדירות דקה;
טיקים לאחר ההפעלה החזירו HTTP 200 ו־`NOT_DUE` ללא ריצת Sync מיותרת. צפייה
תפעולית רציפה במעבר משחק אמיתי `NS → live → FT` אינה שער סיום ל־Slice: אין
לייצר מעבר ספק מלאכותי ב־Hosted, והחוזה מכוסה בבדיקות הדטרמיניסטיות וייבדק
אופורטוניסטית כאשר יתרחש משחק מתאים.

ראיות ה־POC וה־Canary המסוננות נשמרות תחת `docs/evidence/`; הן אינן כוללות
מפתחות, headers, signed URLs, PII או payload מלא של הספק.

### Slice 7c — Design System ורענון UI

**סטטוס: הושלם, נפרס ל־Preview ואושר חזותית ב־25 באוגוסט 2026.** ה־tokens, מעטפת האפליקציה, גופן Heebo,
מצבי הרכיבים וארבעת מסכי העוגן יושמו בלי dependency, route, schema או שינוי
הרשאות. המימוש נבדק ב־390px, ב־768px וב־1440px; כל 460 בדיקות היחידה, 646
בדיקות מסד הנתונים ו־20 תרחישי Playwright בדסקטופ וב־Pixel 5 עברו.

**תוצר:** שפה חזותית עברית ו־RTL אחידה שמיושמת במעטפת האפליקציה ובארבעה
מסכי עוגן — `/dashboard`, `/leagues/[leagueId]`,
`/leagues/[leagueId]/matches` ו־`/leagues/[leagueId]/standings` — בלי שינוי
התנהגות עסקית, schema, הרשאות או נתיבים.

#### שער עיצוב לפני קוד

- [`design-brief.md`](./design-brief.md) הוא קלט העיצוב המאושר. אפשר להשתמש
  ב־Claude Design/Fable או בכלי אבטיפוס אחר ככלי פיתוח בלבד, עם צילומי מסך
  מסוננים והמסמכים הקנוניים; אין להעביר `.env`, API keys, cookies, PII,
  אסמכתאות או נתוני משתמש אמיתיים.
- האבטיפוס נדרש להציג כל מסך ב־390px וב־1440px, את מעטפת הניווט ואת המצבים
  loading, empty, error, success, disabled ו־locked הרלוונטיים. אין להתחיל
  implementation לפני אישור כיוון אחד; תוצר כלי העיצוב אינו מקור אמת חלופי.
- כיוון הבסיס הוא Sports Command Center בהיר: טיפוגרפיה עברית חזקה,
  היררכיית נתונים ברורה, נייבי/אמרלד ומשטח כהה סמנטי ומוגבל ללוח תוצאות.
  אין גרדיאנטים זוהרים, מטבעות, odds, jackpot, אווטרים, פיד חברתי או theme
  כהה גלובלי.

#### מימוש

- tokens מרכזיים לצבע, טיפוגרפיה, spacing, radius, focus ו־motion מוגבלים
  ב־`globals.css`; רכיבים חוזרים מצומצמים תחת `src/components`. Tailwind v4
  נשאר כלי ה־UI, ולא מתווספת ספריית UI/אייקונים/אנימציה ללא החלטת ארכיטקטורה.
- המחזור הוא יחידת הארגון הראשית במסך המשחקים. `RoundCard` מציג מספר מחזור,
  התקדמות ניחושים, זמן נעילה ורשימת משחקים, תוך שמירה על ה־queries, search
  params, זמן DB וחוזי הניחוש הקיימים.
- עריכת ניחוש נשארת ב־`/matches/[matchId]` דרך ה־Action והטופס הקיימים;
  `MatchRow` מציג מצב, ניחוש קיים ו־CTA ואינו מוסיף form inline. שעה מוחלטת
  ו־timezone נשארים גלויים דרך `LocalDateTime` גם כאשר מוצג פורמט זמן מקוצר.
- אין להציג chip ניקוד או `result_version` שלא נקראו מן השרת, ואין לגזור
  מחדש exact/outcome/points ב־UI. נתוני mockup שאינם ב־queries הקיימים — משחק
  קרוב או aggregation ב־Dashboard, משחק/מספר חברים/מצב מחזור בתקציר, מצב
  מחזור ב־LeagueCard ו־"אחרי מחזור" בדירוג — מושמטים.
- progress של מחזור מוצג רק לחבר פעיל. בסינון תאריך הוא מסומן כמתייחס
  למשחקים המוצגים, כדי לא לטעון שזו תמונת המחזור המלאה.
- payloads קיימים של תקציר הליגה והדירוג מוסיפים `viewerIsManager` כערך תצוגה
  שנגזר בשרת מ־`manager_id` ומהמשתמש המאומת. הוא משמש רק להצגת tabs למנהל;
  הוא אינו מתקבל מהלקוח ואינו שכבת הרשאה. כל מסך ופעולה ממשיכים לאמת את
  המשאב והתפקיד בשרת ולהסתמך על RLS כהגנה נוספת.
- דשבורד מגדיר את ה־app shell ואת נקודת הכניסה; תקציר ליגה בודק זהות ליגה
  ומשטח תוצאה; מסך המשחקים בודק את לולאת הניחוש; הדירוג בודק צפיפות מספרית,
  שוויון ו־responsive. יתר המסכים נשארים פונקציונליים ומקבלים את tokens
  והרכיבים המשותפים בלי הרחבת scope.
- home/away נשארים עקביים בכל המסכים; טקסט מעורב עברית/לטינית מבודד באופן
  סמנטי; labels, focus, touch targets וניגודיות AA נשמרים. motion קצר בלבד
  ומכבד `prefers-reduced-motion`.
- ביקורת ה־handoff חיזקה את ניגודיות הטקסט המשני, העבירה את העלאת ה־Demo ואת
  שלדי המשחקים ל־tokens, קודדה זוגות תוצאה מפורשים ל־RTL והגבילה הכרזות
  countdown ארוכות לקוראי מסך. אין לכך השפעה על נתונים או חוקים עסקיים.
- ביקורת ההמשך הוסיפה `control-border` ייעודי לבקרי טופס גלויים ביחס ניגודיות
  של לפחות 3:1, בלי להכהות את מסגרות הכרטיסים; מסכי החברים וההגדרות ורכיבי
  הניהול שלהם הועברו לאותה מעטפת, tabs ו־tokens. כפילויות בהכרזות ניחוש
  והתקדמות הוסרו, כותרת המשחק מבודדת שמות קבוצות באמצעות `bdi`, ומצבי loading
  והפרדת תוצאה לא גמורה קיבלו סמנטיקה עקבית. אין שינוי ב־queries, Actions,
  AuthZ, schema או חוקים עסקיים.
- סגירת הערות ה־S3 שומרת רקע לבן משני צדי `control-border` בשדות readonly,
  משתמשת ב־accent סמנטי במקום משטח ירוק סביב קישור חד־פעמי, ומשלימה את מעבר
  מצבי ה־focus, התוויות ומצבי disabled בקובצי Auth והתוצאה הידנית ל־tokens.
  בדיקות E2E מקבעות את צבע הרקע והמסגרת בשני שדות ה־readonly. זהו ליטוש חזותי
  בלבד, ללא שינוי בחוזה הטופס, בנתונים או בהרשאות.
- ביקורת ה־Preview האחרונה השלימה את מעטפת `AuthCard`, כפתורי הפעולה, הודעות
  השגיאה ומצבי focus של `summary` באותם tokens. assertions נוספים מקבעים את
  accent ההזמנה, מעטפת Auth ושדה Auth לבן; אין שינוי בזרימות ההרשמה, ההזמנה
  או התוצאה הידנית.
- proof פרטי אינו נטען כ־thumbnail מטושטש. נשמרים metadata בטוחים וכפתור
  צפייה מפורש שממשיך דרך `/api/payment-proofs/[proofId]` לאחר AuthZ.
- אין הוספת `/leagues` כללי, תמונת פרופיל, היסטוריית דירוג, התראות או פעולה
  שלא קיימת ב־MVP. אין migration או generated-types change ב־Slice 7c.

#### בדיקות ויציאה

- Playwright קיים מכסה Desktop Chrome ו־Pixel 5; נוספות assertions ממוקדות
  לארבעת מסכי העוגן, app shell, RTL, סדר home/away, focus והיעדר overflow.
  בדיקת 390px ו־1440px וניגודיות/keyboard נעשית גם ידנית ומתועדת.
- selectors קיימים שתלויים ב־`article`, בטקסט "מקום N" או במיקום עמודות
  מותאמים למבנה הסמנטי החדש באותו שינוי. assertions של נעילה, status, timezone,
  cross-user AuthZ והסתרת ניחושים אינם נחלשים.
- בדיקות פונקציונליות קיימות לניחוש, חשיפה, דירוג, AuthZ ו־proof נשארות ירוקות;
  שינוי עיצוב אינו מרכך negative tests או RLS.

**Exit:** כיוון אחד אושר; tokens, מעטפת וארבעת מסכי העוגן יושמו ונבדקו
ב־390px וב־1440px; loading/empty/error/locked/focus תקינים; אין overflow,
פיצ'ר חדש, secret בדפדפן או regression פונקציונלי; lint, typecheck, unit,
build ו־E2E הרלוונטי ירוקים. ה־Preview הקבוע של הענף עבר QA רספונסיבי ואישור
חזותי לפני מיזוג ל־Production.

### Slice 8 — דוח מנהל לא־כספי

**סטטוס: הושלם ב־25 באוגוסט 2026.** המימוש query-only, ללא schema או תלות,
עבר `npm run verify`: כל 489 בדיקות Vitest, כל 646 בדיקות pgTAP וכל 22 תרחישי
Playwright בדסקטופ וב־Pixel 5 עברו. build ו־client-secret scan ירוקים; לא נעשה
שימוש ב־admin client, AI, חישוב כספי או mutation Hosted.

**תוצר:** `/leagues/[leagueId]/reports` למנהל הליגה בלבד, עם תמונת מצב חברות
ודירוג נוכחי או סופי שאינו כספי.

- feature ממוקד תחת `src/features/reports/` עם `types.ts`, `queries.ts`,
  `service.ts` ובדיקות. אין dependency, migration, RPC, Action או mutation.
- UUID ו־session נבדקים לפני הקריאה. הרשאת המשאב משווה את המשתמש המאומת
  ל־`leagues.manager_id` המדויקת דרך user-scoped Supabase client תחת RLS.
  חבר רגיל, זר או מנהל ליגה אחרת מקבלים not-found אטום.
- ספירת חברים פעילים מגיעה רק מ־`league_members.status='active'`; חבר שהוסר
  או בקשה ישנה שאושרה אינם נספרים. `pending_approval`, `pending_proof`
  ו־`rejected` נשמרים כספירות נפרדות ללא join ל־`payment_proofs`.
- `getLeagueStandings`, טיפוסי הדירוג ו־mapping קיימים נשארים מקור האמת.
  הסדר הוא points, אחריו correct outcomes, ואחריו `rank()` משותף כגון
  `1, 1, 3`; exact scores הם מידע בלבד.
- ספירות `head: true` אינן מעבירות שורות ומקבלות כל safe integer לא־שלילי;
  שגיאה או נתון malformed נכשלים סגור. רשימת standings נשארת חסומה ל־500
  שורות ונכשלת סגור במקום להחזיר דירוג חלקי.
- `completed` בלבד מוצג כ־"דירוג סופי"; בכל status אחר מוצג "דירוג נוכחי".
  Slice 8 אינו מקדם סטטוס. בדיקת Playwright משתמשת ב־fixture DB מבודד כדי
  להוכיח rendering בלבד; Actions של lifecycle מתוכננים במפורש ל־Slice 9.
- UI עברי/RTL, Server Component, notice קבוע, כרטיסי ספירה, cards במובייל,
  table סמנטי עם caption בדסקטופ, loading/error/empty, keyboard וללא overflow
  ב־Pixel 5 ובדסקטופ.
- הדוח מידע בלבד: אין AI, דמי השתתפות, קופה, תשלום או עיבוד תשלום, פרס כספי,
  אחוזי פרס, payout מדומה, currency symbol או קישור תשלום.

**Exit:** מנהל רואה ספירות ו־standings נכונים; creator-only/zero/removed/
status separation/empty/shared positions/duplicate names/limits/malformed
מכוסים ב־Vitest; Playwright מוכיח manager/guest/member/other-manager,
current/final, notice, היעדר UI כספי/AI והיעדר overflow. כל שערי verify ירוקים.

### Slice 9 — Hardening, מסמכים והצגה

**תוצר:** מוצר שניתן להגיש ולהסביר. ביקורת שער השחרור המקובעת ל־
`a14edfc4df446a57f0bfe7153f6f0870e0cab243` וה־backlog המחייב נמצאים ב־
[`docs/slice-9-preflight-audit.md`](./slice-9-preflight-audit.md). מסמך זה הוא
המקור לפרטי reproduction, acceptance, regression, Hosted evidence ו־dependency
של כל מזהה להלן. אישור ה־audit אינו אישור release.

**יעדי** Slice 9 נשארו ללא שינוי: lifecycle מלא, hardening, מסמכי הגשה והצגה.
לעומת זאת, ביקורת ה־preflight הרחיבה את **העבודה המחייבת** מעבר לניסוח הכללי
"hardening". היקף היכולת החדש חייב להיות מתוזמן במפורש וכולל לפחות:

- `S9-DEF-003` — יצירה/תיקון מלאים וצרים של match בידי system admin.
- `S9-DEF-007` — שינוי הגדרות הליגה המותרות.
- `S9-DEF-008` — הסרה מפורשת של manual override.
- `S9-DEF-009` — AuthZ מדויק ו־pagination במקום הסתמכות על hard caps.
- רשימת חברים פעילים לקריאה בלבד כחלק מ־`S9-REQ-001`, לאחר הכרעת
  `S9-DEF-021` שכבר נסגרה.

זו תוספת capability ממשית ל־Slice 9 ואסור להסתיר אותה תחת hardening. דרישות
Slice 9 שתוכננו מראש נשארות `S9-REQ-*`; הן אינן מתוארות כ־regressions.

#### החלטות מוצר מאושרות — 26 באוגוסט 2026

| ID | הכרעה מחייבת |
| --- | --- |
| `S9-PDEC-001` | מנהל רשאי להפעיל ליגה מוקדם; fallback מתוזמן אטומי/idempotent/audited חייב לשמור `active` ואודיט לא יאוחר מ־kickoff הראשון. DB-time guard מונע open behavior במקרה איחור, אך reconciliation מאוחר מסומן `ACTIVATION_PERSIST_LATE` ואינו עומד ב־guarantee |
| `S9-PDEC-002` | completion דורש שכל match כלול יהיה terminal ופתור: `canceled`, או `finished` עם FT רשמי/הכרעת system admin מתועדת. scheduled/live/postponed, durable review שעדיין pending, unknown provider status ו־AET/PEN unresolved חוסמים; `review` אינו `match_status` |
| `S9-PDEC-003` | provider correction אחרי completion אינו משנה final league בשקט; נדרש system-admin review/reconciliation מפורש, מורשה ומתועד |
| `S9-PDEC-004` | completion סוגר באותה טרנזקציה `pending_proof` ו־`pending_approval` כ־`rejected` עם reason code קבוע `LEAGUE_COMPLETED` ושומר proofs/history/audit; ה־UI ממפה אותו ל־"הליגה הושלמה" |
| `S9-PDEC-005` | `/members` מציג active members לקריאה בלבד לצד queue קיים; standalone removal/reactivation הן post-MVP |

`S9-DEF-006` נסגר כחוזה החלטה, לא כתיקון runtime. הסתירה התיעודית של
`S9-DEF-021` נסגרה, וה־UI החסר עבר ל־acceptance הפתוח של `S9-REQ-001`.

#### חוזה מימוש lifecycle של Slice 9

- לפני completion קבוצת ה־included fixtures היא כל `matches` שעבורם
  `matches.season_id = leagues.season_id`; אין בחירת subset ב־MVP. completion
  מוסיף באותה טרנזקציה snapshot ל־`league_match_snapshots(league_id,
  match_id, completed_status, completed_home_score, completed_away_score,
  completed_result_version, completed_at)` עם PK זוגי ו־shape constraints.
  אחרי completion כל match read, correction review ו־final report משתמשים
  ב־snapshot ולא בשדות mutable של `matches`; fixture חדש באותה עונה אינו
  מצטרף רטרואקטיבית. הקבוצה הדינמית משמשת ל־first kickoff ולבדיקת completion
  עד רגע ההקפאה. reconciliation מפורש הוא הדרך היחידה לעדכן snapshot סופי.
- `startLeague` קורא ל־RPC lifecycle יחיד; אותה סמנטיקה משמשת fallback מערכתי.
  worker מתוזמן קורא `activate_due_leagues` עם DB time ו־lookahead בטוח שנגזר
  מ־cadence מאומת, עם retry לפני הגבול; תנאי הקבלה הוא שבכל מצב תקין הוא מקבע
  פעם אחת `status='active'`, `activated_at` ואירוע audit לא יאוחר מ־first
  kickoff. אם tick לא הגיע בזמן, כל גבול DB שמסתמך על status מחשב effective
  `active` החל מהגבול ואוכף מיד את הסמנטיקה הסגורה. גבול שרוכש league כ־parent
  ראשון, או ה־Cron הבא, מבצע reconciliation idempotent: `activated_at` נשמר
  כ־`first_kickoff_at`, `recorded_at` נשאר זמן הכתיבה, ונוסף code
  `ACTIVATION_PERSIST_LATE` שמסומן לכשל תפעולי/alert. recovery זה אינו PASS
  ל־deadline ואינו backdating של האודיט. principal לא־אינטראקטיבי מקבל מראש
  designation יחיד `automation_purpose='sports_sync'`; trigger מבוקר יוצר את
  ה־binding הפרטי, ו־migration קדימה מקדמת binding קיים לאותו designation.
   recovery שנחשף בגבול עסקי רשאי לקרוא את ה־designation ישירות כאשר cache
   ה־binding חסר, בלי לכתוב אותו אחרי נעילת league. הוא מייחס את אירוע האודיט
   ל־system actor ושומר את `auth.uid()` של החבר/מוזמן רק בתור
   `metadata.triggering_actor_id`. חסרון designation נכשל סגור, actor אחר אינו
   מחליף אותו בשקט והסרת שורת `system_admins` מסירה את הקישור. לפני פתיחת traffic
   ב־Hosted חדש, runbook+CI contract מחייבים designation יחיד, binding תואם
   והתאמה value-free ל־`SYNC_SYSTEM_ACTOR_ID`; תבנית הראיה שומרת רק PASS/FAIL
   ולעולם לא UUID. פעולה ידנית מוקדמת
  משתמשת בזמן DB שלה. המירוץ manual/automatic יוצר transition ואירוע audit
  יחידים ונועל את חוקי הניקוד; correctness אינו נשען על שעון הדפדפן או על tick
  מוצלח יחיד.
- `completeLeague` נועל את הליגה, מאמת את מטריצת terminal ואת גרסאות הניקוד,
  ודורש `requires_review=false` וללא review pending לגרסה הכלולה. `canceled`
  הוא resolved; `finished` resolved רק עם `provider_status='FT'` ותוצאת זמן
  חוקי מאומתת, או עם הכרעת system admin מפורשת ומתועדת. forward migration
  מוסיפה ל־`matches` את `requires_review`/`review_code`/`review_result_version`
  ואת `match_result_reviews(match_id, result_version, provider_status,
  candidate_home_score, candidate_away_score, disposition, selected_status,
  selected_home_score, selected_away_score, applied_result_version, decided_by,
  decided_at, created_at)`
  עם PK זוגי ו־constraints שמחייבים actor/time/result לפי disposition. AET/PEN
  או provider disposition לא־מוכר יוצרים row `pending` ואינם מתחזים ל־
  `match_status`. `resolveMatchResultReview` של system admin לוקח תחילה את
  מחסום ה־registry הבלעדי, גוזר את כל הליגות בעונת המשחק, לוקח את מפתחות
  הליגה בסדר יציב, נועל match→review
  ומאמת שוב שה־match עדיין באותה `review_result_version` ושה־row pending.
  disposition תקף כותב באותה טרנזקציה canonical `finished`+תוצאת זמן חוקי או
  `canceled`, מעלה `matches.result_version`, מסמן את ה־row `resolved` עם
  `applied_result_version`/actor/time, ומנקה את `requires_review`, `review_code`
  ו־`review_result_version` רק עבור הגרסה שהוכרעה. הוא מנקד רק ליגות שאינן
  `completed` ויוצר pending reconciliation רק לליגה מושלמת שכבר קיימת עבורה
  `league_match_snapshots(league_id, match_id)`. pgTAP מוכיח
  שהכרעה תקינה פותחת completion, בעוד actor זר, version stale/replay, provider
  version חדש ומירוץ review מול correction נשארים חסומים ואינם מנקים flags.
  לאחר האימות, `completeLeague` סוגרת את שתי קבוצות
  הבקשות ב־`rejected` עם `rejection_reason='LEAGUE_COMPLETED'`, decision
  metadata והעתק עברי ב־display layer, שומרת proofs/history, מוסיפה audit
  ומעבירה ל־`completed` פעם אחת בלבד.
- סדר הנעילות למוטציות lifecycle/membership/proof/scoring הוא:
  `catalog registry barrier (create/catalog/review discovery) → league advisory keys →
  leagues → profiles → join_requests(id) → payment_proofs(id) →
  league_members(id) → matches(id) → match_result_reviews(match_id, result_version) →
  league_match_snapshots(league_id, match_id) →
  league_match_reconciliations(id)`.
  ה־league advisory key הוא `(2026090609, hashtext(league_id::text))`; בריבוי
  ליגות ממיינים ומסירים כפילויות לפי מפתח ה־`int4`. כותב catalog שיכול
  להוסיף fixture והכרעת review שמגלה את ליגות העונה לוקחים קודם את מחסום
  ה־registry הבלעדי; `create_league` מחזיקה shared barrier. מוטציות lifecycle
  רגילות מדלגות עליו, ולכן ליגות שונות אינן serialized. מותר לדלג על שכבות
  שאינן רלוונטיות; טבלאות בעלות `id` ננעלות
  בסדר UUID, ושני המפתחות הזוגיים ננעלים בסדר לקסיקוגרפי. אסור לרכוש
  parent/שכבה מוקדמת אחרי child. rate-limit transaction הוא leaf path
  `profiles → join_requests` ואינו רוכש league לאחר מכן; finalize עובר
  `league → request → proof`; approve עובר `league → request → member`;
  completion עובר `league → requests → members/matches/reviews/snapshots`.
  `score_match` נשאר match-only, רשאי להוסיף match-review/reconciliation
  leaves לפי הסדר ואינו רוכש league לאחר מכן.
- כל מוטציית membership/proof שאיבדה את המירוץ ל־completion נכשלת באופן אטום;
  replay של completion אינו מכפיל reason/audit. real multi-session tests
  מוכיחים completion מול upload/finalize/approve/reject.
- correction אוטומטי אחרי completion משאיר points/report סופיים ללא שינוי
  ומוסיף idempotently רשומה ל־`league_match_reconciliations` עבור כל
  `(league_id, match_id, result_version)`, עם `id` UUID שמונפק בשרת, snapshot
  של status/scores, `pending/applied/dismissed`, actor/timestamps ו־unique
  constraint על השלשה. composite FK ‏`(league_id, match_id)` אל
  `league_match_snapshots` אוכף membership בסט הקפוא; match שנוסף אחרי completion
  אינו מקבל reconciliation ואינו יכול להיכנס לליגה גם בפעולה מפורשת.
  `reconcileCompletedLeague` של system admin מזהה את רשומת ה־review בלי
  לנעול אותה מוקדם ונכשל לפני delegate אם היא חסרה, לוקח את מפתח הליגה ואז
  קורא מחדש ומוודא שהרשומה עדיין קשורה לאותה ליגה תוך נעילת parent. שני
  המסלולים משלימים `league → match → snapshot → reconciliation` לפני delegate.
  במסלול apply הוא מחיל את ה־snapshot המפורש באותה נוסחת scoring; dismissal
  אינו משנה אותו. לפני apply או
  dismissal נבדקים שוב pending/version וקיום snapshot; מזהה שאינו בסט הקפוא
  נדחה כ־not-found/no-op אטום. אין queue בזיכרון או הסתמכות על `audit_logs`
  בלבד.
- `/members` טוען רשימת active מלאה, bounded ומדופדפת, תחת manager AuthZ;
  אין `removeMember` או reactivation Action ב־MVP.
- לפני migration/runtime, יש לסנכרן באותו implementation change את
  `docs/architecture.md` §10.2: ניסוח ה־base הנוכחי אומר overwrite בכל הליגות,
  ואילו S9-PDEC-003 דורש skip+review לליגה `completed`. זהו prerequisite
  תיעודי של REQ-001, לא החלטת מוצר נוספת ולא שינוי בקובץ architecture ב־PR זה.

#### חוזה capability של S9-DEF-003

`create_or_correct_match` מקבל system-admin מאומת, operation, stable create UUID
שהונפק בשרת או match ID קיים, season, שתי team IDs קיימות, round, kickoff UTC,
status ותוצאה לפי הסטטוס. create חוזר עם אותו UUID ואותו payload מחזיר אותה
רשומה ואותו audit outcome; payload שונה לאותו UUID נכשל בקוד יציב. יצירה/
תיקון ידניים מסמנים manual ownership עד `clearManualOverride`. `finished` לפני
DB kickoff נדחה; latch קיים אינו נפתח; שינוי season/teams נדחה כאשר קיימים
predictions או נעילה, ותיקון provider-owned אינו משנה provider identity. הוא
אינו מוסיף team CRUD ואינו generic DB editor; כל actor אחר נדחה.

במצב ההיסטורי שלפני DEF-003, orchestration החזירה `skipped/MANUAL_PROVIDER` לפני ש־fixtures של
ה־adapter מוחלים, ולכן Manual/Preview אינם יכולים לאכלס match חדש דרך sync.
S9-DEF-003 מבטל את ה־short-circuit: `ManualSportsProvider` עובר למסלול import
server-only חסום, bounded ואידמפוטנטי על גבי catalog/seed דטרמיניסטי עם UUIDs
קבועים. המקור הקנוני ל־`manual-catalog-v1` הוא חמשת matches ושש teams שב־
`supabase/migrations/20260815200600_slice5_manual_demo_fixtures.sql:5-69`.
לפני DEF-003, ה־payload שהיה ב־`src/features/sports/fixtures.ts` לא היה
importable: הוא השתמש ב־IDs לא־UUID, dates אחרים ו־live/finished ישנים. המימוש
הנוכחי ממפה בדיוק UUID/season/team/match/kickoff/status של ה־manifest הקנוני.
RPC ה־import מכניס רק row חסר; drift קיים בשדות הקבועים, provider-owned row,
latch, עונה `completed`/`archived` עם catalog חסר, או fixture חסר שמועדו הגיע
לפי זמן DB טרי נכשלים אטומית ואינם עושים overwrite.
prediction קיים אינו מפריע ל־catalog replay זהה; בגבול `create_or_correct_match`,
שינוי season/teams נחסם אם קיימים prediction או latch. בדיקת parity אחרי reset
משווה את כל שדות 5/5 ה־matches ו־6/6 ה־teams
בין adapter ל־DB, ומוכיחה שאין duplicate catalog או seed עתידי שהופך ל־live/
finished ישן. כל invocation תקין שהגיע ל־RPC אחרי בניית ה־payload השרתית יוצר
`sync_runs` סופי אחד; validation/config שנכשל לפני ה־RPC אינו invocation מסדי.
רק `MANUAL_APPLIED` יוצר business audit, ו־`MANUAL_NO_CHANGE` אינו מכפיל אותו.
`create_or_correct_match` נשאר escape
hatch מתוך teams קיימות. rows ידניות/סינתטיות נשארות ללא provider identity;
API-Football ממשיך לבצע upsert רק לפי `(external_provider, external_id)`. אסור
למזג או להצמיד team לפי display name; reconciliation מכוון בעתיד יהיה פעולה
מפורשת ומתועדת.

#### חוזה capability של S9-DEF-008

`clear_manual_match_override` מקבלת UUID משחק בלבד דרך gateway שרתי שמקבע את
actor ה־session המאומת ב־header פנימי. היא אינה granted ל־anon/authenticated
ואינה מקבלת actor, role, result, provider או flag מהדפדפן. רק match עם
`external_provider='api-football'` ו־external ID מספרי חיובי תקין יכול לעבור
מבעלות ידנית לבעלות ספק; row ידנית/סינתטית או provider אחר נדחים. ה־RPC דוגמת
את season, נועלת את כל ליגות העונה בסדר UUID, מחזיקה מחדש את actor ב־
`system_admins FOR KEY SHARE`, נועלת את ה־match ומוודאת שה־season לא השתנה.
שינוי ממשי נכשל סגור כאשר אחת מליגות העונה `completed`/`archived`, עד מסירת
reconciliation ב־W4.

ה־mutation היחידה היא `is_manually_overridden=false` ו־`updated_at` מזמן המסד.
ה־status, scores, `result_version`, external/provider metadata,
`predictions_locked_at` וכל שורות/metadata הניחושים נשארים ללא שינוי. רק clear
ראשון יוצר `match_manual_override_cleared`; replay מחזיר את אותה תמונת מצב עם
`result_cleared=false`, אינו מזיז timestamp ואינו מוסיף audit. אחרי commit,
apply מגודר של API-Football אינו מדלג עוד על ה־match וה־snapshot המאומת הבא
רשאי להחליף את התוצאה לפי החוזה הקנוני.

חובת ה־carry של S9-REQ-001/W4 נמסרה כך: כל מעבר completion או automatic
completion לוקח מפתח advisory דו־חלקי לפי league לפני עבודה על הליגה או על
קבוצת ה־matches שלה ושומר `league → matches`. כתיבת catalog שיכולה להוסיף
match, וגם הכרעת review שמגלה ליגות לפני scoring, משתמשות קודם במחסום registry
גלובלי צר, מגלות את כל הליגות המושפעות ואז לוקחות את מפתחותיהן; `create_league`
משתתפת במחסום shared כדי למנוע phantom.
מרוצי dblink אמיתיים מכסים completion-vs-missing-match וכן התקדמות בלתי תלויה
של save/completion בשתי ליגות. ה־guard של DEF-003 אינו תחליף ל־snapshot/
reconciliation הסופי.

#### Register מחייב וחשבון priorities

ה־register הפעיל למסירה כולל **25 רשומות שאינן decision-only: P1=7, P2=8,
P3=10**.

- P1: `S9-DEF-001`, `002`, `003`, `004`, ו־`S9-REQ-001`–`003`.
- P2: `S9-DEF-007`–`011`, `013`, ו־`S9-REQ-004`–`005`.
- P3: `S9-DEF-012`, `014`–`016`, `018`–`020`, `022`, `024`, `025`.

Dispositions שאינם נספרים שוב: `S9-DEF-005` מוזג ל־`S9-REQ-001`;
`S9-DEF-006` נסגר כהחלטת מוצר; `S9-DEF-017` הוא
`RESOLVED — ACCEPTED RESIDUAL RISK` פנימי;
`S9-DEF-021` נסגר כסתירת מסמכים והיכולת מוזגה ל־`S9-REQ-001`;
ה־traceability gap של MATCH-03 מוזג ל־`S9-DEF-003`; `S9-DEF-023` נסגר לאחר
הוספת [`docs/course-source.md`](./course-source.md) והכרעת `S9-TDEC-003`.
`S9-DEF-025` נסגר ב־28 באוגוסט 2026 לאחר שינוי Hosted target-only, ‏Preview
חדש, מטריצת names/scopes מסוננת, סריקות bundle/logs ותצפית Cron לקריאה בלבד.

#### דרישות Slice 9 מתוכננות

- `S9-REQ-001` — lifecycle מלא לפי ההחלטות לעיל. סדר התלות הוא
  `DEF-002→{DEF-003,DEF-008}→REQ-001`; acceptance כולל את כל guard/matrix/
  concurrency של DEF-005 ואת active-members list של DEF-021.
- `S9-REQ-002` — deck, demo script וחזרה מוכחת של 10–15 דקות.
- `S9-REQ-003` — final CI/deployment SHA, public incognito וגישת evaluator ל־GitHub.
- `S9-REQ-004` — חבילת מסמכי הגשה וספר פרויקט מסונכרנים.
- `S9-REQ-005` — Hosted password policy, ‏Security/Performance Advisor עם
  disposition לכל finding, representative plans ובקרות hardening. הראיות
  כוללות את acceptance של `S9-TDEC-004`: מדיניות password ב־Hosted תואמת
  למינימום שמונה תווים ולתקרת 72 בתים, בקרות rate/monitoring מתועדות ואין
  טענת leaked-password protection. ‏Native 200% ו־keyboard/contrast/touch
  שייכים ל־`S9-DEF-022`; scope סוד הספורט שייך ל־`S9-DEF-025`. כל אחת משלוש
  הרשומות מקבלת status עצמאי ואינה סוגרת את האחרות.

#### Technical decision ledger

| ID | מצב | owner/הכרעה |
| --- | --- | --- |
| `S9-TDEC-001` | `RESOLVED — ACCEPTED RESIDUAL RISK`, 26.8.2026 | repository owner (`talzantkeren`): המאגר נשאר פרטי ובתכנית הנוכחית; אין direct push ל־`main`; merge רק מ־PR שנבדק; נרשמים candidate SHA והצלחת `Lint, typecheck, unit tests and build`, `Supabase database tests` ו־`Playwright core flows` על אותו SHA, ואז מאומתים Production commit, immutable URL וה־alias. rationale: single-maintainer course repo ו־API 403. reopen: collaborator/visibility/plan משתנים, ניסיון direct push, control failure או דרישת evaluator |
| `S9-TDEC-002` | `RESOLVED`, 26.8.2026 | `SPORTS_API_KEY` הוא Production-only; Production היא `api-football`, ו־Preview/Local/CI הם Manual ללא key וללא live canary. בידוד מכסה בין credentials אינו מאומת ואין רכישת subscription נוסף רק ל־Preview. שינוי Hosted והראיות אומתו ב־DEF-025 ב־28.8.2026 |
| `S9-TDEC-003` | `RESOLVED`, 26.8.2026 | נשמר manifest provenance ב־[`docs/course-source.md`](./course-source.md); ה־PDF המדויק נמסר בנפרד ולא נכלל ב־Git ללא הרשאת redistribution מפורשת |
| `S9-TDEC-004` | `RESOLVED — ACCEPTED RESIDUAL RISK`, 26.8.2026 | אין שדרוג plan רק עבור leaked-password protection ואין lookup בצד הלקוח; validation של שמונה תווים לפחות ועד 72 בתים בקידוד UTF-8, rate limits, recovery enumeration-safe אחרי DEF-001, monitoring ו־Demo-only הם mitigations. מדיניות Hosted ו־Advisor אומתו ב־REQ-005 ב־28.8.2026. reopen triggers: plan מתאים מסיבה אחרת, נתונים רגישים יותר, incident/credential-stuffing evidence או דרישת evaluator |

כל ארבע ההחלטות הטכניות סגורות ואפס פתוחות. אין להפוך את המאגר לציבורי, לרכוש
plan רק עבור `S9-TDEC-004` או להפעיל canary ספק חי ב־Preview. שינוי scope של
Vercel וראיית password/Advisors אומתו ב־28.8.2026 תחת `S9-DEF-025` ו־
`S9-REQ-005`. Branch control, Preview
Auth, custom SMTP ו־leaked-password protection הם gates פנימיים ואינם מיוחסים
ישירות למסמך הקורס.

**כלל release:** אפס P0/P1 פתוחים, ואין P2 ללא תיקון או waiver כתוב שאושר על
ידי owner וכולל תאריך, rationale, mitigation ו־revisit deadline. green CI לבדו
אינו עוקף את הכלל. כל blocker נסגר ב־regression המוגדר ברשומת ה־audit וב־
Hosted/manual evidence כאשר הרשומה דורשת זאת.

**Exit:** כל `S9-DEF-*` ו־`S9-REQ-*` קיבל disposition סופי לפי הכלל לעיל,
ארבע ההחלטות הטכניות נשארות סגורות וה־Hosted/manual acceptance שלהן הושלם;
Definition of Done בסעיף 18; verify מלא ו־clean clone על candidate אחד; CI,
Preview ו־Production קשורים לאותו SHA; מצגת ודמו עברו rehearsal; וביקורת
שחרור סופית חדשה החזירה release verdict מתאים.

## 16. לוח זמנים מוצע

| תאריכים | יעד |
| --- | --- |
| עד 24 באוגוסט | Slices 0–7b, Hosted canary ומימוש מקומי של Slice 7c — הושלמו |
| 25 באוגוסט | Preview ואישור חזותי של Slice 7c |
| 25–29 באוגוסט | Slice 8 — דוח מנהל לא־כספי |
| 30 באוגוסט–3 בספטמבר | Slice 9 — סגירת lifecycle, Hardening ומסמכי הגשה |
| 4–5 בספטמבר | תיקוני blocker, rehearsal ו־submission checklist |
| 6 בספטמבר | הגשה |

המסמכים והבדיקות נכתבים בכל slice; התאריכים האחרונים הם השלמה ואימות, לא התחלה שלהם.

## 17. מדיניות חיתוך היקף

אם הלו"ז מחליק, חותכים לפי הסדר:

1. provider אוטומטי. גם אם הוא נחתך, נשארים catalog/seed דטרמיניסטיים,
   `ManualSportsProvider` שמגיע למסלול persistence חסום ו־
   `create_or_correct_match` של system admin מתוך teams קיימות. Manual sync אינו
   רשאי להישאר `skipped` אחרי DEF-003, ואין להציג result-only override כ־
   fallback מלא.
2. הרחבות דוח כגון export, BI או charts; נשארים הסיכום והדירוג הנכונים.
3. אנימציות, וריאציות ויזואליות ואיורים שאינם נדרשים לבהירות.

לא חותכים:

- AuthN/AuthZ ו־RLS.
- העלאת קובץ בטוחה או פרטיות.
- ניחוש, נעילה והסתרה.
- `points`, ניקוד אידמפוטנטי ודירוג.
- זרימת ה־lifecycle המינימלית `startLeague`/`completeLeague`, שנדרשת כדי
  להדגים `active`/`completed` ואת REPORT-05 דרך המוצר ולא דרך fixture מסד.
- בדיקות לזרימות המרכזיות.
- שפה חזותית עקבית, RTL, מובייל, focus ונגישות במסכי הליבה.
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
| provenance של מקור הקורס | `docs/course-source.md`; ה־PDF המדויק נמסר בנפרד בערוץ הרשמי |
| הוראות הרצה ומשתני סביבה | `README.md`, `.env.example` |
| Vercel URL ו־GitHub | `README.md` ועמוד ההגשה |
| מצגת 10–15 דקות | `presentation/` או קישור מצורף להגשה |

## 20. המשימה הבאה לסוכן הקידוד

Slice 8 — דוח מנהל לא־כספי — הושלם ב־25 באוגוסט 2026. המשימה הבאה היא
**Slice 9 — lifecycle, היכולות המחייבות שחשפה הביקורת, Hardening, מסמכים
והצגה**, בגבולות הסעיף לעיל. אין להוסיף יכולת שאינה ב־register, AI או מנגנון
כספי, ואין להתחיל runtime לפני אישור audit PR זה.

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
