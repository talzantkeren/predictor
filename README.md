# Predictor1

Predictor1 היא אפליקציית Web בעברית וב־RTL לליגות פרטיות של חיזוי תוצאות
כדורגל. הפריסה הציבורית של הקורס היא **Demo בלבד**: אין בה גביית כסף, סליקה,
העברת פרסים כספיים או הצגה של מסמך פיננסי אמיתי.

- Production: [https://predictor-swart.vercel.app](https://predictor-swart.vercel.app)
- Slices 3–4 Preview: [https://predictor-git-feature-slice-3-joi-bfc58f-tals-projects-19902e47.vercel.app](https://predictor-git-feature-slice-3-joi-bfc58f-tals-projects-19902e47.vercel.app)
- Slice 5 Preview: [https://predictor-git-feature-slice-5-mat-fb0a0f-tals-projects-19902e47.vercel.app](https://predictor-git-feature-slice-5-mat-fb0a0f-tals-projects-19902e47.vercel.app)
- GitHub: [https://github.com/talzantkeren/predictor](https://github.com/talzantkeren/predictor)
- Supabase project ref: `zthqqxsbtioaacvpmqna`

זרימת אישור Email אמיתי חזרה בהצלחה ל־Preview היציב ב־15 באוגוסט 2026 ושמרה את
הקשר ההזמנה לאחר אישור ורענון. השלמת החלטת המנהל נדרשת להיבדק ידנית שוב לאחר כל
שינוי ב־Preview; קישור הפריסה לבדו אינו הוכחה לסיום Slices 3–4.

## דרישות

- Node.js 24.16.0
- npm ו־`package-lock.json`
- Docker Desktop לצורך Supabase מקומי ובדיקות pgTAP
- Chromium של Playwright לצורך בדיקות E2E

ה־Supabase CLI מותקן כ־dev dependency, ולכן אין צורך בהתקנה גלובלית.

## הרצה מקומית

```powershell
nvm use 24.16.0
npm ci
Copy-Item .env.example .env.local
npm exec -- supabase start
npm run dev
```

לאחר `supabase start`, העתיקו מ־`supabase status -o env` אל `.env.local` את
`API_URL` בתור `NEXT_PUBLIC_SUPABASE_URL`, את `PUBLISHABLE_KEY` בתור
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ואת `SECRET_KEY` בתור
`SUPABASE_SECRET_KEY`. הסוד נדרש רק ל־gateways המצומצמים של Storage ושל
ניקוד מערכת;
אין להדפיס או לשמור ב־Git את ערכו, JWTs או סיסמת מסד הנתונים. `.env.local`
חסום ב־Git.

המשתנים הפעילים ב־Slices 3–7b:

| משתנה | שימוש |
| --- | --- |
| `NEXT_PUBLIC_APP_URL=http://localhost:3000` | כתובת האפליקציה המקומית |
| `NEXT_PUBLIC_SUPABASE_URL` | כתובת Supabase המקומית או hosted |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | מפתח ציבורי המותר בדפדפן עם RLS |
| `SUPABASE_SECRET_KEY` | server-only; gateways מצומצמים ל־`payment-proofs`, scoring ו־Sync בלבד |
| `CRON_SECRET` | server-only; סוד Bearer נפרד ל־`POST /api/cron/sync` |
| `SYNC_SYSTEM_ACTOR_ID` | UUID server-only של principal לא־אינטראקטיבי ב־`system_admins` |
| `SPORTS_API_PROVIDER=manual` | `manual` או `api-football`; ברירת המחדל וה־rollback הם manual |
| `SPORTS_API_KEY` | server-only; נדרש רק ל־`api-football`, נשמר ב־Vercel ולא ב־Supabase Vault |
| `DEMO_MODE=true` | מצב ההדגמה של הקורס |

`SUPABASE_SECRET_KEY` אינו מיובא ב־Auth/Profile/Leagues ואינו נשלח לדפדפן.
כתיבת ניקוד privileged עוברת רק דרך `score_match`, שמאמת actor מול
`system_admins`. מסלול ה־Sync משתמש ב־principal נפרד וב־gateway מצומצם.
`SPORTS_API_KEY` לעולם אינו נשלח לדפדפן, ל־Supabase או ללוג; בדיקות ו־CI
משתמשים ב־recorded fixtures וב־fake transport ללא credential.

## זרימת Auth ופרופיל

הנתיבים הקנוניים של Slice 1:

- `/register` — הרשמה עם Email, סיסמה ושם תצוגה.
- `/auth/confirm` — השלמת אישור Email או callback של שחזור סיסמה.
- `/login` — התחברות; משתמש מחובר מופנה ל־`/dashboard`.
- `/forgot-password` — בקשת קישור שחזור עם הודעה אחידה למניעת enumeration.
- `/update-password` — בחירת סיסמה לאחר callback שחזור תקף בלבד.
- `/dashboard` — עמוד מוגן.
- `/profile` — קריאה ועדכון של שם התצוגה האישי בלבד.

זרימת ההדגמה: הרשמה → פתיחת Mailpit → אישור ההודעה → Dashboard → פרופיל →
עדכון שם → התנתקות → התחברות. שחזור סיסמה מתחיל ב־`/forgot-password`, ממשיך
בקישור Mailpit ומסתיים בהתחברות מחדש עם הסיסמה החדשה. בגלל PKCE, השלמת session
אוטומטית דורשת את הדפדפן שבו התחילה הבקשה. אישור שנפתח במכשיר אחר עדיין מאשר
את הכתובת ומציג התחברות ידנית; בשחזור יש לבקש קישור חדש בדפדפן שבו ייפתח.

טפסי Auth נשלחים ל־Server Actions ומאומתים שם באמצעות Zod. בנוסף,
`supabase/config.toml` והפרויקט המארח אוכפים מינימום של 8 תווים ברמת Supabase
Auth, גם עבור קריאה ישירה שאינה מגיעה מה־UI.

## זרימת Slice 2: ליגות

הנתיבים החדשים מוגנים ודורשים session תקף:

- `/dashboard` — ברכה אישית, empty state או רשימת הליגות הפעילות של המשתמש.
- `/leagues/new` — יצירת ליגה עם עונת 2026/27, סכום/הוראות Demo, הצטרפות
  מאוחרת, חוקי ניקוד לכל ליגה וחלוקת פרסים שמסתכמת ב־100%.
- `/leagues/[leagueId]` — סיכום פרטי לחבר פעיל: עונה, סטטוס, תפקיד, סכומי
  Demo, ניקוד ופרסים. משתמש שאינו חבר מקבל not-found ללא חשיפת נתונים.

זרימת ההדגמה: הרשמה/התחברות → Dashboard ריק → יצירת ליגה → תיקון שדות לא
תקינים לדוגמה → שמירה → סיכום הליגה → חזרה ל־Dashboard. פעולת השמירה קוראת
ל־`create_league` אטומי: היוצר נגזר מה־session ונשמר גם כמנהל וגם כחבר פעיל.
כשל בעונה, בניקוד או בפרסים אינו משאיר רשומות חלקיות.

ה־catalog נמסר ב־migrations forward-only וכולל את ליגת העל הישראלית ועונת
`2026/27` בלבד. teams, fixtures, scores ו־provider IDs נשארים ריקים עד למסלול
הידני/המאומת ב־slice הייעודי.

## זרימות Slices 3–4: הזמנה, הוכחת Demo והחלטת מנהל

- מנהל הליגה נכנס ל־`/leagues/[leagueId]/settings`, יוצר קישור הזמנה ומעתיק
  אותו מהתצוגה החד־פעמית. הקישור תקף שבעה ימים; refresh מציג רק metadata בטוח,
  ו־rotation מבטל אטומית את הקישור הקודם. revoke חוסם בקשות חדשות.
- אורח פותח `/invite/[publicId]#invite=[secret]`. ה־Fragment נשאר בדפדפן ואינו
  נשלח כחלק מבקשת HTTP או נתיב Vercel; ה־bootstrap מסיר אותו מיד מהכתובת,
  מחשב SHA-256 בדפדפן ושולח ל־`/api/invites/[publicId]/exchange` רק digest.
  הצלחה יוצרת cookie HttpOnly מוגבל לאותו נתיב ול־30 דקות. אז מוצגים פרטי ליגה
  מצומצמים ואזהרת Demo, ו־login/register חוזרים לנתיב הציבורי בלבד. בהרשמה
  היעד נשמר ב־cookie נפרד וקצר המוגבל ל־callback; קישור אישור ה־Email אינו
  כולל secret. Supabase מקבל רק public ID ו־SHA-256 hash תואמים.
  בקשה חדשה נוצרת כ־
  `pending_proof`; refresh/double-submit מחזירים את אותה בקשה.
- המשתמש מעלה רק תמונה סינתטית מסוג JPEG/PNG/WebP. זהו דמו בלבד — אין להעביר
  כסף ואין להעלות מסמך פיננסי אמיתי. אין תשלום, סליקה, אימות קבלה או קישור
  לספק תשלום.
- ה־Route Handler מגביל בקשה ל־4,250,000 bytes, קובץ ל־4,000,000 bytes ותמונה
  מפוענחת ל־20,000,000 pixels; הוא מתאים לתיבה 2000×2000, מסיר metadata ושומר
  WebP חדש בלבד ב־bucket הפרטי `payment-proofs`.
- כל החלפה מכוונת מוסיפה proof חדש, עד חמש לבקשה. retry משתמש במפתח
  idempotency, והמסד אוכף מכסות של 5 ניסיונות ב־15 דקות לבקשה ו־20 ב־24 שעות
  למשתמש. העלאה תקינה מעבירה את הבקשה ל־`pending_approval`.
- Dashboard מציג את בקשות המשתמש ואת הפעולה הבאה. תוכן proof נפתח רק דרך
  `/api/payment-proofs/[proofId]`, לאחר הרשאת uploader או מנהל הליגה ובאמצעות
  signed access של עד 60 שניות. כתיבה ישירה ל־Data API ו־CRUD ישיר ב־Storage
  אינם מורשים; קריאת עמודות סיכום בטוחות בלבד מוגנת ב־RLS, ולעולם אינה חושפת
  token hash, נתיב Storage, digest או מפתח idempotency.
- ב־Slice 4 מנהל/ת הליגה נכנס/ת מ־Summary אל `/leagues/[leagueId]/members`, רואה תור
  מצומצם של בקשות והיסטוריית הוכחות, וצופה בתמונה רק דרך אותו signed access
  קצר. אישור יוצר או מפעיל חברות ומעדכן את הבקשה באותה transaction; דחייה
  דורשת סיבה בטוחה. שליחה חוזרת של אותה החלטה אידמפוטנטית ונרשמת פעם אחת.

Slice 3 מסתיים בבקשת `pending_approval` ובהוכחת Demo פרטית. Slice 4 ממשיך בתור
מנהל, צפייה מורשית, approve/reject וחברות פעילה. PR #4 מוסר את שני ה־Slices;
אין קיצור דרך דרך כתיבה ישירה לטבלאות או ל־Storage.

## זרימת Slice 5: משחקים, ניחושים, נעילה וחשיפה

הנתיבים החדשים מוגנים ודינמיים:

- `/leagues/[leagueId]/matches` — משחקי העונה של הליגה עם סינון מחזור או
  תאריך, שעה מוחלטת באזור הזמן המקומי, סטטוס, תוצאה ל־finished בלבד, countdown
  וניחוש המשתמש הנוכחי.
- `/matches/[matchId]?league=[leagueId]` — פרטי משחק והקשר ליגה מאומת, יצירה
  או החלפה של ניחוש מדויק לפני הנעילה, ניחוש עצמי נעול אחריה וחשיפת ניחושי
  החברים הפעילים. כאשר אותו משתמש חבר בכמה ליגות לאותה עונה, המסך דורש בחירת
  ליגה ואינו מנחש את ההקשר מה־URL בלבד.

זרימת ההדגמה: חבר/ה פעיל/ה → רשימת משחקים → פתיחת משחק → שמירת תוצאה מדויקת
→ רענון שמציג את זמן השמירה מהשרת → עריכה → הגעה ל־`kickoff_at` → דחיית טופס
ישן בהודעה בטוחה → חשיפת ניחושי חברים פעילים. ה־countdown והנטרול בדפדפן הם
עזרי UX בלבד. `save_prediction` במסד גוזר את המשתמש מה־session, נועל את שורת
הליגה, החברות והמשחק, דורש חברות פעילה והתאמת עונה ומאפשר upsert רק בליגה
שאינה `completed`/`archived` ועבור `scheduled`/`postponed` כאשר
`now() < kickoff_at`. ליגה שהושלמה או אורכבה נשארת זמינה לקריאה בלבד. אין
כתיבת טבלה ישירה ואין מחיקה.

ה־seed של Slice 5 הוא **Demo ידני וסינתטי**: שש קבוצות וחמישה משחקים עתידיים
בשני מחזורים, עם שמות קבוצות אמיתיים לצורכי תצוגה אך ללא טענה שהמועדים הם לוח
2026/27 מאומת. `external_provider` ו־`external_id` נשארים `NULL`; בחירת
API-Football המאוחרת אינה משנה את השורות האלה, ולא מתבצעת קריאה חיצונית
מהדפדפן. המועדים העתידיים מונעים מה־seed לנעול
מיד את חוקי הניקוד של כל ליגות 2026/27; כשהמועד הראשון יעבור, trigger הנעילה
הקיים יפעל לפי זמן המסד כרגיל.

Slice 5 אינו כולל scoring, leaderboard או prize split; אלה נמסרו ב־Slice 6.
Slice 7 הוסיף observability ו־Cron ידני. Slice 7b מוסיף קטלוג API-Football
provider-owned נפרד ואינו משנה או מתייג מחדש את קטלוג ה־Demo;
AI ו־finance נשארים Slices 8–9.

## זרימת Slice 6: תוצאות, ניקוד ודירוג

הנתיבים החדשים מוגנים ודינמיים:

- `/admin/matches` — זמין רק לזהות שמופיעה ב־`system_admins`; מאפשר להזין
  תוצאה בתום הזמן החוקי או לבטל משחק. אין ממשק שמעניק הרשאת מנהל מערכת.
- `/leagues/[leagueId]/standings` — זמין רק לחבר פעיל או למנהל הליגה ומציג
  נקודות, כיוונים נכונים, תוצאות מדויקות ומספר ניחושים. השוויון משתמש
  ב־competition ranking: מקומות 1,1,3 ולא `dense_rank`.

`applyManualResult` מאמת session, קלט והרשאת מנהל מערכת בצד השרת, ואז קורא
ל־`score_match` דרך gateway `server-only`. הפונקציה נועלת את המשחק בלבד,
מעדכנת את התוצאה ואת ה־audit באותה transaction ומחליפה את שדות הניקוד של כל
ניחוש לפי חוקי הליגה שלו. retry זהה אינו משנה נקודות או timestamps; תיקון
מחשב מחדש; ביטול מאפס נקודות בלי למחוק ניחושים. `league_leaderboard` הוא
`security_invoker` ונשען על RLS, ולכן זהות מערכת שאינה חברה בליגה אינה מקבלת
גישה לדירוג רק מכוח תפקידה.

חלוקת פרסי Demo למקומות משותפים מחושבת במודול טהור ב־basis points. המערכת אינה
מחלקת כסף, אינה מציגה פרסים כספיים אמיתיים ואינה פותחת את שער הציות.

## זרימת Slice 7/7b: Sports Sync

- `POST /api/cron/sync` מקבל JSON עם `Authorization: Bearer ...`, משווה את
  `CRON_SECRET` בזמן קבוע ומפעיל orchestration משותפת. ה־Route דק ואינו מכיל
  mapping, SQL או ניקוד.
- `manual` שומר את התנהגות Slice 7: שורה סופית `MANUAL_PROVIDER` או
  `CONCURRENT_ATTEMPT`, ללא ספק וללא שינוי משחקים.
- `api-football` מבצע claim due-aware ב־Data API. `NOT_DUE` אינו קורא לספק
  ואינו יוצר שורת run. claim מוצלח יוצר lease עמיד עם generation/token/expiry;
  provider HTTP מתבצע אחר כך ומחוץ לטרנזקציה.
- ה־client server-only קורא רק league 383/season 2026 דרך endpoints allowlisted,
  עם GET, timeout, body cap, Zod, paging, retries חסומים ו־quota headers.
- payload מנורמל בלבד עובר ב־batches ל־apply RPC. upsert נעשה לפי provider ID,
  `FT` בלבד עובר ל־`score_match` הקיימת, ו־manual override מדולג. apply/finalize
  דוחים token ישן או פג.
- משחק שנצפה live/SUSP/INT/FT/AET/PEN מקבל latch מסדי שאינו נפתח מחדש לאחר
  שינוי מועד. קוד ביטול לבדו אינו קובע latch לפני kickoff; ביטול עתידי ללא
  latch יכול לחזור בבטחה ל־scheduled/postponed ומאפס metadata של ניקוד למצב
  unscored. `AET/PEN` נשמרים כ־review ללא ניקוד, מוחרגים מ־targeted ומוצגים
  כ־"דורש בדיקה". fixture עם regression לא־בטוח מבודד ואינו מפיל את ה־batch.
- ב־`/leagues/new` עונת Demo ועונת הספק מסומנות במקורן, גם כאשר שם התחרות
  ושם העונה זהים.
- `/admin/sync` זמין רק למנהל מערכת, מציג עד 100 ריצות, lifecycle, counters,
  quota והערות review בטוחות, ומאפשר trigger ידני באותה lease. רק
  `status='failed'` הוא כשל.

### הקמת principal ו־Cron

בסביבה מקומית, `supabase db reset --local` יוצר ב־seed principal בדיקה
לא־אינטראקטיבי שמזהה שלו
`70000000-0000-4000-8000-000000000007`. הגדירו אותו ב־`.env.local` בתור
`SYNC_SYSTEM_ACTOR_ID`, צרו ערך אקראי משלכם ל־`CRON_SECRET` ואל תשמרו אותו
ב־Git. `npm run test:e2e` מזריק סוד אקראי חדש לכל הרצה אוטומטית.

לכל סביבת hosted מבצעים את ההקמה ידנית ומאובטחת:

1. יוצרים דרך Supabase Auth Admin, בסשן תפעולי מבוקר, משתמש לא־אינטראקטיבי
   ייעודי. אין להפיץ או לשמור credential להתחברות; שומרים רק את ה־UUID שלו.
2. מעניקים ל־UUID שורה ב־`system_admins` דרך ערוץ ניהול מבוקר. אין מסך UI
   שמעניק הרשאה זו. הסרת השורה מבטלת מיד את יכולת ה־RPC.
3. מגדירים ב־Vercel את `SYNC_SYSTEM_ACTOR_ID` ואת `CRON_SECRET` כמשתני
   server-only. את אותו סוד Cron שומרים ב־Supabase Vault, לא ב־migration.
4. מגדירים Supabase Cron לבצע POST שמרני אל `/api/cron/sync`, עם
   `Content-Type: application/json` ו־Bearer שנקרא מ־Vault. אין לכתוב את הסוד
   ב־SQL, ב־Git או בלוגים.
5. כל עוד Production מוגדר `manual`, מפעילים ניסיון אחד ומוודאים במסך
   `/admin/sync` שורת `MANUAL_PROVIDER`. אין לפרש אותה כסנכרון לוח ממשי.

### Checklist להפעלת API-Football ב־Hosted — לא להריץ לפני merge מאושר

1. לאשר את Draft PR ולמזג רק לאחר review ו־CI ירוק.
2. להחיל את ה־migration forward-only על Hosted Supabase; אין לערוך migration
   קודמת ואין להריץ `supabase db reset --linked`.
3. להגדיר ב־Vercel Sensitive Environment Variable את `SPORTS_API_KEY`, ולהגדיר
   `SPORTS_API_PROVIDER=api-football`. אין להדפיס את המפתח ואין לשמור אותו ב־Vault.
4. להשאיר `CRON_SECRET` ו־`SYNC_SYSTEM_ACTOR_ID` הקיימים. `CRON_SECRET` נשאר
   גם ב־Supabase Vault; ה־Sports key אינו נכנס ל־Cron SQL.
5. לבצע deploy ולאמת שאין Sports key ב־HTML, client bundle או runtime response.
6. להפעיל manual Sync מורשה מתוך `/admin/sync`.
7. לאמת competition provider-owned, 14 teams, 26 rows ב־
   `sports_provider_rounds` ו־182 fixtures כפי שנצפו ב־POC, תוך קבלה של
   rounds/fixtures חדשים אם פורסמו; stage לא מוכר צריך `requires_review=true`.
8. לאמת ששש קבוצות וחמשת משחקי ה־Demo נשארו ללא external IDs וללא שינוי.
9. לאמת ש־Cron ללא secret/עם secret שגוי מחזיר 401 ואינו מוסיף run/audit.
10. לאמת lifecycle/counters/operator notes ב־`/admin/sync`.
11. לעדכן את job ה־Supabase Cron הקיים לפי שמו; אין ליצור job כפול. לשנות tick
    לכדקה רק לאחר שה־deployment בריא.
12. לבצע canary: `NS` → live → prediction נשאר נעול → `FT` מתוך
    `score.fulltime` → scoring דטרמיניסטי → leaderboard.
13. לבדוק retry זהה, correction `FT→FT` ו־manual override מול refresh.
14. לבדוק ביטול עתידי ללא חשיפת ניחושים, reactivation ואיפוס scoring metadata,
    וכן ש־AET/PEN מוצגים כ־"דורש בדיקה" ואינם תופסים targeted slot.
15. rollback תפעולי הוא `SPORTS_API_PROVIDER=manual` ו־redeploy. הוא אינו מוחק
    provider data ואינו מחזיר migration לאחור.

דוגמת Cron קיימת נשארת POST עם `Content-Type: application/json` ו־Bearer
שנקרא מ־Vault. יש לערוך את ה־schedule של ה־job הקיים ל־`* * * * *` דרך כלי
הניהול המאושר בלבד; אין להעתיק secret ל־SQL או ליצור job נוסף.

### Mailpit

Supabase CLI לוכד הודעות מקומיות ב־Mailpit. הכתובת מופיעה בשדה `MAILPIT_URL`
של `supabase status -o env` (ברירת המחדל היא
[http://localhost:54324](http://localhost:54324)). CI משתמש באותו מנגנון ולא
שולח Email אמיתי.

שירות ה־Email המובנה של Supabase hosted מיועד לניסוי, מוגבל בקצב וזמין על
בסיס best-effort. לפני שימוש אמיתי יידרש SMTP ייעודי; מגבלה זו אינה נעקפת
בפריסת הקורס.

## הגדרות Redirect ב־Supabase hosted

ב־Authentication → URL Configuration יש להגדיר ללא wildcard רחב:

- Site URL: `https://predictor-swart.vercel.app`
- Redirect URL: `http://localhost:3000/auth/confirm`
- Redirect URL: `https://predictor-swart.vercel.app/auth/confirm`
- Redirect URL: `https://predictor-git-feature-slice-1-auth-tals-projects-19902e47.vercel.app/auth/confirm`
- Redirect URL: `https://predictor-git-feature-slice-3-joi-bfc58f-tals-projects-19902e47.vercel.app/**`
- Redirect URL: `https://predictor-git-feature-slice-5-mat-fb0a0f-tals-projects-19902e47.vercel.app/**`

טפסי ההרשמה והשחזור משתמשים ב־origin הנוכחי. סביבות ה־Preview של PR #4 ו־PR
#5 מגדירות `NEXT_PUBLIC_APP_URL` ל־branch alias היציב שלהן, וה־aliases המדויקים
מופיעים ב־allowlist; `Site URL` נשאר כתובת ה־Production.

## Migrations וטיפוסים

ה־migrations הקנוניות נמצאות ב־`supabase/migrations/`. להפעלה מקומית בלבד:

```powershell
npm exec -- supabase db reset --local
npm run test:db
npm run types:db
npm run types:check
```

אסור להריץ `supabase db reset --linked`. שינוי schema חדש חייב להגיע
ב־migration אדיטיבית, ו־CI נכשל אם `database.generated.ts` סוטה מהמסד המקומי.

## בדיקות

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run types:check
npm run build
npm run test:e2e
npm run test:e2e:preview
npm run verify
```

`npm run test:e2e` דורש Supabase מקומי פעיל, בונה production build עם הכתובת
והמפתח הציבורי המקומיים ומריץ Desktop + Mobile. `npm run preview:local` מפעיל
את ה־build האחרון מול אותה סביבה לצורך בדיקה ידנית. `test:e2e:preview` דורש
`PLAYWRIGHT_BASE_URL` ומריץ רק smoke ציבורי מסומן; הפקודה המקומית נכשלת במכוון
אם מנסים להפנות אותה ל־URL חיצוני, כדי לא להסתיר דילוג על זרימות Auth.

פירוט מטריצת הבדיקות נמצא ב־[`docs/testing.md`](./docs/testing.md), וגבולות
האבטחה של Auth, פרופילים וליגות ב־[`docs/security.md`](./docs/security.md).

## פריסה

האפליקציה היא Next.js 16 יחידה שנפרסת ב־Vercel. הענף אינו מתמזג אוטומטית
ל־`main`; Production מתעדכן רק לאחר ביקורת PR ו־CI ירוק. כל סביבת Preview
חייבת להישאר ב־`DEMO_MODE=true` ולהשתמש ב־Supabase המורשה עבורה.
