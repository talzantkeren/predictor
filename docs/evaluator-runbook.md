# Runbook evaluator — Predictor1

מסמך זה מרכז גישה, הרצה והדגמה בטוחות של candidate ההגשה. הוא אינו מכיל
credential ואינו מרחיב את היקף המוצר. הפריסה הציבורית היא Demo בלבד.

## קישורים וחבילת מסירה

- Production: [https://predictor-swart.vercel.app](https://predictor-swart.vercel.app)
- Preview smoke של Draft PR #14: אין URL יציב; אם נדרש smoke, משתמשים רק
  ב־origin המדויק שמופיע ב־deployment check של ה־candidate SHA באותו זמן.
- מאגר: [https://github.com/talzantkeren/predictor](https://github.com/talzantkeren/predictor)
- [ספר הפרויקט](project-book.docx)
- [פנקס ראיית הגשה סופית](final-submission-evidence.md)
- [מצגת ותסריט](../presentation/README.md)
- [מטריצת בדיקות](testing.md), [אבטחה](security.md), [קנה מידה](scale.md)
  ו־[פריסה](deployment.md)

בגבול הנוכחי המאגר עדיין Private ו־PR #14 עדיין Draft. אישור owner מותנה
ל־Ready/merge/Public ולפרסום author metadata התקבל ב־29.8.2026, אך visibility
אינה משתנה לפני final Production, סריקות pre-public וכל שערי הקדם המתועדים.
לאחר המעבר ל־Public גישת evaluator לקוד תאומת ללא authentication באמצעות
README, ‏default branch `main`, ‏final SHA ו־clean clone; אין צורך בזהות GitHub
או בהזמנת collaborator. גישת Demo, אם נדרשת, נמסרת בערוץ הקורס מחוץ ל־Git.
Preview הוא smoke ציבורי בלבד; Auth לא נתמך ולא מאומת בו. אין למסור token,
cookie, סיסמה, invite fragment, signed URL או proof path במסמך או בראיה.

## זהות ה־candidate

לפני בדיקה יש לרשום את הערכים שנצפו, לא לנחש:

```text
Candidate SHA: <candidate-sha>
Production SHA: <owner-will-record-after-approved-deploy>
Public repository access: OWNER_ACTION_REQUIRED
```

אישור owner אינו PASS. כל עוד שערי ה־pre-merge המתועדים לא עברו על אותו
candidate SHA, ‏PR #14 נשאר Draft ואסור להעבירו ל־Ready או למזג. לאחר שהם
עוברים מותר לבצע Ready ו־reviewed merge ידני ללא אישור owner נוסף; auto-merge
ו־direct push נשארים אסורים. קישור Production קיים אינו מוכיח שהוא מריץ את
ה־candidate עד שנצפה deployment SHA מדויק.

## clean clone מקומי

במכונה נקייה עם Node.js 24.16.0, Docker Desktop ו־Git:

```powershell
git clone https://github.com/talzantkeren/predictor.git predictor
Set-Location predictor
git checkout --detach <candidate-sha>
nvm use 24.16.0
npm ci
Copy-Item .env.example .env.local
npm exec -- supabase start
```

לאחר `supabase start`, מעתיקים ידנית ל־`.env.local` רק את הערכים המקומיים
שמודפסים ב־`supabase status -o env`: ‏`API_URL`, ‏`PUBLISHABLE_KEY` ו־
`SECRET_KEY` למשתנים המתועדים ב־README. אין לצרף את הפלט לראיה. משאירים
`SPORTS_API_PROVIDER=manual` ו־`DEMO_MODE=true`; לא משתמשים ב־provider חי.

שערי בדיקה מקומיים:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run types:check
npm run build
npm run test:client-secrets
npm run test:e2e
npm run docs:book:check
npm run docs:submission:check
npm run presentation:check
```

אסור להריץ `supabase db reset --linked`. reset מקומי, אם נדרש, הוא רק
`npm exec -- supabase db reset --local`.

## מסלול evaluator

1. לפתוח את Production ולאשר בית RTL במצב Demo. אם נדרשת זרימת Auth מלאה,
   להשתמש בזהות שנמסרה מחוץ ל־Git; אין להניח ש־Preview Auth עובד.
2. לבצע את `presentation/demo-script.md`: פתיחה → הצטרפות → משחק → הפעלת
   הליגה → ניחוש → תוצאה → דירוג נוכחי → השלמת הליגה → דירוג סופי.
3. להראות תיקון מאוחר ו־reconciliation מפורש, או להשתמש בנכסי fallback אם
   הסביבה אינה זמינה. אין mutation ישיר למסד כדי ליצור שלב נראה.
4. לפתוח את ספר הפרויקט, security, scale ו־testing ולהצליב אותם מול אותו SHA.
5. לתעד תוצאה מצונזרת בלבד; כשל קישור, access או בדיקה נשאר כשל.

## חמשת שערי המסירה שעדיין פתוחים

| שער | פעולה מדויקת | ראיה מותרת |
| --- | --- | --- |
| Hosted Email | השירות המובנה (2/h, organization members בלבד) מאושר ל־Demo; למסור כתובת mailbox מורשית ולקבל link, וה־agent מריץ את `docs/runbooks/slice-9-def-004-hosted-auth.md`; אין רכישת SMTP נדרשת | למלא את `docs/evidence/slice-9/w2/S9-DEF-004-owner-template.md`; ללא recipient, link או credential |
| Hosted Cron | לבצע פעם אחת את `docs/runbooks/slice-9-def-012-production-cron.md` אחרי final deploy | למלא `docs/evidence/slice-9/w5/S9-DEF-012-owner-template.md`; רק response/run/lease columns מסוננים |
| page zoom spot-check | Chrome Zoom=200% על candidate: keyboard ב־admin matches, ‏members/error ו־settings; אין clipping/overlap/page overflow | zoom, גרסת Chrome, שלושת המסכים, PASS/FAIL; מטריצת forced DSF מלאה כבר מתועדת ב־S9-DEF-022 |
| חזרה | לבצע ולתעד 10–15 דקות לפי `presentation/rehearsal-log.md` | SHA, משך, קישורים, fallback ותוצאה |
| Public/final SHA | לאחר merge ו־Production סופי להעביר את המאגר ל־Public, לאמת README/default `main`/final SHA ו־clean clone ללא credentials; גישת Demo, אם נדרשת, נמסרת מחוץ ל־Git | מצב anonymous access, ‏SHA וקישור בלבד; אין credential |

שער ה־Vercel Sports נסגר ב־28 באוגוסט 2026: `SPORTS_API_KEY` נשאר Sensitive
ו־Production-only, ו־Preview/Local/CI נשארו Manual ללא key. זו תצפית שכבר
נשמרה ב־`S9-DEF-025`, לא פעולת owner שנותרה.

כל חמש הרשומות נשארות `OWNER_ACTION_REQUIRED` עד לתצפית המתאימה; אישור owner
או כוונה עתידית אינם הופכים אף אחת ל־PASS. לפני merge חלים שערי ה־pre-merge
לעיל; לאחר merge חלים שערי Hosted/Production/Public על final/main SHA. אין
להציג real money או AI runtime, ואין להכריז `READY_TO_SUBMIT` לפני סגירת כל
החמישה.
