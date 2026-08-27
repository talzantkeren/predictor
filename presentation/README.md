# חבילת המצגת וההדגמה

החבילה מיועדת להצגת פרויקט הגמר ולבדיקת הבוחן. היא נשארת Demo בלבד ואינה
מציגה תשלום אמיתי, פרס כספי פעיל, מסמך פיננסי אמיתי או generative AI בזמן ריצה.

המחזור החי מתבצע רק מול האפליקציה המקומית ו־Supabase מקומי disposable.
Production נפתח בסיום כקישור ציבורי נפרד בלבד; אין להתחבר אליו או לשנות בו
נתונים במהלך ההצגה.

## מקור הסמכות והתכולה

- `scripts/generate-presentation.mjs` — מקור העריכה הסמכותי והדטרמיניסטי.
- `predictor1-final-project.pptx` — פלט 16:9 בן שלושה־עשר שקפים, עם speaker
  notes ומקורות בכל שקף. אין לערוך אותו ביד.
- `deck-source.md` — חוזה התוכן האנושי: נקודה, ראיה, סיבה ומקורות לכל שקף.
- `predictor1-final-project/slide-1.png` עד `slide-13.png` — רינדור סופי לבדיקת
  RTL, פיסוק, clipping, overlap, contrast וקריאות.
- `demo-script.md` — תסריט מקומי של 10–15 דקות, כולל שאלות בוחן ונוהל תקלה.
- `timing-guide.md` — חלוקת זמן דטרמיניסטית, כללי קיצור ו־hard stop.
- `evaluator-checklist.md` — checklist מסונן של המוצר, ההסבר, הסביבות,
  הקישורים והמעבר לגיבוי.
- `fallback/` — חמש תמונות מסוננות מאותו תרחיש Playwright.
- `rehearsal-log.md` — שער החזרה האנושית; אין לסמן אותו PASS בלי חזרה שנמדדה.

## חמש תמונות הגיבוי

1. `fallback/01-open-league.png` — ליגה פתוחה.
2. `fallback/02-open-approved-members.png` — ליגה פתוחה ובה חבר מאושר ברשימה הפרטית.
3. `fallback/03-active-current-report.png` — ליגה פעילה, דירוג נוכחי ו־3 נקודות.
4. `fallback/04-completed-final-frozen.png` — ליגה שהושלמה, דירוג סופי קפוא ו־3 נקודות.
5. `fallback/05-completed-final-reconciled.png` — ליגה שהושלמה לאחר reconciliation, דירוג סופי ו־0 נקודות.

אם פעולה מקומית אינה זמינה בתוך 20 שניות, אומרים:

> השלב החי לא נצפה. אמשיך מצילום גיבוי שנלכד מאותו תרחיש Playwright מקומי; הצילום אינו הופך את השלב שלא נצפה ל־PASS.

לאחר מכן מציגים את התמונה המתאימה ואומרים איזה שלב חי לא נצפה. תמונת גיבוי
אינה הופכת mutation, קישור או סביבת Production שלא נצפו ל־PASS.

## קישורים בשקף 13

- Production Demo: [https://predictor-swart.vercel.app](https://predictor-swart.vercel.app)
- Repository: [https://github.com/talzantkeren/predictor](https://github.com/talzantkeren/predictor)

פותחים את שני הקישורים רק בסיום, בלשוניות נפרדות. ב־Production מציגים את עמוד
ה־Demo הציבורי בלבד; אין login או mutation. גישת הבוחן למאגר הפרטי נבדקת
בנפרד ואינה מוסקת מתגובת HTTP אנונימית.
ל־Preview של PR #14 אין URL יציב ואין callback קבוע. הוא מיועד ל־smoke ציבורי
בלבד; Auth לא נתמך ולא מאומת בו.

## בנייה ובדיקת החבילה

לפני הבנייה מגדירים את `RUNTIME_NODE_MODULES` לנתיב חבילות ה־Node.js שמחזירה
סביבת העבודה; המחולל משתמש ב־`@oai/artifact-tool` וב־JSZip מן runtime זה ואינו
מוסיף אותם כתלות ייצור של האפליקציה.

```powershell
npm.cmd run presentation:build
npm.cmd run presentation:build:check
npm.cmd run presentation:check
```

פקודת הבנייה קוראת רק את המקור הדטרמיניסטי וכותבת את ה־PPTX. בדיקת ה־build
נכשלת אם בנייה חוזרת אינה זהה byte-for-byte. בדיקת החבילה נכשלת אם
חסרים שקף, render, notes, מקורות, קישורים, תסריט, תמונת גיבוי או יומן חזרה.
היא נכשלת גם כאשר פסקה עברית אינה מסומנת `rtl="1"`. בדיקת overflow והרינדור
החזותי של כל שקף מתבצעות בנוסף; הן אינן מחליפות חזרה אנושית.

## יצירת תמונות גיבוי חדשות

מותר ליצור את התמונות רק מול Supabase מקומי disposable. התרחיש מבצע את כל
השלבים הנראים דרך ה־UI ואינו משתמש ב־Hosted mutation או בספק Sports חי.

```powershell
$env:CAPTURE_PRESENTATION_ASSETS='true'
npm.cmd run test:e2e:run -- e2e/lifecycle.spec.ts --project=desktop-chromium
```

ה־spec יוצר את חמשת השמות הקבועים, משתמש בשמות תצוגה סינתטיים ואינו כותב צילום
כשהדגל חסר. אין להוסיף לצילומים סיסמה, Email, invite fragment, signed URL,
נתיב proof או payload של ספק.

## מפת ההסבר

| נושא | שקפים | נקודת ההסבר |
| --- | --- | --- |
| תזה, בעיה ותפקידים | 1–3 | מי צריך את המוצר, מה נשבר בניהול ידני ומדוע ההרשאה נעצרת בגבול הליגה |
| מחזור החיים והדמו | 4, 8–9 | `open` → `active` → `completed`, זמן מסד, snapshot ו־reconciliation |
| ארכיטקטורה ומודל נתונים | 5–6 | Next.js 16 יחיד, גבולות האחריות והטבלאות שמונעות overwrite |
| אבטחה | 7 | הרשאת משאב, RLS/grants, SECURITY DEFINER ומסלול proof פרטי |
| בדיקות וסקייל | 10–11 | Vitest, ‏pgTAP, ‏Playwright ו־query plans עם Function Scan ושורות שנמדדו על ה־SHA הסופי |
| tradeoffs, גבולות ועתיד | 12–13 | modular monolith, Manual fallback, ‏Demo-only, ללא runtime AI והרחבות רק אחרי ראיה |

לפני מסירה יש לפתוח את כל שלוש־עשרה תמונות הרינדור, לעבוד לפי
`timing-guide.md`, למלא את `evaluator-checklist.md`, לפתוח את שני הקישורים
בשקף 13 ולמלא את `rehearsal-log.md` מול אותו candidate SHA. עד לביצוע החזרה
האנושית, S9-REQ-002 נשאר `OWNER_ACTION_REQUIRED`.
