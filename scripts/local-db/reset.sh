#!/usr/bin/env bash
# Local-only database harness. Rebuilds a scratch PostgreSQL database from the
# committed migrations and seed so the pgTAP files can run unmodified when the
# Supabase container images are unreachable. CI remains the authoritative
# database gate; see docs/testing.md.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_NAME="${PREDICTOR_LOCAL_DB:-postgres}"

psql_as_postgres() {
  su postgres -c "psql -v ON_ERROR_STOP=1 -q -X $*"
}

# The committed pgTAP files open dblink sessions against the Supabase container
# hostname, so the local harness resolves that name to this cluster.
if ! grep -q 'supabase_db_predictor' /etc/hosts; then
  echo '127.0.0.1 supabase_db_predictor' >> /etc/hosts
fi

psql_as_postgres "-d template1 -c \"alter role postgres password 'postgres'\""
psql_as_postgres "-d template1 -c \"drop database if exists ${DB_NAME} with (force)\""
psql_as_postgres "-d template1 -c \"create database ${DB_NAME}\""
psql_as_postgres "-d ${DB_NAME} -f ${REPO_ROOT}/scripts/local-db/supabase-surface.sql"

for migration in "${REPO_ROOT}"/supabase/migrations/*.sql; do
  psql_as_postgres "-d ${DB_NAME} -f ${migration}"
done

psql_as_postgres "-d ${DB_NAME} -f ${REPO_ROOT}/supabase/seed.sql"
echo "local database ${DB_NAME} rebuilt"
