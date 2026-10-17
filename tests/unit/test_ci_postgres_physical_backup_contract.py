"""The physical backup probe is constrained to disposable GitHub CI only."""

import subprocess
from pathlib import Path

SCRIPT = Path("scripts/ci_postgres_physical_backup_verify.sh")


def test_physical_backup_refuses_local_execution() -> None:
    result = subprocess.run(
        ["bash", str(SCRIPT)], capture_output=True, text=True, timeout=5,
        env={"PATH": "/usr/bin:/bin"},
    )
    assert result.returncode == 3
    assert "outside GitHub Actions" in result.stdout


def test_physical_backup_requires_container_identity_and_verifies_backup() -> None:
    source = SCRIPT.read_text()
    assert 'CI:-' in source and 'GITHUB_ACTIONS:-' in source
    assert 'ATLAS_CI_POSTGRES_CONTAINER:-' in source
    assert 'pg_basebackup' in source and 'pg_verifybackup' in source
    assert 'docker exec "$container"' in source
    assert 'test ! -e /tmp/atlas-ci-physical-backup' in source


def test_physical_backup_is_started_on_separate_ephemeral_port_and_stopped() -> None:
    source = SCRIPT.read_text()
    assert 'pg_ctl -D "$restore"' in source
    assert '55433' in source
    assert 'pg_ctl -D /tmp/atlas-ci-physical-backup -m immediate -w stop' in source
    assert "atlas_ci_backup_restore.replay_probe" in source
    assert 'SELECT SUM(cash) FROM atlas_ci_backup_restore.replay_probe' in source
    assert "docker exec --user postgres" in source


def test_embedded_disposable_restore_shell_is_individually_parseable() -> None:
    # bash -n of the outer wrapper does not guarantee correct nested sh quoting.
    source = SCRIPT.read_text()
    marker = "docker exec --user postgres \"$container\" sh -ceu '"
    assert marker in source
    shell_source = source.split(marker, 1)[1].split("\n'", 1)[0]
    assert "'" not in shell_source
    check = subprocess.run(
        ["sh", "-n", "-c", shell_source],
        capture_output=True, text=True, timeout=5,
    )
    assert check.returncode == 0, check.stderr
