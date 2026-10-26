"""True process interruption: DuckDB bars and receipt share one commit boundary."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from atlas.integrations.history_store import CandleArchive
from tests.unit.test_atlas_nse_integrations import synthetic_batch

_CHILD = r"""
import os
import sys
from pathlib import Path

from atlas.integrations.history_store import CandleArchive
from tests.unit.test_atlas_nse_integrations import synthetic_batch

filename, marker_file, phase = sys.argv[1:]
archive = CandleArchive(Path(filename))
original = archive._connect

def kill():
    with open(marker_file, 'wb') as fd:
        fd.write(phase.encode('ascii'))
        fd.flush()
        os.fsync(fd.fileno())
    os._exit({'after_first_bar': 71, 'after_receipt': 72, 'after_commit': 73}[phase])

class FaultConnection:
    def __init__(self, backing):
        self.backing = backing
    def execute(self, sql, *args):
        result = self.backing.execute(sql, *args)
        if phase == 'after_first_bar' and 'INSERT INTO candles VALUES' in sql:
            kill()
        if phase == 'after_receipt' and 'INSERT INTO history_receipts' in sql:
            kill()
        if phase == 'after_commit' and sql == 'COMMIT':
            kill()
        return result
    def close(self):
        return self.backing.close()

archive._connect = lambda: FaultConnection(original())
archive.add(synthetic_batch())
sys.exit(15)  # A successful normal return means fault injection was not reached.
"""


@pytest.mark.parametrize(
    ("phase", "exit_code", "persisted"),
    [
        ("after_first_bar", 71, False),
        ("after_receipt", 72, False),
        ("after_commit", 73, True),
    ],
)
def test_archive_receipt_commit_survives_or_rolls_back_together(
    tmp_path: Path, phase: str, exit_code: int, persisted: bool
) -> None:
    db_path = tmp_path / "disposable.duckdb"
    marker = tmp_path / "triggered.txt"
    env = os.environ.copy()
    env["PYTHONPATH"] = "src"
    child = subprocess.run(
        [sys.executable, "-c", _CHILD, str(db_path), str(marker), phase],
        text=True,
        capture_output=True,
        check=False,
        timeout=15,
        env=env,
    )
    assert child.returncode == exit_code, child.stderr + child.stdout
    assert marker.read_text() == phase

    for _ in range(3):
        archive = CandleArchive(db_path)
        report = archive.provenance("upstox_v3", "NSE_EQ|INE123456789", "1m")
        assert report.observed_candles == (65 if persisted else 0)
        assert report.receipt_count == (1 if persisted else 0)
        assert report.legacy_unattributed_candles == 0
        assert report.source_rights_verified is False

    # Retrying the exact response makes one receipt and exactly 65 bars,
    # irrespective of the crash point.
    archive = CandleArchive(db_path)
    new_bars = archive.add(synthetic_batch())
    assert new_bars == (0 if persisted else 65)
    report = archive.provenance("upstox_v3", "NSE_EQ|INE123456789", "1m")
    assert report.observed_candles == 65
    assert report.receipt_count == 1
    assert report.legacy_unattributed_candles == 0
