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

המאגר פרטי. ה־owner מוסר הרשאת evaluator וזהות Demo בערוץ הקורס, מחוץ ל־Git.
Preview הוא smoke ציבורי בלבד; Auth לא נתמך ולא מאומת בו. אין למסור token,
cookie, סיסמה, invite fragment, signed URL או proof path במסמך או בראיה.

## זהות ה־candidate

לפני בדיקה יש לרשום את הערכים שנצפו, לא לנחש:

```text
Candidate SHA: <candidate-sha>
Production SHA: <owner-will-record-after-approved-deploy>
Evaluator access: OWNER_ACTION_REQUIRED
```

Draft PR #14 נשאר Draft ואינו מתמזג, מאושר או מועבר ל־Ready במסגרת runbook זה.
קישור Production קיים אינו מוכיח שהוא מריץ את ה־candidate עד שה־owner מצרף
deployment SHA מדויק.

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

## פעולות owner שעדיין נדרשות

| שער | פעולה מדויקת | ראיה מותרת |
| --- | --- | --- |
| Hosted Email | לבצע את `docs/runbooks/slice-9-def-004-hosted-auth.md` כפעולה רציפה אחת עם custom SMTP מאושר ונמען disposable מורשה | למלא את `docs/evidence/slice-9/w2/S9-DEF-004-owner-template.md`; ללא recipient או credential |
| Hosted Cron | לבצע פעם אחת את `docs/runbooks/slice-9-def-012-production-cron.md` אחרי final deploy | למלא `docs/evidence/slice-9/w5/S9-DEF-012-owner-template.md`; רק response/run/lease columns מסוננים |
| native zoom | Chrome Zoom=200% על candidate, keyboard, ‏360–390 CSS px ולפחות 1024 CSS px ללא device emulation | viewport, zoom, גרסת Chrome, מסך, PASS/FAIL |
| חזרה | לבצע ולתעד 10–15 דקות לפי `presentation/rehearsal-log.md` | SHA, משך, קישורים, fallback ותוצאה |
| evaluator/final SHA | להעניק גישת מאגר וחשבונות מחוץ ל־Git ולרשום Production SHA סופי | זהות evaluator אינה נכתבת; רק מצב access ו־SHA |

שער ה־Vercel Sports נסגר ב־28 באוגוסט 2026: `SPORTS_API_KEY` נשאר Sensitive
ו־Production-only, ו־Preview/Local/CI נשארו Manual ללא key. זו תצפית שכבר
נשמרה ב־`S9-DEF-025`, לא פעולת owner שנותרה.

עד שכל שער רלוונטי הושלם, הוא נשאר `OWNER_ACTION_REQUIRED`. אין להכריז על
מוכנות לשחרור, אין להציג real money או AI runtime, ואין למזג את Draft PR #14.
