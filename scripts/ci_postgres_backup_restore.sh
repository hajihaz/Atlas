#!/usr/bin/env bash
# Atlas CI-only PostgreSQL backup/restore drill.
# Only operates on the disposable GitHub PostgreSQL 17 service container.
set -euo pipefail

if [[ "${CI:-}" != "true" || "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "Refusing backup drill outside GitHub Actions"; exit 3
fi
# Only allow the expected test role, localhost endpoint and CI database.
# Never embed a URL password (even a disposable one) in source code.
if [[ "${ATLAS_TEST_DB:-}" != "${ATLAS_EXECUTION_TEST_DB:-}" ]]; then
  echo "Refusing inconsistent disposable CI database URLs"; exit 3
fi
case "${ATLAS_TEST_DB:-}" in
  postgresql+psycopg://atlas_ci:*@localhost:5432/atlas_ci) ;;
  *) echo "Refusing non-CI PostgreSQL database URL"; exit 3 ;;
esac
container="${ATLAS_CI_POSTGRES_CONTAINER:-}"
if [[ ! "$container" =~ ^[a-f0-9]{64}$ ]]; then
  echo "Missing exact GitHub service-container identity"; exit 3
fi

# Fixed identifiers for this dedicated per-job disposable container.
test_schema='atlas_ci_backup_restore'
test_database='atlas_ci_restore_verify'
archive='/tmp/atlas_ci_backup_drill.dump'

# A fresh CI service is mandatory; never overwrite an existing fixture schema.
existing="$(docker exec "$container" psql -U atlas_ci -d atlas_ci -At -c "SELECT COUNT(*) FROM pg_namespace WHERE nspname='$test_schema'")"
if [[ "$existing" != "0" ]]; then
  echo "Backup drill fixture unexpectedly preexists"; exit 3
fi

# CREATE and DROP are limited to the disposable service container and
# fixed test-only objects. This script has no production DB credentials.
docker exec "$container" psql -U atlas_ci -d atlas_ci -v ON_ERROR_STOP=1 -c   "CREATE SCHEMA $test_schema"
docker exec "$container" psql -U atlas_ci -d atlas_ci -v ON_ERROR_STOP=1 -c   "CREATE TABLE $test_schema.replay_probe(id integer PRIMARY KEY, cash numeric NOT NULL)"
docker exec "$container" psql -U atlas_ci -d atlas_ci -v ON_ERROR_STOP=1 -c   "INSERT INTO $test_schema.replay_probe VALUES (1,101.25),(2,202.50),(3,303.75)"

# A real PostgreSQL 17 native logical archive and clean restore, not row copying.
docker exec "$container" pg_dump -U atlas_ci -Fc -n "$test_schema" -f "$archive" atlas_ci
docker exec "$container" createdb -U atlas_ci "$test_database"
docker exec "$container" pg_restore -U atlas_ci -d "$test_database" --exit-on-error "$archive"

result="$(docker exec "$container" psql -U atlas_ci -d "$test_database" -At -c   "SELECT COUNT(*)::text || '|' || SUM(cash)::text FROM $test_schema.replay_probe")"
if [[ "$result" != '3|607.50' ]]; then
  echo "BACKUP RESTORE DRILL: BLOCKED (restored rows / totals mismatch)"; exit 2
fi

echo "ATLAS POSTGRESQL LOGICAL BACKUP/RESTORE: PASS (3 rows; 607.50; isolated CI only)"
