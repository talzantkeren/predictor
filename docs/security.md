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

## הזמנות, בקשות ואסמכתאות Demo ב־Slice 3

### הזמנה ו־return path

- פונקציית PostgreSQL מייצרת secret של 32 bytes אקראיים ומחזירה base64url ללא
  padding פעם אחת בלבד, יחד עם `public_id` אקראי נפרד. רק SHA-256 hash נשמר;
  אין עמודה, לוג, audit metadata או snapshot שמכילים את ה־secret הגולמי. קישור
  חדש תקף בדיוק שבעה ימים לפי זמן DB.
- הקישור הוא `/invite/[publicId]#invite=[secret]`. RFC 3986 מפריד Fragment לפני
  dereference, ולכן בקשת הדף ולוגי הנתיב של Vercel מכילים רק UUID ציבורי. Client
  Component מקבל רק Fragment יחיד וקנוני, מסיר אותו מיד מהיסטוריית הכתובת עם
  `history.replaceState`, מחשב SHA-256 ב־Web Crypto ושולח ל־exchange רק digest
  קטן־אותיות בן 64 hex. ה־secret הגולמי אינו נשלח ל־Vercel גם בגוף בקשה,
  ל־PostgREST או ל־Server Action.
- `POST /api/invites/[publicId]/exchange` דורש Origin מדויק, JSON חסום ל־256
  bytes וזוג `publicId`+digest תקין. ה־RPC מאמת שוב את הצורה ואת ההתאמה לרשומה.
  הצלחה מציבה cookie `predictor_invite_access` מסוג HttpOnly, `SameSite=Lax`,
  Secure בפריסה, מוגבל ל־`/invite/[publicId]` ול־30 דקות. ערכו הוא public ID
  ו־digest בלבד; הוא bearer-equivalent ולכן אסור בלוגים, אך JavaScript אינו יכול
  לקרוא אותו וכל שימוש עדיין נבדק מול revoke/expiry/eligibility במסד.
- לכל ליגה יש לכל היותר הזמנה `active` אחת. create/rotate נועלת את שורת הליגה,
  מבטלת קישור קודם ויוצרת חדש באותה transaction. ההזמנה הראשונה מעבירה ליגה
  `draft` ל־`open`; אין פתיחה מחדש של ליגה שהושלמה או אורכבה.
- revoke ו־expiry חוסמים בקשה חדשה מיד, אך אינם מוחקים או שוללים העלאה מבקשה
  קיימת. submission נועל ואוכף שוב status, late join, `joins_close_at`, מנהל,
  חברות ובקשה פעילה; partial unique index הוא ההגנה הסופית בפני race.
- `/invite/[publicId]` ו־exchange הם dynamic ו־no-store, עם `noindex`,
  `nofollow` ו־`Referrer-Policy: no-referrer`. קישור לא זמין מחזיר מצב אחיד
  שאינו מגלה ליגה. אין analytics או משאבי צד שלישי בעמוד. Vercel Runtime Logs
  עשויים לשמור את הנתיב, אך כעת הוא מכיל public ID בלבד ולא secret. ה־Fragment
  נראה לזמן קצר למשתמש, ל־clipboard ולסביבת הדפדפן; תוסף דפדפן זדוני או צילום
  כתובת נשארים סיכון משתמש שיורי, וה־bootstrap דורש JavaScript.
- `next` מקבל רק נתיב יחסי מדויק ב־allowlist, כולל public ID קנוני בלבד.
  absolute/protocol-relative URLs, query/fragment לא צפויים, backslash, קידוד
  עוקף ותווי בקרה נדחים. login משמר את היעד המאומת בפרמטר פנימי. registration
  שומר אותו עד 30 דקות ב־cookie `HttpOnly`, `SameSite=Lax`, שמוגבל ל־
  `/auth/confirm`; כתובת callback שנשלחת ל־Supabase/Email אינה כוללת invite secret.
  ה־callback צורך ומוחק את ה־cookie. אישור בדפדפן אחר חסר את ה־cookie ואת PKCE
  verifier ולכן חוזר ל־login/Dashboard בלי לשכפל את token בהודעת Email.

### גבול Storage והעלאה

- `payment-proofs` הוא bucket פרטי, עד 4,000,000 bytes ו־`image/webp` בלבד.
  אין policies ל־`anon` או `authenticated` על `storage.objects`, ולכן דפדפן אינו
  יכול לעקוף את Route Handler ולשמור bytes לא מסוננים.
- החריג המצומצם לשימוש ב־`SUPABASE_SECRET_KEY` הוא gateway עם `server-only`
  ו־bucket קבוע. הוא גוזר path רק מ־UUIDs שאושרו, מעלה WebP מסונן עם
  `upsert: false`, ובודק מחדש MIME/signature/גודל/digest וממדים של פלט ה־sanitizer
  לפני שימוש ב־secret. הוא מוחק בפיצוי ויוצר signed URL לאחר AuthZ ואינו חושף client
  כללי, bucket/path שרירותיים ואינו כותב טבלאות עסקיות.
- ה־Handler דורש `DEMO_MODE=true`, session, Origin זהה ל־
  `NEXT_PUBLIC_APP_URL` או ל־origin מדויק שמגיע ממשתנה deployment מהימן של
  Vercel (`VERCEL_BRANCH_URL`/`VERCEL_URL`), והרשאת owner לפני עבודה privileged.
  אין הסתמכות על Host/forwarded-host מהבקשה. הוא קורא stream
  חסום ל־4,250,000 bytes גם ללא `Content-Length`, מקבל file יחיד בשם `proof`
  ומפתח idempotency מסוג UUID.
- הקלט מוגבל ל־JPEG/PNG/WebP עד 4,000,000 bytes. סיומת, MIME ו־magic bytes
  חייבים להתאים. `sharp` מפענח תמונה חד־עמודית עם עד 20,000,000 pixels,
  מפעיל orientation, מתאים לתיבה 2000×2000 ללא הגדלה, מסיר metadata ומקודד
  WebP חדש. המקור, שמו ו־EXIF אינם נשמרים.
- עד חמש הוכחות נשמרות append-only לכל בקשה. מפתח idempotency זהה עם digest
  זהה מחזיר את התוצאה הקיימת; תוכן אחר עם אותו מפתח נדחה. המכסה המתמשכת היא
  חמש ניסיונות למשתמש+בקשה ב־15 דקות ו־20 למשתמש ב־24 שעות.
- לאחר upload, RPC user-scoped נועל את הבקשה, מאמת שוב owner/status ואת ה־object
  המדויק ב־`storage.objects`, מוסיף metadata ומעביר `pending_proof` ל־
  `pending_approval` אטומית. רק SQLSTATE שמוכיח rollback — `P0001`, מחלקות
  `22`/`23`, או מחלקה `40` למעט `40003` — הוא rejection מובהק שמאפשר מחיקת
  פיצוי. מחלקה `08`, `40003`, shutdown, כשל transport/schema וקוד חסר או לא
  מוכר נשארים עמומים כי ייתכן שה־commit כבר הושלם; במקרה כזה משוחזרת פעם אחת
  בדיוק אותה קריאת finalizer אידמפוטנטית.
  replay מוצלח שומר את ה־object שאליו מצביעה רשומת ה־DB. אם גם ה־replay אינו
  מכריע, אין למחוק object שאולי כבר מקושר: הוא נשאר פרטי ונרשם רק האירוע המסונן
  `{"event":"proof_upload_compensation_failed","recovery":"private_orphan_reconciliation"}`;
  אותו אירוע נרשם גם אם מחיקת פיצוי מובהקת נכשלת. התאוששות תפעולית
  מאתרת objects ישנים ללא `payment_proofs` תואם, מצליבה עם האירוע ומוחקת אותם
  רק דרך אותו gateway לאחר review.
- רק status ברשימת rejection סגורה (`400`, `401`, `403`, `404`, `409`, `411`,
  `413`, `415`, `422`, `429`) מוכיח שכשל Storage קדם ל־commit: לא מופעל finalizer
  ואין צורך ב־reconciliation. `408`, `425`, `499`, כל `5xx`, transport ו־status
  חסר/לא מוכר הם עמומים כי upload עשוי היה להישמר; אין finalization ואין מחיקה,
  ונשלח אותו signal מסונן. מחיקה של הנתיב
  אינה בטוחה בשלב זה כי `upsert: false` אינו מוכיח שה־object שייך לניסיון הנוכחי
  ולא להתנגשות קיימת; cleanup מותנה ידרוש ownership marker ייחודי בחוזה ה־Gateway.

### צפייה, RLS וסיכון שיורי

- כתיבות טבלה וכל metadata רגיש אינם נגישים ישירות ללקוח. `authenticated`
  רשאי לקרוא תחת RLS רק את בקשתו/בקשת הליגה שהוא מנהל ועמודות proof בטוחות
  (`id`, שיוך בקשה, MIME, גודל וזמן). token hash, path, digest, מפתח
  idempotency, שם מקורי ו־URL אינם ניתנים לקריאה. ה־RPCs של ה־UI מצמצמים זאת
  עוד ל־DTO הדרוש למסך.
- endpoint צפייה מקבל proof UUID בלבד, מאמת uploader או manager של אותה ליגה,
  מחזיר אותה תשובת 404 לחסר/אסור ומייצר signed access לעד 60 שניות. אין חריג
  system-admin ב־Slice 3. ה־path נשמר מחוץ ל־DTOs/תגובות upload ואינו נחשף
  למשתמש לא מורשה; הוא כן מופיע, בהכרח, ב־Supabase signed URL שמקבל משתמש
  מורשה למשך החלון הקצר, ולכן גם ה־URL וגם ה־path אסורים בלוגים וב־artifacts.
- magic-byte detection ו־decode/re-encode מפחיתים סיכון אך אינם antivirus או
  הוכחה שקובץ אינו זדוני. סריקת malware מלאה ו־retention אוטומטי נשארים מחוץ
  ל־MVP. קובץ SVG/executable מוסווה נדחה; אם payload נלווה לתמונה תקינה עדיין
  ניתן לפענוח, המקור כולו נזרק ורק WebP חדש שנוצר מהפיקסלים נשמר. זו נטרול דרך
  re-encode ולא טענה לזיהוי polyglot מושלם. משתמשים רק בתמונות סינתטיות ואסור
  להעלות מסמך פיננסי אמיתי.

| איום | גבול אכיפה | בדיקה |
| --- | --- | --- |
| secret גולמי בנתיב/לוג או קישור ישן | public-ID path + Fragment שנמחק לפני רשת, hash-only, cookie HttpOnly קצר, rotation/expiry ב־DB | network-target assertion, exchange Route, refresh, rotate, revoke וחיפוש diff/log |
| בקשה כפולה או invite race | row lock + partial unique + idempotent RPC | שתי submissions/rotations מקבילות |
| IDOR של request/proof | session + resource AuthZ + RLS/opaque 404 | requester/outsider/manager ליגה אחרת |
| עקיפת sanitization | אין Storage policies ללקוחות; gateway קבוע | CRUD ישיר כ־anon/authenticated |
| MIME מזויף/image bomb | extension+MIME+magic, Sharp limits ו־re-encode | SVG/PDF/HTML/exe/corrupt/multi-page/oversize |
| retry שיוצר היסטוריה כפולה | digest + idempotency unique + compensation | retry זהה/שונה ומקביל |
| דליפת path או signed URL למשתמש לא מורשה או ל־artifact | DTO allowlist, AuthZ, TTL קצר, no-store ולוגים מסוננים | תגובות upload/denial, bundle וחיפוש repository; משתמש מורשה רואה אותו ב־redirect בלבד |
