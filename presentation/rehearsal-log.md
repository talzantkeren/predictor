# יומן חזרה אנושית

סטטוס נוכחי: **VERIFIED — OWNER_REPORTED_PASS**.

המצגות, התסריט, הרינדור ותמונות הגיבוי יכולים להיבדק אוטומטית, אך agent אינו
יכול להחליף חזרה אנושית מתוזמנת מול מסך, דיבור וקישורים. ב־30.8.2026 ה־owner
אישר במפורש שהחזרה עברה; זו ראיית `OWNER_REPORTED`, לא תצפית agent. זמני
התחלה/סיום, משך מדויק ו־screenshot לא נשמרו. 13/13 השקפים שבמאגר הם QA פנימי;
החזרה הרשמית נמדדה על 18/18 שקפי
`Predictor1_Final_Presentation_HE.pptx`, ‏SHA-256
`8B805B3C735C14A03BDE2BC3830F011842842549150B7E37A8E7F62C5D40B62C`.

## חוזה החזרה שעליו דיווח ה־owner

1. להריץ `git switch feature/slice-9-implementation`, ‏`git pull` ואז
   `git rev-parse HEAD`; להחליף ביומן את `<candidate-sha>` בערך שנצפה.
2. להריץ `npm.cmd run presentation:build:check` ו־`npm.cmd run
   presentation:check` על ראיית המאגר בלבד. לפתוח את 13/13 השקפים והרינדורים
   הפנימיים ל־QA, ובנפרד את 18/18 שקפי המצגת הנבחרת. אין להפעיל generator על
   הקובץ הנבחר או לשנות אותו.
3. להפעיל Supabase מקומי disposable ואת היישום המקומי ב־Production build עם
   `SPORTS_API_PROVIDER=manual` וללא credential של ספק Sports. להכין שתי
   sessions מקומיות מורשות בלי להעתיק סיסמה או פרטי חשבון ליומן.
4. לפתוח את חמש תמונות הגיבוי לפי הסדר:
   `01-open-league.png`, ‏`02-open-approved-members.png`,
   `03-active-current-report.png`, ‏`04-completed-final-frozen.png`,
   `05-completed-final-reconciled.png`.
5. להפעיל טיימר ולבצע בקול את `demo-script.md` לפי `timing-guide.md`. כל שינוי
   שנראה למשתמש חייב לעבור דרך ה־UI המקומי; אין mutation ישיר במסד.
6. לדמות תקלה מקומית. בתוך 20 שניות לומר: “הסביבה המקומית אינה זמינה כרגע;
   אמשיך עם ראיה שנלכדה מאותו תרחיש Playwright.” לעבור לתמונה המתאימה ולציין
   איזה שלב חי לא נצפה.
7. לאחר שקף 18 לפתוח ידנית, בלשוניות נפרדות, את Production ואת המאגר; הקישורים
   במצגת הנבחרת הם טקסט רגיל. ב־Production להציג את עמוד ה־Demo הציבורי בלבד;
   אין login או mutation.
8. לאשר משך כולל של `10:00–15:00`, למלא את `evaluator-checklist.md` ולרשום
   בטבלה רק תוצאה מסוננת. כשל נשאר FAIL עם הפעולה המדויקת שחסרה.

## רשומת חזרה

| תאריך ושעה (Asia/Jerusalem) | Candidate SHA | Hash מצגת נבחרת | משך | 18/18 שקפים | מסלול UI מקומי | 5/5 תמונות גיבוי | Production/GitHub | הסבר בוחן | בסיס תצפית | תוצאה והערות מסוננות |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-08-30; שעה מדויקת NOT_CAPTURED | `4b77e2412336ed1151849c5db8d05d5947a46e45` | `8B805B3C735C14A03BDE2BC3830F011842842549150B7E37A8E7F62C5D40B62C` | `OWNER_REPORTED_WITHIN_10:00–15:00` | PASS — OWNER_REPORTED 18/18 | OWNER_REPORTED_FALLBACK_USED; UI חי לא נצפה בידי agent | PASS — OWNER_REPORTED 5/5 | PASS — OWNER_REPORTED_OPENED | PASS — OWNER_REPORTED; פירוט לא נשמר | OWNER_REPORTED; agent לא צפה ולא נשמר screenshot | VERIFIED — OWNER_REPORTED_PASS |

## תנאי PASS

PASS מותר רק כאשר:

- כל העמודות מולאו מול אותו SHA והמשך ההדגמה נמדד בטווח 10–15 דקות.
- כל 18 השקפים הנבחרים נקראו נכון, כולל עברית, פיסוק ומונחים לטיניים; עבור
  שקפים 14–18 נעשה שימוש ב־talk track ייעודי ולא ב־notes החוזרים.
- המחזור המקומי או המעבר המפורש לתמונות הגיבוי סיפר את חמשת המצבים הקבועים:
  פתוחה; חבר מאושר; פעילה עם דירוג נוכחי ו־3 נקודות; הושלמה עם דירוג סופי
  קפוא ו־3 נקודות; reconciliation עם דירוג סופי ו־0 נקודות.
- נתיב התקלה עבר לתמונה בתוך 20 שניות בלי לטעון שפעולה שלא נצפתה עברה.
- שני הקישורים נפתחו ידנית לאחר שקף 18, ו־Production נשאר קישור Demo ציבורי נפרד ללא
  login או mutation.
- המציג הסביר את הארכיטקטורה, האבטחה, זמן המסד, הסופיות, הבדיקות, הסקייל,
  ה־tradeoffs והגבולות בלי לטעון לכסף אמיתי, runtime AI, ‏SMTP או ספק חי שלא
  נבדקו.
- אין secret או מידע אישי ברשומה.

הרשומה נסגרה על בסיס אישור owner מפורש שכל תנאי החזרה עברו. אין כאן claim על
timestamps, משך מדויק, screenshot או תצפית agent. ראיה סותרת בעתיד מחייבת
פתיחה מחדש; אין לשנות בדיקה, workflow, מצגת, ledger או checklist כדי להסתיר
תוצאה חסרה.
