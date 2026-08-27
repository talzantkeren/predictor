# Sports Provider POC

## Purpose

This document defines the contract between Predictor and sports-data providers.

The application must not depend directly on the response format of a specific external API. Every provider must normalize its data into the internal Predictor format.

The first implementation will be `ManualSportsProvider`, which allows development and testing without external API credentials.

API-Football by API-Sports was selected after a live POC on 23 August 2026.
`ManualSportsProvider` remains the mandatory fallback and test provider.

## Responsibilities

The sports-provider layer is responsible for supplying:

- Leagues and competitions
- Teams
- Fixtures
- Kickoff times
- Match statuses
- Official final scores

The sports-provider layer is not responsible for:

- Calculating prediction points
- Locking predictions
- Managing users or leagues
- Managing payments
- Applying RLS
- Rendering the user interface

## Supported Match Statuses

The normalized internal statuses are:

- `scheduled`
- `live`
- `finished`
- `postponed`
- `canceled`

External provider statuses must be mapped to these internal values.

Unknown or unsupported statuses must not be silently treated as `finished`.

## Score Policy

Only a `finished` match may provide an official score for calculating prediction points.

For a `live` match with an intermediate score:

- `homeScore` must be `null`
- `awayScore` must be `null`
- The intermediate score must not activate prediction scoring

A `finished` match stores the official final result.

Displaying temporary live scores is outside the current MVP scope.

## Timezone Policy

All match times must be normalized before entering the application domain.

Match times must use ISO 8601 format.

The initial league timezone is:

- `Asia/Jerusalem` for the Israeli Premier League

The system must not rely on the user's local computer timezone when deciding whether a match has started.

## Multi-League Support

The provider contract must not contain league-specific business logic.

Each league must identify its competition and data source through configuration.

Example:

```ts
{
  leagueId: "israel-premier-league",
  providerKey: "manual",
  competitionId: "israel-premier-league",
  timezone: "Asia/Jerusalem"
}
```

A future league may use another provider:

```ts
{
  leagueId: "premier-league",
  providerKey: "sports-api",
  competitionId: "england-premier-league",
  timezone: "Europe/London"
}
```

The rest of the application must receive the same normalized data structure regardless of the league or provider.

## Stable Identifiers

Normalized data must contain stable identifiers:

- `leagueId` identifies the internal league
- `competitionId` identifies the competition in the provider
- `teamId` identifies a team
- `matchId` identifies a match

Provider-specific identifiers may be preserved for synchronization, but application logic must use stable internal identifiers.

## Initial Implementation

Slice 0 includes:

- The `SportsProvider` interface
- The `ManualSportsProvider`
- Manual fixtures for the Israeli Premier League
- Normalization functions
- Unit tests for normalization
- Fixtures covering all supported match statuses

Slice 0 does not include:

- External API credentials
- Production API synchronization
- Scheduled background jobs
- Retry logic
- Rate-limit handling
- Display of temporary live scores

## Selected external provider

The live integration uses API-Football by API-Sports with the internal provider
identifier `api-football`. The production base URL is the fixed server-only
constant `https://v3.football.api-sports.io`; authentication uses the
`x-apisports-key` header and only GET requests are allowed. The application
stores normalized data in PostgreSQL before any user-facing flow consumes it.

Allowed Slice 7b endpoints are limited to league 383 and season 2026:

- `/leagues?id=383&season=2026`
- `/teams?league=383&season=2026`
- `/fixtures/rounds?league=383&season=2026&dates=true`
- `/fixtures?league=383&season=2026&timezone=UTC`
- `/fixtures?ids=<up-to-20-hyphen-separated-ids>&timezone=UTC`

Predictions, odds, betting, events, lineups, injuries, players and fixture/player
statistics are outside this integration. Adding the provider does not change the
prediction-scoring rules or make provider responses a UI data source.

## Provider Evaluation Questions

Before selecting an external provider, verify:

1. Does the provider support the Israeli Premier League for the required season?
2. Does it provide the complete fixture list?
3. Does it provide reliable match statuses?
4. Does it provide official final scores?
5. Does it provide stable competition, team, and match identifiers?
6. Are its credentials, rate limits, and licensing suitable for this project?

## Acceptance Criteria

The provider layer is accepted when:

- `ManualSportsProvider` returns fixtures for a configured league.
- Fixtures are normalized into one internal format.
- All supported statuses are represented.
- A live intermediate score becomes `null`.
- A finished match retains its official final score.
- Live intermediate scores do not activate prediction scoring.
- The provider contract contains no Israeli-league-specific business logic.
- A second provider could be added without changing scoring or UI code.

## POC decision and evidence

The gate passed on 23 August 2026. The sanitized evidence is stored in
[`evidence/api-football-poc-2026-08-23.md`](./evidence/api-football-poc-2026-08-23.md).
The verified facts were:

- Ligat Ha'al is league ID `383`; the 2026/27 API season is `2026` and was current.
- The observed season range was 2026-08-22 through 2027-03-06.
- 14 stable team IDs, 26 published `Regular Season - N` round labels and 182
  published fixtures were returned.
- UTC fixture timestamps, `NS` and `FT` were observed; `FT` official scores came
  from `score.fulltime`.
- The Pro plan had 7,500 requests/day, 300/minute and up to 5/second. Targeted
  fixture requests accept no more than 20 IDs.

The provider may publish championship/relegation stages or additional fixtures
later. The implementation therefore preserves the full round label, performs
periodic discovery and never hard-codes 26 or 182 as a permanent invariant.

## Slice 5 consumption

Slice 5 reads match data only from PostgreSQL. A forward migration seeds a small,
clearly labeled manual Demo catalog for the 2026/27 season using the same team-name
vocabulary as `src/features/sports/fixtures.ts`. Its fixture timestamps are
synthetic future examples, not a verified real schedule; `external_provider` and
`external_id` remain `NULL`.

No provider was selected, no external request, synchronization job, Cron, lease,
`sync_runs` table, or result override was added in Slice 5. Those decisions remain
behind the Slice 7 POC gate. Browser and CI flows always consume stored/manual data.

## Slice 7b integration decision

Slice 7b extends rather than relabels the delivered manual Slice 7:

- `manual` still records a terminal `MANUAL_PROVIDER` skip and never mutates the
  synthetic Slice 5 catalog.
- `api-football` uses a due-aware durable row lease with monotonic generation,
  an expiring fencing token and real `running/succeeded/failed/skipped` runs.
- Provider HTTP occurs outside PostgreSQL. Every apply and finalize validates
  the current unexpired lease, and official `FT` results call the existing
  atomic scoring path inside the fenced apply transaction.
- Provider-owned competition, season, teams and matches use external IDs only.
  Demo rows remain external-ID-free and existing leagues are not rebound.
- `is_manually_overridden` always wins. A match observed live/interrupted/terminal
  receives an irreversible database prediction-lock latch.
- `AET` and `PEN` are identified but quarantined from automatic scoring until a
  product decision and recorded contract establish the correct 90-minute field.
- Recorded sanitized fixtures and fake transport cover the client and adapter;
  CI and browser tests never make live API-Football requests.

## Slice 9 Manual fallback note — 26 August 2026

The Slice 7b bullets above are retained as the historical integration decision.
S9-DEF-003 supersedes only the current `manual` runtime behavior: it no longer
returns `skipped/MANUAL_PROVIDER`. The server-only Manual adapter now applies the
exact bounded `manual-catalog-v1` manifest through one idempotent database RPC,
returning `MANUAL_APPLIED`, `MANUAL_NO_CHANGE`, or a terminal
`MANUAL_CATALOG_CONFLICT`. It still performs no provider HTTP request and never
merges synthetic rows by display name or assigns provider identity. The public
payload-only RPC delegates to a revoked owner-only full transaction core; no
granted function accepts actor or clock. Production samples fresh database time
after its locks and rejects a missing canonical fixture once its kickoff has
arrived, while an exact already-present replay remains safe.

S9-DEF-008 adds the inverse handoff only for a provider-owned match whose
provider is exactly `api-football` and whose external ID is a valid positive
numeric API-Football identifier. A confirmed system administrator can clear the
Manual-ownership flag through a service-only RPC. The handoff preserves the
current status, scores, result version, provider provenance, prediction-lock
latch, predictions and scoring; it records one audit on the first change and is
an unaudited no-op on replay. A later fenced, validated provider snapshot may
then resume the ordinary apply path. Manual Demo rows remain providerless and
cannot use this handoff.
