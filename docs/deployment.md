# פריסה, origins ו־Auth callbacks

מסמך זה הוא runbook תפעולי. הארכיטקטורה וה־product rules נשארים מקורות האמת;
אין כאן הרחבה של יכולות המוצר. הפריסה הציבורית היא Demo בלבד.

## חוזה הסביבות

| סביבה | תפקיד | origin אפליקטיבי | Redirect URL מורשה |
| --- | --- | --- | --- |
| Production | אתר הקורס וה־evaluator | `https://predictor-swart.vercel.app` | `https://predictor-swart.vercel.app/auth/confirm` |
| Local | פיתוח ובדיקות Mailpit | `http://localhost:3000` | `http://localhost:3000/auth/confirm` |
| Local חלופי | loopback שנבחר במפורש | `http://127.0.0.1:3000` | `http://127.0.0.1:3000/auth/confirm` |
| Preview של PR #14 | smoke ציבורי זמני | `https://predictor-git-feature-slice-9-imp-51f991-tals-projects-19902e47.vercel.app` | אין callback קבוע; Auth לא נתמך ולא מאומת |

`NEXT_PUBLIC_APP_URL` הוא ה־fallback הקנוני. ב־Vercel, Server Actions עשויים
לבחור רק origin מדויק מתוך `VERCEL_BRANCH_URL`, ‏`VERCEL_URL` או
`VERCEL_PROJECT_PRODUCTION_URL`; התאמה זו אינה תחליף ל־Redirect URL אצל
Supabase. ‏`next` אחרי ה־callback נשאר נתיב יחסי מתוך ה־allowlist של המוצר.

## מדיניות Preview

- כל deployment או branch alias ישן הוא historical בלבד לאחר שה־PR/SHA שלו
  הוחלף. אין להעתיק alias ישן ל־README ואין להציג אותו כ־endpoint נתמך.
- ה־branch alias בטבלה נלקח מ־Vercel Preview של PR #14. הוא מתעדכן על הענף;
  אם Vercel מחליף את ה־alias עצמו, מעדכנים יחד את הטבלה, README וה־regression.
- Preview של PR נועד ל־smoke ציבורי ללא תלות ב־Email. עצם הצלחת הפריסה אינה
  ראיה ל־confirmation, recovery או invite callback.
- אם נדרש Auth ב־Preview לצורך QA פנימי, owner בוחר deployment אחד ומוסיף
  זמנית רק `<exact-preview-origin>/auth/confirm`. אין להשתמש ב־`*`, ‏`/**`,
  suffix allowlist או alias של Slice ישן.
- אחרי הבדיקה מסירים את ה־callback הזמני, או מתעדים במפורש למה הוא עדיין נדרש,
  מי owner שלו ומתי ייבדק מחדש. אין להגדיר את ה־Preview כ־Site URL.
- Preview Auth אינו דרישת הקורס ואינו סוגר את ראיית Production/local של
  `S9-DEF-004`.

## שינוי configuration בטוח

1. מאמתים שה־Site URL הוא Production המדויק ושומרים snapshot מסונן של שמות
   ה־origins בלבד. אין לצלם token, cookie, recipient או provider payload.
2. משאירים רק את שלושת ה־callbacks הקבועים בטבלה. entry ישן נמחק לאחר שה־owner
   מאשר שאין לו consumer; אם אינו נמחק, הוא מסומן historical עם owner ותאריך
   revisit ואינו מוזכר כנתמך.
3. להפעלת Preview Auth, לוקחים את ה־origin המדויק מ־deployment שנבחר באותו SHA,
   מוסיפים callback מדויק יחיד ומריצים confirmation ו־recovery בחשבון disposable
   מורשה. לא משתמשים ב־wildcard.
4. בודקים ש־host עוין, scheme שאינו HTTPS ו־`next` חיצוני נופלים ל־Production
   או ל־`/dashboard`, בהתאם לגבול שנבדק.
5. שומרים ראיה מסוננת ומסירים את ה־callback הזמני. פעולת Hosted שדורשת credential
   נשארת owner action; אין לקרוא, להדפיס או להכניס secret ל־Git.

## בדיקת drift מקומית

```powershell
npx vitest run src/lib/deployment-docs-contract.test.ts
npx vitest run src/features/auth/auth-rules.test.ts
```

הבדיקה הראשונה דורשת את ה־origins המדויקים, את הסיווג הנוכחי של Preview ואת
היעדרם של callback wildcards/הבטחות stale. השנייה מאמתת התאמה מדויקת ומניעת
open redirect בקוד. בדיקת Hosted מלאה נשארת ראיה ידנית לפי
`docs/evidence/slice-9/w2/S9-DEF-004.md`.
