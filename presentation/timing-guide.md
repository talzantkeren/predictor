# Timing guide — 10–15 minute demonstration

The deterministic target is **11:30**. A valid human rehearsal must finish in
**10:00–15:00**. Start the timer only after the deck, two authorized Demo
sessions, Production page and three fallback screenshots are open.

| Clock | Target | Slides/UI | Evidence of completion | Cut/fallback rule |
| --- | ---: | --- | --- | --- |
| 00:00–00:40 | 0:40 | Slide 1 | One-sentence product thesis and Demo-only boundary | Do not add an agenda |
| 00:40–01:40 | 1:00 | Slide 2 | Roles, draw, league scoring and trust problem | Keep one example only |
| 01:40–04:20 | 2:40 | Slide 3 + UI | League, invite, request, sanitized Demo proof, approval and privacy-safe member list | After **20 seconds** of unavailable UI, show `01-open-league.png` |
| 04:20–06:20 | 2:00 | UI | Manual fixture, activation and saved 2:1 prediction before DB lock | Use the fixed 2:1 score; never alter the DB directly |
| 06:20–07:40 | 1:20 | UI | Final 2:1 result and current ranking | After 20 seconds, show `02-active-current-report.png` |
| 07:40–08:50 | 1:10 | Slide 6 + UI | Completed state and final ranking; explain atomic snapshot/join-request closure | After 20 seconds, show `03-completed-final-report.png` |
| 08:50–09:50 | 1:00 | Slide 6 | Explain late 1:1 review/reconciliation and explicit apply | Explanation is sufficient if time is tight |
| 09:50–10:50 | 1:00 | Slides 4–7 | Architecture, RLS/resource authorization, private proof path and three test layers | Never quote a count not measured on the final SHA |
| 10:50–11:30 | 0:40 | Slides 8–9 | Scale boundary, no runtime AI/financial operation, Production/GitHub links | Stop at 11:30 before questions |

## Pace controls

- At 04:20 or later: omit descriptive UI narration; keep only visible state
  transitions and their security meaning.
- At 08:50 or later: explain reconciliation without performing it live.
- At 10:30: move to slide 9 regardless of unfinished optional detail.
- At 14:30: **hard stop** the walkthrough, state any unobserved item explicitly,
  open the final links, and reserve the remaining 30 seconds for closure.
- Finishing before 10:00 is not a pass; add the evaluator explanations from the
  script without inventing a result. Crossing 15:00 is not a pass.

## Deterministic data and outage behavior

Use only authorized Demo accounts supplied outside Git. The score sequence is
prediction `2:1` → first final result `2:1` → optional late correction `1:1`.
All visible state changes use the UI. If any live step is unavailable for 20
seconds, say that it was not observed, switch to the named sanitized screenshot,
and continue the same narrative. An outage fallback keeps the presentation
moving but does not convert a failed link or mutation into PASS.
