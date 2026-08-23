# API-Football POC — sanitized evidence

| Field | Verified value |
| --- | --- |
| POC date | 2026-08-23 |
| Provider | API-Football by API-Sports |
| Internal identifier | `api-football` |
| Base URL | `https://v3.football.api-sports.io` |
| Authentication | server-only `x-apisports-key` header |
| HTTP method | GET only |
| Competition | Ligat Ha'al, Israel |
| League ID | `383` |
| API season | `2026` |
| Observed season range | 2026-08-22 through 2027-03-06 |
| Current | true |
| Teams returned | 14 |
| Fixtures published | 182 |
| Rounds published | 26 (`Regular Season - 1` through `Regular Season - 26`) |
| Fixture timezone tested | UTC |
| Statuses observed live | `NS`, `FT` |
| Official result field verified | `score.fulltime` for `FT` |
| Plan observed | Pro |
| Daily quota | 7,500 requests |
| Documented rate | 300/minute and up to 5/second |
| Targeted fixture batch | up to 20 IDs separated by `-` |

## Coverage returned for league 383, season 2026

| Capability | Returned coverage |
| --- | --- |
| Fixture events | true |
| Lineups | false |
| Fixture statistics | false |
| Player statistics | false |
| Standings | true |
| Players | false |
| Injuries | false |
| Predictions | true |
| Odds | true |

Slice 7b consumes only factual league, team, round, fixture, status and official
full-time result data. It does not call predictions, odds, betting, event,
lineup, injury, player or statistics endpoints.

The counts above describe what the provider had published at the POC time; they
are not permanent schema constraints. Later championship/relegation stages or
additional fixtures must be discovered without overwriting the full provider
round label.

This evidence intentionally excludes the API key, authorization headers, account
object, account owner, email, full `/status` response and unnecessary subscription
metadata.
