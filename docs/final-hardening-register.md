# מרשם hardening סופי — Slice 9

Status: `VERIFIED`

זהו המרשם הסמכותי של `S9-REQ-005`. מדיניות Hosted, ‏Security Advisor
ו־Performance Advisor נקראו בפועל ב־28.8.2026. כל 28 ממצאי האבטחה הראשוניים
וכל 20 ממצאי הביצועים קיבלו disposition מפורש. פער אמיתי אחד תוקן בקוד
וב־migration קדימה, וה־Advisors הורצו מחדש. אין עוד owner action ברשומה זו.

## זיהוי checkpoint

| שדה | ערך |
| --- | --- |
| ID | `S9-REQ-005` |
| Branch | `feature/slice-9-implementation` |
| Implementation checkpoint | `8b30d9c` |
| Draft review | PR #14 נשאר Draft ולא מוזג |
| Hosted mutation | רק `20260825000000_revoke_rls_event_trigger_rpc_access.sql`, אחרי dry-run מבודד של migration יחיד |
| Forbidden production gates | `S9-DEF-004`, `S9-DEF-012`, `S9-REQ-003` לא נוסו |

## Hosted password policy

ה־Management API נצפה בקריאה בלבד: מינימום `8`, ללא character classes,
`password_hibp_enabled=false`, ו־rate limits מתועדים. GoTrue הפעיל הוא
`v2.195.0`; המקור המתויג אוכף תקרה של 72 בתים. החוזה האפליקטיבי הקודם של
8–128 תווים לא היה עקבי, ולכן תוקן לשמונה תווים לפחות ועד 72 בתים בקידוד
UTF-8. בדיקות מכסות 72/73 ASCII ואת אותו גבול עם עברית רב־בתית.

אין טענה ש־leaked-password protection מופעלת. זהו `ACCEPTED WITH RATIONALE`
של `S9-TDEC-004`: owner הוא repository owner; target הוא revisit on trigger;
triggers הם plan מתאים, הרחבת רגישות, incident/credential stuffing או דרישת
evaluator. ה־mitigations הם validation תואם, recovery enumeration-safe,
rate limits נצפים ו־Demo-only.

## Advisor disposition

| Gate | תוצאה נצפית | Disposition |
| --- | --- | --- |
| Security Advisor initial | 28: ‏0 ERROR, ‏22 WARN, ‏6 INFO | 28/28 מפורטים ב־`S9-REQ-005-security-advisor.md` |
| `rls_auto_enable` anon/auth warnings | שתי אזהרות אמיתיות | `FIXED`: path ריק, grants מבוטלים, trigger נשמר; post-fix Advisor אינו מציג אותן. pgTAP יוצר event-trigger אמיתי, מוכיח שכל guard מזהה mutation ורק אז מריץ את חוזה ההקשחה של ה־migration |
| Security Advisor post-fix | 26: כל הפריטים הנותרים מוסברים | intentional gateway/deny-all/`pg_net` הם `NO-FIX WITH EVIDENCE`; leaked-password הוא accepted risk |
| Performance Advisor | 20: ‏0 ERROR, ‏0 WARN, ‏20 INFO | 12 `NO-ADD WITH EVIDENCE`; שמונה `RETAIN WITH EVIDENCE`; אין index ספקולטיבי |

ה־Hosted נצפה עם RLS וללא direct DML על שש טבלאות ה־deny-all, ועם 17 gateways
מכוונים שהם SECURITY DEFINER, ‏`search_path=''`, ללא PUBLIC/service-role
execute. רק `resolve_invite` פתוח ל־anon בכוונה; כל 17 פתוחים ל־authenticated
עם actor/resource checks ובדיקות של משתמש/ליגה זרים.

## מטריצת verification בנקודת סגירת S9-REQ-005

| Gate | פקודה | תוצאה נצפית | Status |
| --- | --- | --- | --- |
| Auth boundary | `npm.cmd exec -- vitest run src/features/auth/auth-rules.test.ts` | 87/87 | PASS |
| Lint | `npm.cmd run lint` | ESLint ללא finding | PASS |
| Strict types | `npm.cmd run typecheck` | ללא שגיאה | PASS |
| Full unit | `npm.cmd run test` | 50 files, 641/641 | PASS |
| Production build | `npm.cmd run build` | Next.js compile/type/page generation | PASS |
| Forward reset | `supabase db reset --local` | 39 migrations through `20260827200000` | PASS |
| DB type drift | `npm.cmd run types:db`; `npm.cmd run types:check` | generated types current | PASS |
| Full database | `npm.cmd run test:db` | 32 files, 1502/1502 | PASS |
| Multi-session | explicit ten-file `supabase test db` suite | 10 files, 624/624 | PASS |
| Security Advisor | `supabase db advisors --linked --type security --level info` | initial 28; post-fix 26; all dispositioned | PASS |
| Performance Advisor | `supabase db advisors --linked --type performance --level info` | 20/20 dispositioned | PASS |
| Migration isolation | linked `db push --dry-run`, then apply | exactly one hardening migration | PASS |

הרצת DB ראשונה בנקודת הסגירה נכשלה כש־Docker יצר מחדש את מסד ה־Local באמצע קובץ
multi-session. ריצה מיידית ללא reset חשפה fixture שנותר מהחיבור שנקטע. שתי
הריצות לא סומנו כ־PASS. לאחר reset קדימה ותצפית health תקינה, כל 1502 בדיקות
ה־DB וכל 624 בדיקות חבילת ה־multi-session עברו.

## P0/P1/P2

| Priority | Disposition |
| --- | --- |
| P0 | אפס finding פתוח; אין waiver |
| P1 | אפס finding פתוח; אין waiver |
| P2 | כל פריט fixed / no-fix with evidence / accepted with Owner, Target date ו־Trigger; אין owner action של `S9-REQ-005` |

## שערים נפרדים

| Gate | רשומה | Status | גבול |
| --- | --- | --- | --- |
| Chrome page zoom 200% | `S9-DEF-022` | TRACKED_BY_RECORD | forced browser-scale matrix עברה; נשאר spot-check אנושי קצר של פקד Zoom בשלושה מסכים |
| Vercel secret scope | `S9-DEF-025` | TRACKED_BY_RECORD | הסרת Preview ללא Reveal ו־Preview verification |
| Production Cron | `S9-DEF-012` | TRACKED_BY_RECORD | final acceptance רק אחרי merge; לא נוסה כאן |
| Hosted migration parity | `S9-REQ-003` | TRACKED_BY_RECORD | 19 migrations נשארו local-only; לא נפרסו כאן |
| Public repository access | `S9-REQ-003` | TRACKED_BY_RECORD | לאחר כל השערים: visibility Public, ‏anonymous README/main/final SHA ו־clean clone; Demo access נשאר מחוץ ל־Git אם נדרש |
| Human rehearsal | `S9-REQ-002` | TRACKED_BY_RECORD | הרצה מדודה נפרדת |
| Final Production SHA | `S9-REQ-003` | TRACKED_BY_RECORD | immutable deployment/alias אחרי merge בלבד |

## ראיות

- `docs/evidence/slice-9/w8/S9-REQ-005.md`
- `docs/evidence/slice-9/w8/S9-REQ-005-hosted-auth-policy.md`
- `docs/evidence/slice-9/w8/S9-REQ-005-security-advisor.md`
- `docs/evidence/slice-9/w8/S9-REQ-005-performance-advisor.md`

ה־register וה־exports אינם מכילים JWT, secret assignment, project/account ID,
password, URL חתום או provider payload.
