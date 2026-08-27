# Predictor1 — חוזה התוכן של המצגת

מקור העריכה הסמכותי הוא `scripts/generate-presentation.mjs`. הקובץ
`predictor1-final-project.pptx` וכל שלוש־עשרה תמונות ה־PNG נוצרים ממנו באופן
דטרמיניסטי; אין לערוך את ה־PPTX ביד. מסמך זה הוא חוזה התוכן האנושי לביקורת,
ואינו מחליף את מסמכי המוצר, הארכיטקטורה או הקוד.

מטרת התקשורת של המצגת: בתום ההצגה, הבוחן צריך להבין כיצד Predictor1 מעביר
ליגה פרטית ממצב פתוח למצב סופי שניתן להסביר, מדוע כללי הזמן והסופיות נאכפים
ב־PostgreSQL, ואילו גבולות נשארים במכוון מחוץ ל־MVP.

כל טקסט עברי במקור נשמר בסדר לוגי טבעי. כל פסקה עברית מיוצאת עם `rtl="1"`,
יישור לימין ושפת `he-IL`; אין להפוך מילים ידנית. מונחים כגון Next.js 16,
Supabase, PostgreSQL, Demo ו־RTL נשארים בכתב לטיני בתוך המשפט העברי.

## שקף 1 — Predictor1

טקסט גלוי:

- ליגה פרטית. חיזוי הוגן. דירוג סופי שנשאר סופי.
- פרויקט גמר — Internet Technologies
- הדגמה בלבד

נקודה: זו מערכת אמון לליגה פרטית, לא רק מחשבון ניקוד.

ראיה: מחזור חיים מלא ותוצאה סופית שנשמרת במפורש.

למה הוא קיים: לקבע את התזה ואת גבול ה־Demo כבר במשפט הפתיחה.

[Sources]
- `docs/product.md` — סעיפים 2, 3 ו־6
- `README.md` — פסקת הפתיחה
- `e2e/lifecycle.spec.ts`
[/Sources]

## שקף 2 — כשהליגה מתנהלת בצ׳אט, אין מקור אמת אחד

טקסט גלוי:

- מנהלי ליגות פרטיות מרכזים בקשות, אסמכתאות, ניחושים ותוצאות בין הודעות וגיליונות.
- המשתתפים צריכים תשובה ברורה: מי בפנים, מתי ננעל, ולמה הניקוד השתנה?
- הבעיה המרכזית היא אמון — לא רק חישוב.

נקודה: הפיצול הידני יוצר מחלוקות שאין להן ראיה אחת מוסכמת.

ראיה: חברות, נעילה, ניקוד ותיקון תוצאה הם מוקדי המחלוקת שהמוצר פותר.

למה הוא קיים: להסביר למי המוצר נועד ולמה בכלל צריך מערכת.

[Sources]
- `docs/product.md` — סעיפים 2–4 ו־13
- `README.md` — זרימות Slices 3–6
[/Sources]

## שקף 3 — תפקידים נפרדים; ההרשאה תחומה לליגה

טקסט גלוי:

- אורחים נכנסים מהזמנה; מבקשי הצטרפות מעלים תמונת הדגמה פרטית.
- מנהל הליגה מאשר חברות; חברים פעילים מנחשים וצופים בדירוג.
- מנהל מערכת מטפל בקטלוג ובחריגי תוצאה — בלי להפוך אוטומטית לחבר בליגה.
- ניהול ליגה אחת אינו מעניק הרשאה לליגה אחרת.

נקודה: תפקיד הוא תחום אחריות, לא קיצור דרך להרשאה רחבה.

ראיה: כל תפקיד מחובר לפעולות המוצר המותרות לו ולבדיקת משתמש זר.

למה הוא קיים: להפוך את מודל ההרשאות למובן לפני הדיון הטכני באבטחה.

[Sources]
- `docs/product.md` — סעיפים 4, 9.3–9.7 ו־12
- `src/features/membership/actions.ts`
- `src/features/predictions/actions.ts`
- `src/features/leagues/actions.ts`
- `e2e/join-and-proofs.spec.ts`
[/Sources]

## שקף 4 — המחזור המלא נראה בדמו — בלי קיצור דרך

טקסט גלוי:

- פתוחה — `open`: מהזמנה לבקשה, לאסמכתה ולאישור.
- פעילה — `active`: מניחוש לנעילה, לניקוד ולדירוג נוכחי.
- הושלמה — `completed`: מהקפאה לדירוג סופי וליישוב מאוחר מפורש.
- בדמו כל מעבר מתבצע דרך ה־UI; אין עדכון ישיר במסד כדי לזייף שלב שנראה למשתמש.

נקודה: אותו סיפור משתמש ממשיך ממצב פתוח עד מצב סופי.

ראיה: חמש תמונות הגיבוי מתעדות את אותן תחנות של תרחיש ה־Playwright.

למה הוא קיים: לשמש מפת ניווט לדמו החי ולחבר בין המוצר למימוש.

[Sources]
- `docs/product.md` — S9-PDEC-001–005 וסעיפים 10.2–10.5
- `README.md` — “Slice 9: lifecycle והגדרות ליגה”
- `e2e/lifecycle.spec.ts`
- `presentation/fallback/01-open-league.png`
- `presentation/fallback/02-open-approved-members.png`
- `presentation/fallback/03-active-current-report.png`
- `presentation/fallback/04-completed-final-frozen.png`
- `presentation/fallback/05-completed-final-reconciled.png`
[/Sources]

## שקף 5 — יישום אחד; כל כלל נאכף בשכבה הנכונה

טקסט גלוי:

- Next.js 16 ו־TypeScript strict מרכיבים מונוליט מודולרי יחיד ב־Vercel.
- Server Components מבצעים קריאות; Server Actions מטפלים במוטציות UI.
- Route Handlers מקבלים upload, Cron ו־HTTP חיצוני.
- Supabase מספק Auth, Storage ו־Cron; PostgreSQL אחראי לאילוצים, RLS, זמן מסד, transactions וניקוד set-based.
- מה שחייב להישאר אטומי גם במרוץ — מוכרע במסד.

נקודה: אין backend נוסף ואין שכפול של כללים בין היישום למסד.

ראיה: תרשים הגבולות Browser → Next.js → Supabase/PostgreSQL.

למה הוא קיים: להסביר מדוע כללי הזמן, החברות וההשלמה שורדים תחרות בין בקשות.

[Sources]
- `docs/architecture.md` — סעיפים 2–6
- `docs/technical-plan.md` — סעיפים 3, 7, 9 ו־10
- `src/proxy.ts`
- `src/lib/supabase/server.ts`
- `src/app/api/cron/sync/route.ts`
[/Sources]

## שקף 6 — הפרדת הנתונים שומרת החלטות והיסטוריה

טקסט גלוי:

- `join_requests` מתעדת את ההצטרפות; `payment_proofs` שומרת היסטוריה; `league_members` מייצגת חברות.
- `predictions` קושרת ליגה, משחק ומשתמש ושומרת ניקוד וגרסאות חישוב.
- `match_result_reviews` עוצרת תוצאה לא־בטוחה לפני ניקוד.
- `league_match_snapshots` ו־`league_match_reconciliations` מפרידות בין מצב סופי לבין תיקון מאוחר.

נקודה: בקשה, אסמכתה, חברות, ניחוש ותוצאה סופית הן ישויות שונות בכוונה.

ראיה: מודל קשרים המציג את שמות הטבלאות האמיתיים ואת היחסים ביניהן.

למה הוא קיים: להראות שההיסטוריה והמצב הסופי אינם נדרסים בעת שינוי.

[Sources]
- `docs/architecture.md` — סעיף 8
- `docs/technical-plan.md` — סעיפים 6.2–6.7
- `supabase/migrations/20260813182000_leagues.sql`
- `supabase/migrations/20260814231000_slice3_membership_and_proofs.sql`
- `supabase/migrations/20260815200500_slice5_predictions.sql`
- `supabase/migrations/20260827090000_slice9_lifecycle_schema.sql`
[/Sources]

## שקף 7 — אבטחה בשכבות — כי שכבה אחת אינה מספיקה

טקסט גלוי:

- מאמתים מחדש את זהות המשתמש בכל כניסה לפעולה; ההרשאה נבדקת מול המשאב עצמו.
- במסד, RLS ו־least-privilege grants מגינים על כל טבלה חשופה; מגבלת רשימה ו־pagination אינן תחליף להרשאה.
- ב־SECURITY DEFINER: ‏`search_path = ''`, שמות schema מלאים ו־EXECUTE רק לתפקיד הדרוש.
- תמונת אסמכתה עוברת אימות חתימה, פענוח וקידוד מחדש ל־WebP; היא נשמרת ב־bucket פרטי ונפתחת רק בקישור חתום וקצר־חיים.

נקודה: זהות, הרשאת משאב, RLS וגבול הקובץ הם בקרות נפרדות.

ראיה: מסלול אסמכתה מלא מן ה־upload ועד הצפייה, לצד בדיקת משתמש זר.

למה הוא קיים: להוכיח שגם מזהה חוקי או רשימה תחומה אינם מאפשרים גישה למשאב זר.

[Sources]
- `docs/security.md` — זהות ו־session, גבול Storage, צפייה ו־RLS
- `docs/architecture.md` — סעיפים 6, 7, 12 ו־13
- `src/lib/supabase/admin.ts`
- `src/features/files/private-proof-storage.ts`
- `supabase/tests/proofs.test.sql`
- `e2e/join-and-proofs.spec.ts`
[/Sources]

## שקף 8 — את מועד הנעילה קובע המסד

טקסט גלוי:

- במסלול שמירת ניחוש ננעלות `leagues`, אחריה `league_members`, אחריה `matches`.
- רק לאחר רכישת הנעילות נקרא `clock_timestamp()`.
- `kickoff_at` נשמר ב־UTC; ברגע ה־kickoff הניחוש נדחה, גם אם הבקשה התחילה קודם.
- אחרי שנצפתה התחלה, נעילת המשחק נשארת בלתי הפיכה גם אם הספק שולח מועד עתידי.
- ה־countdown הוא עזר תצוגה בלבד.

נקודה: משתמש אינו יכול להאריך לעצמו את חלון הניחוש באמצעות שעון מקומי או בקשה שהתעכבה.

ראיה: בדיקת מרוץ אמיתית שחוצה את גבול הפתיחה ומוכרעת לפי זמן המסד.

למה הוא קיים: זהו לב ההוגנות של המוצר.

[Sources]
- `docs/product.md` — PRED-03, PRED-04 וסעיף 13
- `docs/security.md` — משחקים וניחושים וסדר נעילות lifecycle
- `supabase/migrations/20260826193000_slice9_database_time_serialization.sql`
- `supabase/tests/slice9-time-serialization.test.sql`
- `e2e/prediction-lock.spec.ts`
[/Sources]

## שקף 9 — סיום ליגה הוא הקפאה אטומית

טקסט גלוי:

- שער הסיום נפתח רק כשכל המשחקים סופיים ופתורים.
- באותה פעולה אטומית נשמרים מצב הליגה, snapshot קפוא וסגירת כל הבקשות בשני מצבי ההמתנה עם `LEAGUE_COMPLETED`.
- האסמכתאות, היסטוריית ההחלטות ויומן הביקורת נשמרים.
- תיקון מאוחר עובר reconciliation מפורש ומנוהל בגרסאות; החלטה מיושנת, replay או התאמה לליגה אחרת נדחים.

נקודה: הדירוג הסופי נשאר סופי, אך תיקון מוצדק עדיין אפשרי במסלול מפורש ומתועד.

ראיה: מעבר `active` → `completed` ותיקון מאוחר שאינו משנה את הדוח עד החלטת מנהל מערכת.

למה הוא קיים: להראות כיצד האטומיות וההיסטוריה פותרות את המקרה המסוכן ביותר במוצר.

[Sources]
- `docs/product.md` — S9-PDEC-002–004, LEAGUE-09, MATCH-09 ו־JOIN-14
- `docs/security.md` — lifecycle, review ויישוב תוצאה סופית
- `supabase/migrations/20260827110000_slice9_league_completion.sql`
- `supabase/migrations/20260827120000_slice9_match_review_reconciliation.sql`
- `supabase/tests/slice9-league-completion.test.sql`
- `supabase/tests/slice9-match-review-reconciliation.test.sql`
- `e2e/lifecycle.spec.ts`
[/Sources]

## שקף 10 — כל שכבת בדיקה מוכיחה אמת אחרת

טקסט גלוי:

- Vitest — חוקים, schemas, מתאמים וחישובים טהורים.
- pgTAP — constraints, RLS, grants, אטומיות ומרוצים אמיתיים בין sessions.
- Playwright — זרימות משתמש, הרשאות, נגישות ו־RTL בדפדפן אמיתי.
- בסביבת הבדיקות אין פנייה לספק Sports חי; ב־CI נעשה שימוש ב־recorded fixtures וב־fake transport.

הסכומים המוצגים: 50 קובצי Vitest ו־639 בדיקות; 31 קובצי pgTAP ו־1,496
בדיקות; 38 מתוך 38 בדיקות Playwright עברו.

הסכומים המוצגים במצגת נלקחים רק מפלט `npm run verify` שנצפה על ה־SHA הסופי.

נקודה: כל סיכון נבדק בשכבה שבה הוא באמת קורה.

ראיה: שלושת סוגי הבדיקות והסכומים שנמדדו באותה הרצה סופית.

למה הוא קיים: לתת לבוחן מדדים אמיתיים והסבר מה הם מוכיחים.

[Sources]
- `docs/testing.md`
- `docs/technical-plan.md` — סעיף 14
- `package.json`
- `docs/evidence/slice-9/w7/S9-REQ-002.md`
[/Sources]

## שקף 11 — קנה מידה שנמדד, לא הובטח

טקסט גלוי:

- הקריאות התחומות שנמדדו: dashboard, ליגות זמינות, ניחושים חשופים וחברים פעילים.
- הרשימות תחומות באמצעות Keyset pagination ואינדקסים שתואמים לדפוסי הקריאה.
- הניקוד set-based ב־PostgreSQL; ‏Sync מחולק ל־catalog, ‏targeted ו־reconciliation תחת מכסה.

תוצאות המדידה המוצגות הן `Function Scan` עם 51, 51, 51 ו־26 שורות, לפי סדר
ארבע התוכניות. המספרים נלקחים מפלט `npm run scale:plans` שנצפה על המועמד
הסופי; אין גרף יחסי שאינו מקודד מדידה ואין זמן ריצה תנודתי בשקף.

נקודה: הארכיטקטורה מספיקה ליעד הקורס משום שהשאילתות תחומות ונמדדות.

ראיה: `dashboard_leagues_101`, ‏`eligible_leagues_101`,
`revealed_predictions_202` ו־`active_members_201`.

למה הוא קיים: להחליף הצהרת סקייל כללית בראיה שניתן לשחזר.

[Sources]
- `docs/scale.md`
- `scripts/check-scale-plans.ts`
- `docs/evidence/slice-9/w8/S9-REQ-005.md`
- `supabase/migrations/20260826310000_slice9_keyset_pagination.sql`
- `supabase/migrations/20260827130000_slice9_active_members.sql`
[/Sources]

## שקף 12 — גבולות אמיתיים עדיפים על הבטחות

טקסט גלוי:

- המונוליט המודולרי הוא בחירה מכוונת; שירות נוסף יופיע רק לאחר מדידת צוואר
  בקבוק.
- מחוץ ל־Production נשאר נתיב Manual adapter עובד ובטוח.
- מחוץ לסביבת הייצור אין פרטי גישה לספק ואין פנייה בזמן אמת לספק נתוני ספורט;
  Local, ‏Preview ו־CI משתמשים ב־Manual adapter, ‏recorded fixtures ו־fake
  transport.
- מצב Demo בלבד: אין גבייה, סליקה, החזקת כסף או מסמך פיננסי אמיתי.
- ב־MVP אין שילוב של generative AI בזמן ריצה.
- סיכונים שנותרו: מגבלות ספק, אמינות SMTP ופעולות Hosted/Production שדורשות ראיה נפרדת.

נקודה: המוצר מציג במפורש מה הוא אינו עושה ומה עדיין תלוי בתשתית חיצונית.

ראיה: מטריצת סביבות, מסלול Manual קבוע וסריקות bundle/log שאינן תלויות בסוד.

למה הוא קיים: למנוע הבטחות שאינן נתמכות בקוד או בראיה שנצפתה.

[Sources]
- `docs/product.md` — סעיפים 6, 8.2 ו־15
- `docs/architecture.md` — סעיפים 2, 14 ו־19–21
- `docs/security.md` — סיכונים שיוריים ופעולות owner
- `docs/scale.md` — גבולות ורמזי הרחבה
- `scripts/check-client-secret-absence.ts`
- `scripts/check-sports-secret-boundaries.mjs`
[/Sources]

## שקף 13 — ה־MVP הושלם; העתיד נשאר מחוץ לגבול

טקסט גלוי:

- מימוש ה־MVP: הצטרפות, ניחוש, דירוג והשלמה — מחזור מלא.
- תיקון מאוחר נשאר פרטי, מפורש ומתועד.
- מפרידים רכיב רק אחרי שנמדד צוואר בקבוק אמיתי.
- כסף אמיתי רק אחרי שער משפטי, פרטיות וגיל; generative AI רק לאחר שינוי היקף מאושר.
- כך Predictor1 הופך כללי ליגה פרטית להסכמות שאפשר לבדוק.

קישורים גלויים:

- פתיחת האתר הציבורי: `https://predictor-swart.vercel.app`
- פתיחת מאגר הקוד: `https://github.com/talzantkeren/predictor`

נקודה: העתיד מופרד בבירור ממה שנמסר ונבדק כעת.

ראיה: כל הרחבה מוצמדת לטריגר מתועד, לא לרשימת משאלות כללית.

למה הוא קיים: לסגור את הסיפור באותה תזה שבה נפתח ולתת לבוחן נתיב המשך.

[Sources]
- `docs/product.md` — סעיפים 5.2, 8.2 ו־15
- `docs/scale.md` — גבולות ורמזי הרחבה
- `docs/architecture.md` — סעיפים 2, 19 ו־21
- `docs/deployment.md`
- `presentation/demo-script.md`
[/Sources]

## חוזה בנייה ורינדור

- `scripts/generate-presentation.mjs` הוא מקור העריכה היחיד.
- פקודת הבנייה הדטרמיניסטית היא `npm.cmd run presentation:build`.
- הפלט הוא `presentation/predictor1-final-project.pptx` ביחס 16:9.
- לכל שקף יש בלוק speaker notes תחום ב־`[Sources]` וב־`[/Sources]`.
- לכל שקף יש PNG תואם תחת `presentation/predictor1-final-project/`.
- יש לבדוק את כל שלוש־עשרה התמונות בגודל מלא: סדר מילים, צד הפיסוק,
  clipping, overlap, contrast וקריאות ממרחק הקרנה.
- `npm.cmd run presentation:check` חייב להיכשל אם פסקה עברית חסרה
  `rtl="1"`, אם חסרים מקורות או אם חבילת ההדגמה אינה תואמת למצגת.
