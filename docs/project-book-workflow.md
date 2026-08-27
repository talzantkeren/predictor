# תהליך יצירה ובדיקה — ספר הפרויקט

`docs/project-book.docx` הוא תוצר נגזר. מקורות האמת נשארים `product.md`,
`architecture.md` ו־`technical-plan.md`; הקובץ `project-book-source.md` הוא תקציר
מסירה קריא בלבד ואינו מקור דרישות נוסף.

## עדכון

1. פותרים סתירה בקוד ובמקור הקנוני המתאים לפני שינוי הספר.
2. מריצים מחדש את בדיקות הפרויקט ומעדכנים ב־`project-book-source.md` רק תוצאות
   שנצפו בפועל. אין לשכתב ראיה היסטורית.
3. מתקינים את כלי המסמכים בסביבת Python נפרדת:
   `python -m pip install -r docs/requirements-docs.txt`.
4. מריצים `npm run docs:book`. הגנרטור מייצר את ה־DOCX באופן דטרמיניסטי,
   מאמת קישורים מקומיים ומקבע metadata וזמני ZIP.
5. מריצים `npm run docs:book:check` ואת
   `npx vitest run src/lib/project-book-contract.test.ts`. בדיקת drift מייצרת
   עותק זמני ודורשת התאמה byte-for-byte לקובץ שב־Git.

## Render ובדיקה חזותית

מריצים את `render_docx.py` מחבילת Documents של סביבת העבודה. אם LibreOffice
אינו מותקן, מייצאים PDF דרך Microsoft Word במצב read-only וממירים כל עמוד ל־PNG
באמצעות Poppler. בכל מקרה בודקים כל PNG ב־100% ולא מסתפקים בחילוץ טקסט.

רשימת הבדיקה המחייבת:

- כל עמוד קיים, מאוזן וקריא; אין clipping, overlap או עמוד כמעט ריק.
- RTL תקין בפסקאות, ברשימות ובטבלאות; Latin ומספרים נשארים קריאים.
- כותרת עליונה ותחתונה אינן נוגעות בתוכן; תאריך וגרסה עדכניים.
- טבלאות נשארות בתוך השוליים, header חוזר ו־cell padding קריא.
- כל הקישורים ב־`project-book-source.md` נמצאים או משתמשים ב־HTTPS.
- אין טענת בדיקה שלא נצפתה, אין תיאור של דוח כספי ואין שלב שהושלם מוצג כשלב הבא.

אחרי כל שינוי ב־source או בגנרטור חוזרים על generation, drift check, render
ובדיקה חזותית של כל העמודים. קובצי PDF/PNG הם ראיית QA זמנית ואינם נמסרים ל־Git.
