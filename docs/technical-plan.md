# Predictor1 — תכנית טכנית מפורטת

| שדה | ערך |
| --- | --- |
| גרסה | 2.0 |
| תאריך עדכון | 11 באוגוסט 2026 |
| סטטוס | Ready for implementation |
| דדליין | 6 בספטמבר 2026 |

## 1. מטרת המסמך

מסמך זה מתרגם את [`product.md`](./product.md) ואת [`architecture.md`](./architecture.md) לתכנית מימוש שאפשר לבצע לפי סדר. הוא מכסה את מבנה התיקיות, הקומפוננטות, בסיס הנתונים, CRUD, פעולות שרת, APIs, state, validation, שגיאות, UX, בדיקות, פריסה ותוצרי הקורס.

זה אינו מסמך ארכיטקטורה נוסף. אם נדרש שינוי גבול מערכת, טכנולוגיה, מודל נתונים מהותי או חוק עסקי — מעדכנים קודם את המסמך הקנוני המתאים.

## 2. מצב התחלתי ושערי התחלה

נכון למועד כתיבת המסמך טרם קיים קוד אפליקציה במאגר. לפני פיצ'ר ראשון יש להשלים:

1. מאגר GitHub פרטי/ציבורי לפי דרישות הקורס, עם branch `main` מוגן ככל האפשר.
2. פרויקט Supabase hosted עבור Production.
3. פרויקט Vercel המקושר למאגר.
4. סביבת Node.js בגרסה 20.9 ומעלה.
5. Docker Desktop לצורך Supabase local development, אם המחשב תומך; אחרת migrations נבדקות בפרויקט development נפרד ולא ב־Production.
6. החלטת POC מתועדת לגבי Sports provider. כשל POC מפעיל מיד `ManualSportsProvider` ו־seed — הוא לא עוצר פיתוח.
7. `DEMO_MODE=true` בפריסה הציבורית. אין תשלום, פרס כספי או מסמך פיננסי אמיתי.

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
| `test:e2e` | `playwright test` |
| `types:db` | יצירת `src/types/database.generated.ts` מה־DB המקומי |
| `verify` | lint → typecheck → unit → DB → build; E2E ב־CI job נפרד |

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
│   ├── league-join.spec.ts
│   ├── prediction-lock.spec.ts
│   └── scoring.spec.ts
├── public/
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   ├── page.tsx
│   │   │   └── invite/[token]/page.tsx
│   │   ├── (auth)/auth/
│   │   │   ├── sign-in/page.tsx
│   │   │   ├── sign-up/page.tsx
│   │   │   └── forgot-password/page.tsx
│   │   ├── (app)/
│   │   │   ├── dashboard/page.tsx
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
│   │   ├── auth/callback/route.ts
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
- `SUPABASE_SECRET_KEY`, `CRON_SECRET`, מפתחות ספק וסיסמת DB אינם מופיעים ב־client bundle, logs או Git. עותק ה־Cron לסביבת Supabase נשמר ב־Vault אחרי ה־deploy, לא ב־migration.
- `env.ts` מאמת env בצד שרת עם Zod ונכשל בזמן startup כאשר ערך חובה חסר.
- `admin.ts` כולל `import 'server-only'` ונבדק בבדיקת import boundary.

## 5. תכנית migrations

שמות הקבצים כוללים timestamp אמיתי בעת יצירתם. הסדר הלוגי:

| Migration | תוכן | תנאי סיום |
| --- | --- | --- |
| 001 `extensions_and_enums` | extensions, enums ו־default privileges | reset מקומי מצליח |
| 002 `identity` | `profiles`, `system_admins`, trigger פרופיל ו־RLS | משתמש רואה/מעדכן רק המותר |
| 003 `sports_core` | competitions, seasons, teams, matches, indexes ו־RLS | seed של מחזור נטען |
| 004 `leagues` | leagues, scoring rules, prize rules, invite links, `create_league` ו־RLS | יצירה אטומית; סכום פרסים וחוקי ניקוד תקינים |
| 005 `membership_and_proofs` | join requests, members, proofs, bucket, policies ופונקציות החלטה | אישור כפול אידמפוטנטי |
| 006 `predictions_and_scoring` | predictions, policies, `score_match`, leaderboard view | כל מטריצת הניקוד עוברת |
| 007 `operations_and_ai` | analyses, sync runs, audit, rate-limit events | הרשאות ו־cleanup מוגדרים |
| 008 `seed_current_season` | נתוני בסיס ידניים/fixture מאומת | האפליקציה עובדת ללא ספק חיצוני |

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

### 6.2 זהות

#### `profiles`

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `display_name text not null` — 2–50 תווים אחרי trim.
- `created_at`, `updated_at timestamptz`.
- משתמש יכול לעדכן רק `display_name` של עצמו.

#### `system_admins`

- `user_id uuid primary key references auth.users(id)`.
- `granted_by uuid`, `granted_at timestamptz`.
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

- `id`, `league_id`, `token_hash text unique`, `status`, `expires_at`, `created_by`, timestamps.
- token גולמי נוצר ב־crypto random, מוחזר פעם אחת ואינו נשמר.

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

#### `league_leaderboard` View

מתחיל מכל `league_members` הפעילים ומבצע `LEFT JOIN` לניחושים, כדי להחזיר גם חבר ללא ניחושים עם 0. הוא מחזיר per league/member:

- `total_points`.
- `correct_outcomes`.
- `exact_scores`.
- `predictions_submitted`.
- `rank()` לפי points ואז correct outcomes. אין `dense_rank()`: שני חברים במקום 1 גורמים למקום הבא להיות 3, בהתאם לחלוקת מקומות הפרס.

ה־View הוא `security_invoker` במידת התמיכה, או query מוגנת שלא עוקפת RLS. אין `SECURITY DEFINER VIEW` חשופה.

### 6.7 תפעול ו־AI

#### `ai_match_analyses`

- `match_id primary key`, `content jsonb`, `provider`, `model`.
- `data_as_of`, `generated_at`, `source_result_version`.
- content נכתב רק אחרי Zod validation.

#### `sync_runs`

- `id`, `provider`, `status`, `started_at`, `finished_at`.
- `fixtures_seen`, `matches_changed`, `results_changed`, `error_code`, `error_message_safe`.

#### `audit_logs`

- `id`, `actor_id`, `action`, `entity_type`, `entity_id`, `metadata jsonb`, `created_at`.
- append-only; metadata ללא secret או קובץ.

#### `rate_limit_events`

- `id`, `user_id`, `action`, `created_at`.
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

1. caller הוא secret/system operation בלבד.
2. lock על match.
3. validation של score/status.
4. עדכון result ו־version רק כאשר השתנו.
5. set-based overwrite של כל prediction fields לפי חוקי כל ליגה.
6. canceled מאפס נקודות ומסמן flags false בלי למחוק תחזיות.
7. audit תוצאה ותיקון.
8. commit אחד.

`SECURITY DEFINER` functions משתמשות ב־`set search_path = ''`, שמות schema מלאים והרשאות EXECUTE מצומצמות.

## 8. CRUD ופעולות אפליקטיביות

| Domain | Create | Read | Update | Delete/Deactivate |
| --- | --- | --- | --- | --- |
| Profile | trigger בהרשמה | self/shared-league | display name של עצמי | דרך מחיקת Auth בעתיד |
| League | `createLeague` | member/manager | `updateLeagueSettings` | archive, לא hard delete |
| Scoring rules | עם הליגה | member/manager | manager לפני lock | אין delete |
| Prize rules | עם הליגה | member/manager | manager לפני completion | replace transactionally |
| Invite | `createInvite` | manager; resolve token בשרת | אין edit token | `revokeInvite` |
| Join request | `submitJoinRequest` | owner/manager | decision functions | אין delete |
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
| `createInvite` | league id + expiry | invite service | raw token פעם אחת |
| `revokeInvite` | invite id | invite service | link disabled |
| `submitJoinRequest` | invite token | membership service | status `pending_proof` |
| `approveJoinRequest` | request id | RPC approve | member active |
| `rejectJoinRequest` | request id + reason | RPC reject | request rejected |
| `savePrediction` | league, match, two scores | user-client upsert + RLS | saved timestamp |
| `removeMember` | league + member | membership service | status removed + audit |
| `applyManualResult` | match + result/status | `score_match` via admin client | result and ranking updated |
| `completeLeague` | league id | report/league service | final report read-only |

כל action מגדיר schema קלט, בודק session ומשאב, ואינו מקבל actor/user id סמכותי מהלקוח.

## 10. Route Handlers

### 10.1 `POST /api/join-requests/[requestId]/proofs`

הקובץ מגדיר `export const runtime = 'nodejs'`.

1. reject אם `DEMO_MODE` אינו מוגדר כמצופה בפריסת הקורס או אם המשתמש אינו owner של בקשה מתאימה.
2. בדיקת Origin/Host, session, rate limit ו־`Content-Length` עד 4,250,000 bytes מוקדם ככל האפשר.
3. קובץ יחיד, עד 4,000,000 bytes, allowlist JPEG/PNG/WebP.
4. בדיקת extension, MIME ו־magic bytes.
5. `sharp` עם `limitInputPixels: 20_000_000`, resize בתוך 2000×2000 ללא הגדלה, הסרת metadata ו־encode ל־WebP.
6. חישוב hash, upload ל־private bucket ו־insert metadata.
7. אם insert נכשל אחרי upload, מחיקת orphan object; אם upload נכשל, אין רשומת DB.
8. status הבקשה עובר ל־`pending_approval` באותה orchestration עם audit.

### 10.2 `GET /api/payment-proofs/[proofId]`

1. session.
2. lookup metadata לפי proof id.
3. AuthZ: uploader, manager של הליגה או system admin.
4. signed URL ל־60 שניות והפניית 302, או JSON רק אם ה־UI דורש.
5. `Cache-Control: private, no-store`.

### 10.3 `POST /api/cron/sync`

1. secret, method ו־content-type צפויים; ה־job קורא את הסוד מ־Supabase Vault והוא תואם ל־`CRON_SECRET` ב־Vercel.
2. advisory lock.
3. due-window check.
4. adapter call עם timeout.
5. upsert + `score_match` + sync log.
6. תשובה קצרה ללא נתונים רגישים.

### 10.4 `POST /api/matches/[matchId]/analysis`

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
| `STATE_CONFLICT` | 409 | המידע השתנה; רענון |
| `RATE_LIMITED` | 429 + retry hint | נסה מאוחר יותר |
| `UPLOAD_REJECTED` | 400/413/415 | סוג/גודל קובץ לא תקין |
| `PROVIDER_UNAVAILABLE` | 503 או fallback | נתונים אחרונים מוצגים |
| `INTERNAL_ERROR` | 500 + request id | אירעה שגיאה; ללא פרטים טכניים |

לוגים מסננים Email, tokens, secrets, signed URLs, proof paths ותוכן אסמכתאה.

## 14. אסטרטגיית בדיקות

### 14.1 Vitest

בודקים מודולים טהורים:

- outcome classification כולל תיקו.
- טבלת 3/1/0 וחוקי ניקוד מותאמים שונים בשתי ליגות.
- prize split במקומות משותפים.
- Zod schemas ומקרי גבול.
- adapter mapping מ־fixtures מוקלטים.
- cache freshness ו־AI fallback.

Async Server Components אינם יעד ל־Vitest; בודקים את ה־Service/queries בנפרד ואת העמוד ב־Playwright.

### 14.2 pgTAP / DB integration

- כל טבלה קיימת עם RLS enabled.
- grants ופונקציות EXECUTE מצומצמים.
- משתמש A אינו קורא/כותב נתוני משתמש B או ליגה זרה.
- prediction מותר לפני kickoff ונדחה ב־/אחרי kickoff לפי DB time.
- visibility לפני/אחרי kickoff.
- unique constraints תחת concurrency.
- approve/reject atomicity ו־idempotency.
- `score_match`: מדויק, בית, חוץ, תיקו, טעות, canceled, retry ותיקון תוצאה.
- שתי ליגות עם חוקי ניקוד שונים מקבלות `points` שונים לאותו משחק.

### 14.3 Playwright

זרימות חובה:

1. הרשמה → login → logout → password reset smoke.
2. מנהל יוצר ליגה עם חוקים ופרסים.
3. משתמש פותח invite, מעלה תמונת Demo והמנהל מאשר.
4. משתמש לא מאושר מנסה URL/API ישיר ונדחה.
5. שני חברים מנחשים; לפני פתיחה אין חשיפה, אחרי פתיחה יש.
6. שמירה לפני/אחרי נעילה.
7. מנהל מערכת מזין תוצאה; דירוג ושוויון מתעדכנים.
8. proof ID של בקשה אחרת אינו נגיש.
9. AI provider mocked נופל והניחוש עדיין עובד.

### 14.4 Contract tests

- Sports provider נבדק מול JSON fixtures שנשמרו לאחר ה־POC.
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

**תוצר:** sign-up/in/out/reset, profile ו־protected dashboard.

- publishable key clients, SSR cookies ו־`src/proxy.ts`.
- identity migration + RLS + pgTAP.
- E2E auth smoke.
- README local setup ראשוני.

**Exit:** session עובד ב־Local וב־Vercel; משתמש אינו מעדכן פרופיל זר.

### Slice 2 — יצירת ליגה, ניקוד ופרסים

**תוצר:** מנהל יוצר ליגה תקינה עם חוקי ניקוד ופרסי Demo.

- league migrations/policies.
- form, schemas, service ו־Action.
- `create_league` RPC אטומי שמוסיף את היוצר גם כחבר פעיל.
- סכום פרסים 10000 bps.
- נעילת scoring rules לאחר התחלה נבדקת ב־DB/Service.

**Exit:** כשל חלקי אינו משאיר ליגה; היוצר חבר פעיל; משתמש אחר אינו משנה ליגה; שתי ליגות יכולות להחזיק חוקים שונים.

### Slice 3 — Invite, בקשה ו־upload מאובטח

**תוצר:** קישור הזמנה, בקשה, upload Demo פרטי וסטטוס.

- token hash, lifecycle ו־expiry.
- private bucket ו־Storage RLS.
- Node runtime, hard byte/pixel limits, re-encode, hash ו־history.
- signed access route.
- unit/DB tests לקבצים והרשאות.

**Exit:** SVG/exe/oversize נדחים; IDOR proof נכשל; אין bucket ציבורי.

### Slice 4 — החלטת מנהל וחברות

**תוצר:** manager queue, צפייה מורשית, approve/reject וחברות פעילה.

- RPCs, audit ו־unique constraints.
- concurrency tests.
- E2E join flow.

**Exit:** אישור כפול מייצר חבר אחד; מנהל ליגה זרה נדחה.

### Slice 5 — משחקים ידניים, ניחושים ונעילה

**תוצר:** seed/מסך משחקים, save prediction, lock ו־visibility.

- sports core migrations ו־seed ליגת העל ככל שהמידע מאומת.
- round/date pages.
- prediction Action, policy ו־countdown.
- boundary tests ו־two-user E2E.

**Exit:** DB מכריע את גבול הזמן; ניחושי אחרים מוסתרים לפני הפתיחה.

### Slice 6 — תוצאות, ניקוד ודירוג

**תוצר:** manual result → atomic scoring → standings → prize split.

- `score_match`, result versions ו־leaderboard view.
- unit/pgTAP matrix מלאה כולל שתי ליגות עם חוקים שונים.
- correction/cancel flows.

**Exit:** retry אינו משנה נקודות; correction מחשב מחדש; tie rules מדויקים.

### Slice 7 — Sports Sync אמיתי או adapter ידני סופי

**תוצר:** sync logs, override, Cron ו־admin status.

- provider adapter לפי POC, contract fixtures ו־timeout.
- Cron secret ב־Supabase Vault וב־Vercel, due-window ו־advisory lock.
- manual override.

**Exit:** כפילות ריצה בטוחה; ספק שנופל אינו פוגע בנתונים הקיימים. אם POC נכשל, ה־slice נסגר עם Manual provider מתועד.

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

## 20. המשימה הראשונה לסוכן הקידוד

המשימה הבאה היא **Slice 0 בלבד**:

1. ליצור scaffold של Next.js 16 עם strict TypeScript.
2. להגדיר scripts, env validation, Supabase clients skeleton ו־`src/proxy.ts`.
3. לאתחל Supabase migrations בלי טבלאות מוצר מעבר ל־foundation הנדרש.
4. להוסיף CI בסיסי ו־health/home page.
5. לפרוס ל־Vercel.
6. ליצור `SportsProvider` + `ManualSportsProvider` ו־POC script נפרד.
7. לתעד תוצאות POC; לא להתחיל sync production בלי מעבר השער.

אין להתחיל ליצור את כל הטבלאות או כל המסכים בבת אחת. Slice 0 חייב להיות deployable, בדוק ומובן לפני Slice 1.

## 21. מקורות טכניים — אומתו ב־11 באוגוסט 2026

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
