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

## Vercel — baseline היסטורי בלבד

ה־Preview שנצפה קודם היה deployment
`dpl_Cjza13KogKyyLMbZr972AU5DmbY3`, immutable
`predictor-mew7uo1y9-tals-projects-19902e47.vercel.app`, READY/HTTP 200. הוא
אינו final SHA.

ה־Production שנצפה קודם היה deployment
`dpl_VtykjW3xjXJcjmpCjH25wZTBP3xn`, immutable
`predictor-2r75rqica-tals-projects-19902e47.vercel.app`, READY/HTTP 200. ה־200
הוא smoke היסטורי ואינו מוכיח Production parity ל־`<final-sha>`.

## מטריצת env ללא ערכים

בצילום read-only הקודם נמצא `SPORTS_API_KEY` ב־scope
`preview,production`. S9-DEF-025 מצמצם זאת לפעולת owner יחידה: להסיר Preview
בלי Reveal/Copy. מטריצת blank values וגבולות Local/CI כבר נבדקו. אחרי הפעולה,
S9-REQ-003 דורש snapshot סופי של names/scopes בלבד.

## migrations מקומיות

ה־reset והבדיקה המקומיים החילו 36 migrations עד `20260827180000`. לא בוצעה
פנייה ל־linked Supabase. ה־owner ישווה ב־SQL Editor את עמודת `version` בלבד מול
קובצי Git, וישמור parity מצונזר על אותו `<final-sha>`.

## שער owner היחיד

| שער | פעולה מדויקת | סטטוס |
| --- | --- | --- |
| Final Production and evaluator closeout | לבצע ברצף את `docs/runbooks/slice-9-req-003-final-production-review.md`: להקפיא SHA ו־Draft PR, לקשור אליו CI ירוק, להוכיח Hosted migrations/env scopes, לקדם את אותו SHA ל־Production, לאמת immutable+alias ב־incognito Demo-only, ולהשיג אישור evaluator לקריאת המאגר הפרטי | OWNER_ACTION_REQUIRED |

התבנית הריקה נמצאת ב־
`docs/evidence/slice-9/w8/S9-REQ-003-owner-template.md`. אין לסמן את הרשומה
VERIFIED לפני שכל הראיות מתייחסות לאותו SHA. PR #14 לא ימוזג, לא יסומן Ready,
לא יאושר ולא יקבל auto-merge במסגרת הפעולה.
