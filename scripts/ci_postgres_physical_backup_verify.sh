#!/usr/bin/env bash
# Physical PostgreSQL backup verification on the one disposable GitHub CI service only.
# Does not touch production systems, restore production data, or change broker authority.
set -euo pipefail

if [[ "${CI:-}" != "true" || "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "Refusing physical backup check outside GitHub Actions"; exit 3
fi
if [[ "${ATLAS_TEST_DB:-}" != "${ATLAS_EXECUTION_TEST_DB:-}" ]]; then
  echo "Inconsistent CI-only database URLs"; exit 3
fi
case "${ATLAS_TEST_DB:-}" in
  postgresql+psycopg://atlas_ci:*@localhost:5432/atlas_ci) ;;
  *) echo "Refusing unknown PostgreSQL endpoint"; exit 3 ;;
esac
container="${ATLAS_CI_POSTGRES_CONTAINER:-}"
if [[ ! "$container" =~ ^[a-f0-9]{64}$ ]]; then
  echo "Missing exact disposable PostgreSQL service container"; exit 3
fi
# pg_basebackup runs only inside the disposable CI container. Never delete a
# pre-existing directory; CI must provide a newly initialized container.
docker exec "$container" sh -ceu 'test ! -e /tmp/atlas-ci-physical-backup'
docker exec "$container" sh -ceu '
  export PGPASSWORD="${POSTGRES_PASSWORD:?CI password missing}"
  pg_basebackup -h 127.0.0.1 -U atlas_ci \
    -D /tmp/atlas-ci-physical-backup -Fp -Xs -c fast --no-password
'
docker exec "$container" pg_verifybackup /tmp/atlas-ci-physical-backup

# On a disposable GitHub service only, boot the physical copy on an isolated
# local port and socket; this checks it can actually replay and answer queries.
# The original PostgreSQL service remains running and untouched.
docker exec "$container" chown -R postgres:postgres /tmp/atlas-ci-physical-backup
docker exec --user postgres "$container" sh -ceu '
  restore=/tmp/atlas-ci-physical-backup
  log=/tmp/atlas-ci-physical-restore.log
  pg_ctl -D "$restore" \
    -o "-p 55433 -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp" \
    -l "$log" -w start
  trap '''pg_ctl -D /tmp/atlas-ci-physical-backup -m immediate -w stop''' EXIT
  result="$(psql -h /tmp -p 55433 -U atlas_ci -d atlas_ci -v ON_ERROR_STOP=1 \
    -At -c "SELECT COUNT(*)::text || '''|''' || SUM(cash)::text FROM atlas_ci_backup_restore.replay_probe")"
  if [ "$result" != "3|607.50" ]; then
    echo "ATLAS CI PHYSICAL RESTORE REJECTED: $result"; exit 2
  fi
  echo "ATLAS CI POSTGRESQL PHYSICAL RESTORE: PASS (3 rows; 607.50)"
'
echo "ATLAS CI POSTGRESQL PHYSICAL BACKUP+RESTORE: VERIFIED (ephemeral CI only)"
