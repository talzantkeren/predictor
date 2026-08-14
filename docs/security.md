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

## ליגות והרשאות ב־Slice 2

- `competitions`, `seasons`, `teams` ו־`matches` הם catalog גלובלי לקריאה בלבד
  עבור `authenticated`. ל־`anon` אין `SELECT`, ולמשתמש רגיל אין הרשאות כתיבה.
- `leagues`, `league_scoring_rules`, `prize_rules` ו־`league_members` מפעילות
  RLS ומעניקות למשתמש רגיל `SELECT` בלבד. אין `INSERT`, `UPDATE` או `DELETE`
  ישירים דרך Data API.
- קריאת נתוני ליגה דורשת חברות פעילה באותה ליגה, או להיות המנהל של אותה ליגה
  לפי `leagues.manager_id` של המשאב — לעולם לא לפי role או flag שהגיעו מהלקוח.
  מנהל קורא גם את חוקי הניקוד ואת חלוקת הפרסים של הליגה שלו גם ללא שורת חברות
  פעילה, בהתאם לחוזה הקריאה member/manager בתוכנית הטכנית. ניהול ליגה אחת אינו
  מקנה שום קריאה בליגה אחרת, וחבר שהוסר מאבד את כל הגישה.
- פונקציות policy ב־schema פרטי הן `SECURITY DEFINER` עם `search_path = ''`.
  הן קוראות `auth.uid()` ומונעות תלות רקורסיבית בין policies של ליגות וחברויות.
- מדיניות `profiles` מאפשרת self read/update כבעבר, ומרחיבה קריאה בלבד לפרופיל
  של חבר פעיל שחולק ליגה פעילה. פרופיל לא קשור אינו ניתן לגילוי או לעדכון.
- `create_league` היא נקודת הכתיבה היחידה ב־Slice: פונקציה אטומית שמקבלת הגדרות
  אך לא actor, manager או user ID. היא גוזרת את היוצר מ־`auth.uid()`, יוצרת ליגה,
  חוקים, פרסים וחברות פעילה, או מבטלת את כל הפעולה.
- ל־RPC יש `search_path = ''`; `EXECUTE` נשלל מ־PUBLIC, מ־`anon` ומ־`service_role`
  ומוענק רק ל־`authenticated`. שגיאות צפויות ממופות לקודים בטוחים וה־UI אינו
  מחזיר SQL.
- סכומי Demo נשמרים באגורות שלמות ואחוזים ב־basis points שלמים. אין שדה payment
  URL. הוראות Demo נשמרות ומוצגות כטקסט בלבד: שתי שכבות ה־validation (Zod
  ו־constraint) דוחות קישורים מפורשים — `http://`, `https://` או `www.` — וטקסט
  חופשי אחר אינו הופך לקישור בעמוד. השארית המקובלת: טקסט חופשי יכול לתאר העברה
  ידנית, וגילוי ה־Demo הקבוע מבהיר שמדובר בסימולציה בלבד.
- שדות הטקסט של הליגה דוחים תווי בקרה ב־Zod וב־check constraints: שם הליגה הוא
  חד־שורתי לחלוטין, והתיאור והוראות ה־Demo מתירים רק tab ומעברי שורה.
- allowlist ההפניות לאחר התחברות מקבל בדיוק את `/dashboard`, `/profile`,
  `/update-password`, `/leagues/new` ונתיב סיכום ליגה עם UUID תקין. כל ערך אחר —
  כולל origin חיצוני, `//`, backslash, query או fragment — חוזר ל־`/dashboard`.
- יצירת ליגה אינה אידמפוטנטית גלובלית: שליחה חוזרת מפורשת יוצרת ליגה חדשה
  ותקינה. ה־UI מנטרל double-submit באמצעות pending state ו־redirect לאחר הצלחה,
  ואין מצב חלקי או נסתר במסד.
- trigger במסד מעלה את גרסת חוקי הניקוד בכל שינוי מותר, ודוחה שינוי לאחר
  `locked_at` או כאשר `now()` של PostgreSQL הגיע ל־kickoff הראשון בעונת הליגה.
- סכום פרסים של 10000 bps ומיקומים רצופים נבדקים בתוך ה־RPC וגם ב־constraint
  trigger deferred שבודק את שני צדי העברה בין ליגות, כך שגם כתיבה privileged
  עתידית אינה יכולה להשאיר מצב חלקי.
- אין שימוש ב־admin client או ב־`SUPABASE_SECRET_KEY` בזרימות Slice 2.
