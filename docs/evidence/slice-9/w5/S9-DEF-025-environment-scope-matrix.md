# S9-DEF-025 — sanitized environment/scope matrix

Status: `OWNER_ACTION_REQUIRED`

This matrix records names, providers and scopes only. Every value cell is
intentionally blank and must remain blank in committed evidence.

| Environment | Expected provider | Repository/CI observation | Expected `SPORTS_API_KEY` scope | Hosted scope observation | Value |
| --- | --- | --- | --- | --- | --- |
| Production | `api-football` | Server-only Production contract | Present, Sensitive, Production-only | Read-only listing previously showed the key includes Production | |
| Preview | `manual` | `manual` | Absent | Read-only listing and owner-provided state show Preview is still selected | |
| Local | `manual` | `manual` in `.env.example`; key blank | Absent | Not applicable | |
| CI | `manual` | `manual` in workflow and runs `33097585902` / `33097590476`; no key name in sanitized logs | Absent | Not applicable | |

## Single remaining owner action

In Vercel, open **Project → Settings → Environment Variables → SPORTS_API_KEY →
Edit**, uncheck Preview, leave Production selected, and save without using the
reveal/copy controls and without opening the value. If the UI requires replacing
the variable rather than editing its targets, stop and use the approved secrets
manager directly; never paste the value into evidence.

Save a screenshot to the owner evidence bundle showing only the variable name,
Sensitive classification and Production scope. Keep the Value column above
blank.

Afterward verify without reading a value:

```powershell
vercel env ls preview
vercel env ls production
npm.cmd run sports:secret-boundaries
```

The sanitized listings must show no `SPORTS_API_KEY` row in Preview and one
Sensitive Production row. Record only names/scopes and the checker result in
`docs/evidence/slice-9/w5/S9-DEF-025.md`.

