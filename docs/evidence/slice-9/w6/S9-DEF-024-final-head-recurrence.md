# S9-DEF-024 — final-head recurrence and forward repair

## Observed recurrence

Candidate `ea37f999ada508a9e15189a717545363d05dd46e` was not accepted as a
final verified head. The exact command below completed all 38 Playwright
scenarios, but the active server-log gate observed a response-stream failure
and correctly returned a non-zero exit code:

```powershell
npm.cmd run verify
```

Sanitized excerpt:

```text
38 passed
[WebServer] Error: The destination stream closed early
E2E runner: FAIL (exit 1)
```

Temporary local instrumentation, removed before commit, localized the failure
to an immediate navigation following a successful React Server Action response,
while automatic `Link` prefetch responses were also in flight. No provider
payload, credential, cookie, signed URL or personal value was recorded.

## Forward repair

- `AppLink` preserves Next navigation while explicitly disabling automatic
  prefetch, so unused routes do not leave speculative RSC streams in flight.
- Prediction-save tests wait for the matching `POST` RSC response and bounded
  `networkidle` before any reload or later navigation.
- Stream-safe teardown waits for bounded network idle, parks every open page at
  `about:blank`, and closes unique browser contexts sequentially.
- The regression contract checks teardown order, bounded timeout behavior,
  exclusive `AppLink` use, `prefetch={false}`, and all five prediction-save
  synchronization points. Without the repair, these new assertions fail.

## Agent-run evidence

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test -- src/lib/playwright-response-streams.test.ts
```

Sanitized result:

```text
lint: PASS (exit 0)
typecheck: PASS (exit 0)
playwright-response-streams.test.ts: 1 file, 5 tests passed
```

Five separate focused stress runs used this exact command:

```powershell
npm.cmd run test:e2e:run -- e2e/prediction-lock.spec.ts
```

Sanitized result:

```text
repeat 1: 2/2 passed in 28.5s
repeat 2: 2/2 passed in 28.6s
repeat 3: 2/2 passed in 28.5s
repeat 4: 2/2 passed in 28.6s
repeat 5: 2/2 passed in 28.4s
No [WebServer] Error was emitted in any repeat.
```

The full browser matrix was then run without skipping or weakening the server
error gate:

```powershell
npm.cmd run test:e2e:run
```

Sanitized result:

```text
Running 38 tests using 1 worker
38 passed (6.4m)
exit 0
No [WebServer] Error was emitted.
```

This supplement does not infer Hosted, Production, native 200% zoom, evaluator
access or a human rehearsal result.
