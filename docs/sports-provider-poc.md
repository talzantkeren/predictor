# Sports Provider POC

## Purpose

This document defines the contract between Predictor and sports-data providers.

The application must not depend directly on the response format of a specific external API. Every provider must normalize its data into the internal Predictor format.

The first implementation will be `ManualSportsProvider`, which allows development and testing without external API credentials.

A real external API provider will be evaluated and integrated in a later slice.

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

## Future External API Integration

A later sports-data slice will include:

- Selection of an external provider
- Verification that the provider supports the required leagues and seasons
- API credentials stored in environment variables
- An `ApiSportsProvider` implementation
- Provider-specific response mapping
- Timezone conversion
- Synchronization with the database
- Handling of retries and rate limits
- Tests using recorded provider fixtures

Adding an external provider must not require changes to prediction-scoring logic or the user interface.

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

## Slice 0 decision and evidence

No live external Sports API POC has been run or accepted. The six provider questions
remain open, so the documented safe fallback is active: `ManualSportsProvider` with
the checked-in fixture set at `src/features/sports/fixtures.ts`. Run the one-off
`npm run poc:sports` command to inspect its normalized output; this command is not
part of CI and does not make network requests.

## Slice 5 consumption

Slice 5 reads match data only from PostgreSQL. A forward migration seeds a small,
clearly labeled manual Demo catalog for the 2026/27 season using the same team-name
vocabulary as `src/features/sports/fixtures.ts`. Its fixture timestamps are
synthetic future examples, not a verified real schedule; `external_provider` and
`external_id` remain `NULL`.

No provider was selected, no external request, synchronization job, Cron, lease,
`sync_runs` table, or result override was added in Slice 5. Those decisions remain
behind the Slice 7 POC gate. Browser and CI flows always consume stored/manual data.

## Slice 7 gate closure

The gate did not pass by 22 August 2026: no live POC was executed, no provider
credentials were supplied, and the six evaluation questions above remain
unanswered. `ManualSportsProvider` is therefore the canonical MVP path. The
synthetic Slice 5 catalog remains stored Demo data with `external_provider` and
`external_id` set to `NULL`; it must not be relabeled or rewritten as provider
data.

Slice 7 adds operational observability without pretending that a provider was
selected:

- `POST /api/cron/sync` makes one Data API call to an atomic
  `record_sync_attempt()` RPC.
- Every authorized attempt is terminal and skipped with either
  `MANUAL_PROVIDER` or `CONCURRENT_ATTEMPT`; it performs no provider request,
  fixture upsert, match change, result scoring, or application audit write.
- The checked-in JSON contract fixture and pure `sync-planner` specify future
  status normalization, corrections, and unconditional exclusion of
  `is_manually_overridden` matches. The planner is not connected to Cron or the
  database.
- CI and browser tests make no live Sports network request.

A future live provider can be proposed only after a new documented POC answers
all six evaluation questions with recorded contract fixtures. Integration must
then update the canonical architecture first and implement a durable database
claim/lease with an expiring fencing token. Provider HTTP runs outside the
transaction; every apply/finalize operation must reject an expired or superseded
token. A session advisory lock through the Data API is not an acceptable lease.
The live-provider change must add due-window logic, upserts, lifecycle handling,
and scoring integration together rather than partially wiring any of them into
the manual path.
