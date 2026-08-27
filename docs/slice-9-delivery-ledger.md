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
| S9-DEF-004 | P1 | W2 | Hosted confirmation/recovery אינו בר־הדגמה אמינה | OWNER_ACTION_REQUIRED | §10, `S9-DEF-004` | `docs/evidence/slice-9/w2/S9-DEF-004.md` | `4a500fef8a728cb13092a02040aeb694ae6f2a55` | אין credential מאושר ל־delivery או disposable recipient; אין claim על Hosted pass. הוראות owner מדויקות ו־Production/Local origins נשמרו בראיה. |
| S9-DEF-003 | P1 | W3 | fallback ידני מלא למשחקים חסר | VERIFIED | §10, `S9-DEF-003` | `docs/evidence/slice-9/w3/S9-DEF-003.md` | `15ced4df68faa53c67aa7d05371583ff2dc0d4e4`, `aaa152b1d2062632358ce8760559ce0c56cbd55b` | ראיית session ‏27.8.2026: שני קובצי pgTAP עברו 138/138; report→scoring עבר 4/4 לאחר בידוד fixture; המטריצה המלאה עברה 26/26; שערי lint/typecheck/Vitest/DB/types drift עברו. |
| S9-DEF-007 | P2 | W3 | מסך הגדרות ליגה אינו משנה הגדרות | VERIFIED | §10, `S9-DEF-007` | `docs/evidence/slice-9/w3/S9-DEF-007.md` | `445a07a4a22143bd6a74769d1873a3c6e37cda4f`, `0ded7d0de1e657a72aa2447e2b8d1f560e8047ba` | ראיית session ‏27.8.2026: שני קובצי pgTAP עברו 131/131; settings עבר בשני viewports; דליפת fixture שנחשפה בריצת W3 הראשונה תוקנה, ואותה פקודה עברה 8/8. |
| S9-DEF-008 | P2 | W3 | אין פעולה להסרת manual override | VERIFIED | §10, `S9-DEF-008` | `docs/evidence/slice-9/w3/S9-DEF-008.md` | `18014c1b4825696488f400f9782e9c859aacdfeb` | ראיית session ‏27.8.2026: שני קובצי pgTAP עברו 91/91; scoring/clear עבר בשני viewports כחלק מריצת W3 הסופית 8/8; full DB עבר 1182/1182. |
| S9-DEF-009 | P2 | W3 | hard caps משמשים בטעות כשלמות נתונים והרשאה | VERIFIED | §10, `S9-DEF-009` | `docs/evidence/slice-9/w3/S9-DEF-009.md` | `9c5e469abe421770fb194736d8f78cde0cb1c75d`, `0f8455dd2cbdff3b4b2d600ce5344eea2670f1e2`, `ee5fb791357a7f5f789512af2451a357524d29cf`, `8f52eff9413f6ae908c8a23e69bf211bf0ef5a64` | ראיית session ‏27.8.2026: pgTAP static+concurrency עבר 89/89, ‏Vitest מלא עבר 563/563, pagination ו־manager-decision עברו Desktop/Pixel, והמטריצה המלאה עברה 26/26; exact AuthZ נפרד מ־keyset pagination. |
| S9-REQ-001 | P1 | W4 | מימוש lifecycle מלא דרך המוצר | IN_PROGRESS | §11, `S9-REQ-001` | `docs/evidence/slice-9/w4/S9-REQ-001.md` | `ffd4233533b535f6495b951e7a97b65557084014`, `efba7ae597d46dd05d48076840f8a9f0f86a42b0`, `b6f5cb0dc6f38eb6c477427521102e2c7574a094`, `b77709bb8471bd6e9b999cdb9430063306ce35c1` | checkpoint 4/8: completion אטומי, snapshot final reads וסגירת שתי בקשות pending; ‏23/23 completion, ‏1247/1247 DB, ‏565/565 Vitest, lint/type/build/types/client-scan עברו; review/reconciliation, members, races ו־lifecycle E2E עדיין פתוחים. |
| S9-DEF-010 | P2 | W5 | targeted sync יכול להרעיב catalog/reconciliation | NOT_STARTED | §10, `S9-DEF-010` | `docs/evidence/slice-9/w5/S9-DEF-010.md` | — | fairness חסומה תוך שמירת live priority ו־genuine NOT_DUE. |
| S9-DEF-011 | P2 | W5 | `Retry-After` ארוך מסווג timeout ומאבד backoff | NOT_STARTED | §10, `S9-DEF-011` | `docs/evidence/slice-9/w5/S9-DEF-011.md` | — | RATE_LIMITED נשמר לפני wait budget; ללא שינה ארוכה או קריאת provider חיה בבדיקה. |
| S9-DEF-012 | P3 | W5 | Cron timeout קצר מ־budget חוקי של האפליקציה | NOT_STARTED | §10, `S9-DEF-012` | `docs/evidence/slice-9/w5/S9-DEF-012.md` | — | controlled slow path; promotion רק באחד מארבעת תנאי הביקורת. |
| S9-DEF-018 | P3 | W5 | `FORCE_COOLDOWN` חוקי ב־DB אך נדחה ב־TypeScript | NOT_STARTED | §10, `S9-DEF-018` | `docs/evidence/slice-9/w5/S9-DEF-018.md` | — | יישור contract/copy/tests ללא migration. |
| S9-DEF-019 | P3 | W5 | error taxonomy של sync אינו מבחין בין שלבי הכשל | NOT_STARTED | §10, `S9-DEF-019` | `docs/evidence/slice-9/w5/S9-DEF-019.md` | — | קודי provider/planner/apply/finalize יציבים ובטוחים, ללא double-finalize. |
| S9-DEF-025 | P3 | W5 | production sports credential זמין ל־Preview שאינו משתמש בו | NOT_STARTED | §10, `S9-DEF-025` | `docs/evidence/slice-9/w5/S9-DEF-025.md` | — | Production-only policy; אין לקרוא, להדפיס או להזין מחדש secret. |
| S9-DEF-015 | P3 | W6 | שמות לא־מהימנים מאפשרים bidi spoofing ואינם מבודדים | NOT_STARTED | §10, `S9-DEF-015` | `docs/evidence/slice-9/w6/S9-DEF-015.md` | — | application+DB rejection/isolation תוך שמירת Hebrew/Latin לגיטימי. |
| S9-DEF-016 | P3 | W6 | skip link ב־invite מחובר מצביע ליעד חסר | NOT_STARTED | §10, `S9-DEF-016` | `docs/evidence/slice-9/w6/S9-DEF-016.md` | — | יעד יחיד, גלוי ובר־focus לכל guest/auth × valid/unavailable. |
| S9-DEF-020 | P3 | W6 | invite unavailable מאבד escape למשתמש מחובר | NOT_STARTED | §10, `S9-DEF-020` | `docs/evidence/slice-9/w6/S9-DEF-020.md` | — | Dashboard/logout בטוחים למשתמש מחובר ללא disclosure. |
| S9-DEF-022 | P3 | W6 | פערי נגישות קטנים ב־loading/forms/targets | NOT_STARTED | §10, `S9-DEF-022` | `docs/evidence/slice-9/w6/S9-DEF-022.md` | — | semantics, focus, names, targets, keyboard, contrast, mobile ו־native 200%. |
| S9-DEF-024 | P3 | W6 | full E2E ירוק משאיר server error לא מוסבר | NOT_STARTED | §10, `S9-DEF-024` | `docs/evidence/slice-9/w6/S9-DEF-024.md` | — | reproduction צר ותיקון שורש או filter מדויק מוכח; שלוש חזרות נקיות. |
| S9-DEF-013 | P2 | W7 | ספר הפרויקט derived סותר את המקור הקנוני | NOT_STARTED | §10, `S9-DEF-013` | `docs/evidence/slice-9/w7/S9-DEF-013.md` | — | source/workflow דטרמיניסטי, regeneration ו־render inspection מלא. |
| S9-DEF-014 | P3 | W7 | Redirect allowlist ו־README אינם מתארים את Preview הנוכחי | NOT_STARTED | §10, `S9-DEF-014` | `docs/evidence/slice-9/w7/S9-DEF-014.md` | — | ה־configuration child של DEF-004 תועד ב־W2: Production/Local מדויקים ו־Preview סווג QA פנימי בלבד. סנכרון המסמכים הסופי וה־evidence של הרשומה הראשית נשארים W7. |
| S9-REQ-002 | P1 | W7 | מצגת, demo script וחזרה של 10–15 דקות | NOT_STARTED | §11, `S9-REQ-002` | `docs/evidence/slice-9/w7/S9-REQ-002.md` | — | deck editable+rendered, script/assets/checklist; rehearsal אנושי אינו ראיה אוטומטית. |
| S9-REQ-004 | P2 | W7 | חבילת מסמכי הגשה מסונכרנת | NOT_STARTED | §11, `S9-REQ-004` | `docs/evidence/slice-9/w7/S9-REQ-004.md` | — | canonical docs, README, book, deployment/evaluator instructions ונתונים סופיים מסונכרנים. |
| S9-REQ-003 | P1 | W8 | ראיית הגשה סופית וגישת evaluator | NOT_STARTED | §11, `S9-REQ-003` | `docs/evidence/slice-9/w8/S9-REQ-003.md` | — | final candidate/evaluator/Production gates; post-merge או owner action נשארים מפורשים. |
| S9-REQ-005 | P2 | W8 | hardening וראיית בדיקה סופית | NOT_STARTED | §11, `S9-REQ-005` | `docs/evidence/slice-9/w8/S9-REQ-005.md` | — | matrix מלאה, clean clone, Advisors/scale/UI/security וראיות final SHA. |

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
