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

### הבחנה בין ראיית המאגר לתוצר ההגשה

החבילה בת 13 השקפים לעיל נשארת ראיית reproducibility דטרמיניסטית של המאגר.
ה־owner בחר לתיק ההגשה החיצוני מצגת אחרת בת 18 שקפים, שמועתקת byte-for-byte
לשם `Predictor1_Final_Presentation_HE.pptx`; SHA-256 שלה הוא
`8B805B3C735C14A03BDE2BC3830F011842842549150B7E37A8E7F62C5D40B62C`.
אין להפנות אליה את `presentation:build` או לדרוס אותה. חזרת 10–15 הדקות
נמדדת על 18/18 שקפי התוצר הנבחר, בעוד 13/13 השקפים והרינדורים שבמאגר ממשיכים
להיבדק כחוזה פנימי בלבד.

במצגת הנבחרת המספור הגלוי מדלג על 13, notes של שקפים 14–18 חוזרים על notes
קודמים והקישורים בשקף 13 הם טקסט רגיל. ה־owner אישר שימור byte-for-byte של
המגבלות האלה; האישור אינו PASS. המציג משתמש ב־talk track הייעודי שב־
`timing-guide.md`, פותח את הקישורים ידנית ומשתמש בחמש תמונות הגיבוי הקנוניות
כאשר ה־UI המקומי אינו נצפה.

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
ה־Demo הציבורי בלבד; אין login או mutation. לאחר שער הפרסום גישת הבוחן למאגר
מאומתת אנונימית מול README, ‏default `main`, ‏final SHA ו־clean clone ללא
credentials.
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

לפני מסירה יש לפתוח את 13/13 תמונות הרינדור הפנימיות לצורך QA, ואת 18/18
שקפי המצגת הנבחרת לצורך החזרה הרשמית. עובדים לפי המסלול המתאים ב־
`timing-guide.md`, ממלאים את `evaluator-checklist.md`, פותחים ידנית את שני
הקישורים וממלאים את `rehearsal-log.md` מול אותו candidate SHA. עד לביצוע
החזרה האנושית, S9-REQ-002 נשאר `OWNER_ACTION_REQUIRED`.
