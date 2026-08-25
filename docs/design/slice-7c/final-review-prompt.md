# פרומפט ביקורת סופית ל־Claude Code — Slice 7c

העתק את כל הטקסט הבא ל־Claude Code כאשר הוא פתוח בשורש המאגר:

---

בצע ביקורת קוד עצמאית וסופית לשינויי Slice 7c במאגר Predictor1. זו ביקורת
בלבד: אל תשנה קבצים, אל תבצע commit, push, deploy, reset או seed, ואל תתקן את
הממצאים בעצמך. שמור את ה־working tree ללא שינוי.

לפני הביקורת קרא לפי הסדר את `AGENTS.md`, ‏`docs/product.md`,
`docs/architecture.md`, ‏`docs/technical-plan.md`, ואם קיים גם את
`Internet Technologies.pdf` או `project_sources/01-Internet-Technologies.pdf`.
לאחר מכן קרא את `docs/design-brief.md`, ‏`docs/design/slice-7c/README.md`,
`docs/design/slice-7c/implementation-review-prompt.md` ואת כל ה־diff הלא־מחויב.
המסמכים הקנוניים והקוד גוברים על ה־mockups.

מטרת הביקורת היא לוודא שממצאי הביקורת הקודמת נסגרו בלי regression. בדוק במיוחד:

1. `src/app/globals.css` מגדיר `--color-control-border: #7f90a4`, וכל בקר טופס
   גלוי (`input`, ‏`select`, ‏`textarea`, העלאת קובץ ושדה readonly) משתמש ב־
   `border-control-border`. אמת יחס ניגודיות של לפחות 3:1 מול הרקע שבו הבקר
   מופיע. ודא שמסגרות דקורטיביות של cards נשארות `border-line` ולא הוכהו
   בטעות.
2. בדוק את `/leagues/[leagueId]/members` ואת
   `/leagues/[leagueId]/settings`, כולל
   `manager-join-request-card.tsx` ו־`invite-controls.tsx`. הם צריכים להשתמש
   במעטפת, ב־`LeagueTabs`, בצבעים ובמצבי הרכיבים של Slice 7c; אין לאפשר שינוי
   ב־query, ‏Server Action, ‏AuthZ, תפקידי מנהל, מסלולים או כללי מוצר.
3. ב־`match-row.tsx` אין הכרזה כפולה של "הניחוש שלי" לקורא מסך.
4. ב־`round-card.tsx` פס ההתקדמות מוכרז פעם אחת בלבד, והקטעים שטרם הושלמו
   נשארים נראים. אין להציג progress למשתמש שאינו חבר פעיל.
5. ב־`standings/loading.tsx` מצב הטעינה נגיש ועקבי בלי status כפול.
6. ב־`src/app/(app)/matches/[matchId]/page.tsx` שמות הבית והחוץ בכותרת
   מבודדים ב־`bdi`, סדר הבית/חוץ נכון ב־RTL, ומפריד של תוצאה לא גמורה מקבל
   שם נגיש תקין בלי `aria-label` אסור על אלמנט גנרי.
7. בדוק focus גלוי, labels, touch targets של 44px לפחות, overflow, טקסט מעורב
   עברית/לטינית ו־`prefers-reduced-motion`. בדוק 360px, ‏390px, ‏768px,
   ‏1024px ו־1440px, לפחות במסכי העוגן ובמסכי החברים וההגדרות.
8. ודא שלא נוספו dependency, SDK של כלי עיצוב, route, schema, migration,
   client state, AI, real-money capability או חשיפה של אסמכתאה פרטית. אין
   להחליש בדיקות RLS/AuthZ או את נעילת הניחושים לפי זמן מסד הנתונים.

הרץ, אם סביבת Supabase המקומית זמינה בלבד, את שערי האימות הבאים:

```text
npm run lint
npm run typecheck
npm run test
npm run build
npm run types:check
npm run test:db
npm run test:e2e
```

אל תפנה לספק Sports חי ואל תשתמש בפרויקט Supabase מקושר/Production. אל תפתח,
תציג או תעתיק `.env`, מפתחות, cookies, PII, proof content/path, signed URLs או
payload מלא של ספק. אם שער אינו יכול לרוץ, דווח בדיוק למה במקום לסמן אותו
כעובר.

החזר תשובה במבנה הבא:

1. `Findings` תחילה, לפי חומרה S0–S3, עם `file:line`, השפעה ודרך שחזור. אל
   תציג מחמאה כללית במקום ממצאים. אם אין ממצאים, כתוב במפורש `No findings`.
2. טבלת `Previous findings` עבור: ניגודיות מסגרות בקרים; מסכי members/settings;
   הכרזת ניחוש כפולה; progress כפול/חלש; loading של דירוג; `bdi` ומפריד התוצאה.
   סמן כל סעיף `Fixed`, ‏`Partially fixed` או `Open` והוסף ראיה קצרה.
3. `Verification` עם תוצאת כל פקודה, מספר בדיקות שעברו ומדידות viewport.
4. `Residual risks` — דברים שלא נבדקו בפועל בלבד.
5. `Verdict`: אחד מ־`Approve for Preview`, ‏`Approve with non-blocking notes`
   או `Changes required before Preview`.

---
