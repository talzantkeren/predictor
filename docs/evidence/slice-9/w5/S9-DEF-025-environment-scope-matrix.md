# S9-DEF-025 — sanitized environment/scope matrix

Status: `VERIFIED`

Observed 2026-08-28. This matrix contains variable names, environments,
classification and scope only. It contains no value column, value, hash,
length, prefix, suffix or other fragment of a value.

| Variable name | Environment | Classification | Scope observation |
| --- | --- | --- | --- |
| `SPORTS_API_KEY` | Production | Sensitive | One record; Production only; all branches |
| `SPORTS_API_KEY` | Preview | Not present | No Preview or branch-specific association |
| `SPORTS_API_KEY` | Local | Not present | `.env.local` sanitized check: no nonblank key |
| `SPORTS_API_KEY` | CI | Not present | Workflow has no key entry |
| `SPORTS_API_PROVIDER` | Production | Sensitive | One record; Production only; all branches |
| `SPORTS_API_PROVIDER` | Preview | Not present | No Preview or branch-specific association |
| `SPORTS_API_PROVIDER` | Local | Local configuration | Local scope only |
| `SPORTS_API_PROVIDER` | CI | Workflow configuration | CI scope only |

Vercel evidence came from `/v10/projects/<linked-project>/env?decrypt=false`,
captured in memory and projected to the four columns above. Raw `vercel env ls`
was not used because its table can contain a value column. The key's combined
Preview+Production record was narrowed with one target-only PATCH whose body
contained only `target=[production]`; no value field was read or sent.
