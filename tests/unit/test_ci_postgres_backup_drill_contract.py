"""A database backup drill must be limited to disposable GitHub CI infrastructure."""

from pathlib import Path


def test_ci_wires_postgres_service_container_and_never_production_url():
    workflow = Path(".github/workflows/ci.yml").read_text()
    script = Path("scripts/ci_postgres_backup_restore.sh").read_text()
    assert "ATLAS_CI_POSTGRES_CONTAINER: ${{ job.services.postgres.id }}" in workflow
    assert "bash scripts/ci_postgres_backup_restore.sh" in workflow
    assert "GITHUB_ACTIONS" in script and "CI:-" in script
    assert "atlas_ci" in script
    assert 'docker exec "$container" pg_dump' in script
    assert 'docker exec "$container" pg_restore' in script
    assert "BACKUP/RESTORE: PASS" in script
    assert "image: postgres:17" in workflow
    assert "PRODUCTION_DB_URL" not in workflow
