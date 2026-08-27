# חבילת המצגת וההדגמה

החבילה מיועדת להצגת פרויקט הגמר ולבדיקת evaluator. היא נשארת Demo בלבד ואינה
מציגה תשלום אמיתי, פרס כספי פעיל, מסמך פיננסי אמיתי או שילוב מודל גנרטיבי.

## תכולה

- `predictor1-final-project.pptx` — מצגת 16:9 עריכה, 9 שקפים, speaker notes
  ומקורות בכל שקף.
- `deck-source.md` — חוזה תוכן אנושי לכל תשעת השקפים; ה־PPTX נשאר המקור
  העריך הסמכותי.
- `predictor1-final-project/slide-1.png` עד `slide-9.png` — render סופי לבדיקת
  פריסה ולפתיחה גם בלי PowerPoint.
- `demo-script.md` — תסריט חי של 10–15 דקות, כולל שאלות evaluator ונוהל outage.
- `timing-guide.md` — חלוקת זמן דטרמיניסטית, כללי קיצור ו־hard stop.
- `evaluator-checklist.md` — checklist מסונן של המוצר, ההסבר, הקישורים וה־outage.
- `fallback/` — שלושה צילומי מוצר שנלכדו רק אחרי שה־UI הגיע למצבי open,
  active/current ו־completed/final.
- `rehearsal-log.md` — שער החזרה האנושית; אין לסמן אותו PASS בלי חזרה שנמדדה.

## קישורים ציבוריים

- Production: [https://predictor-swart.vercel.app](https://predictor-swart.vercel.app)
- Preview smoke של PR #14: [https://predictor-git-feature-slice-9-imp-51f991-tals-projects-19902e47.vercel.app](https://predictor-git-feature-slice-9-imp-51f991-tals-projects-19902e47.vercel.app)
- GitHub: [https://github.com/talzantkeren/predictor](https://github.com/talzantkeren/predictor)

Preview משמש smoke ציבורי בלבד; Auth לא נתמך ולא מאומת בו. אין להוסיף callback
wildcard או להעביר credential ל־Git כדי להפעיל אותו. פרטי חשבונות evaluator
נמסרים מחוץ ל־repository ורק לאחר אישור owner.

## בדיקת החבילה

```powershell
npm.cmd run presentation:check
```

הבדיקה נכשלת אם חסרים deck, render, notes, קישורים, תסריט, תמונות fallback או
יומן חזרה. בדיקת overflow נעשית בנוסף עם כלי הרינדור של מיומנות המצגות; החזרה
האנושית אינה ניתנת להחלפה בבדיקה אוטומטית.

יצירת צילומי fallback חדשים מותרת רק מול Supabase מקומי disposable ובפקודה:

```powershell
$env:CAPTURE_PRESENTATION_ASSETS='true'
npm.cmd run test:e2e:run -- e2e/lifecycle.spec.ts --project=desktop-chromium
```

ה־spec יוצר שמות קבועים, מצנזר שמות דינמיים ואינו כותב צילום כשהדגל חסר. אין
להוסיף לצילומים סיסמה, דוא״ל, invite fragment, signed URL או נתיב proof.

## מפת הסבר למציג/ה

| נושא | היכן במצגת | נקודת הסבר |
| --- | --- | --- |
| מוצר וערך | 2–3 | lifecycle מלא דרך המוצר, תיקו וניקוד ליגה |
| רכיבים וספריות | 4 | Next.js 16, React, TypeScript, Supabase, Zod ו־sharp |
| מסד והרשאה | 4–6 | RLS, בדיקת משאב, זמן DB, Storage פרטי ו־snapshot |
| בדיקות | 7 | Vitest, pgTAP ו־Playwright ללא ספק חי |
| קנה מידה | 8 | pagination, batch sync, caps ו־measurement-first |
| tradeoffs ומגבלות | 8–9 | modular monolith, Manual fallback, Demo-only וללא AI |

לפני מסירה יש לפתוח את כל תשעת ה־renders, לעבוד לפי `timing-guide.md`, למלא את
`evaluator-checklist.md`, ללחוץ על שני הקישורים בשקף 9 ולמלא את
`rehearsal-log.md` מול אותו candidate SHA. אין להסיק מהצלחת Production שה־
Preview Auth או SMTP עובדים.
