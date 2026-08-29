# פרומפט לביקורת תוכנית המימוש ב־Claude Code

העתק את הטקסט הבא לצ'אט של Claude Code לאחר פתיחת מאגר Predictor1:

---

בצע Design and Architecture Review בלבד לתוכנית המימוש של Slice 7c. אל תכתוב
קוד, אל תשנה קבצים ואל תרחיב scope.

קרא תחילה את `AGENTS.md`, ולאחר מכן לפי הסדר:

1. `docs/product.md`
2. `docs/architecture.md`
3. `docs/technical-plan.md`
4. `docs/design-brief.md`
5. `docs/design/slice-7c/README.md`
6. `docs/design/slice-7c/claude-design-export.html`
7. כל הקבצים תחת `docs/design/slice-7c/mockups/`

לאחר מכן בדוק את הקוד הקיים בארבעת מסכי העוגן ואת הרכיבים והבדיקות שהם
משתמשים בהם. חומרי העיצוב הם reference בלבד; במקרה סתירה המסמכים הקנוניים,
האבטחה וההתנהגות הקיימת גוברים.

## מטרת Slice 7c

ליישם שפה חזותית עברית ו־RTL אחידה ב־`/dashboard`,
`/leagues/[leagueId]`, `/leagues/[leagueId]/matches` וב־
`/leagues/[leagueId]/standings`, ברוחבים 390px, 768px ו־1440px, בלי שינוי
schema, RLS, הרשאות, routes, Server Actions או חוקים עסקיים.

## גבולות שאינם נתונים למשא ומתן

- Next.js 16 App Router, TypeScript strict, Tailwind CSS v4 ו־Server Components
  כברירת מחדל.
- אין migration, generated-types change, ספריית UI/אייקונים/אנימציה, global
  client state, Dark Mode או runtime integration עם כלי עיצוב.
- זמן מסד הנתונים ממשיך לקבוע נעילת ניחושים; סדר home/away וחוזי הניקוד אינם
  משתנים.
- proof פרטי אינו נטען מראש; צפייה ממשיכה דרך Route ההרשאה וה־signed URL הקיים.
- אין להעתיק את ה־HTML או ה־inline styles של Claude Design לקוד הייצור.

## תוכנית המימוש לביקורת

### 1. Foundation

- להרחיב את `src/app/globals.css` ב־tokens של ה־handoff: נייבי, אמרלד, צבעי
  success/warning/error/locked, רקע, surface, border, טקסט, focus, spacing,
  radius, shadow ו־motion של 120–160ms.
- להוסיף Heebo דרך `next/font` עם fallback, בלי package או בקשת runtime חדשה.
- לשמור `lang="he"`, `dir="rtl"`, metadata ו־semantic HTML.
- לעדכן את `src/app/(app)/layout.tsx` ואת
  `src/features/auth/components/app-header.tsx` למעטפת P1 נגישה: skip link,
  Dashboard, Profile והתנתקות, ללא sidebar או bottom navigation.
- `prefers-reduced-motion` מבטל shimmer ותנועה לא חיונית.

### 2. רכיבים

- רכיבים כלליים מצומצמים תחת `src/components/ui`: `DemoNotice`,
  `StatusBadge`, `EmptyState` ו־`ErrorState`.
- רכיבי ליגה תחת `src/features/leagues/components`: `LeagueCard`,
  `LeagueTabs` ו־`LeaguePageHeader`.
- רכיבי ניחוש תחת `src/features/predictions/components`: `RoundCard` ו־
  `MatchRow`, וכן helper טהור ומפורש לקיבוץ משחקים לפי מחזור.
- לא ליצור generic Button/Card framework, מערכת variants גדולה או `utils.ts`.

### 3. ניווט ליגה

- `LeagueTabs` הוא `<nav>` עם קישורים ל־Routes, לא ARIA tabs.
- סקירה, משחקים ודירוג מוצגים למורשים; חברים והגדרות למנהל בלבד.
- `getLeagueMatchList` ו־`getLeagueStandings` כבר בוחרים `manager_id`. אפשר
  להחזיר `viewerIsManager` שנגזר מהשורה שכבר נקראה, בלי DB query נוסף.
- במובייל הניווט גולל אופקית בלי לגרום page overflow.

### 4. Dashboard

- לעצב מחדש את `src/app/(app)/dashboard/page.tsx` ואת רכיבי בקשות ההצטרפות
  באמצעות הנתונים הקיימים בלבד: profile, `getDashboardLeagues` ו־
  `getMyJoinRequests`.
- ליישם PageHeader, LeagueCard, CTA ליצירת ליגה, DemoNotice ומצבי
  loading/empty/error.
- לא להוסיף ספירת "ניחושים פתוחים" או query מצרפי חדש. "הפעולה הבאה" מופיעה
  רק אם היא נגזרת מבקשות ההצטרפות שכבר נטענו; אחרת היא מושמטת.
- שמות ארוכים, role ועונה אינם חופפים או נחתכים במובייל.

### 5. תקציר ליגה

- לעצב מחדש את `src/app/(app)/leagues/[leagueId]/page.tsx` עם הנתונים שכבר
  מוחזרים מ־`getLeagueSummary`: זהות, תיאור, role/status, Demo, חוקי ניקוד,
  פרסים ופעולות מנהל.
- ה־mockup מציג משחק קרוב, אך ה־query אינו קורא משחקים. לא נוסף query דקורטיבי
  ולא מוצגים קבוצות/זמן מומצאים. קישור ברור למסך המשחקים נשאר.
- pattern כהה מופיע רק במקום שיש בו נתוני משחק אמיתיים; אין להשתמש בו כקישוט
  מאחורי Demo, טפסים או טבלאות.

### 6. משחקים וניחושים

- לעדכן את דף המשחקים וה־loading הקיים בלי לשנות את `getLeagueMatchList`,
  המסננים או search params.
- לקבץ בצד השרת את המשחקים לפי `roundNumber` וליצור `RoundCard` לכל מחזור.
- התקדמות מחושבת רק מ־`ownPrediction` של המשחקים שכבר התקבלו.
- `MatchRow` שומר home ראשון מימין, משתמש ב־`LocalDateTime`,
  `LockCountdown`, `databaseNow` ופונקציות ה־display הקיימות, ומציג תוצאה רק
  כאשר החוזה הקיים מאפשר זאת.
- רקע המגרש הוא CSS/SVG מקומי קטן, ללא URL או צילום, ורק באזור משחק מרכזי.

החלטת scope לביקורת: ה־mockup מציג שמירת ניחוש inline, אבל המוצר הקיים שומר
דרך `/matches/[matchId]` ו־`PredictionForm`. התוכנית משאירה את המוטציה במסך
הבודד, מציגה ב־MatchRow את הניחוש והמצב הקיימים, ומשתמשת ב־CTA "פתיחת המשחק
והניחוש" או "עדכון הניחוש". מסך המשחק הבודד והטופס מקבלים styling מינימלי עם
אותם tokens. כך אין client form לכל שורה, duplication של state או שינוי flow
אבטחתי. בדוק אם הפשרה שומרת מספיק על הכוונה של `RoundCard`.

### 7. דירוג

- לשמור את `getLeagueStandings` וחוקי הדירוג.
- טבלה מ־768px ומעלה ושורות־כרטיס מתחת; הדגשת המשתמש לפי `user.id` הקיים.
- להציג שוויון 1,1,3, tag שוויון, chip "את/ה", `tabular-nums`, caption ושמות
  ארוכים ללא overflow.
- אין מיון אינטראקטיבי חדש; חץ, אם נשאר, מתאר את הסדר הקבוע בלבד.

### 8. נגישות ומצבים

- loading, empty, error, success, disabled, locked, focus ו־hover לפי הצורך.
- touch targets של 44px, focus נראה, סטטוס שאינו תלוי רק בצבע, `role="alert"`,
  `aria-busy`, בידוד bidi והיעדר horizontal overflow ב־390px.
- אין `dangerouslySetInnerHTML`, proof preload, secret או SDK עיצוב ב־bundle.

### 9. בדיקות

- Vitest ל־helper קיבוץ מחזורים: סדר, progress, קלט ריק, מצבים מעורבים ואי־שינוי
  input.
- Playwright שומר את זרימות Auth, ליגות, proof, ניחוש, נעילה, חשיפה, ניקוד,
  דירוג ו־cross-user authorization.
- assertions נוספים ל־app shell, ארבעת מסכי העוגן, overflow ב־390/1440,
  home/away, keyboard/focus, שוויון, שם ארוך והיעדר טעינת proof כתמונה.
- לא להוסיף screenshot baselines שבירים אם בדיקות סמנטיות ו־QA ידני מספיקים.
- שער יציאה: lint, typecheck, unit, client-secret check, build, DB tests,
  generated-types drift ו־E2E, בתוספת QA ידני ב־390/768/1440.

### 10. סגירה

הערת ארכיון: לאחר Preview ואישור חזותי עודכנו technical plan, testing, README
וספר הפרויקט; Slice 7c נסגר ו־Slice 8 בוצע לאחריו. זו אינה הנחיית השלב הבא.

## שאלות הביקורת

1. האם נכון להשאיר עריכת ניחוש במסך המשחק הבודד ולא ליצור form inline?
2. האם נכון לוותר על upcoming match בתקציר כדי לא להוסיף query?
3. האם נכון להשמיט dashboard aggregation חדש?
4. האם מבנה הרכיבים מינימלי וממוקם בגבולות feature נכונים?
5. האם קיימים סיכוני RTL, responsive, accessibility או אבטחה שלא טופלו?
6. האם Heebo דרך `next/font` מתאים ללא dependency/runtime request חדש?

החזר: פסק דין כללי; blockers; התייחסות לשלוש הפשרות; תיקוני Must/Should/Could;
סיכוני RTL/responsive/accessibility; והמלצה סופית אם להתחיל implementation.
אל תכתוב קוד ואל תרחיב scope.

---
