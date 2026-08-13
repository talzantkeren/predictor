# Database tests

Add pgTAP tests alongside the migrations they verify. `identity.test.sql` covers the Slice 1 profile schema, trigger hardening, grants, constraints and self/foreign RLS behavior. Every test file runs in a transaction and rolls back its fixtures.
