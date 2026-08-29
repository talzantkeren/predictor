# פנקס מסירה — Slice 9

מסמך זה הוא פנקס העבודה המחייב של Slice 9. הוא נוצר על בסיס
`docs/slice-9-preflight-audit.md` §§10–18, ומפריד בין 25 רשומות המסירה
לבין findings שנסגרו או מוזגו לפני תחילת המימוש. ראיית baseline קיימת אינה
ראיית סגירה: רשומה תסומן `VERIFIED` רק לאחר עמידה מלאה בתנאי הקבלה שלה וצירוף
regression חדש שהיה נכשל ללא התיקון.

## נקודת מוצא

- Audit PR `#13` מוזג כ־squash לאחר אימות ה־base/head וה־allowlist, ב־SHA
  `9fc73e425f0b9f9e0acb07e403ffdd3daaa2be0d`.
- ענף העבודה: `feature/slice-9-implementation`, שנוצר ישירות מ־`origin/main`
  באותו SHA.
- baseline מקומי נקי: `npm ci`; lint; typecheck; 489/489 בדיקות Vitest;
  646 assertions של בדיקות מסד הנתונים; בדיקת drift של טיפוסי Supabase; build;
  סריקת 50 client artifacts ללא secret; ו־22/22 תרחישי Playwright.
- main CI run `32998167698` ופריסת Vercel של SHA הבסיס נצפו ירוקים. עובדות אלו
  מתארות את הבסיס בלבד ואינן סוגרות רשומה כלשהי להלן.
- `Internet Technologies.pdf` לא נמצא ב־repository או ב־attachments. בהתאם
  להחלטה S9-TDEC-003, היעדרו אינו פותח מחדש את finding המקור; אין להוסיף את
  הקובץ ל־Git.

## שער מיפוי 25/25

כל אחת מ־25 הרשומות ממופה פעם אחת בלבד ל־W1–W8: P1=7, P2=8, P3=10. אין
רשומה לא ממופה ואין כפל ספירה. סדר הביצוע המחייב הוא W1 → W8, עם לכל היותר
רשומה אחת במצב `IN_PROGRESS` בכל זמן. S9-DEF-014 ממופה ל־W7 כרשומת המסירה
הראשית; עבודת ה־Hosted/config התלויה בה נעשית לצד W2 ואינה נספרת כרשומה נוספת.

| ID | Priority | Workstream | Title | Status | Acceptance source (audit §) | Evidence path | Commit SHA | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S9-DEF-002 | P1 | W1 | החלטות זמן מתקבלות לפני serialization | VERIFIED | §10, `S9-DEF-002` | `docs/evidence/slice-9/w1/S9-DEF-002.md` | `6a11de606ddc2d7276b881fefcc22633c3a0cb54` | regression חדש: `npx supabase test db supabase/tests/slice9-time-serialization.test.sql` עבר 119/119; `npm run test:db` עבר 765/765; schema lint וטיפוסים עברו. |
| S9-DEF-001 | P1 | W2 | recovery suppresses and misclassifies errors | VERIFIED | §10, `S9-DEF-001` | `docs/evidence/slice-9/w2/S9-DEF-001.md` | `4a500fef8a728cb13092a02040aeb694ae6f2a55` | Typed allowlisted outcomes ו־account-neutral copy; 96/96 focused Vitest ו־6/6 Mailpit Playwright ב־Desktop/Mobile עברו. |
| S9-DEF-004 | P1 | W2 | Hosted confirmation/recovery אינו בר־הדגמה אמינה | OWNER_ACTION_REQUIRED | §10, `S9-DEF-004` | `docs/evidence/slice-9/w2/S9-DEF-004.md` | `4a500fef8a728cb13092a02040aeb694ae6f2a55`, `92a5206a871f52e227f1ddaf29470957d3c6e2e3`, `787d2dac461622d42f2f727d4faa32e24e32e10c`, `97c142e04b57882fb7ef91a4f521086f34dadb9f` | Hosted Email נצפה Enabled, ללא custom SMTP, והשירות המובנה מסר בפועל שתי הודעות שאושרו בנפרד. replacement דרך Server Action שמר PKCE, אך השימוש הראשון בידי ה־agent נדחה לפני callback עם `access_denied / otp_expired`; לא בוצעה password mutation. אחרי final deploy נדרשים owner approval+mailbox handoff מתיבה ללא one-time-link prefetch, וה־agent מסיר שני callback aliases ישנים ומריץ את ה־flow המלא. |
| S9-DEF-003 | P1 | W3 | fallback ידני מלא למשחקים חסר | VERIFIED | §10, `S9-DEF-003` | `docs/evidence/slice-9/w3/S9-DEF-003.md` | `15ced4df68faa53c67aa7d05371583ff2dc0d4e4`, `aaa152b1d2062632358ce8760559ce0c56cbd55b` | ראיית session ‏27.8.2026: שני קובצי pgTAP עברו 138/138; report→scoring עבר 4/4 לאחר בידוד fixture; המטריצה המלאה עברה 26/26; שערי lint/typecheck/Vitest/DB/types drift עברו. |
| S9-DEF-007 | P2 | W3 | מסך הגדרות ליגה אינו משנה הגדרות | VERIFIED | §10, `S9-DEF-007` | `docs/evidence/slice-9/w3/S9-DEF-007.md` | `445a07a4a22143bd6a74769d1873a3c6e37cda4f`, `0ded7d0de1e657a72aa2447e2b8d1f560e8047ba` | ראיית session ‏27.8.2026: שני קובצי pgTAP עברו 131/131; settings עבר בשני viewports; דליפת fixture שנחשפה בריצת W3 הראשונה תוקנה, ואותה פקודה עברה 8/8. |
| S9-DEF-008 | P2 | W3 | אין פעולה להסרת manual override | VERIFIED | §10, `S9-DEF-008` | `docs/evidence/slice-9/w3/S9-DEF-008.md` | `18014c1b4825696488f400f9782e9c859aacdfeb` | ראיית session ‏27.8.2026: שני קובצי pgTAP עברו 91/91; scoring/clear עבר בשני viewports כחלק מריצת W3 הסופית 8/8; full DB עבר 1182/1182. |
| S9-DEF-009 | P2 | W3 | hard caps משמשים בטעות כשלמות נתונים והרשאה | VERIFIED | §10, `S9-DEF-009` | `docs/evidence/slice-9/w3/S9-DEF-009.md` | `9c5e469abe421770fb194736d8f78cde0cb1c75d`, `0f8455dd2cbdff3b4b2d600ce5344eea2670f1e2`, `ee5fb791357a7f5f789512af2451a357524d29cf`, `8f52eff9413f6ae908c8a23e69bf211bf0ef5a64` | ראיית session ‏27.8.2026: pgTAP static+concurrency עבר 89/89, ‏Vitest מלא עבר 563/563, pagination ו־manager-decision עברו Desktop/Pixel, והמטריצה המלאה עברה 26/26; exact AuthZ נפרד מ־keyset pagination. |
| S9-REQ-001 | P1 | W4 | מימוש lifecycle מלא דרך המוצר | VERIFIED | §11, `S9-REQ-001` | `docs/evidence/slice-9/w4/S9-REQ-001.md` | `ffd4233533b535f6495b951e7a97b65557084014`, `efba7ae597d46dd05d48076840f8a9f0f86a42b0`, `b6f5cb0dc6f38eb6c477427521102e2c7574a094`, `b77709bb8471bd6e9b999cdb9430063306ce35c1`, `2a95569c159b864d2f253323f7d38f87fc48350a`, `be69893b4231612506c13cb85ef9a5e13c067b9a`, `94ffa850176ee279969cc713715db6cd3da5b7c4`, `aadf6de5484a9fcec0af3d4dd1b19dfc811dd338`, `d62c3af687ff8696a266251118b5826ed073e278`, `3b6cd1d43609180fd924c29effaca1ca205f2f64` | ביקורת עצמאית: שמונת גבולות ה־lifecycle ו־completion keyed per league; חבילת multi-session עברה 616/616. activation עסקי מיוחס ל־system actor וה־caller נשמר רק ב־metadata; focused עבר 110/110 ו־DB מלא 1496/1496. |
| S9-DEF-010 | P2 | W5 | targeted sync יכול להרעיב catalog/reconciliation | VERIFIED | §10, `S9-DEF-010` | `docs/evidence/slice-9/w5/S9-DEF-010.md` | `515ca8aef4f379d528dfa21ae01a345a31dd6422` | רוטציה least-recently-attempted מבטיחה כל plan due בתוך 3 claims זכאים; live ראשון במכסת 20; ‏9/9 focused ו־1409/1409 DB מלא עברו. |
| S9-DEF-011 | P2 | W5 | `Retry-After` ארוך מסווג timeout ומאבד backoff | VERIFIED | §10, `S9-DEF-011` | `docs/evidence/slice-9/w5/S9-DEF-011.md` | `3b23b1eeab4696060bc6655a8e28f183c2fbe26a` | ברירת המחדל 45/120/date מסווגת מיד RATE_LIMITED ללא sleep; quota/hint בטוחים נשמרים; ‏29/29 focused, ‏577/577 Vitest, ‏77/77 focused pgTAP ו־1411/1411 DB עברו. |
| S9-DEF-012 | P3 | W5 | Cron timeout קצר מ־budget חוקי של האפליקציה | OWNER_ACTION_REQUIRED | §10, `S9-DEF-012` | `docs/evidence/slice-9/w5/S9-DEF-012.md` | `1005a9b3b35e12b6535d82f17b56fc6ab947f12a`, `f8189d62c421435a5aee61e1271c572f674f3db9`, `a118ebe8b3ac9727dff882b2628e0c60cfe08d0d` | 30/45/60/120 contract, 26 focused Vitest ו־93 pgTAP עברו. ה־post-merge runbook ממפה לכל artifact את המסך/SQL המדויקים, קורא safe columns בלבד ואינו דורש owner input, credential או secret re-entry. הרשומה פתוחה רק משום ש־tick טבעי של final Production SHA טרם יכול היה להיצפות. |
| S9-DEF-018 | P3 | W5 | `FORCE_COOLDOWN` חוקי ב־DB אך נדחה ב־TypeScript | VERIFIED | §10, `S9-DEF-018` | `docs/evidence/slice-9/w5/S9-DEF-018.md` | `54a1041460478c8b30b0adf45a69701223cb891c` | real RPC row → skip ניטרלי; אין provider/apply/finalize/run; copy cooldown ייעודי. ‏35/35 focused, ‏584/584 Vitest ו־1427/1427 DB עברו בלי הרחבת admin allowlist. |
| S9-DEF-019 | P3 | W5 | error taxonomy של sync אינו מבחין בין שלבי הכשל | VERIFIED | §10, `S9-DEF-019` | `docs/evidence/slice-9/w5/S9-DEF-019.md` | `a9f7137c89002266f1de2524cf8c6ef509e156eb`, `5751a56bea59f0587264c3d96ee1723d76f5daa5` | taxonomy נשארת מכוסה; שער `test:client-secrets` העצמאי בונה עם sentinel וסורק 52 artifacts, ונאכף גם ב־CI וגם ב־`verify`. הרצת `verify` המבודדת עברה. |
| S9-DEF-025 | P3 | W5 | production sports credential זמין ל־Preview שאינו משתמש בו | VERIFIED | §10, `S9-DEF-025` | `docs/evidence/slice-9/w5/S9-DEF-025.md`, `docs/evidence/slice-9/w5/S9-DEF-025-environment-scope-matrix.md` | `47f29afc4ed1b4e22bc328350a6072d1f9ed5170` | הרשומה הקיימת צומצמה ב־target-only update ל־Sensitive Production-only בלי לקרוא או לשלוח value. ‏Preview חדש הגיע ל־READY ועבר 4/4 smoke ב־Manual ללא key; 53-artifact scan, Sports ‏63/63, build/runtime log scans ותצפית Cron לקריאה בלבד עברו. |
| S9-DEF-015 | P3 | W6 | שמות לא־מהימנים מאפשרים bidi spoofing ואינם מבודדים | VERIFIED | §10, `S9-DEF-015` | `docs/evidence/slice-9/w6/S9-DEF-015.md` | `33a80f3925ed4eca59ee3ac20e6f878b93e78cfe` | כל Bidi_Control נדחה ב־application+DB וטקסט mixed נשמר ומבודד. ‏193/193 focused, ‏617/617 Vitest, ‏16/16 focused DB, ‏1443/1443 DB ו־2/2 Playwright עברו. |
| S9-DEF-016 | P3 | W6 | skip link ב־invite מחובר מצביע ליעד חסר | VERIFIED | §10, `S9-DEF-016` | `docs/evidence/slice-9/w6/S9-DEF-016.md` | `3ed8a1b62fad7dac24c2da2035cc79de9fbe0a0a` | יעד יחיד, גלוי ובר־focus לכל guest/auth × valid/unavailable; regression עבר 4/4 ב־Desktop/Pixel. |
| S9-DEF-020 | P3 | W6 | invite unavailable מאבד escape למשתמש מחובר | VERIFIED | §10, `S9-DEF-020` | `docs/evidence/slice-9/w6/S9-DEF-020.md` | `251b87f76bb35f46cc79dc4f161660e06fbc714f` | guest/auth × malformed/expired/revoked עברו 4/4 ב־Desktop/Pixel; Dashboard/logout ניתנים רק ל־session מאומת וללא נתוני resource. |
| S9-DEF-022 | P3 | W6 | פערי נגישות קטנים ב־loading/forms/targets | OWNER_ACTION_REQUIRED | §10, `S9-DEF-022` | `docs/evidence/slice-9/w6/S9-DEF-022.md` | `2decde7e9244a6a0a55baf81b809cdb66858b370`, `1ce8f9d8c77fb6a50598f4062bcda12b4004f31a`, `ab0cf8749fd7d529db1967aded95f302a9179e04`, `1ce4fca9665609f85c52179874db45322443dc88` | המטריצה הרגילה עברה 14/14; חמישה תהליכי Chromium עם `--force-device-scale-factor=2`, ‏`viewport:null`, raster×2 וכל חוזי keyboard/name/contrast/44px/layout עברו 10/10. forced DSF משנה device scale אך לא את HostZoomMap/page zoom שמפעיל reflow נפרד; לכן נשאר spot-check של כ־4 דקות בלבד ב־Chrome Menu Zoom=200% על שלושה מסכים, לא מטריצה ידנית מלאה. |
| S9-DEF-024 | P3 | W6 | full E2E ירוק משאיר server error לא מוסבר | VERIFIED | §10, `S9-DEF-024` + supplement | `docs/evidence/slice-9/w6/S9-DEF-024.md`, `docs/evidence/slice-9/w6/S9-DEF-024-final-head-recurrence.md`, `docs/evidence/slice-9/w7/S9-REQ-004.md` | `1bc326dde52c7162337485fda134003719d1592c`, `056f6af4cb88415c1b18eef72a870da47acc456f` | ה־runner הכשיל גם recurrence ב־session זה ולא הציג 36/38 כ־PASS; אחרי reset ובידוד מתהליך מתחרה, focused עבר 4/4 והמטריצה המלאה עברה 38/38 ללא WebServer error. |
| S9-DEF-013 | P2 | W7 | ספר הפרויקט derived סותר את המקור הקנוני | VERIFIED | §10, `S9-DEF-013` + supplement | `docs/evidence/slice-9/w7/S9-DEF-013.md`, `docs/evidence/slice-9/w7/S9-DEF-013-python-runtime-determinism.md` | `867da06b9a2459eb6be9a042377fa394f3eca976`, `93cc78aea82299760df9143f06db51008c6ddb4e`, `5751a56bea59f0587264c3d96ee1723d76f5daa5` | `docs:book:check` regenerates to temp and byte-compares the DOCX; Vitest runs that executable gate, ו־CI/`verify` enforce it with Python 3.12. Final isolated `verify` passed. |
| S9-DEF-014 | P3 | W7 | Redirect allowlist ו־README אינם מתארים את Preview הנוכחי | VERIFIED | §10, `S9-DEF-014` | `docs/evidence/slice-9/w7/S9-DEF-014.md` | `dc0673acc14db431f67bd582b5a10c60c10858a7`, `15b2ff2e3fe33258f01d6046f82044ea9f9158ce` | אין host נגזר־branch במסמכי evaluator: Production/Local callbacks מדויקים, ללא wildcard; Preview Auth unsupported/unverified וללא origin יציב. חוזה docs עבר 88/88. |
| S9-REQ-002 | P1 | W7 | מצגת, demo script וחזרה של 10–15 דקות | OWNER_ACTION_REQUIRED | §11, `S9-REQ-002` | `docs/evidence/slice-9/w7/S9-REQ-002.md` | `c52393d654f63906a4561231d1943e38de2437d1`, `7a087986493ec1e421cc7db81df246717a84a98b`, `93e2055c0ae5ba4f1e458714cc41dc0384cf5e33`, `ba464a88f897e82654501afeb267bc7a3a78ee28` | 13 slides/renders/notes נבנו ממקור דטרמיניסטי; RTL/שפות/סדר לוגי, overflow, קישורים, 5 fallbacks ו־native Hebrew QA עברו. ‏50/641 Vitest, ‏32/1502 pgTAP ו־38/38 E2E נצפו. פעולה יחידה: owner מבצע חזרה אנושית רציפה 10–15 דקות וממלא checklist+log. |
| S9-REQ-004 | P2 | W7 | חבילת מסמכי הגשה מסונכרנת | VERIFIED | §11, `S9-REQ-004` | `docs/evidence/slice-9/w7/S9-REQ-004.md` | `219c31bb28cdfa90e873168675c23849e2baade7`, `5751a56bea59f0587264c3d96ee1723d76f5daa5`, `eb66c0951f6c2bfad65e570a0b5e65bf393c04d6` | `docs:submission:check` נאכף ב־CI/`verify`; guard tracked-text חוסם נתיבי developer מוחלטים. isolated `verify`: ‏639 Vitest, ‏1496 pgTAP, ‏38/38 E2E; build ו־52-artifact scan עברו. |
| S9-REQ-003 | P1 | W8 | ראיית הגשה סופית וגישת evaluator | OWNER_ACTION_REQUIRED | §11, `S9-REQ-003` | `docs/evidence/slice-9/w8/S9-REQ-003.md` | `1e3b9968c54edca78bab72ffefa491cbd2e0454f`, `450ece51b5cfd4f051e745b46c4bfde0aa9bd6b2`, `2f705dc4633877637c5286c9ca623f3f12b1af17` | ה־post-merge runbook הוא agent-executable וממפה exact-SHA CI, Hosted migration parity, system-actor readiness, Vercel immutable URL, incognito וגישת evaluator בלי לקרוא או להזין secret. הקלט היחיד שרק owner יכול לספק הוא זהות GitHub מאושרת של evaluator ושיטת מסירה out-of-band של Demo credentials. |
| S9-REQ-005 | P2 | W8 | hardening וראיית בדיקה סופית | VERIFIED | §11, `S9-REQ-005` | `docs/evidence/slice-9/w8/S9-REQ-005.md`, `docs/evidence/slice-9/w8/S9-REQ-005-hosted-auth-policy.md`, `docs/evidence/slice-9/w8/S9-REQ-005-security-advisor.md`, `docs/evidence/slice-9/w8/S9-REQ-005-performance-advisor.md` | `8b30d9ce2e5969c9e25d3ae15cb1c72458199f66`, `34316109119fd076552751ace1e8cb24498d882c` | Hosted policy נקראה בלבד; app הותאם ל־8 תווים/72 UTF-8 bytes ו־leaked-password נשאר accepted risk. כל 28 Security ו־20 Performance findings קיבלו disposition. migration קדימה הקשיח `rls_auto_enable`; post-fix Advisors, types/drift, ‏1502/1502 pgTAP ו־624/624 multi-session עברו. |

## Final closeout — agent-observed checkpoint

Checkpoint `4ee7bedbb096c8dcd1112324bf9b317ba5cf4712` נבדק ב־27.8.2026 לאחר
השלמת `docs/slice-9-owner-actions.md`, ‏`docs/slice-9-review-packet.md` וסנכרון
ספר הפרויקט. כל התוצאות להלן נצפו בפועל מול Local Supabase בלבד:

| Gate | תוצאה נצפית |
| --- | --- |
| `npm.cmd ci` | PASS — ‏427 packages נוספו, 428 נסרקו, 0 vulnerabilities |
| `npm.cmd run verify` | PASS — lint; strict typecheck; ‏50/639 Vitest; ‏31/1496 pgTAP; types current; project-book/submission checks; build; 52-artifact client scan; ‏38/38 Playwright ב־6.6m |
| standalone build + synthetic client scan | PASS — Next.js 16.3.0 production build; sentinel סינתטי נעדר מ־52 artifacts |
| `npm.cmd audit --audit-level=low` | PASS — 0 vulnerabilities |
| local DB lint | PASS — public/private, ‏`results=[]` |
| local forward reset | PASS — exit 0, כל 38 migrations עד `20260827200000`, seed ו־restart |
| generated types | PASS — current אחרי ה־reset |
| scale plans | PASS — ארבעה plans תחומים; 0.166/0.188/3.271/1.797ms; rows ‏51/51/51/26 |
| viewport/accessibility — checkpoint היסטורי | PASS — ‏10/10 ציבורי; הוחלף בראיית S9-DEF-022 העדכנית של 14/14 על public+authenticated למטה |
| S9-DEF-024 repeats | PASS — prediction-lock Desktop+Mobile ‏2/2 ב־27.1s, ‏2/2 ב־26.8s, ‏2/2 ב־27.1s; ללא server error |
| submission contracts | PASS — hardening, sports secret boundary, presentation, owner runbooks, final evidence, 15-document/34-local-link/5-external-link online check |
| project book | PASS — regeneration דטרמיניסטית; 5/5 pages הומרו read-only דרך Word 16 + Poppler ונבדקו חזותית ללא clipping/overlap/table/glyph/header/footer defect; ה־LibreOffice renderer המועדף לא היה זמין מקומית |

בדיקת native Chrome 200%, ‏Hosted/Production, delivery, evaluator והרצה אנושית
לא הוסקו מן המטריצה. לאחר סגירת S9-REQ-005 ו־S9-DEF-025 נשארות חמש פעולות
owner, אחת לכל רשומה פתוחה. מצב המסירה הנוכחי הוא 20 `VERIFIED` ו־5
`OWNER_ACTION_REQUIRED`.

### Recurrence על final candidate ותיקון קדימה

ה־candidate `ea37f999ada508a9e15189a717545363d05dd46e` נפסל: `npm.cmd run verify`
הריץ 38/38 תרחישי Playwright, אך detector פעיל צפה ב־server error מסוג
`The destination stream closed early` וה־runner החזיר exit 1. לא נרשם PASS ל־SHA זה.

התיקון הקדמי `056f6af4cb88415c1b18eef72a870da47acc456f` מונע prefetch ספקולטיבי
דרך `AppLink`, ממתין ל־RSC POST ול־network idle לפני reload אחרי שמירת prediction,
ומחנה דפים ב־`about:blank` לפני סגירה סדרתית של contexts. ראיה שנצפתה לפני
ה־push: lint ו־typecheck עברו; regression עבר 5/5; חמש ריצות focused עברו 2/2
ב־28.5/28.6/28.5/28.6/28.4 שניות; והמטריצה המלאה עברה 38/38 ב־6.4 דקות, exit
0 וללא WebServer error. הראיה המצונזרת נמצאת ב־supplement של S9-DEF-024.

### Determinism של ספר הפרויקט בין runtimes

ה־candidate `7a13d8ce04aa1aa400a58634fd00e7620e40e987` עבר את `npm.cmd run verify`
ואת שערי DB/UI, אך נפסל כ־SHA סופי לאחר ש־`npm.cmd run docs:book:check` נכשל
ב־Python 3.14.3 בזמן שאותו check עבר ב־Python 3.12.13. השוואת package זמנית
הוכיחה שתוכן כל entries זהה ורק bytes של DEFLATE שונים בין גרסאות zlib.

התיקון הקדמי `93cc78aea82299760df9143f06db51008c6ddb4e` כותב entries ממוינים ומנורמלים
כ־`ZIP_STORED`. שני runtimes עברו את drift check, regression חדש עבר 4/4,
וה־DOCX נפתח read-only ב־Word 16, הומר ל־PDF בן חמישה עמודים ועבר בדיקה חזותית
5/5 דרך Poppler ללא clipping, overlap, table overflow, פגם glyph או פגם
header/footer. באותו checkpoint היסטורי המניין היה 18 `VERIFIED` ו־7
`OWNER_ACTION_REQUIRED`; המניין הנוכחי לאחר סגירת שערי Hosted מופיע לעיל.

## סגירת findings של הביקורת העצמאית — 28.8.2026

| Finding | Pushed SHA | תוצאה וראיה שהוזזה |
| --- | --- | --- |
| 1 — Preview origin transient | `15b2ff2e3fe33258f01d6046f82044ea9f9158ce` | host נגזר־branch הוסר מכל מסמך durable; ‏S9-DEF-014 קיבל חוזה exact Production/Local + Preview unsupported/unverified. ‏88/88 focused עברו. |
| 2 — global lifecycle serialization | `d62c3af687ff8696a266251118b5826ed073e278` | נבחרה חלופת per-league key לכל שמונת הגבולות ול־completion/review/reconciliation; registry barrier נשאר רק לכותבי catalog. ראיית S9-REQ-001: multi-session ‏616/616 ו־DB מלא ‏1481/1481 באותה נקודת commit. |
| 3 — drift gates run nowhere | `5751a56bea59f0587264c3d96ee1723d76f5daa5` | ראיית S9-DEF-013/S9-REQ-004/S9-DEF-019: book regeneration+byte compare, submission check ו־client-secret build/scan נאכפים ב־CI וב־`verify`. |
| 4 — wrong activation actor | `3b6cd1d43609180fd924c29effaca1ca205f2f64` | ראיית S9-REQ-001: binding פרטי immutable ל־system actor; caller רק ב־metadata; mismatch/revocation/rotation ו־binding-row race. ‏110/110 focused ו־1496/1496 DB עברו. |
| 5 — developer path leak | `eb66c0951f6c2bfad65e570a0b5e65bf393c04d6` | ראיית S9-REQ-004: כל paths הוחלפו ב־placeholders ו־Vitest tracked-text guard עבר 6/6; אין allowlist לקובץ הבדיקה. |

## סגירת שלושת שערי pre-merge — 28.8.2026

| Record | Status נוכחי | Pushed SHA | תוצאה |
| --- | --- | --- | --- |
| S9-REQ-005 | VERIFIED | `34316109119fd076552751ace1e8cb24498d882c` | Hosted Auth נקרא בלבד; כל 48 findings קיבלו disposition; migration hardening קדימה, types/drift, ‏1502 pgTAP ו־624 multi-session אומתו. |
| S9-DEF-025 | VERIFIED | `47f29afc4ed1b4e22bc328350a6072d1f9ed5170` | `SPORTS_API_KEY` נשאר Sensitive ו־Production-only ללא קריאת value; Preview READY עבר Manual smoke והמשכיות Cron נצפתה בקריאה בלבד. |
| S9-DEF-022 | OWNER_ACTION_REQUIRED | `1ce8f9d8c77fb6a50598f4062bcda12b4004f31a` | כל המטריצה האוטומטית ותיקוני המוצר עברו; נשארה רק תצפית Chrome native Zoom=200% לפי הראיה. |

לא בוצעו S9-DEF-004, ‏S9-DEF-012 או S9-REQ-003, משום שהם תלויים בפריסת
Production הסופית לאחר merge. גם S9-REQ-002 ו־S9-DEF-022 נשארים פתוחים; לכן
המניין המחייב הוא 20 `VERIFIED` ו־5 `OWNER_ACTION_REQUIRED`. ‏PR #14 נשאר
Draft ולא מוזג.

הרצות הסיום נשמרות בלי למחוק כשל: `verify` ראשון עבר את כל השערים עד E2E אך
נכשל 36/38 עם WebServer error; focused ראשון אחרי הכשל נכשל 0/4 בגלל cleanup
מקומי שלא הושלם. reset מקומי עבר וכל 38 migrations הוחלו, ואז focused עבר
4/4. `verify` שני נפסל כאשר session מקביל החליף את container ה־DB באמצע
`test:db`; ‏Docker הראה `OOMKilled=false`. רק לאחר יציאת התהליך המתחרה הורץ
`npm run verify` מבודד: lint/typecheck, ‏50 files/639 Vitest, ‏31 files/1496
pgTAP, types current, book/submission, build, ‏52-artifact scan ו־38/38 E2E
ב־6.6 דקות ללא WebServer error — PASS. ‏`npm run build` סופי עבר בנפרד.

PR #14 נשאר Draft. לא בוצעו merge, Ready for review או auto-merge, ולא בוצעה
mutation ב־Hosted/linked.

## סגירת findings של ביקורת round 2 — code and gates only

| Finding | Status | Pushed SHA | שינוי וראיית regression |
| --- | --- | --- | --- |
| F10 — bootstrap של boundary actor | FIXED | `a1a8e11cc4252686cd1a76b53971669b72a407b4` | migration קדימה מוסיף designation יחיד `sports_sync`, מקדם binding קיים בזמן deploy, יוצר cache ב־trigger בעת designation ומאפשר fallback לקריאה בלבד כשה־cache במצב UNBOUND. בדיקת late approval מוחקת את ה־binding לפני kickoff שכבר חל ומוכיחה activation+audit עם actor המערכת; מול המימוש הישן הקריאה נעצרת ב־`SYSTEM_ACTOR_UNAVAILABLE`. במסד Hosted ריק לחלוטין migration אינה ממציאה Auth UUID: runbook ה־Production דורש designation ואימותו אחרי migrations ולפני פתיחת traffic. |
| F8 — barrier לפני review discovery | FIXED | `b06f481cad57a1ce9efb28a996d91e922189086f`, `ec4ca777c281125c3501d83fb525b7fb1269ce90` | `resolve_match_result_review` לוקח את אותו registry barrier לפני discovery ורק אז את מפתחות הליגות. בדיקת dblink עם חמישה backends נכשלה מול הסכימה הקודמת ב־6/27 assertions ועברה 27/27 לאחר התיקון; בדיקה מבנית נוספת מקבעת את סדר barrier→discovery→league locks. |
| F9 — reconcile lock/reverify | FIXED | `9a1ba2f01558101b2881abe6e4b33a7710431e64` | ה־wrapper נכשל מיד ב־not-found, נועל את מפתח הליגה, נועל מחדש את שורות league→match→snapshot→reconciliation ומאמת שה־work item עדיין קשור לאותה ליגה לפני delegate. המירוץ הישן נכשל ב־5/23 assertions ואף dismiss את הרשומה שהועברה לליגה B; אחרי migration עברו 23/23 והיא נשארה pending עם `RECONCILIATION_NOT_FOUND`. |
| F6 — advisor hardening non-vacuous | FIXED | `ed1a0e53d6dede677e68b5e2ea13fbb6da23697f` | pgTAP יוצר transactional event trigger ו־`rls_auto_enable` אמיתיים, מפעיל בנפרד mode/path/link/ארבע mutations של EXECUTE ומחייב כל guard להיכשל לפני תיקון; אחר כך חוזה migration מתקן ומאומת ב־18/18. שתי בדיקות Vitest מקבעות parity מול migration המקור ואת הקריאה האוטומטית כמשפט אחרון; הסרת הקריאה נצפתה כ־1/2 failing וחזרה ל־2/2 אחרי restore. |
| F11 — gates enforced | FIXED | `e01d9492bbdc0a4be0151f5177d6aa3032cab5d9` | כל ששת השערים נקראים ישירות מ־CI ומ־`npm run verify`; scale plans רצים כשה־DB פעיל. חוזה sentinel סינתטי נשמר תחת `.next` וקשור ל־`BUILD_ID`, ולכן direct scan נכשל סגור על build ישן/חוזה חסר/אי־התאמה. הסרת `hardening:check` מ־verify נצפתה כ־1/3 failing; לאחר restore עברו 3/3, וחמש בדיקות scanner התנהגותיות עברו. |

### Final observed gates אחרי F11

| פקודה | תוצאה נצפית |
| --- | --- |
| `npm run verify` | PASS — lint; strict typecheck; ‏53 files/651 Vitest; ארבעת שערי evidence/hardening/runbooks/Sports; ‏34 files/1574 pgTAP; ארבעה scale plans עם rows ‏51/51/51/26; generated types current; book/submission checks; build; שתי סריקות של 53 artifacts; ‏42/42 Playwright ב־9.4 דקות |
| `npm run build` | PASS — Next.js production compile, TypeScript, page collection ו־static generation |
| mutation check של F11 | EXPECTED FAIL — הסרה זמנית של `hardening:check` גרמה ל־1/3 failure; הקובץ שוחזר לפני commit והבדיקה חזרה ל־3/3 PASS |

לא נערכו נתיבי המצגת שבבעלות המשימה הנפרדת. ארבעת קובצי ה־E2E/רכיבים
שהיו modified מראש נשמרו מחוץ לכל commit. ‏PR #14 נשאר Draft ולא מוזג.

## תיקוני follow-up לביקורת round 2 — 28.8.2026

ה־follow-up סוגר את חמשת הפערים הקונקרטיים שהועלו בביקורת החוזרת, בלי לשנות
את סטטוס רשומות המסירה ובלי לבצע פעולת Hosted/Production:

| פער | Pushed SHA | תיקון וראיה שנצפתה |
| --- | --- | --- |
| F10 — שער pre-traffic אינו מוגן וה־env actor אינו מושווה | `dfd4c56785af71e0f0e500b0005f321a69cb9ddc` | checker ו־Vitest מחייבים את §3A, את שני ערכי ה־readiness ואת `sync_actor_matches_designation` גם ב־runbook וגם בתבנית value-free. ה־runbook דורש השוואה חזותית זמנית ל־Production env בלי לשמור UUID. שינוי זמני של כותרת §3A הכשיל את checker ואת Vitest ‏1/3; לאחר restore עברו 3/3. |
| F10 — מסלול promotion של binding קיים לא נבדק | `db03671603ed8a967f3b0f7be6847c5bec82abe5` | migration קדימה מוסיפה helper פרטי, invoker-rights, empty-path וללא Data API grant; היעדר binding הוא no-op, mismatch נכשל סגור ו־replay idempotent. fixture יוצר legacy binding אמיתי ועבר 42/42; helper מוטנטי שהחזיר false הכשיל שלוש assertions ובהמשך `SYSTEM_ACTOR_UNAVAILABLE`. הסרת invocation הסופי הכשילה Vitest ‏1/2. |
| F8 — השומר המבני לא קיבע discovery מתחת למחסום | `4f3ef91596bffe2436df188bed7059580f21fea4` | assertion מקבע במפורש barrier→`public.leagues` discovery→league keys. הזזה מקומית של discovery מעל המחסום הכשילה assertion יחיד מתוך 39; reset החזיר 39/39. |
| F8 — כניסת `public.score_match` הישירה עקפה registry/league keys | `43a893b2f1599e64d7b0aa430a35bae414edc8c5` | migration קדימה משמרת את חתימת ה־RPC אך עוטפת אותה ב־actor→registry→discovery→sorted league keys ומעבירה את המימוש הקודם ל־delegate פרטי ללא Data API EXECUTE. probe בחיבור נפרד מוכיח המתנה על ה־registry ועל מפתח הליגה המדויק. עטיפה מוטנטית ללא prefix נכשלה בדיוק ב־3/59; לאחר reset עברו scoring+scope ‏133/133 ו־review barrier ‏27/27. |

### שערי סיום נצפים אחרי ה־follow-up

| פקודה | תוצאה נצפית |
| --- | --- |
| `npm run verify` | PASS — lint; strict typecheck; ‏55 files/656 Vitest; ארבעת שערי evidence/hardening/runbooks/Sports; ‏34 files/1600 pgTAP; scale plans עם rows ‏51/51/51/26; generated types current; book/submission/presentation checks; build; שתי סריקות של 53 artifacts; ‏42/42 Playwright ב־9.2 דקות |
| `npm run build` | PASS — validation, Next.js production compile, TypeScript, page collection ו־static generation |
| local forward reset + DB lint | PASS — כל 45 migrations עד `20260828101000`; seed/restart; `extensions`, ‏`private` ו־`public` ללא schema error |

לא נערכו נתיבי המצגת שבבעלות המשימה הנפרדת. ארבעת קובצי ה־E2E/רכיבים שהיו
modified מראש נשארו מחוץ לכל commit. ‏PR #14 נשאר Draft ולא מוזג.

## סגירת הביקורת המקיפה הנוספת — 28.8.2026

הסבב הזה סוגר את שני ממצאי ה־LOW החדשים ואת שאריות חוזה הבדיקה שנלוו אליהם.
לא השתנה סטטוס אף רשומת מסירה, ולא בוצעה פעולת Hosted או Production:

| ממצא/שארית | Status | Pushed SHA | תיקון וראיה שנצפתה |
| --- | --- | --- | --- |
| `clear_manual_match_override` ללא registry barrier | FIXED | `42d79f79f40845c0fd472dc44260ced643f57504` | migration קדימה משמרת את חתימת ה־RPC, מעבירה את המימוש ל־delegate פרטי ללא Data API grant, ולוקחת barrier בלעדי לפני גילוי העונה. מירוץ dblink עם `create_league` אמיתי מוכיח שה־creator ממתין במחסום shared עד שה־clear מסיים; wrapper מוטנטי ללא barrier הכשיל 3/107 assertions, ולאחר reset עברו 107/107. |
| revocation של actor בזמן scoring | FIXED | `4863abf9874b647dc90dd74d3aa21d352082b799` | helper פרטי, invoker-rights, ‏empty-path וללא Data API grant מאמת מחדש את actor אחרי registry+league waits ומחזיק את `system_admins` ב־`FOR KEY SHARE` עד commit. שלושת הגבולות `score_match`, ‏`create_or_correct_match` ו־`resolve_match_result_review` קוראים לו לפני delegate. הסרת `FOR KEY SHARE` הכשילה 2/18; הסרת ה־retain מ־`score_match` הכשילה 1/18; baseline ממוקד עבר 213/213. |
| promotion mismatch, קריאת sync וניסוחי lock חלשים | CLOSED_CONTRACT_GAPS | `5578f24c4f93c06eaf0f0a26f46e7d3549fbd28f` | בדיקת promotion בונה designation ו־legacy binding שונים ומחייבת `SYSTEM_ACTOR_MISMATCH` בלי mutation; הסרת הענף הכשילה 1/45. חוזה ה־sync דורש כעת קריאה executable מדויקת ל־`public.score_match` ומקבע שה־lock set החיצוני הוא superset של עונת הספק ועונות fixtures קיימים; alias מוטנטי שהשאיר את ההערה הכשיל 1/79. בדיקת scoring מזהה את מפתח ה־advisory המדויק שעליו `save_prediction` ממתינה. |
| overhead של wrapper חוזר בתוך batch | ACCEPTED_WITH_EVIDENCE | `5578f24c4f93c06eaf0f0a26f46e7d3549fbd28f` | ה־batch תחום ל־50 fixtures; נעילות transaction חוזרות הן reentrant וקבוצת הנעילות הפנימית מקובעת כ־subset. parse/lookup חוזרים נשמרים בכוונה כדי שכל ניקוד יעבור באותו גבול actor/authorization, במקום ליצור bypass פרטי לצורך אופטימיזציה ספקולטיבית. |

### שערים נצפים אחרי הסגירה הנוספת

| פקודה | תוצאה נצפית |
| --- | --- |
| `npm run verify` | PASS — lint; strict typecheck; ‏55 files/656 Vitest; כל שערי evidence/hardening/runbooks/Sports; ‏35 files/1638 pgTAP; ארבעה scale plans עם rows ‏51/51/51/26; generated types current; book/submission/presentation checks; build; שתי סריקות של 53 artifacts; ‏42/42 Playwright ב־9.2 דקות |
| `npm run build` | PASS — validation, Next.js production compile, TypeScript, page collection ו־static generation |
| local forward reset + DB lint | PASS — כל 47 migrations עד `20260828103000`; seed/restart; `extensions`, ‏`private` ו־`public` ללא schema error |
| focused contract baseline | PASS — activation+sync+scoring ‏198/198; actor-retention/lock/review/scoring ‏213/213; generated-type drift ו־submission evidence עברו |

ה־`SYSTEM_ACTOR_UNAVAILABLE` בתוך חוזה ה־promotion נשאר guard הגנתי מול מצב
שלא ניתן לבנות דרך הסכימה התקינה: ה־FK של binding ל־`system_admins` עם
`ON DELETE CASCADE` מונע שורת binding יתומה. הוא אינו נספר כראיית runtime.
נתיבי המצגת לא נערכו. ארבעת קובצי המשתמש שהיו modified מראש נשארו מחוץ לכל
commit; ‏PR #14 נשאר Draft, פתוח ולא ממוזג.

## השלמת חוזה actor retention לכל כותבי scoring — 28.8.2026

ממצא ה־LOW האחרון מן הביקורת המתוזמנת נסגר ב־commit
`2071b0a90c2c235efe950184f84728bce9129a2d`, בלי לשנות סטטוס של רשומת מסירה
ובלי פעולת Hosted או Production:

| ממצא | Status | תיקון וראיית regression |
| --- | --- | --- |
| `reconcile_completed_league` ו־`apply_api_football_sync_batch` לא קיבעו actor אחרי ההמתנה | FIXED | migration קדימה `20260828104000_slice9_remaining_scoring_actor_retention.sql` משמרת את שתי חתימות ה־RPC ואת grants ה־`service_role` בלבד. reconciliation שומר `league key → actor retain → lock-bound recheck → delegate`; ה־batch שומר `registry barrier → sorted league keys → actor retain → delegate`, גם ב־batch שאין בו fixture סופי. כך כל שמונת כותבי ה־service-role במיפוי הביקורת מקיימים את חוזה ה־revocation. |

`slice9-system-actor-retention.test.sql` מקבע כעת את כל חמשת ה־wrappers
שתלויים ב־helper. הסרה זמנית של retain מ־reconciliation במסד המקומי בלבד
הכשילה assertion אחד מתוך 18 והורידה את המניין מ־5 ל־4; לאחר reset, הסרה
נפרדת מן ה־API-Football batch הכשילה באותו אופן 1/18. קובץ המוטציה הזמני
נמחק, reset מלא החיל מחדש את כל 48 ה־migrations, וה־baseline הממוקד עבר
283/283 בשישה קובצי pgTAP. ‏DB lint לא מצא schema errors ו־generated types
נשארו current; החתימות החשופות לא השתנו.

### שערים נצפים אחרי השלמת ה־retention

| פקודה | תוצאה נצפית |
| --- | --- |
| `npm run verify` | PASS — lint; strict typecheck; ‏55 files/656 Vitest; כל שערי evidence/hardening/runbooks/Sports; ‏35 files/1638 pgTAP; ארבעה scale plans עם rows ‏51/51/51/26; generated types current; book/submission/presentation checks; build; שתי סריקות של 53 artifacts; ‏42/42 Playwright ב־9.1 דקות |
| `npm run build` | PASS — validation, Next.js production compile, TypeScript, page collection ו־static generation |
| local forward reset | PASS — כל 48 migrations עד `20260828104000`; seed ו־restart |
| שתי mutations נפרדות | EXPECTED FAIL — כל הסרת retain הכשילה בדיוק 1/18; לאחר restore עברו 18/18 וה־focused set עבר 283/283 |

נתיבי המצגת לא נערכו. ארבעת קובצי המשתמש שהיו modified מראש נשארו מחוץ לכל
commit. ‏PR #14 נשאר Draft, פתוח ולא ממוזג; פעולות ה־Production וה־native
Chrome Zoom=200% נשארות פעולות הבעלים המתועדות ולא נטענות כאן כ־PASS.

## ראיית סגירת W3 מה־session של 27.8.2026

רק ארבע רשומות W3 נסגרות על בסיס ההרצות האלה; W4 נשאר `NOT_STARTED`.

| ID/שער | פקודה מדויקת | תוצאה שנצפתה |
| --- | --- | --- |
| S9-DEF-003 | `npx.cmd --no-install supabase test db supabase/tests/manual-match-fallback.test.sql supabase/tests/manual-match-concurrency.test.sql` | PASS — ‏2 files, ‏138 tests |
| S9-DEF-007 | `npx.cmd --no-install supabase test db supabase/tests/league-settings.test.sql supabase/tests/league-settings-concurrency.test.sql` | PASS — ‏2 files, ‏131 tests |
| S9-DEF-008 | `npx.cmd --no-install supabase test db supabase/tests/manual-override-clear.test.sql supabase/tests/manual-override-clear-concurrency.test.sql` | PASS — ‏2 files, ‏91 tests |
| S9-DEF-009 | `npx.cmd --no-install supabase test db supabase/tests/keyset-pagination.test.sql supabase/tests/keyset-pagination-concurrency.test.sql` | PASS — ‏2 files, ‏89 tests |
| W3 browser | `npm.cmd run test:e2e:run -- e2e/scoring.spec.ts e2e/sync.spec.ts e2e/settings.spec.ts e2e/pagination.spec.ts` | ריצה ראשונה: FAIL — ‏7 passed, ‏1 failed עקב דליפת fixture של settings; אחרי תיקון ואיפוס מקומי: PASS — ‏8/8 |
| DEF-003 integration | `npm.cmd run test:e2e:run -- e2e/reports.spec.ts e2e/scoring.spec.ts` | PASS — ‏4/4 ב־Desktop/Pixel |
| DEF-009 integration | `npm.cmd run test:e2e -- e2e/join-and-proofs.spec.ts` | אחרי אבחון locator כפול: PASS — build + client scan + ‏4/4 ב־Desktop/Pixel |
| W3 full browser | `npm.cmd run test:e2e:run` | PASS — ‏26/26 לאחר reset מקומי טרי |
| lint | `npm.cmd run lint` | PASS — exit 0 |
| TypeScript | `npm.cmd run typecheck` | PASS — exit 0; עבר שוב אחרי generation |
| Vitest | `npm.cmd run test` | PASS — ‏40 files, ‏563 tests |
| DB מלא | `npm.cmd run test:db` | PASS — ‏19 files, ‏1182 tests |
| generated types | `npm.cmd run types:check` | ריצה ראשונה: FAIL — generated types stale |
| generation | `npm.cmd run types:db` | PASS |
| generated types חוזר | `npm.cmd run types:check` | PASS — `Generated database types are current` |

הפלטים המצונזרים, שמות ה־specs והאבחון המלא נשמרו בקובצי הראיה של כל ID
ב־`docs/evidence/slice-9/w3/`. אין claim על Hosted/Production, provider חי או
בדיקה שלא נצפתה ב־session הזה.

## רשומות ביקורת שאינן נספרות כמסירה פתוחה

| ID | Disposition | Reason |
| --- | --- | --- |
| S9-DEF-005 | MERGED | מוזג לתנאי הקבלה האטומיים של S9-REQ-001; אין לממש או לספור בנפרד. |
| S9-DEF-006 | RESOLVED_PRODUCT_DECISION | חוזה ה־lifecycle הוכרע ב־S9-PDEC-001..005; עבודת runtime נשארת ב־S9-REQ-001. |
| S9-DEF-017 | ACCEPTED_RESIDUAL_RISK | S9-TDEC-001 אישר manual release control עקב מגבלת GitHub plan; אין finding הנדסי פתוח. |
| S9-DEF-021 | MERGED | החלטת `/members` נסגרה; יכולת הרשימה לקריאה בלבד מוזגה ל־S9-REQ-001. |
| S9-DEF-023 | CLOSED_PROVENANCE | נסגר ב־S9-TDEC-003; manifest נשמר וה־PDF הרשמי מסופק מחוץ ל־Git. |

## סדר תלויות וגבולות ראיה

1. W1 מתקן serialization וזמן DB לפני כל שינוי lifecycle או sync.
2. W2 סוגר את חוזה recovery המקומי ומפריד במפורש פעולות Hosted שאין להן
   credentials/זהות זמינים.
3. W3 בונה fallback ידני, settings, override ו־pagination על בסיס W1.
4. W4 מסנכרן תחילה את policy ב־architecture ואז מממש lifecycle מלא.
5. W5 מקשיח sync על גבי חוזי W1/W4 בלי provider חי בבדיקות.
6. W6 סוגר RTL, security, accessibility ואות הבדיקה.
7. W7 מסנכרן מסמכים ויוצר מחדש את הספר והמצגת רק אחרי התייצבות עובדות runtime.
8. W8 מריץ ומקשר ראיות final-candidate, בלי לשכתב ראיות היסטוריות ובלי למזג
   את ה־Draft PR.

כל evidence חדש יישמר בנתיב הרשומה ויכלול פקודה מדויקת, שם test/spec וקטע
פלט מצונזר. ערך `Commit SHA` יעודכן לאחר commit קוהרנטי; ה־PR ledger יסונכרן
אחרי כל גבול workstream.

## צמצום שערי הבעלים לפני merge — 29.8.2026

נקודת הקוד שנבדקה לפני commit ה־ledger היא
`1ce4fca9665609f85c52179874db45322443dc88`. ‏PR #14 נצפה Draft, פתוח ולא
ממוזג; לא בוצעו merge, ‏Production deploy או promotion. לא נערך נתיב תחת
`presentation/`, וארבעת קובצי המשתמש שהיו modified מראש נשארו מחוץ לכל
commit.

| רשומה | סטטוס | מה נצפה בפועל | מה עדיין דורש owner וזמן פעיל |
| --- | --- | --- | --- |
| S9-DEF-004 | OWNER_ACTION_REQUIRED | Hosted Email Enabled; built-in sender ללא custom SMTP; שתי הודעות נמסרו. הבקשה החלופית דרך Server Action יצרה PKCE verifier cookies, אך Supabase דחה את השימוש הראשון שנצפה בקישור עם `access_denied / otp_expired` לפני `/update-password`; לא שונתה סיסמה. | לאחר final deploy: לאשר נמען organization-member/Auth בתיבה ללא one-time-link prefetch ולהחזיר קישור יחיד — 3–5 דקות. ה־agent מבצע את כל יתר ה־callback/update/replay/logout/login וה־configuration capture. |
| S9-DEF-012 | OWNER_ACTION_REQUIRED | ה־runbook וה־template מציינים את המסך/SQL/עמודות הבטוחות לכל artifact, וה־checker עבר. | אין קלט owner; 0 דקות. לאחר final deploy ה־agent ממתין ל־tick טבעי ומקשר job→response→terminal run→released lease. |
| S9-DEF-022 | OWNER_ACTION_REQUIRED | מטריצה רגילה 14/14, loading ‏2/2 ו־forced-browser-scale ‏10/10 עברו. ה־DSF הכפוי אומת בשורת הפקודה, DPR, raster ו־`visualViewport`, וכל בדיקות keyboard/focus/names/contrast/targets/layout עברו בחמישה רוחבים. | Chrome Menu Zoom=200% spot-check בלבד על admin matches, members+invalid rejection ו־settings — כ־4 דקות. לבדוק focus, clipping/overlap ו־horizontal page scroll; אין צורך לחזור על contrast/names/targets או חמשת הרוחבים. |
| S9-REQ-002 | OWNER_ACTION_REQUIRED | לא נגעו במצגת או בראיה, בהתאם להפרדת המשימות. | חזרה אנושית רציפה והשלמת checklist/log — 10–15 דקות. |
| S9-REQ-003 | OWNER_ACTION_REQUIRED | runbook/template מכינים exact-SHA CI, migration parity, designation readiness, immutable Production, incognito ו־evaluator artifacts; gates עברו. | למסור זהות GitHub מאושרת של evaluator ושיטת Demo access מאושרת — כ־2 דקות. ה־agent מבצע את יתר הסגירה לאחר merge/final deploy. |

לפני שלושת שערי ה־Production נדרשת החלטת owner נפרדת להעביר את PR #14 מ־Draft
ולמזג אותו; משימה זו אינה נותנת הרשאה לכך. המצב נשאר 20 `VERIFIED` ו־5
`OWNER_ACTION_REQUIRED`.

### שערים שנצפו בסשן הזה

| פקודה/שער | תוצאה נצפית |
| --- | --- |
| `npm run verify` — ריצה ראשונה | EXPECTED REAL FAILURE — ‏1/656 נכשל: `accessibility-matrix.spec.ts` עקף את stream-safe fixture ב־type-only import ישיר. החוזה לא דולג ולא הוחלש. |
| focused regression אחרי התיקון | PASS — `playwright-response-streams.test.ts` ‏5/5 ו־strict typecheck. התיקון pushed ב־`1ce4fca9665609f85c52179874db45322443dc88`. |
| `npm run verify` — ריצה מלאה חוזרת | PASS — lint; strict typecheck; ‏55 files/656 Vitest; כל שערי evidence/hardening/runbooks/Sports; ‏35 files/1638 pgTAP; scale rows ‏51/51/51/26; generated types current; book/submission/presentation read-only checks; build; שתי סריקות של 53 client artifacts; ‏42/42 Playwright ב־9.8 דקות. |
| `npm run build` — ריצה נפרדת | PASS — env validation, Next.js production compile, TypeScript, page collection ו־5/5 static generation. |

S9-DEF-004 אינו נסגר על סמך delivery בלבד; S9-DEF-022 אינו נסגר על סמך
forced device scale; ו־S9-DEF-012/S9-REQ-003 אינם נסגרים לפני final Production
SHA. אלה גבולות ראיה מכוונים, לא waiver.
