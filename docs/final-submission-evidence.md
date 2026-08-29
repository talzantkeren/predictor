# פנקס ראיית הגשה סופית

Status: `OWNER_ACTION_REQUIRED`.

המסמך מפריד בין CI אמיתי שנצפה, עובדות read-only היסטוריות, ובין שער
Production/Public יחיד. אין כאן credential, ערך env, זהות evaluator או claim
על Hosted שלא נצפה. Draft PR #14 נשאר פתוח, Draft ולא ממוזג.

```text
Final candidate SHA: <final-sha>
Final CI run: <final-run-id>
Final Production SHA: <final-sha>
Public repository access: OWNER_ACTION_REQUIRED
Hosted migration parity: OWNER_ACTION_REQUIRED
FINAL_SUBMISSION_DIRECTORY: NOT_RUN
LINKS_FINAL_SHA_AND_PUBLIC_URLS: NOT_RUN
ZIP_ROOT_SHAPE: NOT_RUN
ZIP_EXTRACT_REOPEN_HASH_LINK_SECRET_QA: NOT_RUN
```

## בינאריים סופיים שנבחרו מחוץ ל־Git

ב־29.8.2026 ה־owner קבע כי שלושת הקבצים הבאים הם המקור הרשמי לתיק ההגשה.
הטבלה משתמשת בשמות בסיס בלבד; נתיב פרופיל משתמש אינו נשמר במאגר. העותקים
יועברו ל־`<Downloads>/Predictor1_Final_Submission` רק לאחר final SHA ופרסום
Public, בלי generator, export מחדש, שינוי metadata או שינוי תוכן:

| Source basename | Final copy basename | Bytes | SHA-256 | Disposition |
| --- | --- | ---: | --- | --- |
| `Predictor1_Project_Book_HE_v2.1 (2).pdf` | `Predictor1_Project_Book_HE_v2.1.pdf` | 492432 | `DBA0AE5F200394A70BDDF65E7229C0443F8D8145D9704096986AA73CB8F5D0EA` | OWNER_APPROVED_BYTES_FROZEN |
| `Predictor1_Project_Book_HE_v2.1 (2) (1).docx` | `Predictor1_Project_Book_HE_v2.1.docx` | 71129 | `73FB802509CD8D18579079FD05B8B9817C44D1A75543566F09D27581C998318D` | OWNER_APPROVED_BYTES_FROZEN |
| `Predictor1-Final-Project-Upgraded-RTL (2).pptx` | `Predictor1_Final_Presentation_HE.pptx` | 763248 | `8B805B3C735C14A03BDE2BC3830F011842842549150B7E37A8E7F62C5D40B62C` | OWNER_APPROVED_BYTES_FROZEN; 18 slides and 18 notes parts |

הבינאריים האלה גוברים **רק** לצורכי תיק ההגשה וה־ZIP. ‏`docs/project-book.docx`
והמצגת בת 13 השקפים שב־`presentation/` נשארים ראיות reproducibility פנימיות
של המאגר. בחירת הקבצים אינה rehearsal ואינה מוכיחה folder/ZIP QA. מספר
הסטודנט ייכתב רק ב־`LINKS.txt` החיצוני; הוא אינו נרשם כאן או בקובץ tracked.

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
gh pr view 14 --json number,isDraft,state,headRefOid,mergeCommit,mergedAt,url
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

ה־reset שנרשם בנקודת סגירת S9-REQ-005 החיל 39 migrations עד
`20260827200000`. במהלך אותה סגירה
נבדקה רשימת Hosted והוחלה בבידוד רק migration ההקשחה
`20260825000000_revoke_rls_event_trigger_rpc_access.sql`; לאחריה נצפו 20
migrations מרוחקות, בעוד 19 migrations של Slice 9 נשארו local-only במכוון.
לא בוצע linked reset ולא נעשה ניסיון לסגור את S9-REQ-003. לאחר merge agent מאומת
ישווה את עמודת `version` בלבד מול קובצי Git וישמור parity מצונזר על אותו
`<final-sha>`.

## שער final יחיד וקלט owner המצומצם

| שער | פעולה מדויקת | סטטוס |
| --- | --- | --- |
| Final Production, Public and package closeout | agent מבצע לאחר merge את `docs/runbooks/slice-9-req-003-final-production-review.md`: final/main SHA ו־merge, CI, Hosted migrations/env scopes, Production+incognito, snapshot הגנות, מעבר ל־Public, גישה אנונימית/clone ושערי מסמכים. לאחריהם בלבד נוצרים `LINKS.txt`, תיק ארבעת הקבצים וה־ZIP; העותקים נבדקים byte-for-byte וה־ZIP עובר extract/reopen/hash/link/secret QA. אישור owner לפרסום, ל־author metadata ולבינאריים הנבחרים התקבל; גישת Demo, אם נדרשת, נשארת מחוץ ל־Git | OWNER_ACTION_REQUIRED |

התבנית הריקה נמצאת ב־
`docs/evidence/slice-9/w8/S9-REQ-003-owner-template.md`. אין לסמן את הרשומה
VERIFIED לפני שכל הראיות מתייחסות לאותו SHA. אישור owner ל־merge ולפרסום
התקבל ב־29.8.2026, אך אין לסמן Ready או למזג לפני ששערי pre-merge המתועדים
עברו על ה־final SHA; ה־runbook מתחיל רק אחרי merge תקין.
