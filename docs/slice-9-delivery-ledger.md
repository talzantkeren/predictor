# פנקס מסירה — Slice 9

מסמך זה הוא פנקס העבודה המחייב של Slice 9. הוא נוצר על בסיס
`docs/slice-9-preflight-audit.md` §§10–18, ומפריד בין 25 רשומות המסירה הפתוחות
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
| S9-DEF-004 | P1 | W2 | Hosted confirmation/recovery אינו בר־הדגמה אמינה | OWNER_ACTION_REQUIRED | §10, `S9-DEF-004` | `docs/evidence/slice-9/w2/S9-DEF-004.md` | `4a500fef8a728cb13092a02040aeb694ae6f2a55`, `92a5206a871f52e227f1ddaf29470957d3c6e2e3` | exact URL/SMTP/template/rate + confirmation/recovery/replay/password/429 runbook, sanitized artifact map ו־empty template עברו regression; 88 focused tests ירוקים. פעולה יחידה: owner מריץ את כל ה־Hosted flow פעם אחת עם delivery credential ונמען disposable מאושרים. |
| S9-DEF-003 | P1 | W3 | fallback ידני מלא למשחקים חסר | VERIFIED | §10, `S9-DEF-003` | `docs/evidence/slice-9/w3/S9-DEF-003.md` | `15ced4df68faa53c67aa7d05371583ff2dc0d4e4`, `aaa152b1d2062632358ce8760559ce0c56cbd55b` | ראיית session ‏27.8.2026: שני קובצי pgTAP עברו 138/138; report→scoring עבר 4/4 לאחר בידוד fixture; המטריצה המלאה עברה 26/26; שערי lint/typecheck/Vitest/DB/types drift עברו. |
| S9-DEF-007 | P2 | W3 | מסך הגדרות ליגה אינו משנה הגדרות | VERIFIED | §10, `S9-DEF-007` | `docs/evidence/slice-9/w3/S9-DEF-007.md` | `445a07a4a22143bd6a74769d1873a3c6e37cda4f`, `0ded7d0de1e657a72aa2447e2b8d1f560e8047ba` | ראיית session ‏27.8.2026: שני קובצי pgTAP עברו 131/131; settings עבר בשני viewports; דליפת fixture שנחשפה בריצת W3 הראשונה תוקנה, ואותה פקודה עברה 8/8. |
| S9-DEF-008 | P2 | W3 | אין פעולה להסרת manual override | VERIFIED | §10, `S9-DEF-008` | `docs/evidence/slice-9/w3/S9-DEF-008.md` | `18014c1b4825696488f400f9782e9c859aacdfeb` | ראיית session ‏27.8.2026: שני קובצי pgTAP עברו 91/91; scoring/clear עבר בשני viewports כחלק מריצת W3 הסופית 8/8; full DB עבר 1182/1182. |
| S9-DEF-009 | P2 | W3 | hard caps משמשים בטעות כשלמות נתונים והרשאה | VERIFIED | §10, `S9-DEF-009` | `docs/evidence/slice-9/w3/S9-DEF-009.md` | `9c5e469abe421770fb194736d8f78cde0cb1c75d`, `0f8455dd2cbdff3b4b2d600ce5344eea2670f1e2`, `ee5fb791357a7f5f789512af2451a357524d29cf`, `8f52eff9413f6ae908c8a23e69bf211bf0ef5a64` | ראיית session ‏27.8.2026: pgTAP static+concurrency עבר 89/89, ‏Vitest מלא עבר 563/563, pagination ו־manager-decision עברו Desktop/Pixel, והמטריצה המלאה עברה 26/26; exact AuthZ נפרד מ־keyset pagination. |
| S9-REQ-001 | P1 | W4 | מימוש lifecycle מלא דרך המוצר | VERIFIED | §11, `S9-REQ-001` | `docs/evidence/slice-9/w4/S9-REQ-001.md` | `ffd4233533b535f6495b951e7a97b65557084014`, `efba7ae597d46dd05d48076840f8a9f0f86a42b0`, `b6f5cb0dc6f38eb6c477427521102e2c7574a094`, `b77709bb8471bd6e9b999cdb9430063306ce35c1`, `2a95569c159b864d2f253323f7d38f87fc48350a`, `be69893b4231612506c13cb85ef9a5e13c067b9a`, `94ffa850176ee279969cc713715db6cd3da5b7c4`, `aadf6de5484a9fcec0af3d4dd1b19dfc811dd338` | checkpoint 8/8: lifecycle מוצרי מלא עבר 1/1 ב־Desktop ו־1/1 ב־Mobile; פער audit בתוצאת Manual תוקן ב־migration קדימה וברגרסיה; ‏1400/1400 DB, ‏573/573 Vitest וכל שערי lint/type/build/types/client-scan עברו. |
| S9-DEF-010 | P2 | W5 | targeted sync יכול להרעיב catalog/reconciliation | VERIFIED | §10, `S9-DEF-010` | `docs/evidence/slice-9/w5/S9-DEF-010.md` | `515ca8aef4f379d528dfa21ae01a345a31dd6422` | רוטציה least-recently-attempted מבטיחה כל plan due בתוך 3 claims זכאים; live ראשון במכסת 20; ‏9/9 focused ו־1409/1409 DB מלא עברו. |
| S9-DEF-011 | P2 | W5 | `Retry-After` ארוך מסווג timeout ומאבד backoff | VERIFIED | §10, `S9-DEF-011` | `docs/evidence/slice-9/w5/S9-DEF-011.md` | `3b23b1eeab4696060bc6655a8e28f183c2fbe26a` | ברירת המחדל 45/120/date מסווגת מיד RATE_LIMITED ללא sleep; quota/hint בטוחים נשמרים; ‏29/29 focused, ‏577/577 Vitest, ‏77/77 focused pgTAP ו־1411/1411 DB עברו. |
| S9-DEF-012 | P3 | W5 | Cron timeout קצר מ־budget חוקי של האפליקציה | OWNER_ACTION_REQUIRED | §10, `S9-DEF-012` | `docs/evidence/slice-9/w5/S9-DEF-012.md` | `1005a9b3b35e12b6535d82f17b56fc6ab947f12a`, `f8189d62c421435a5aee61e1271c572f674f3db9` | 30/45/60/120 contract, 26 focused Vitest ו־93 pgTAP עברו; exact final-deploy/job/natural-tick SQL runbook ו־empty template מחזירים safe columns בלבד. פעולה יחידה: owner קושר tick טבעי אחד ל־terminal run יחיד ול־lease משוחרר אחרי final deploy. |
| S9-DEF-018 | P3 | W5 | `FORCE_COOLDOWN` חוקי ב־DB אך נדחה ב־TypeScript | VERIFIED | §10, `S9-DEF-018` | `docs/evidence/slice-9/w5/S9-DEF-018.md` | `54a1041460478c8b30b0adf45a69701223cb891c` | real RPC row → skip ניטרלי; אין provider/apply/finalize/run; copy cooldown ייעודי. ‏35/35 focused, ‏584/584 Vitest ו־1427/1427 DB עברו בלי הרחבת admin allowlist. |
| S9-DEF-019 | P3 | W5 | error taxonomy של sync אינו מבחין בין שלבי הכשל | VERIFIED | §10, `S9-DEF-019` | `docs/evidence/slice-9/w5/S9-DEF-019.md` | `a9f7137c89002266f1de2524cf8c6ef509e156eb` | קודי provider/planner/apply/finalize נפרדים ובטוחים; counters מוגדרים וללא double-finalize. ‏26/26 focused, ‏586/586 Vitest, ‏1427/1427 DB ו־52 artifacts בסריקה לא־ריקה עברו. |
| S9-DEF-025 | P3 | W5 | production sports credential זמין ל־Preview שאינו משתמש בו | OWNER_ACTION_REQUIRED | §10, `S9-DEF-025` | `docs/evidence/slice-9/w5/S9-DEF-025.md` | `32f62fa79c5ca24ba48395efdd47e1aee284a473`, `9d9f0e8f2f6668dc88dcffda8707d2cc21b94ae7` | agent-complete: Manual CI/Local, blank-value scope matrix, 52-artifact scan and two green CI log scans passed. פעולה יחידה: owner מבטל Preview scope של `SPORTS_API_KEY` ב־Vercel בלי לפתוח את הערך. |
| S9-DEF-015 | P3 | W6 | שמות לא־מהימנים מאפשרים bidi spoofing ואינם מבודדים | VERIFIED | §10, `S9-DEF-015` | `docs/evidence/slice-9/w6/S9-DEF-015.md` | `33a80f3925ed4eca59ee3ac20e6f878b93e78cfe` | כל Bidi_Control נדחה ב־application+DB וטקסט mixed נשמר ומבודד. ‏193/193 focused, ‏617/617 Vitest, ‏16/16 focused DB, ‏1443/1443 DB ו־2/2 Playwright עברו. |
| S9-DEF-016 | P3 | W6 | skip link ב־invite מחובר מצביע ליעד חסר | VERIFIED | §10, `S9-DEF-016` | `docs/evidence/slice-9/w6/S9-DEF-016.md` | `3ed8a1b62fad7dac24c2da2035cc79de9fbe0a0a` | יעד יחיד, גלוי ובר־focus לכל guest/auth × valid/unavailable; regression עבר 4/4 ב־Desktop/Pixel. |
| S9-DEF-020 | P3 | W6 | invite unavailable מאבד escape למשתמש מחובר | VERIFIED | §10, `S9-DEF-020` | `docs/evidence/slice-9/w6/S9-DEF-020.md` | `251b87f76bb35f46cc79dc4f161660e06fbc714f` | guest/auth × malformed/expired/revoked עברו 4/4 ב־Desktop/Pixel; Dashboard/logout ניתנים רק ל־session מאומת וללא נתוני resource. |
| S9-DEF-022 | P3 | W6 | פערי נגישות קטנים ב־loading/forms/targets | OWNER_ACTION_REQUIRED | §10, `S9-DEF-022` | `docs/evidence/slice-9/w6/S9-DEF-022.md` | `a2a398c146eb56135cb57da0e9d05d481c67444a`, `ecfd412c917f860ecba83e45d7c943aabeedfd73` | axe+keyboard+focus+contrast+touch עברו 10/10 על 4 routes × 5 widths × 2 projects; 42px/20px targets תוקנו; private loading/rejection עברו 2/2+4/4. פעולה יחידה: owner מבצע Chrome native Zoom=200% לפי הראיה. |
| S9-DEF-024 | P3 | W6 | full E2E ירוק משאיר server error לא מוסבר | VERIFIED | §10, `S9-DEF-024` | `docs/evidence/slice-9/w6/S9-DEF-024.md` | `1bc326dde52c7162337485fda134003719d1592c` | stream abort שוחזר, teardown הוסדר ו־WebServer Error מכשיל את ה־runner; שלוש חזרות Desktop+Mobile נקיות עברו 2/2. |
| S9-DEF-013 | P2 | W7 | ספר הפרויקט derived סותר את המקור הקנוני | VERIFIED | §10, `S9-DEF-013` | `docs/evidence/slice-9/w7/S9-DEF-013.md` | `867da06b9a2459eb6be9a042377fa394f3eca976` | source/workflow ו־regeneration דטרמיניסטיים; ‏624/624 Vitest, ‏1443/1443 DB ו־28/28 E2E נמדדו; 5/5 עמודים נבדקו ב־Word/Poppler ללא clipping או overlap. |
| S9-DEF-014 | P3 | W7 | Redirect allowlist ו־README אינם מתארים את Preview הנוכחי | VERIFIED | §10, `S9-DEF-014` | `docs/evidence/slice-9/w7/S9-DEF-014.md` | `dc0673acc14db431f67bd582b5a10c60c10858a7` | README/runbook מציגים Production/Local exact, ‏Preview PR #14 כ־smoke ציבורי ו־Auth לא־נתמך/לא־מאומת; ‏88/88 focused עברו ו־0 URL wildcards נמצאו. |
| S9-REQ-002 | P1 | W7 | מצגת, demo script וחזרה של 10–15 דקות | OWNER_ACTION_REQUIRED | §11, `S9-REQ-002` | `docs/evidence/slice-9/w7/S9-REQ-002.md` | `c52393d654f63906a4561231d1943e38de2437d1`, `7a087986493ec1e421cc7db81df246717a84a98b` | 9 slides/renders/notes, deck source, deterministic timing, 3 fallbacks ו־evaluator checklist עברו Artifact Tool/fidelity/overflow/link/regression checks; obsolete counts הוסרו. פעולה יחידה: owner מבצע חזרה אנושית רציפה 10–15 דקות וממלא checklist+log. |
| S9-REQ-004 | P2 | W7 | חבילת מסמכי הגשה מסונכרנת | VERIFIED | §11, `S9-REQ-004` | `docs/evidence/slice-9/w7/S9-REQ-004.md` | `219c31bb28cdfa90e873168675c23849e2baade7` | README/testing/security/scale/evaluator והספר v1.3 מסונכרנים; 627/627, ‏1443/1443 ו־28/28 נמדדו מחדש; links, render 5/5, build ו־client scan עברו. |
| S9-REQ-003 | P1 | W8 | ראיית הגשה סופית וגישת evaluator | OWNER_ACTION_REQUIRED | §11, `S9-REQ-003` | `docs/evidence/slice-9/w8/S9-REQ-003.md` | `1e3b9968c54edca78bab72ffefa491cbd2e0454f`, `450ece51b5cfd4f051e745b46c4bfde0aa9bd6b2` | Billing נפתר: run ‏33090719466 attempt 2 חשף כשל stream אמיתי על e791f36; אחרי התיקון שני runs ‏33097585902/33097590476 עברו בכל 3 jobs על 223de65. runbook מדויק, template ריק ושני checkers עברו. פעולה יחידה: owner מבצע final Production/evaluator closeout רציף על SHA סופי אחד, כולל Hosted parity ו־incognito. |
| S9-REQ-005 | P2 | W8 | hardening וראיית בדיקה סופית | OWNER_ACTION_REQUIRED | §11, `S9-REQ-005` | `docs/evidence/slice-9/w8/S9-REQ-005.md` | `a0610df0c0dad8634cbf512f9ff0b74b1bde728b`, `a6b45d12a0cc96361e540ef603339a01990127bd` | local+exact clean-clone עברו: 631 Vitest, ‏1443 DB, ‏38 E2E, build/lint/types/audit/reset/scale/5-width UI ושלוש חזרות; checker דורש disposition ו־owner row יחיד. פעולה יחידה: owner מבצע read-only Hosted password policy + Security/Performance Advisor export/dispositions באותו session. |

## Final closeout — agent-observed checkpoint

Checkpoint `4ee7bedbb096c8dcd1112324bf9b317ba5cf4712` נבדק ב־27.8.2026 לאחר
השלמת `docs/slice-9-owner-actions.md`, ‏`docs/slice-9-review-packet.md` וסנכרון
ספר הפרויקט. כל התוצאות להלן נצפו בפועל מול Local Supabase בלבד:

| Gate | תוצאה נצפית |
| --- | --- |
| `npm.cmd ci` | PASS — ‏427 packages נוספו, 428 נסרקו, 0 vulnerabilities |
| `npm.cmd run verify` | PASS — lint; strict typecheck; ‏49/631 Vitest; ‏30/1443 pgTAP; types current; build; 52-artifact client scan; ‏38/38 Playwright ב־6.4m וללא `[WebServer] Error` |
| standalone build + synthetic client scan | PASS — Next.js 16.3.0 production build; sentinel סינתטי נעדר מ־52 artifacts |
| `npm.cmd audit --audit-level=low` | PASS — 0 vulnerabilities |
| local DB lint | PASS — public/private, ‏`results=[]` |
| local forward reset | PASS — exit 0, כל 36 migrations עד `20260827180000`, seed ו־restart |
| generated types | PASS — current אחרי ה־reset |
| scale plans | PASS — ארבעה plans תחומים; 0.166/0.188/3.271/1.797ms; rows ‏51/51/51/26 |
| viewport/accessibility | PASS — ‏10/10; ‏360/390/768/1024/1440 בשני פרויקטי Chromium; axe/keyboard/focus/contrast/touch/RTL/overflow |
| S9-DEF-024 repeats | PASS — prediction-lock Desktop+Mobile ‏2/2 ב־27.1s, ‏2/2 ב־26.8s, ‏2/2 ב־27.1s; ללא server error |
| submission contracts | PASS — hardening, sports secret boundary, presentation, owner runbooks, final evidence, 15-document/34-local-link/5-external-link online check |
| project book | PASS — regeneration דטרמיניסטית; 5/5 pages הומרו read-only דרך Word 16 + Poppler ונבדקו חזותית ללא clipping/overlap/table/glyph/header/footer defect; ה־LibreOffice renderer המועדף לא היה זמין מקומית |

בדיקת native Chrome 200%, ‏Hosted/Production, delivery, evaluator והרצה אנושית
לא הוסקו מן המטריצה ונשארים בשבע פעולות owner, אחת לכל רשומה פתוחה. מצב
המסירה נשאר 18 `VERIFIED` ו־7 `OWNER_ACTION_REQUIRED`.

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
