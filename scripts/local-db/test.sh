#!/usr/bin/env bash
# Runs the committed pgTAP files against the local harness database and reports
# the TAP failures per file. CI remains the authoritative database gate.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_NAME="${PREDICTOR_LOCAL_DB:-postgres}"
status=0

for file in "${REPO_ROOT}"/supabase/tests/${1:-*}*.test.sql; do
  name="$(basename "${file}")"
  output="$(su postgres -c "psql -X -q -t -A -d ${DB_NAME} -f ${file}" 2>&1)"
  failed="$(printf '%s' "${output}" | grep -c '^not ok')"
  errored="$(printf '%s' "${output}" | grep 'ERROR:' | grep -vc 'current transaction is aborted')"
  passed="$(printf '%s' "${output}" | grep -c '^ok ')"
  if [ "${failed}" != "0" ] || [ "${errored}" != "0" ]; then
    status=1
    printf '%s\n' "${output}" | grep -E '^not ok|ERROR:' | grep -v 'current transaction is aborted' | head -20
  fi
  echo "${name}: ok=${passed} not_ok=${failed} errors=${errored}"
done

exit "${status}"
