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
- כל מוטציות Auth מאומתות מחדש ב־Server Actions באמצעות Zod. היישום דורש
  כרגע סיסמה באורך 8–128 תווים. מדיניות Hosted חייבת להיבדק בראיה לקריאה
  בלבד ולהישאר תואמת; אין להציג configuration חזק יותר כ־PASS לפני הראיה.

## מדיניות סיסמאות וסיכון leaked-password — S9-TDEC-004

`S9-TDEC-004` נסגר ב־26 באוגוסט 2026 כ־**RESOLVED — ACCEPTED RESIDUAL
RISK**. הגנת leaked-password של Supabase אינה זמינה בתכנית הנוכחית ומופיעה
ככבויה בראיית ה־Hosted. לא משדרגים את התכנית רק לצורך יכולת זו, והיא מוגדרת
כ־hardening פנימי ולא כדרישת קורס ישירה. אין לממש lookup של סיסמה שנפרצה בצד
הלקוח.

- validation האפליקטיבי הנוכחי דורש 8–128 תווים. לפני שחרור, מדיניות הסיסמה
  של Hosted נבדקת לקריאה בלבד ונשמרת תואמת לגבול הזה.
- אין טענה שדרישות character class מוגדרות כרגע. שינוי אורך מינימלי או דרישת
  character class מחייבים עדכון מסונכרן של Zod, העתקי ה־UI, הבדיקות ואימות
  חשבונות ה־Demo.
- rate limits, שחזור enumeration-safe לאחר תיקון `S9-DEF-001`, ניטור והיקף
  Demo-only הם בקרות מפצות. custom SMTP ואמינות recovery נשארים בנפרד תחת
  `S9-DEF-004` ואינם נסגרים בהחלטה זו.
- אין לטעון שמדיניות Hosted חזקה יותר הושלמה עד שראיה לקריאה בלבד מוכיחה
  אותה. אימות זה נשאר acceptance פתוח של `S9-REQ-005` ואינו שינוי Auth ב־PR
  התיעוד.

הסיכון נפתח מחדש אם הפרויקט עובר לתכנית שכוללת את היכולת מסיבה אחרת, היקף
המוצר מתרחב לנתונים רגישים מהותית יותר, מתרחש אירוע אבטחה או מתקבלת ראיית
credential stuffing, או שה־evaluator דורש את היכולת במפורש.

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
  `/update-password`, `/leagues/new`, נתיב סיכום/הגדרות/משחקים/דירוג/דוחות של
  ליגה עם UUID תקין ונתיב `/matches/[matchId]` עם UUID תקין. query string של
  הקשר ליגה אינו נכנס
  ל־`next`; אם יש כמה הקשרים המשתמש בוחר אותם מחדש במסך המורשה. כל ערך אחר —
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

## הזמנות, בקשות, אסמכתאות והחלטות ב־Slices 3–4

גבול B26 המאושר משייך את ההזמנה, הבקשה והוכחת ה־Demo הפרטית ל־Slice 3, ואת
תור המנהל, ההחלטה והחברות הפעילה ל־Slice 4. גבולות האבטחה של שתי הזרימות
מתועדים יחד משום שהן חולקות את אותו משאב בקשה ואת אותו proof פרטי.

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
- **אימות hosted — 16 באוגוסט 2026:** ה־fixed-bucket gateway הקיים הופעל מול
  הפרויקט המקושר עם מפתח `sb_secret_*` הנוכחי, WebP סינתטי שעבר את כל בדיקות
  ה־sanitizer ו־UUIDs אקראיים שנוצרו בצד השרת. `uploadPrivateProof` הצליח
  ו־`removePrivateProof` מחק מיד את אותו object; לא נשאר artifact. כשל ה־`403`
  עם `Invalid Compact JWS` שתועד בבדיקת Slice 5 לא שוחזר. לא הוחלף מפתח ולא
  נעשה fallback ל־service-role הישן: metadata של מפתח הפרויקט לא השתנה מאז
  11 באוגוסט, משתנה Vercel קדם לדוח, וקוד gateway ההוכחות לא השתנה. endpoint
  הגרסה של Storage החזיר `HTTP 200` ו־`1.69.0`. לכן הראיות מצביעות על rollout
  או תיקון propagation בשכבת ה־API gateway/Storage של Supabase, ולא על שינוי
  הגדרת פרויקט או משתנה סביבה; Supabase אינה חושפת לפרויקט מזהה rollout מדויק.

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

### Slice 4 — החלטת מנהל וחברות

- תור הבקשות מתקבל רק דרך `get_manager_join_requests` לאחר התאמה מדויקת בין
  `auth.uid()` לבין `leagues.manager_id`. ה־DTO כולל שם תצוגה, מצב וסיכומי proof
  בטוחים בלבד; path, digest, token ופרטי Auth אינם מוחזרים.
- `approve_join_request` ו־`reject_join_request` הם `SECURITY DEFINER` עם
  `search_path = ''`, נעילת שורת הבקשה ובדיקת מנהל חוזרת בתוך ה־transaction.
  אין הרשאת כתיבה ישירה לטבלאות. אישור מבצע upsert/activation לחברות, עדכון
  בקשה ו־audit אטומיים; דחייה דורשת reason בשורה אחת באורך 3–300.
- replay של אותה הכרעה מחזיר את אותה תוצאה בלי חברות או audit כפולים. ניסיון
  להחליף הכרעה או סיבת דחייה מחזיר conflict בטוח, ומנהל ליגה אחרת מקבל שגיאה
  עמומה שאינה חושפת אם הבקשה קיימת.

| איום | גבול אכיפה | בדיקה |
| --- | --- | --- |
| secret גולמי בנתיב/לוג או קישור ישן | public-ID path + Fragment שנמחק לפני רשת, hash-only, cookie HttpOnly קצר, rotation/expiry ב־DB | network-target assertion, exchange Route, refresh, rotate, revoke וחיפוש diff/log |
| בקשה כפולה או invite race | row lock + partial unique + idempotent RPC | שתי submissions/rotations מקבילות |
| IDOR של request/proof | session + resource AuthZ + RLS/opaque 404 | requester/outsider/manager ליגה אחרת |
| עקיפת sanitization | אין Storage policies ללקוחות; gateway קבוע | CRUD ישיר כ־anon/authenticated |
| MIME מזויף/image bomb | extension+MIME+magic, Sharp limits ו־re-encode | SVG/PDF/HTML/exe/corrupt/multi-page/oversize |
| retry שיוצר היסטוריה כפולה | digest + idempotency unique + compensation | retry זהה/שונה ומקביל |
| החלטה כפולה או של מנהל זר | row lock + manager AuthZ בתוך RPC + unique membership | approve/reject replay, audit יחיד ומנהל ליגה אחרת |
| דליפת path או signed URL למשתמש לא מורשה או ל־artifact | DTO allowlist, AuthZ, TTL קצר, no-store ולוגים מסוננים | תגובות upload/denial, bundle וחיפוש repository; משתמש מורשה רואה אותו ב־redirect בלבד |

## משחקים וניחושים ב־Slice 5

- `matches` נשאר catalog גלובלי לקריאת `authenticated`; הדפדפן אינו קורא ספק
  Sports. עמודי הליגה והמשחק מאמתים UUID, session ומשאב ומחזירים אותו not-found
  עבור משאב חסר או משתמש לא מורשה.
- `predictions` מפעילה RLS ונשללות ממנה כל הרשאות `INSERT`, `UPDATE` ו־`DELETE`
  ל־`authenticated`; ל־`anon` ול־`service_role` אין גישת טבלה או RPC. הגישה
  היחידה לכתיבת משתמש היא `save_prediction`, `SECURITY DEFINER` עם
  `search_path = ''`, שמות schema מלאים ו־`EXECUTE` ל־authenticated בלבד.
- ה־RPC גוזר actor מ־`auth.uid()`, נועל את שורות הליגה, החברות והמשחק, דורש
  `league_members.status='active'`, מאמת שהעונות זהות ודוחה כאשר הליגה
  `completed`/`archived`, כאשר סטטוס המשחק אינו `scheduled`/`postponed`, או
  כאשר הזמן שנדגם הגיע ל־`kickoff_at`. את הזמן הוא דוגם ב־`clock_timestamp()`
  **אחרי** `for update` על שורת המשחק, ולא מזמן תחילת ה־transaction; לכן ניחוש
  שהתחיל לפני ה־kickoff וחיכה לנעילה נדחה כמו כל ניחוש מאוחר.
  בדיקת lifecycle מתבצעת רק אחרי בדיקת החברות:
  זר מקבל `FORBIDDEN` זהה בלי ללמוד אם הליגה קיימת או read-only. ה־Action מבצע
  מחדש session → Zod → AuthZ למשאב → RPC, אך אינו מקור האכיפה לזמן או לסטטוס.
- `predicted_outcome` הוא generated column. הלקוח שולח רק שני ציונים שלמים
  0–30; אין `user_id`, outcome, points, status, kickoff או role סמכותיים בקלט.
  unique `(league_id, match_id, user_id)` ו־upsert משאירים רשומה יחידה.
- Policy הקריאה דורשת תחילה חברות פעילה. לפני kickoff רק `user_id=auth.uid()`
  עובר; ב־/אחרי kickoff חבר פעיל באותה ליגה רואה את השורות. removed,
  pending/rejected, זר ולא־מחובר רואים אפס שורות. שאילתת ה־Server Component
  מוגבלת לליגה/משחק ול־user IDs של חברים פעילים, ו־RLS מסירה את האחרים לפני
  שה־RSC payload נבנה; אין over-fetch ולא filter ב־React.
- מסך detail נבחר רק מתוך חברות פעילות של הצופה שעונתן תואמת למשחק. UUID
  `?league=` נבדק מול אותה רשימה; החלפה בליגה זרה מחזירה not-found. profiles
  נקראים רק עבור שורות prediction שכבר עברו RLS וה־shared-league policy.
- הזמן המוחלט והמצב הראשוני מגיעים מ־PostgreSQL. רכיב timezone/countdown הוא
  enhancement אחרי hydration ואינו יכול לפתוח כתיבה. טופס ישן שנשלח אחרי
  הנעילה מקבל `PREDICTION_LOCKED` ממופה להודעה עברית ללא SQL או הבדל קיום.
- אין שימוש ב־`SUPABASE_SECRET_KEY`, ב־admin client, ב־Route Handler חדש או
  ב־log אישי ב־Slice 5.

### מטריצת איומים ובדיקות Slice 5

| איום | גבול אכיפה | בדיקה |
| --- | --- | --- |
| שינוי או יצירה אחרי נעילה | membership/match row locks ואז `clock_timestamp() < kickoff_at` בתוך RPC; UI אינו סמכותי | pgTAP לפני/בדיוק/אחרי ו־stale replay; session אמיתי שמחזיק את שורת המשחק על פני ה־kickoff; Playwright מזיז kickoff לעבר ובודק stale create/edit + RPC |
| הצצה לניחוש אחר לפני הפתיחה | RLS חברות+זמן; שאילתות ממוקדות; אין hidden rows ב־payload | שני משתמשים: UI ללא שם/score ו־PostgREST מסונן מחזיר `[]`; אחרי kickoff שתי השורות נחשפות |
| IDOR בין ליגות/עונות | Action AuthZ, RPC התאמת membership/season, consistency trigger ו־RLS | other league, cross-season, outsider ו־`?league=` זר נדחים; parent season change עם prediction נכשל |
| זיוף actor/outcome/points | actor מ־`auth.uid()`, outcome generated, scoring fields אינם בקלט ואין table writes | direct INSERT/UPDATE/DELETE נכשל; outcome HOME/DRAW/AWAY נגזר; `points=0` ו־metadata `NULL` |
| סטטוס עמום מחליש זמן | allowlist סגור `scheduled`/`postponed` וגם זמן DB | live/finished/canceled עתידיים נדחים; postponed עתידי מותר |
| כתיבה לליגה שהושלמה/אורכבה או דליפת הסטטוס שלה | lock על שורת league + `completed`/`archived` read-only אחרי membership AuthZ | active member מקבל `STATE_CONFLICT`; outsider מקבל `FORBIDDEN`; prediction קיים נשאר קריא |

## תוצאות, ניקוד ודירוג ב־Slice 6

- `system_admins` הוקדמה כטבלה מינימלית מוגנת. RLS מופעלת, אין policies ואין
  הרשאות טבלה ל־`anon`, ל־`authenticated` או ל־`service_role`. אין מסך CRUD;
  הענקה נעשית רק ב־seed מאובטח או migration ייעודית. `is_system_admin()` מחזירה
  למשתמש מאומת רק אם הזהות שלו קיימת בטבלה ואינה מאפשרת לשאול על משתמש אחר.
- `applyManualResult` מבצעת session → Zod → בדיקת מנהל מערכת → אימות המשחק →
  gateway שרתי → `score_match`. הטופס אינו שולח actor, role, points, גרסת תוצאה
  או נתיב משאב סמכותי מלבד מזהה המשחק והתוצאה המבוקשת.
- `score_match` אינה ניתנת להרצה ל־`anon` או ל־`authenticated`; גם ברירת המחדל
  של `service_role` נשללת ומוענק לה `EXECUTE` מפורש ומצומצם בלבד. ה־admin client
  נשאר `server-only` ונצרך לניקוד רק דרך gateway ייעודי, לא כלקוח גנרי.
- מאחר שקריאת service-role אינה נושאת `auth.uid()` של המשתמש, ה־Action מעביר
  ללקוח השרת header פנימי וקבוע עם מזהה ה־session המאומת. המשתמש אינו יכול
  להגדיר אותו דרך הטופס. ה־RPC קוראת אותו מ־`request.headers`, דורשת UUID תקין
  ומאמתת מחדש מול `system_admins` לפני lock או שינוי. כך ה־actor באודיט אינו
  נלקח מקלט דפדפן, ושינוי הרשאה בין בדיקת ה־Action ל־RPC נכשל סגור.
- מסלול ה־Cron של Slice 7 משתמש באותו header רק מתוך gateway server-only ועם
  `SYNC_SYSTEM_ACTOR_ID` של principal לא־אינטראקטיבי ייעודי. ה־principal מוקם
  באופן מאובטח לכל סביבה ב־`auth.users` וב־`system_admins`, אינו משמש ל־UI
  ואינו מגיע מהבקשה. env חסר, UUID שגוי או הסרת השורה מ־`system_admins`
  מכשילים את הריצה סגור; אין fallback ל־service-role ישן, לזהות אנושית או
  לקריאת SQL/pg_cron ללא context.
- הפונקציה נועלת רק את שורת `matches`. היא קוראת את חוקי כל ליגה ללא
  `FOR UPDATE` ואינה נועלת `leagues`, ולכן אינה הופכת את סדר הנעילות הקיים של
  `save_prediction` (`leagues → league_members → matches`). התוצאה, גרסתה,
  כל שדות הניקוד וה־audit נכתבים באותה transaction. retry זהה הוא no-op ואינו
  מזיז timestamps או מוסיף audit; תיקון מבצע overwrite מלא; cancel מאפס בלי
  למחוק ניחושים.
- זמן ההכרעה נדגם במסד אחרי השגת נעילת המשחק. `finished` לפני `kickoff_at`
  נדחה ב־`MATCH_NOT_STARTED` לפני mutation, בעוד `canceled` מוקדם נשאר מותר.
- `league_leaderboard` הוא `security_invoker`, מתחיל מחברים פעילים ונשען על
  RLS הקיים של `league_members`, `profiles` ו־`predictions`. הקריאה האפליקטיבית
  מאמתת חברות פעילה או ניהול של הליגה המבוקשת לפני query מסונן ל־`league_id`;
  משתמש זר ומנהל מערכת שאינו חבר אינם מקבלים דירוג.
- אגרגטי הדירוג כוללים רק ניחושים שמשחקם הגיע ל־kickoff. גם ניחושו העתידי של
  הצופה עצמו אינו נספר, כך שהסכומים אינם תלויי־צופה ואין דליפת עצם ההגשה לפני
  החלון. כאשר RLS מתירה חברות אך מסתירה `display_name`, מוחזרת התווית
  הניטרלית "משתתף" במקום כשל עמוד או חשיפת UUID.
- חובות Slice 5 של עוצמת `FOR UPDATE`/`FOR SHARE` ושל חשיפת ניחושי משחק
  `canceled` לפי `kickoff_at` לא שונו ב־Slice 6.

### מטריצת איומים ובדיקות Slice 6

| איום | גבול אכיפה | בדיקה |
| --- | --- | --- |
| משתמש רגיל מזין או מתקן תוצאה | Server Action מאמת session+admin; RPC היא service-only ומאמתת actor שוב | pgTAP ל־anon/authenticated/service actor חסר או זר; Playwright לקריאת RPC ישירה ולנתיב admin |
| זיוף actor דרך הטופס או קריאת gateway לא מורשית | אין actor בקלט; header פנימי נוצר רק במודול `server-only`; `system_admins` ללא CRUD | בדיקות schema/grants/import boundary ו־actor שאינו בטבלה |
| ניקוד כפול או שאריות מתוצאה קודמת | overwrite set-based לפי result/rule version בתוך transaction אחת | exact/outcome/wrong/draw, retry זהה, correction ו־cancel |
| תוצאת סיום מוקדמת יוצרת totals תלויי־צופה | זמן DB אחרי match lock + דחיית `finished` לפני kickoff; אגרגטים מסננים לפי kickoff | pgTAP לתוצאה מוקדמת ללא mutation ולניחוש עתידי שאינו נספר גם לבעליו |
| deadlock עם שמירת ניחוש | `score_match` נועלת match בלבד ואינה נועלת league/rules | pgTAP עם שני חיבורי `dblink` שמריצים `score_match` ו־`save_prediction` במקביל |
| דליפת דירוג בין ליגות | resource AuthZ + `security_invoker` + RLS | חבר באותה ליגה מצליח; outsider ומנהל מערכת שאינו חבר מקבלים אפס שורות/not-found |
| שובר שוויון נוסף לא מאושר | `rank()` לפי points ואז correct outcomes בלבד | שניים במקום 1, הבא במקום 3; exact scores שונים אינם שוברים שוויון |

## Sync ידני ו־Cron ב־Slice 7

- ה־Route `POST /api/cron/sync` דורש method ו־content type צפויים ומשווה את
  Bearer מול `CRON_SECRET` בזמן קבוע על digests באורך זהה. הסוד וה־Authorization
  header אינם נכתבים ללוג או לתשובה, וכל תגובה מסומנת `private, no-store`.
- `CRON_SECRET` ו־`SYNC_SYSTEM_ACTOR_ID` נטענים רק בשרת. actor חסר או UUID לא
  קנוני מכשילים את ה־Route לפני Data API. אין actor ב־URL, בגוף הבקשה או
  fallback למשתמש האנושי שמפעיל מסך.
- ה־principal מוקם בנפרד בכל סביבה דרך Supabase Auth Admin ומקבל שורה
  ב־`system_admins`; credential להתחברות אינו מופץ או נשמר. ב־hosted נשמרים
  ה־UUID ב־Vercel והסוד גם ב־Vercel וגם ב־Supabase Vault. migration ו־seed
  הייצור אינם מכילים סוד; ה־seed המקומי בלבד יוצר actor בדיקה.
- ה־gateway היחיד צורך את admin client המשותף, מזריק
  `x-predictor-system-actor`, וקורא פעם אחת ל־`record_sync_attempt()`. הפונקציה
  היא `SECURITY DEFINER`, עם `search_path = ''`, שמות schema מלאים ו־EXECUTE
  ל־`service_role` בלבד; היא מאמתת מחדש את actor מול `system_admins` לפני
  נעילה או כתיבה.
- `sync_runs` מפעילה RLS באותה migration שבה נוצרה. `authenticated` מקבל
  `SELECT` בלבד וה־policy חושפת שורות למנהל מערכת; `anon`, משתמש רגיל ו־Data
  API service role אינם מקבלים CRUD ישיר. אין policy או grant ל־append ישיר;
  רק ה־RPC יכול להוסיף שורה.
- הטרנספורט הוא `supabase-js` דרך PostgREST, ללא connection שמוצמד ל־Route.
  לכן אין `pg_try_advisory_lock` ברמת session. ה־RPC משתמש רק
  ב־`pg_try_advisory_xact_lock`, והמעט שהוא מגן עליו — הכרעת outcome וכתיבת
  השורה — נמצא באותה transaction ומשתחרר אוטומטית.
- ניסיון מורשה שהפסיד בנעילה נכתב סופית כ־`CONCURRENT_ATTEMPT`; ניסיון שזכה
  נכתב כ־`MANUAL_PROVIDER`. שניהם `status='skipped'`, עם `finished_at`, ללא
  `error_message_safe`, ומוחזרים ב־HTTP 200. `error_code` הוא שם legacy לקוד
  תוצאה; מסך, query או alert מסווגים כשל רק לפי `status='failed'`.
- secret שגוי נעצר לפני ה־gateway; actor חסר, malformed או שהוסר נעצר בתוך
  ה־RPC לפני insert. אף אחד מהמקרים אינו כותב `sync_runs` או `audit_logs`.
  הקוד אינו מפיק לוג אפליקטיבי עם secret או actor; סטטוס בקשת ה־HTTP נשאר
  ב־runtime logs של הפלטפורמה לצורכי תפעול ומניעת ניפוח טבלה.
- המסלול הידני אינו קורא ספק, אינו מעריך due-window, אינו יוצר `running`, אינו
  מבצע upsert ואינו נוגע ב־`score_match`, במשחקים או בניחושים. מודול התכנון
  הטהור של ספק עתידי אינו מיובא ל־Route.

### מטריצת איומים ובדיקות Slice 7

| איום | גבול אכיפה | בדיקה |
| --- | --- | --- |
| גילוי endpoint וניפוח לוג דרך secret שגוי | השוואה בזמן קבוע לפני gateway; אין כתיבת DB או לוג אפליקטיבי רגיש | Vitest ו־Playwright ל־secret חסר/שגוי ומספר שורות קבוע |
| זיוף או ביטול actor | actor מ־env בלבד ואימות חוזר מול `system_admins` בתוך RPC | env tests ו־pgTAP ל־header חסר/malformed/actor שהוסר ללא `sync_runs` או `audit_logs` |
| ריצה מקבילה מעבדת חלון פעמיים | xact lock לא־חוסם בתוך RPC יחיד; המפסיד רק מתעד `CONCURRENT_ATTEMPT` | שתי sessions אמיתיות ב־pgTAP, retry סדרתי ושחרור lock אחרי commit |
| session lock דולף ל־pool | אין session-level advisory lock; Data API call יחיד | בדיקת הגדרת הפונקציה, `pg_locks` ותוצאה `MANUAL_PROVIDER` לאחר שחרור |
| קוד דילוג מוצג או מנוטר ככשל | status הוא discriminator יחיד ו־DB comment מתעד את שם ה־legacy | Vitest ל־display/query ו־Playwright לטקסט ניטרלי ללא פרטי כשל |
| מסך תפעולי נחשף למשתמש רגיל | session AuthZ + `is_system_admin()` + RLS | pgTAP לקריאת admin/רגיל ו־Playwright ל־not-found למשתמש רגיל |

## API-Football Sync ו־fencing ב־Slice 7b

- `SPORTS_API_KEY` הוא secret שרת בלבד. הוא אינו `NEXT_PUBLIC_*`, אינו נשמר
  ב־Supabase/Vault/DB/fixtures/logs ואינו מוחזר ללקוח. URL הייצור קבוע במודול
  `server-only`, ורק חמש צורות GET allowlisted קיימות; אין URL/league/season
  שרירותיים מקלט משתמש ולכן אין SSRF boundary חדש.
- ה־client קורא body כחסום עד 8 MiB לפני JSON parse, מאמת HTTP, envelope,
  `errors`, paging ו־Zod nested schemas, ודוחה IDs כפולים. errors נשמרים כקודים
  והודעות בטוחות; key, headers, URL מלא ו־payload אינם נכנסים ללוג או ל־DB.
- 403 אינו retried. רק transport/timeout, 429, 499 ו־5xx של GET יכולים לקבל
  עד שני retries נוספים בתוך תקציב wall-clock; `Retry-After` חסום ו־jitter
  מונע herd. 429/`Retry-After` מפעיל backoff; quota headers נשמרים לתצפית בלי
  להפעיל threshold שלא הוכח. Shared outbound
  IP של Vercel נשאר סיכון זמינות מתועד, לא סיבה לחשוף key או להוסיף proxy.
- זהות provider נשענת רק על external ID. codes/names/venues אינם משמשים merge.
  התחרות, העונה, הקבוצות והמשחקים של API-Football נפרדים משורות Demo; payload
  מנורמל וחסום בלבד מגיע ל־RPC ואין raw provider response ב־DB.
- `sync_leases` מפעילה RLS ללא policy/grant ל־browser או service-role table
  CRUD. claim/apply/finalize הן `SECURITY DEFINER`, `search_path=''`, שמות
  schema מלאים ו־EXECUTE ל־service_role בלבד. כל אחת מאמתת actor פנימי מול
  `system_admins`; manual trigger גוזר actor מה־session ואינו מקבל אותו בטופס.
- claim מחזיק row lock רק לטרנזקציה קצרה. generation מונוטוני ו־token UUID
  חדש מגדרים את העבודה אחרי HTTP. apply/finalize נועלים את אותה שורה ומאמתים
  provider/run/generation/token/expiry בתחילה; apply בודקת expiry שוב בסוף כך
  ש־commit אחרי expiry עושה rollback. reclaim מסיים run נטוש ומבטל token ישן.
- apply מקבלת batch חסום, מאמתת כל field שוב, מדלגת על manual override
  וקוראת ל־`score_match` בתוך אותה transaction עבור `FT` עם `score.fulltime`
  תקין או עבור reactivation צר שמאפס scoring metadata. fixture עם regression
  לא־בטוח מבודד, שומר provider status והערת מפעיל חסומה ואינו מבטל peers.
- `predictions_locked_at` הוא latch שאינו ניתן לאיפוס על ידי provider apply.
  `save_prediction`, RLS וה־UI בודקים אותו; live/SUSP/INT/FT/AET/PEN ואחריהם
  reschedule עתידי נשארים נעולים. CANC/ABD/AWD/WO נועלים רק אם DB time הגיע
  למועד קנוני או שהיה latch קודם, ולכן ביטול מוקדם אינו מפר את PRED-05.
- force של מנהל עוקף due-window בלבד. backoff נאכף תמיד ו־`last_forced_at`
  מגביל ניסיון ידני לניסיון אחד בדקה גם בין invocations/processes.
- `/admin/sync` ו־manual trigger דורשים session ו־system-admin resource AuthZ.
  Server Action משתמשת בהגנת same-origin של Next.js, אינה שולחת secret
  לדפדפן וקוראת לאותה orchestration/lease. משתמש רגיל ומנהל ליגה מקבלים
  not-found/denial אטום.

| איום | גבול אכיפה | בדיקה |
| --- | --- | --- |
| key ב־browser/log/fixture | server-only env, fixed client, redaction ו־sentinel build scan | env/client/unit; build עם sentinel וסריקת HTML/client artifacts; חיפוש repository |
| SSRF או endpoint אסור | URL constant ו־methods purpose-specific בלבד | client tests לכל endpoint ושבירת query/ID לא קנוני |
| payload גדול/לא תקין | streaming cap + Zod + DB batch/field validation | size/JSON/schema/unit ו־apply rollback ב־pgTAP |
| שתי ריצות או worker ישן | row claim + generation/token/expiry, start/end fencing | concurrent claim, reclaim, wrong/stale/expired token |
| merge של Demo או קבוצה שגויה | provider IDs ו־unique indexes בלבד | name/code collision, Demo snapshot unchanged, codes כפולים |
| חשיפה או פתיחה שגויה סביב ביטול | DB-time latch, PRED-05 RLS ו־reactivation צר | ביטול מוקדם בין שני משתמשים, איפוס scoring, leaderboard ו־save חוזר; live/SUSP/INT נשארים נעולים |
| ניקוד לא רשמי/כפול | FT+fulltime בלבד ו־`score_match` הקיימת | live/AET/PEN/score חסר, retry, correction ו־audit source |

## דוח מנהל לא־כספי ב־Slice 8

- `/leagues/[leagueId]/reports` מאמת UUID לפני query ודורש session באמצעות
  `getUser()` בשרת. return path של אורח נוסף ל־allowlist המדויק בלי query,
  fragment, backslash או segment נוסף.
- נקודת ההרשאה הראשונה קוראת את הליגה תחת RLS עם user-scoped Supabase client
  ומשווה `manager_id` ל־user המאומת. חבר פעיל רגיל, משתמש זר, מנהל של ליגה
  אחרת ומנהל מערכת שאינו מנהל הליגה מקבלים not-found זהה; הסתרת tab היא UX
  בלבד ואינה גבול הרשאה.
- רק אחרי התאמת המנהל מתבצעות ספירות `head + count=exact`. חברים נספרים רק
  מ־`league_members.status='active'`; בקשות נספרות ב־`join_requests` בשלוש
  שאילתות status נפרדות. אין join או query ל־`payment_proofs`, ולכן אין נתיב,
  digest, metadata של קובץ או הכפלת בקשות לפי מספר ההעלאות.
- ה־Service קורא לאחר מכן ל־`getLeagueStandings` הקיים, שמבצע AuthZ נוסף ונשען
  על `league_leaderboard` מסוג `security_invoker` ועל RLS. שמות תצוגה מגיעים
  רק מן ה־view המורשה; אין Email, proof, Auth metadata או PII נוסף.
- count שאינו safe integer לא־שלילי, שורת standings malformed, רשימת standings
  מעל 500, כשל query או אי־התאמה בין תוצאת הסיכום לדירוג נכשלים סגור ל־error
  state בטוח. count תקין יכול להיות גדול מ־500 משום ש־`head: true` אינו מעביר
  את שורות התוצאה.
  SQL, stack, מזהה משתמש, proof path ופרטי ליגה אינם נרשמים או נשלחים בשגיאה.
- אין admin/secret client, RPC, Server Action, mutation, cache חדש, migration
  או dependency. הדוח אינו קורא או מחשב שדה כספי ואינו מציג AI, דמי השתתפות,
  קופה, תשלום, פרס כספי, אחוז פרס, payout מדומה או payment link.

| איום | גבול אכיפה | בדיקה |
| --- | --- | --- |
| IDOR של דוח ליגה | session + manager match על המשאב + RLS + AuthZ חוזר ב־standings | ordinary member, outsider ומנהל ליגה אחרת מקבלים not-found ללא שם ליגה |
| חבר שהוסר נספר בגלל בקשת עבר | count ישיר של membership `active`; אין גזירה מ־approved requests | removed membership לצד pending/history נשאר מחוץ לספירת הפעילים |
| proof history מכפילה בקשות או דולפת | אין קריאת `payment_proofs`; count על `join_requests.id` בלבד | query-contract assertion וספירות נפרדות ב־E2E |
| דוח חלקי או overflow במספר חריג | safe nonnegative integer בכל count; cap של 500 רק ברשימת standings | null/fraction/unsafe נכשלים, 501 count מתקבל ומסלול standings חריג נכשל סגור |
| דירוג שונה מן המסך הציבורי לחברים | reuse של `getLeagueStandings`/view ללא sorting חדש | `1,1,3`, exact informational ושמות כפולים keyed by user ID |
| שפה כספית או AI חודרת לדוח | allowlist שדות ו־UI קבוע לא־כספי | notice גלוי וחיפוש currency/percentage/AI/payment links בדסקטופ וב־Pixel 5 |
