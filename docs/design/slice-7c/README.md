# Slice 7c — Design handoff

| שדה | ערך |
| --- | --- |
| תאריך | 25 באוגוסט 2026 |
| מקור | Claude Design/Fable, לאחר QA סופי |
| כיוון | Sports Command Center בהיר עם pattern מקומי של קווי מגרש |
| סטטוס | ה־handoff יושם ועבר QA; נשמר כחומר ייחוס ואינו מקור אמת חלופי |

## סדר קריאה

לפני שימוש בחומר הזה קוראים את מקורות האמת של המאגר לפי הסדר שנקבע
ב־`AGENTS.md`:

1. [`../../product.md`](../../product.md)
2. [`../../architecture.md`](../../architecture.md)
3. [`../../technical-plan.md`](../../technical-plan.md)
4. [`../../design-brief.md`](../../design-brief.md)
5. [`implementation-review-prompt.md`](./implementation-review-prompt.md)
6. [`final-review-prompt.md`](./final-review-prompt.md)
7. [`s3-polish-review-prompt.md`](./s3-polish-review-prompt.md)

במקרה של סתירה, המסמכים הקנוניים והקוד המאושר גוברים על ה־mockups.

## תכולת ה־handoff

`mockups/` מכיל שמונה מסכי עוגן מלאים ומסך מצבי רכיבים:

| מסך | מובייל 390px | דסקטופ 1440px |
| --- | --- | --- |
| Dashboard | `dashboard-mobile.png` | `dashboard-desktop.png` |
| תקציר ליגה | `league-overview-mobile.png` | `league-overview-desktop.png` |
| משחקים וניחושים | `matches-mobile.png` | `matches-desktop.png` |
| טבלת דירוג | `standings-mobile.png` | `standings-desktop.png` |
| מצבים | `component-states.png` | — |

[`claude-design-export.html`](./claude-design-export.html) הוא הייצוא המקורי
המסונן. הוא נשמר לצורך קריאת tokens, inventory והערות QA בלבד. אין להעתיק ממנו
inline styles, להפעיל את קובצי העזר שלו או להתייחס אליו כקוד ייצור.

## החלטות מאושרות

- נייבי ואמרלד, רקע בהיר, טיפוגרפיה עברית והיררכיה צפופה אך קריאה.
- `RoundCard` הוא רכיב החתימה; המחזור הוא יחידת הארגון במסך המשחקים.
- pattern של קווי מגרש בלבד; חלופת צילום האצטדיון נדחתה.
- המשטח הכהה מוגבל סמנטית למשחק מרכזי או תוצאה, ולא יוצר Dark Mode.
- אין route, feature, schema, dependency, avatar, feed, notification או AI.
- אסמכתאות נשארות metadata עם צפייה מפורשת דרך Route ההרשאה הקיים.

## פערים שאין להעתיק לקוד

- בחלק מה־mockups קיימים נתונים שאינם זמינים ב־query של המסך, כגון משחק קרוב
  בתקציר הליגה או ספירת ניחושים פתוחים ב־Dashboard.
- ה־mockup מציג שמירת ניחוש inline, בעוד שהמוצר הקיים שומר דרך
  `/matches/[matchId]`. ההכרעה מתועדת בפרומפט הביקורת.
- יש לתקן במימוש צפיפות, חפיפות וחיתוך כפתורים שנצפו בחלק מה־frames.
- כל שמות המשתמשים, הקבוצות, התאריכים והסכומים ב־mockups הם נתוני המחשה בלבד.

## הכרעות ביקורת מימוש

- עריכת ניחוש נשארת ב־`/matches/[matchId]`; `RoundCard` מציג מצב ו־CTA ואינו
  מוסיף טופס inline לכל משחק.
- שעה מוחלטת ו־timezone נשארים גלויים באמצעות `LocalDateTime`; הפורמט הקצר
  ב־mockup אינו מחליף את חוזה הזמן הקנוני.
- לא מוצגים chip ניקוד, `result_version` או סיווג הצלחה שלא נקראו מן השרת,
  ואין גזירת ניקוד מחדש ב־UI.
- מושמטים משחק קרוב וספירת ניחושים ב־Dashboard, משחק/ספירת חברים/מצב מחזור
  בתקציר הליגה, מצב מחזור ב־LeagueCard ו־"אחרי מחזור" בדירוג.
- progress מוצג רק לחבר פעיל; תחת מסנן תאריך הוא מתואר ביחס למשחקים המוצגים.
- תוויות נשארות במקורות ה־display הדומייניים. רכיב badge מקבל טקסט וטון ואינו
  ממציא מילון סטטוסים חדש.
- שינוי DOM מחייב עדכון מכוון של selectors ב־E2E באותו שינוי, בלי לרכך בדיקות
  נעילה, חשיפה, הרשאות או תוצאה.

## פרטיות

ה־handoff כולל נתוני Demo בלבד. הוא אינו כולל מפתחות, cookies, signed URLs,
proof paths, אסמכתאות, PII או payload מלא של ספק חיצוני.

## תוצאת המימוש

- מעטפת האפליקציה, Heebo, tokens ומצבי loading/empty/error/status משותפים
  יושמו ללא ספריית UI חדשה.
- ארבעת מסכי העוגן יושמו ונבדקו ב־390px, ב־768px וב־1440px ללא overflow של
  המסמך; tabs רחבים נשארים בגלילה אופקית מקומית ומכוונת במובייל.
- `RoundCard` ו־`MatchRow` משתמשים בנתונים וב־display functions הקיימים;
  עריכת הניחוש נשארה ב־`/matches/[matchId]`.
- ביקורת המימוש חיזקה ניגודיות, עברה ל־tokens גם ב־proof/loading, קודדה תוצאות
  מפורשות ל־RTL והוסיפה affordance לגלילת הניווט במובייל.
- סגירת הביקורת הוסיפה מסגרת `control-border` נגישה לבקרי טופס גלויים בלי
  לשנות את מסגרות הכרטיסים, יישרה את מסכי החברים וההגדרות ואת רכיבי הניהול
  לשפה המשותפת, והסירה הכרזות כפולות לקוראי מסך. כותרת המשחק משתמשת ב־`bdi`
  לשמות הקבוצות ומצבי loading/progress קיבלו סמנטיקה עקבית.
- הערות S3 האחרונות נסגרו בלי להרחיב scope: שדות readonly מקבלים רקע לבן
  משני צדי המסגרת, מקטע הקישור החד־פעמי משתמש ב־accent אמרלד במקום רקע מלא,
  ומצבי focus/disabled והתוויות בקבצים שנגעו בהם הועברו ל־tokens.
- ביקורת נוספת השלימה את `AuthCard`, כפתורי הפעולה והודעות השגיאה והרחיבה את
  focus הגלובלי ל־`summary`. בדיקות רגרסיה מאמתות את accent ההזמנה ואת צבעי
  כפתור/שדה Auth. `viewerIsManager` מאושר במפורש כשדה ניווט שנגזר בשרת ואינו
  מנגנון הרשאה.
- lint, typecheck, build, 460 בדיקות יחידה, 646 בדיקות מסד נתונים ו־20 תרחישי
  Playwright בדסקטופ וב־Pixel 5 עברו.
