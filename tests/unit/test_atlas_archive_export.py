"""Portable archive-manifest tests. Synthetic candles and local integrity ONLY."""

from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import pytest

from atlas.integrations.archive_export import (
    export_parquet_with_manifest,
    manifest_path,
    verify_parquet_export,
)
from atlas.integrations.history_store import CandleArchive
from tests.unit.test_atlas_nse_integrations import synthetic_batch

SYMBOL = "NSE_EQ|INE123456789"


def _archive(tmp_path: Path) -> CandleArchive:
    archive = CandleArchive(tmp_path / "history.duckdb")
    archive.add(synthetic_batch())
    return archive


def test_export_manifest_and_verify_local_integrity(tmp_path: Path) -> None:
    archive = _archive(tmp_path)
    outfile = tmp_path / "snapshot.parquet"
    summary = export_parquet_with_manifest(archive, outfile)
    assert outfile.is_file()
    sidecar = manifest_path(outfile)
    assert sidecar.is_file()
    saved = json.loads(sidecar.read_text())
    assert saved["parquet_sha256"] == summary["parquet_sha256"]
    assert saved["parquet_bytes"] == outfile.stat().st_size
    assert saved["status"] == "LOCAL_FILE_INTEGRITY_ONLY_NOT_NSE_CERTIFIED"
    assert saved["archive_observed_candles"] == 65
    assert saved["sources"][0]["receipt_count"] == 1
    assert saved["sources"][0]["receipts"][0]["rights_status"] == "UNVERIFIED"
    assert saved["source_rights_verified"] is False
    assert saved["point_in_time_universe_verified"] is False
    assert summary["source_rights_verified"] is False
    assert summary["live_money_enabled"] is False
    assert verify_parquet_export(outfile)["parquet_sha256"] == summary["parquet_sha256"]


@pytest.mark.parametrize("attack", ["append", "same_size_flip"])
def test_export_verifier_rejects_corrupted_parquet(tmp_path: Path, attack: str) -> None:
    archive = _archive(tmp_path)
    outfile = tmp_path / "snapshot.parquet"
    export_parquet_with_manifest(archive, outfile)
    if attack == "append":
        with outfile.open("ab") as handle:
            handle.write(b"TAMPERED")
    else:
        with outfile.open("r+b") as handle:
            handle.seek(30)
            original = handle.read(1)
            handle.seek(30)
            handle.write(bytes([original[0] ^ 0x11]))
    with pytest.raises(RuntimeError, match="does not match"):
        verify_parquet_export(outfile)


def test_export_refuses_existing_parquet_and_manifest_without_overwrite(tmp_path: Path) -> None:
    archive = _archive(tmp_path)
    out = tmp_path / "snapshot.parquet"
    out.write_bytes(b"original")
    with pytest.raises(ValueError, match="already exists"):
        export_parquet_with_manifest(archive, out)
    assert out.read_bytes() == b"original"
    out.unlink()

    manifest_path(out).write_text("owner-existing-manifest")
    with pytest.raises(ValueError, match="already exists"):
        export_parquet_with_manifest(archive, out)
    assert manifest_path(out).read_text() == "owner-existing-manifest"
    assert not out.exists()


def test_partial_pair_is_not_accepted(tmp_path: Path) -> None:
    par = tmp_path / "snapshot.parquet"
    par.write_bytes(b"PAR1")
    with pytest.raises(ValueError, match="manifest unavailable"):
        verify_parquet_export(par)
    par.unlink()
    manifest_path(par).write_text('{"schema_version":1}')
    with pytest.raises(ValueError, match="Parquet export file unavailable"):
        verify_parquet_export(par)


def test_failed_manifest_publication_leaves_no_visible_parquet(tmp_path: Path, monkeypatch) -> None:
    archive = _archive(tmp_path)
    out = tmp_path / "partial.parquet"
    real_link = os.link

    def obstruct_manifest(src, dest) -> None:
        if str(dest).endswith(".manifest.json"):
            raise OSError("simulated filesystem failure")
        real_link(src, dest)

    monkeypatch.setattr("atlas.integrations.archive_export.os.link", obstruct_manifest)
    with pytest.raises(OSError, match="filesystem failure"):
        export_parquet_with_manifest(archive, out)
    assert not out.exists()
    assert not manifest_path(out).exists()
    assert not list(tmp_path.glob(".partial.*.parquet"))
    assert not list(tmp_path.glob(".*.tmp"))


def test_concurrent_ingestion_invalidates_export_before_publication(
    tmp_path: Path, monkeypatch
) -> None:
    archive = _archive(tmp_path)
    target = tmp_path / "racing.parquet"
    original_export = archive.export_parquet

    def modify_after_copy(path: Path) -> Path:
        result = original_export(path)
        original = synthetic_batch()
        newer_date = original.from_date + dt.timedelta(days=1)
        shifted = tuple(
            replace(candle, timestamp=candle.timestamp + dt.timedelta(days=1))
            for candle in original.candles
        )
        from atlas.integrations.nse_sources import HistoricalBatch

        archive.add(
            HistoricalBatch(
                original.provider,
                original.instrument,
                original.interval,
                newer_date,
                newer_date,
                shifted,
                "b" * 64,
            )
        )
        return result

    monkeypatch.setattr(archive, "export_parquet", modify_after_copy)
    with pytest.raises(RuntimeError, match="history changed while exporting"):
        export_parquet_with_manifest(archive, target)
    assert not target.exists()
    assert not manifest_path(target).exists()


def test_archive_without_rows_does_not_publish_empty_export(tmp_path: Path) -> None:
    archive = CandleArchive(tmp_path / "empty.duckdb")
    connection = archive._connect()
    connection.close()
    target = tmp_path / "empty.parquet"
    with pytest.raises(ValueError, match="no historical candles"):
        export_parquet_with_manifest(archive, target)
    assert not target.exists()
    assert not manifest_path(target).exists()


def test_cli_export_and_verify_exports_never_claim_nse_rights(tmp_path: Path) -> None:
    archive = _archive(tmp_path)
    output = tmp_path / "published.parquet"
    script = "scripts/atlas_research_command.py"
    exported = subprocess.run(
        [sys.executable, script, "export", "--archive", str(archive.path), "--output", str(output)],
        check=False,
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert exported.returncode == 0, exported.stdout + exported.stderr
    response = json.loads(exported.stdout)
    assert response["live_orders"] is False
    assert response["source_rights_verified"] is False
    assert response["status"] == "LOCAL_ARCHIVE_EXPORT"
    assert response["integrity_status"] == "LOCAL_FILE_INTEGRITY_PASSED_NOT_NSE_CERTIFIED"
    assert response["path"] == str(output)
    assert response["manifest_path"] == str(manifest_path(output))

    checked = subprocess.run(
        [sys.executable, script, "verify-export", "--output", str(output)],
        check=False,
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert checked.returncode == 0, checked.stdout + checked.stderr
    data = json.loads(checked.stdout)
    assert data["status"] == "LOCAL_FILE_INTEGRITY_PASSED_NOT_NSE_CERTIFIED"
    assert data["source_rights_verified"] is False
