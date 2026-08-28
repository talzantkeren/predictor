# פנקס ראיית הגשה סופית

Status: `OWNER_ACTION_REQUIRED`.

המסמך מפריד בין CI אמיתי שנצפה, עובדות read-only היסטוריות, ובין שער
Production/evaluator יחיד שחייב owner אנושי. אין כאן credential, ערך env, זהות
evaluator או claim על Hosted שלא נצפה. Draft PR #14 נשאר פתוח, Draft ולא ממוזג.

```text
Final candidate SHA: <final-sha>
Final CI run: <final-run-id>
Final Production SHA: <final-sha>
Evaluator access: OWNER_ACTION_REQUIRED
Hosted migration parity: OWNER_ACTION_REQUIRED
```

## GitHub Actions — הכשל האמיתי והתיקון שנצפו

Billing/spending blocker: RESOLVED. לאחר הסרת החסימה, run
`33090719466`, attempt 2, רץ בפועל על
`e791f361444eb524099eddebdea1c92d6a3a0cc3` והסתיים `failure`:

| job | תוצאה | משך |
| --- | --- | --- |
| `Lint, typecheck, unit tests and build` | success | 1m24s |
| `Supabase database tests` | success | 3m46s |
| `Playwright core flows` | failure | 12m12s |

ב־Playwright עברו 28 tests, אך log ה־runner דיווח
`The destination stream closed early`; לכן ה־run אינו PASS. תוקן lifecycle של
response streams והתווספה regression שמוכיחה סדר סגירה בטוח.

על SHA המתוקן `223de65f083fcbf954c082c6e83c6df2ed14bdca` נצפו שני runs מלאים ירוקים:

| run | trigger | quality | database | Playwright | overall |
| --- | --- | --- | --- | --- | --- |
| `33097585902` | push | success 1m28s | success 4m35s | success 13m22s | success |
| `33097590476` | pull request | success 1m25s | success 3m49s | success 13m15s | success |

שמות ה־jobs בכל אחד: `Lint, typecheck, unit tests and build`,
`Supabase database tests`, `Playwright core flows`. תוצאות אלו מוכיחות את
התיקון, אך אינן מחליפות CI ירוק על `<final-sha>` לאחר commit המסירה האחרון.

פקודת אימות read-only לסגירה:

```powershell
gh run view <final-run-id> --json databaseId,attempt,headSha,status,conclusion,jobs,url
gh pr view 14 --json number,isDraft,state,headRefOid,mergeStateStatus,url
```

## Vercel — תצפיות שאינן final Production

לאחר תיקון S9-DEF-025 הופעל redeploy מפורש ל־Preview על source
`2fc9a36ed5e8adc101ebef6c4a42796a0abe5690`. הפריסה הגיעה ל־READY בתוך דקה
ועברה public smoke ‏4/4 ב־Manual ללא Sports key. מזהי project/deployment,
aliases וכתובות אינם נשמרים במסמך זה. לא הופעלה או קודמה פריסת Production;
לכן התצפית אינה מוכיחה Production parity ל־`<final-sha>`.

## מטריצת env ללא ערכים

S9-DEF-025 נסגר ב־28 באוגוסט 2026 באמצעות target-only update לרשומה הקיימת,
בלי לקרוא, למשוך, להדפיס או לשלוח value. זו המטריצה המסוננת הנוכחית; אין בה
עמודת value או fragment של value:

| Variable name | Environment | Classification | Scope |
| --- | --- | --- | --- |
| `SPORTS_API_KEY` | Production | Sensitive | Production only; all branches |
| `SPORTS_API_KEY` | Preview | Not present | No Preview or branch-specific association |
| `SPORTS_API_KEY` | Local | Not present | Manual configuration; no key |
| `SPORTS_API_KEY` | CI | Not present | Manual workflow; no key entry |
| `SPORTS_API_PROVIDER` | Production | Sensitive | Production only; all branches |
| `SPORTS_API_PROVIDER` | Preview | Not present | No Preview or branch-specific association |
| `SPORTS_API_PROVIDER` | Local | Local configuration | Local scope only |
| `SPORTS_API_PROVIDER` | CI | Workflow configuration | CI scope only |

תצפית runtime נפרדת אישרה ש־Preview, ‏Local ו־CI בוחרים במסלול Manual ללא
key וללא קריאת provider חי. S9-REQ-003 עדיין דורש snapshot סופי של
names/scopes בלבד על ה־final SHA; הוא
אינו מחזיר את Preview scope ואינו דורש Reveal/Copy של key.

## migrations מקומיות

ה־reset האחרון החיל 39 migrations עד `20260827200000`. במהלך S9-REQ-005
נבדקה רשימת Hosted והוחלה בבידוד רק migration ההקשחה
`20260825000000_revoke_rls_event_trigger_rpc_access.sql`; לאחריה נצפו 20
migrations מרוחקות, בעוד 19 migrations של Slice 9 נשארו local-only במכוון.
לא בוצע linked reset ולא נעשה ניסיון לסגור את S9-REQ-003. לאחר merge ה־owner
ישווה את עמודת `version` בלבד מול קובצי Git וישמור parity מצונזר על אותו
`<final-sha>`.

## שער owner היחיד

| שער | פעולה מדויקת | סטטוס |
| --- | --- | --- |
| Final Production and evaluator closeout | לבצע ברצף את `docs/runbooks/slice-9-req-003-final-production-review.md`: להקפיא SHA ו־Draft PR, לקשור אליו CI ירוק, להוכיח Hosted migrations/env scopes, לקדם את אותו SHA ל־Production, לאמת immutable+alias ב־incognito Demo-only, ולהשיג אישור evaluator לקריאת המאגר הפרטי | OWNER_ACTION_REQUIRED |

התבנית הריקה נמצאת ב־
`docs/evidence/slice-9/w8/S9-REQ-003-owner-template.md`. אין לסמן את הרשומה
VERIFIED לפני שכל הראיות מתייחסות לאותו SHA. PR #14 לא ימוזג, לא יסומן Ready,
לא יאושר ולא יקבל auto-merge במסגרת הפעולה.
