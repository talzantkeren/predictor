# Predictor1 — סקייל בסיסי

## יעד וקיבולת MVP

יעד הקורס הוא עשרות עד מאות משתמשים, מספר קטן של ליגות פרטיות פעילות ועונה
אחת של ליגת העל. PostgreSQL הוא מקור האמת, Server Components קוראים נתונים
מסוננים ופעולות scoring מתבצעות set-based במסד. אין צורך ב־Redis, queue,
microservice או worker נוסף ללא מדידה שמצדיקה אותם.

## API-Football ותקציב מכסה

ה־POC ב־23 באוגוסט 2026 רץ בתכנית Pro: 7,500 requests/day, 300/minute ועד
5/second. API-Football מתעדת גם הגבלה לפי IP, ולכן outbound IP משותף של Vercel
עלול לגרום 429 שאינו נובע רק מהיישום. הנתונים השמורים וה־Manual provider הם
ה־graceful degradation; אין קריאת ספק במסלול request של משתמש.

תכנית ה־MVP:

| עבודה | תדירות יעד | קריאות משוערות |
| --- | --- | --- |
| Cron due check | כדקה | 0 קריאות ספק כאשר `NOT_DUE` |
| live/near-live targeted | כדקה | קריאה אחת לכל עד 20 fixture IDs |
| fixture reconciliation | כל 6 שעות | קריאת fixtures מלאה אחת |
| league/teams/rounds/catalog | כל 12 שעות | ארבע קריאות |

גם ביום עם שני חלונות משחק של שלוש שעות, targeted polling צורך בקירוב 360
קריאות, ועוד פחות מ־20 קריאות catalog/reconciliation — מרווח גדול מתחת ל־
7,500. המספר אינו SLA: retries, משחקים חופפים ו־provider changes נמדדים ב־
`sync_runs`. אין polling כל 15 שניות אף שהספק מתעד refresh כזה.

כל targeted request כולל עד 20 IDs. קבוצות שנאספו מהקטלוג או מתוך fixtures
מחולקות ל־batches של עד 20 לפני batch ה־fixture התלוי בהן. catalog apply
מחולק ל־batches של עד 50 fixtures כדי להגביל זמן transaction וזיכרון; 182
fixtures נצפים דורשים ארבעה fixture batches. retries הם GET-only, עד שלושה ניסיונות כולל הראשון ובתקציב wall-clock
חסום. `Retry-After` של 429 מעדכן backoff ו־quota remaining נשמר כאיתות תפעולי.
threshold אוטומטי למכסה נמוכה יוגדר רק לאחר מדידה, במקום לנחש מדיניות שעלולה
לעכב עדכון משחק חי.

כאשר שלושת סוגי העבודה due יחד, planner מסובב לפי ה־claim המגודר האחרון ולא
לפי הצלחה בלבד. לכן כל סוג מקבל שירות בתוך לכל היותר שלושה claims זכאים
עוקבים; backoff/lease פעיל אינם claims זכאים. במשיכת targeted, משחק `live`
נבחר לפני כל stale, כך שגם יותר מ־20 מועמדים ישנים אינם דוחקים משחק חי.

trigger ידני של מנהל יכול לעקוף due-window בלבד: `backoff_until` נאכף גם בו,
ו־`last_forced_at` מגביל claim ידני אחד לדקה באופן עמיד. כך refresh או לחיצות
חוזרות אינם מייצרים burst חדש מול הספק.

## Database ו־concurrency

- `sync_leases` מחזיקה שורה אחת ל־provider. claim/finalize הם transactions
  קצרים; HTTP אינו מחזיק connection או lock.
- generation מונוטוני ו־token UUID מגדרים stale workers. lease של 120 שניות
  גדול מתקציב ה־HTTP וה־apply; expiry בזמן apply גורם rollback.
- provider entities משתמשות ב־unique indexes על external IDs, ולכן retry אינו
  מכפיל rows. Demo rows חסרות external IDs ואינן משתתפות ב־upsert.
- `matches (season_id, kickoff_at)`, `(status, kickoff_at)` ו־external identity
  משרתים את due planner ואת upsert. `sync_runs (started_at desc)` משרת את מסך
  100 הריצות האחרונות.
- scoring נשאר set-based ב־`score_match`; אין לולאת point updates ב־Next.js.
- קריאת הגדרות מקבלת league UUID אחד ומחזירה מסמך יחיד: ליגה/חוק יחידים,
  עד 100 שורות פרס ו־aggregate של matches בעונה קבועה. אין dashboard scan או
  admin-wide list במסלול הזה.
- שינוי פרטי ליגה בלבד נועל את שורת הליגה ואינו נוגע ב־season/matches; בדיקת
  dblink מוכיחה שהוא מסתיים גם כאשר match נעול. רק שינוי scoring/prizes נועל
  season יחידה ואחריה את משחקי העונה בסדר UUID, כדי לסדר insert מתחרה בלי
  להרחיב את ה־critical section של עריכה רגילה.
- לא נוסף index עבור DEF-007: lookup הליגה והעונה הם לפי PK, חוק הניקוד לפי
  unique league key, וה־aggregate משתמש ב־`matches (season_id, kickoff_at)`
  הקיים. מטריצת 131 בדיקות pgTAP/dblink מוכיחה bounded payload, fast path וסדר
  נעילות; index חדש יישקל רק אם plan מייצג יראה regression מדיד.
- לא נוסף index עבור DEF-008: clear פונה למשחק יחיד לפי PK ומאתר את ליגות
  העונה דרך ה־index הקיים על `leagues.season_id`. ה־critical section משנה דגל
  אחד ואודיט אחד בלבד; אין scan של predictions ואין הצדקה ל־cache או queue.
- רשימת החברים הפעילים של Slice 9 משתמשת ב־keyset יציב של 25 שורות ומבקשת 26
  כדי לזהות עמוד נוסף. היא מחזירה DTO מצומצם ואינה טוענת join requests או
  proofs עבור חבר רגיל.
- completion נועלת ליגה אחת וילדים בסדר קנוני, מקפיאה snapshot רק למשחקי אותה
  עונה וסוגרת בקשות פתוחות באותה transaction. זהו critical section תחום
  לליגה; אין leaderboard גלובלי או scan בין ליגות.

## גבולות ורמזי הרחבה

- response של API-Football מוגבל ל־8 MiB לפני parse. חריגה מסמנת contract
  failure; אין להגדיל בלי evidence מגודל fixture אמיתי.
- query המשחקים מוגבל ל־500 לעונה, מעל 182 שנצפו אך לא יעד לאלפי fixtures.
- ספירות דוח המנהל משתמשות ב־`head: true` ולכן אינן מעבירות שורות ומקבלות
  count שלם ובטוח גם מעל 500; רשימת הדירוג עדיין מוגבלת ל־500 שורות.
- `sync_runs` מוצג עד 100 שורות. cleanup/retention יתווסף רק לאחר מדידת גודל;
  אין subsystem חדש ב־Slice 7b.
- אם ריצה תקינה מתקרבת ל־120 שניות, מוסיפים renew RPC צר או worker נפרד לאחר
  מדידה. אין להאריך lease בלי לשמור start/end fencing.
- אם shared-IP 429 הופך לבעיה מדידה, בוחנים static-egress/worker. ה־MVP אינו
  מוסיף proxy או service נוסף מראש.
- אלפי משתתפים בליגה עשויים להצדיק materialized leaderboard; מאות משתמשים
  נשארים בטווח query רגיל עם indexes והניקוד השמור.
- התאמת timeout של Hosted Cron לתקציב 120 שניות אומתה מקומית. קישור response
  סופי יחיד ושחרור lease בפריסת Vercel נשארים פעולת owner מתועדת; אין להסיק
  מן המודל המקומי SLA של Hosted לפני הראיה הזאת.

## מדדים תפעוליים

המסך וה־DB שומרים provider, kind, lifecycle, זמני UTC, fixtures seen, rows
inserted, teams/matches/results changed, overrides skipped, quota remaining,
קוד תוצאה והערות review מסוננות. רק `status='failed'` הוא כשל. `NOT_DUE` אינו
נשמר, כדי ש־tick דקתי לא ייצור כ־1,440 שורות ביום ללא עבודה אמיתית.
