# פנקס ראיית הגשה סופית

Status: `OWNER_ACTION_REQUIRED`.

מסמך זה מפריד בין עובדות read-only שנצפו ב־27 באוגוסט 2026 לבין שערים שניתן
לסגור רק אחרי שה־candidate הסופי קיים. אין בו credential, ערכי env, זהות
evaluator או טענת Hosted שלא נצפתה. Draft PR #14 נשאר Draft, פתוח ולא ממוזג.

## זהות סופית — טרם קיימת

```text
Final candidate SHA: <final-candidate-sha>
Final Production SHA: <final-production-sha>
Evaluator access: OWNER_ACTION_REQUIRED
Hosted migration parity: OWNER_ACTION_REQUIRED
```

ה־checkpoint האחרון שנבדק לפני יצירת מסמך זה היה
`f1bf854e74233acb076152a8952c24373e1eec3a`. הוא אינו final SHA משום ש־W8
עדיין בתהליך והמסמך עצמו יוצר commit נוסף.

## GitHub ו־CI שנצפו

```text
PR: #14
state: OPEN
isDraft: true
base: main @ 9fc73e425f0b9f9e0acb07e403ffdd3daaa2be0d
head checkpoint: feature/slice-9-implementation @ f1bf854e74233acb076152a8952c24373e1eec3a
repository visibility: PRIVATE
```

שני runs של CI על checkpoint זה לא התחילו את עבודת lint/build, DB או
Playwright. annotation של GitHub היה:

```text
The job was not started because recent account payments have failed or your spending limit needs to be increased.
```

לכן אין CI PASS על checkpoint זה. התוצאות המקומיות אינן מחליפות required
checks ב־GitHub. ה־owner חייב להסדיר Billing/Spending limit ולהריץ מחדש על
`<final-candidate-sha>` בלי לשנות או לדלג על workflow.

## Vercel שנצפה

### Preview של checkpoint

```text
GitHub Vercel check: PASS
deployment id: dpl_Cjza13KogKyyLMbZr972AU5DmbY3
immutable URL: predictor-mew7uo1y9-tals-projects-19902e47.vercel.app
alias: predictor-git-feature-slice-9-imp-51f991-tals-projects-19902e47.vercel.app
target/state: preview / READY
immutable URL + alias anonymous HTTP: 200
api/cron/sync timeout observed: 60 seconds
```

ה־GitHub status check קשר את deployment ל־checkpoint head. ה־timeout של 60
שניות אינו עומד בחוזה המקומי של 120 שניות ונשאר חלק מפעולת owner של Hosted
Cron; Preview READY אינו סוגר אותה.

### Production הנוכחי

```text
deployment id: dpl_VtykjW3xjXJcjmpCjH25wZTBP3xn
immutable URL: predictor-2r75rqica-tals-projects-19902e47.vercel.app
alias: predictor-swart.vercel.app
target/state: production / READY
immutable URL + alias anonymous HTTP: 200
api/cron/sync timeout observed: 300 seconds
```

`vercel inspect` לא החזיר Git SHA ל־Production, והפריסה לא נוצרה מן
`<final-candidate-sha>`. לכן 200/READY הם smoke נוכחי בלבד. אין ראיה שה־alias,
ה־immutable URL ו־Production מצביעים ל־final candidate.

## מטריצת שמות env שנצפתה — ללא ערכים

הפקודה read-only `vercel env ls --json` סוננה לפני תיעוד לשדות
`key/type/target/gitBranch` בלבד.

| שם | type | target | gitBranch | מצב |
| --- | --- | --- | --- | --- |
| `CRON_SECRET` | sensitive | production | — | נצפה |
| `DEMO_MODE` | sensitive | preview,production | — | נצפה |
| `DEMO_MODE` | sensitive | preview | feature/slice-3-join-and-proofs | historical; owner cleanup |
| `DEMO_MODE` | encrypted | preview | feature/slice-5-matches-and-predictions | historical; owner cleanup |
| `NEXT_PUBLIC_APP_URL` | sensitive | preview,production | — | נצפה |
| `NEXT_PUBLIC_APP_URL` | sensitive | preview | feature/slice-3-join-and-proofs | historical; owner cleanup |
| `NEXT_PUBLIC_APP_URL` | encrypted | preview | feature/slice-5-matches-and-predictions | historical; owner cleanup |
| `NEXT_PUBLIC_SUPABASE_URL` | sensitive | preview | — | נצפה |
| `NEXT_PUBLIC_SUPABASE_URL` | sensitive | production | — | נצפה |
| `NEXT_PUBLIC_SUPABASE_URL` | sensitive | preview | feature/slice-3-join-and-proofs | historical; owner cleanup |
| `NEXT_PUBLIC_SUPABASE_URL` | encrypted | preview | feature/slice-5-matches-and-predictions | historical; owner cleanup |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sensitive | preview | — | נצפה |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sensitive | production | — | נצפה |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sensitive | preview | feature/slice-3-join-and-proofs | historical; owner cleanup |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | encrypted | preview | feature/slice-5-matches-and-predictions | historical; owner cleanup |
| `SUPABASE_SECRET_KEY` | sensitive | preview | — | נצפה |
| `SUPABASE_SECRET_KEY` | sensitive | production | — | נצפה |
| `SUPABASE_SECRET_KEY` | sensitive | preview | feature/slice-3-join-and-proofs | historical; owner cleanup |
| `SUPABASE_SECRET_KEY` | sensitive | preview | feature/slice-5-matches-and-predictions | historical; owner cleanup |
| `SPORTS_API_KEY` | sensitive | preview,production | — | לא תקין: להסיר Preview בלי לקרוא ערך |
| `SPORTS_API_PROVIDER` | sensitive | production | — | נצפה |
| `SYNC_SYSTEM_ACTOR_ID` | sensitive | production | — | נצפה |

המחרוזת `preview,production` לעיל מתעדת scope בלבד. היא אינה ערך סוד. לאחר
cleanup יש לשמור snapshot חדש של שמות ו־scopes בלבד ולפרוס מחדש את ה־candidate.

## parity מקומי ו־Hosted

`npx supabase migration list --local` עבר מול המסד המקומי והציג 36 migrations
עד `20260827180000`. בהתאם לגבול "Local Supabase only" לא בוצעה קריאת linked
project. ה־owner חייב להשוות את רשימת Hosted המאושרת ל־Git ולצרף רק IDs,
מצב parity וה־final deployment SHA; אין לצרף connection string או token.

## שערי owner שלא נסגרו

| שער | פעולה מדויקת | סטטוס |
| --- | --- | --- |
| GitHub Actions / billing | להסדיר Billing/Spending limit ולהריץ את כל CI על `<final-candidate-sha>` עד שכל jobs נפתחים ומסיימים בהצלחה | OWNER_ACTION_REQUIRED |
| Final candidate and CI | אחרי S9-REQ-005 לרשום SHA דחוף יחיד, לוודא PR #14 עדיין Draft ולצרף URLs של runs לאותו SHA | OWNER_ACTION_REQUIRED |
| Vercel final deployment | לפרוס בלי למזג את PR #14, ולקשר immutable URL, alias ו־Production ל־`<final-candidate-sha>`; לאשר 200 ו־Demo-only | OWNER_ACTION_REQUIRED |
| Vercel environment cleanup | להסיר Preview מ־`SPORTS_API_KEY`, להסיר entries היסטוריים אחרי בדיקת consumer ולצרף matrix שמות/scopes בלבד | OWNER_ACTION_REQUIRED |
| Hosted migration parity | להשוות migration IDs של Hosted מול Git עד `20260827180000` אחרי ה־deploy ולתעד parity ללא secret | OWNER_ACTION_REQUIRED |
| Evaluator access | להעניק לזהות evaluator גישת read למאגר הפרטי וחשבונות Demo מחוץ ל־Git; לקבל אישור פתיחה | OWNER_ACTION_REQUIRED |
| Incognito final demo | לפתוח immutable URL ו־alias בחלון incognito ללא team login/protection, לבצע smoke Demo ולרשום `<final-production-sha>` | OWNER_ACTION_REQUIRED |

PR #14 לא ימוזג, לא יסומן Ready, לא יאושר ולא יוגדר auto-merge כחלק מהפעולות
האלה. כל שורה נשארת `OWNER_ACTION_REQUIRED` עד ראיה מאותו final SHA; current
200, Vercel READY או בדיקה מקומית אינם תחליף.
