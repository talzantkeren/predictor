# פרומפט ביקורת ממוקדת ל־Claude Code — סגירת הערות S3

העתק את כל הטקסט הבא ל־Claude Code כאשר הוא פתוח בשורש המאגר:

---

בצע ביקורת קוד ממוקדת וסופית על סגירת הערות S3 של Slice 7c ב־Predictor1.
זו ביקורת בלבד: אל תשנה קבצים, אל תבצע commit, push, deploy, reset או seed,
ואל תפתח או תציג `.env`, מפתחות, cookies, PII, proof paths או signed URLs.

קרא תחילה את `AGENTS.md`, ‏`docs/product.md`, ‏`docs/architecture.md`,
`docs/technical-plan.md`, ‏`docs/design/slice-7c/README.md` ואת ה־diff הנוכחי.
המסמכים הקנוניים גוברים על מסמכי העיצוב.

בדוק רק את הסעיפים הבאים ואת הסיכון לרגרסיה שנובע מהם:

1. `src/features/leagues/components/league-form.tsx`: שדה `prizePosition`
   נשאר readonly, רקעו לבן והמסגרת היא `border-control-border`. אמת יחס
   ניגודיות של לפחות 3:1 בין `#7f90a4` ללבן משני צדי המסגרת.
2. `src/features/membership/components/invite-controls.tsx`: שדה
   `new-invite-link` נשאר readonly ולבן; ה־section העוטף לבן עם accent אמרלד
   סמנטי, ולא עם מילוי שפוגע בניגודיות. ודא שאין שינוי ביצירה, העתקה, החלפה
   או ביטול של קישור ההזמנה.
3. בכל `src/features/auth/components/*.tsx` וב־
   `src/features/scoring/components/manual-result-form.tsx` אין עוד
   `focus:border-blue-600`, ‏`focus:ring-blue-200`, ‏`text-slate-800` או
   `disabled:bg-slate-100`. מצבי focus משתמשים ב־`focus`/`navy` tokens,
   תוויות ב־`text-ink` ו־disabled ב־`locked` token.
4. בדוק את assertions החדשים ב־`e2e/leagues.spec.ts` וב־
   `e2e/join-and-proofs.spec.ts`: הם צריכים לבדוק את צבעי הרקע והמסגרת בלי
   להחליש את זרימות היצירה, ההזמנה וה־AuthZ הקיימות.
5. ודא שאין שינוי ב־queries, Actions, services, schema, migrations, RLS,
   נעילת ניחושים, dependency, route או יכולת כסף אמיתי.

הרץ בסביבת Supabase מקומית בלבד:

```text
npm run lint
npm run typecheck
npm run test
npm run build
npm run types:check
npm run test:db
npm run test:e2e
```

החזר:

1. `Findings` לפי S0–S3 עם `file:line`; אם אין, כתוב `No findings`.
2. טבלה עבור S3-1, S3-2 ו־S3-3 עם `Fixed`, ‏`Partially fixed` או `Open`
   וראיה קצרה לכל סעיף.
3. תוצאות כל שערי האימות ומספר הבדיקות.
4. סיכונים שלא נבדקו בפועל.
5. verdict אחד: `Approve for Preview` או `Changes required before Preview`.

---
