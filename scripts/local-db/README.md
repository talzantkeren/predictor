# Local database fallback harness

`npm run test:db` is the canonical database gate and the one CI runs. These
scripts exist only for environments where the Supabase container images cannot
be pulled, so database work can still be verified against a real PostgreSQL
server with real concurrent sessions.

```bash
bash scripts/local-db/reset.sh   # rebuild from supabase/migrations + supabase/seed.sql
bash scripts/local-db/test.sh    # run every supabase/tests/*.test.sql
bash scripts/local-db/test.sh predictions   # run one file by prefix
```

`supabase-surface.sql` creates only what the migrations consume from the
platform: the `anon`, `authenticated` and `service_role` roles, the `auth`,
`extensions` and `storage` schemas, `auth.users`, `auth.uid()`, `auth.role()`,
`storage.buckets`, `storage.objects` and the platform's storage grants. The
committed pgTAP files run unmodified, including the `dblink` sessions that
connect to the `supabase_db_predictor` hostname.

## Limits

This harness is a fallback, not a replacement:

- it runs the distribution's PostgreSQL (16) rather than the project's 17;
- it emulates the `auth` and `storage` surface instead of running the real
  services, so anything depending on their behaviour is only approximated;
- it does not cover `supabase db lint` or `npm run types:check`, which need the
  Supabase stack itself.

A green run here is supporting evidence. `Supabase database tests` in CI remains
the gate that decides.
