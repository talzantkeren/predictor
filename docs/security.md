# Predictor1 — אבטחה

## זהות ו־session ב־Slice 1

- ההזדהות היא Email + Password באמצעות Supabase Auth ו־`@supabase/ssr`.
- ה־session נשמר ב־cookies של SSR. אין token ידני ב־`localStorage`, Auth Context
  או state גלובלי.
- `src/proxy.ts` מרענן session ומבצע redirects בסיסיים בלבד. כל עמוד ו־Server
  Action מוגנים קוראים `getUser()` מחדש מול Supabase.
- ה־Proxy מעביר את כותרות ה־cache ש־`@supabase/ssr` מספק בכל רענון session.
  `/auth/confirm` מעביר אותן לתגובת ה־redirect ומגדיר תמיד `private, no-store`;
  Server Actions הן בקשות POST שאינן נשמרות ב־cache.
- `/auth/confirm` מוחק את פרטי ה־token מהיעד, חוסם redirects שאינם ב־allowlist
  ומוסיף `Referrer-Policy: no-referrer`.
- קישורי Email משתמשים ב־PKCE. פתיחה מחוץ לדפדפן שיזם את הבקשה אינה יכולה
  להחליף את הקוד ב־session: באישור הכתובת המשתמש מופנה להתחברות ידנית, ובשחזור
  הוא מקבל הנחיה לבקש קישור חדש בדפדפן הנוכחי. היעד נגזר רק מ־origin ו־path
  שנמצאים ב־allowlist.
- מסך עדכון הסיסמה דורש user מאומת. cookie `HttpOnly` קצר־חיים מסמן ל־UI
  שה־session נוצר בזרימת recovery, אך אינו מתועד או נחשב גבול הרשאה: לקוח HTTP
  יכול לזייף אותו. ה־Server Action מוחק את הסמן לאחר הצלחה או session לא תקף.
- כל מוטציות Auth מאומתות מחדש ב־Server Actions באמצעות Zod. מינימום הסיסמה
  נאכף בנוסף ב־Supabase Auth עצמו, כך שקריאה ישירה ל־endpoint אינה עוקפת אותו.

## פרופילים והרשאות

- `profiles.id` קשור ל־`auth.users.id`, ופרופיל נוצר ב־trigger מאובטח לאחר
  יצירת משתמש Auth.
- פונקציית ה־trigger היא `SECURITY DEFINER` עם `search_path = ''`, שמות schema
  מלאים וללא הרשאת `EXECUTE` ל־PUBLIC, `anon` או `authenticated`.
- RLS מאפשרת למשתמש authenticated לקרוא ולעדכן רק את הרשומה שלו.
- column grants מאפשרים מהלקוח עדכון של `display_name` בלבד. אין insert,
  delete או עדכון של `id`, `created_at` ו־`updated_at`.
- Zod מאמת קלט בגבול האפליקציה, ו־PostgreSQL אוכף מחדש trim תואם
  `String.trim()` ואורך 2–50, כולל tab, מעברי שורה ו־NBSP.

## פרטיות ושגיאות

- שחזור סיסמה מחזיר תמיד הודעה עקבית שאינה מגלה אם כתובת Email רשומה.
- הודעות UI ממופות מקודי Auth מוכרים; הודעות ספק, SQL ו־stack traces אינן
  מוחזרות למשתמש.
- אין שימוש ב־`SUPABASE_SECRET_KEY` או ב־admin client בזרימות Auth/Profile.
- CI משתמש רק ב־Supabase ו־Mailpit מקומיים ואינו מדפיס את פלט המפתחות של
  `supabase start`.
