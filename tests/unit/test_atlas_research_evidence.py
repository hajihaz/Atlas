"""Synthetic disposable archive tests for evidence attached to actual CLI results."""

from dataclasses import replace
from pathlib import Path

import duckdb
import pytest

from atlas.integrations.history_store import CandleArchive
from tests.unit.test_atlas_nse_integrations import synthetic_batch
from tests.unit.test_atlas_research_cli import cli


def compare(archive: CandleArchive, *extra: str):
    return cli(
        "compare", "--provider", "upstox", "--instrument", synthetic_batch().instrument,
        "--archive", str(archive.path), *extra,
    )


def payload(result):
    import json

    assert result.returncode == 0, result.stdout + result.stderr
    return json.loads(result.stdout)


def test_complete_local_receipts_never_qualify_strategy_or_data(tmp_path: Path):
    archive = CandleArchive(tmp_path / "research.duckdb")
    archive.add(synthetic_batch())
    before = archive.provenance("upstox_v3", synthetic_batch().instrument, "1m")
    result = payload(compare(archive))
    evidence = result["evidence"]
    assert evidence["quality"]["observed_bars"] == result["candles"] == 65
    assert evidence["provenance"]["receipt_count"] == 1
    assert evidence["cross_source_status"] == "NOT_CHECKED"
    assert not evidence["certified"] and not evidence["strategy_qualified"]
    assert not evidence["live_orders_enabled"]
    assert any("rights" in warning for warning in evidence["warnings"])
    assert archive.provenance("upstox_v3", synthetic_batch().instrument, "1m") == before


def test_gapped_replay_and_legacy_rows_show_specific_warnings(tmp_path: Path):
    archive = CandleArchive(tmp_path / "research.duckdb")
    batch = synthetic_batch()
    archive.add(replace(batch, candles=batch.candles[:20] + batch.candles[22:]))
    with duckdb.connect(str(archive.path)) as db:
        db.execute("DELETE FROM history_receipts")
    result = payload(compare(archive))
    evidence = result["evidence"]
    assert evidence["quality"]["observed_missing_intraday_bars"] == 2
    assert evidence["provenance"]["legacy_unattributed_candles"] == 63
    assert any("missing intraday" in warning for warning in evidence["warnings"])
    assert any("lack ingestion receipts" in warning for warning in evidence["warnings"])
    assert not evidence["strategy_qualified"]


@pytest.mark.parametrize("dispute", [False, True])
def test_explicit_cross_source_results_remain_uncertified(tmp_path: Path, dispute: bool):
    archive = CandleArchive(tmp_path / "research.duckdb")
    batch = synthetic_batch()
    archive.add(batch)
    bars = list(batch.candles)
    if dispute:
        bars[0] = replace(bars[0], volume=bars[0].volume + 1)
    archive.add(replace(
        batch, provider="fyers_v3", instrument="NSE:SYNTHETIC-EQ",
        candles=tuple(bars), payload_sha256="b" * 64,
    ))
    result = payload(compare(
        archive, "--other-provider", "fyers", "--other-instrument", "NSE:SYNTHETIC-EQ",
    ))
    evidence = result["evidence"]
    assert evidence["comparison"]["volume_disagreement_bars"] == int(dispute)
    assert evidence["cross_source_status"] == (
        "UNCERTIFIED_VENDOR_DIFFERENCES_REVIEW_REQUIRED" if dispute
        else "UNCERTIFIED_VENDOR_OBSERVATIONS_AGREE_ON_OVERLAP"
    )
    assert not evidence["certified"] and not evidence["strategy_qualified"]
    assert not evidence["comparison"]["write_authority"]


def test_corrupt_receipt_prevents_any_strategy_return(tmp_path: Path):
    archive = CandleArchive(tmp_path / "research.duckdb")
    archive.add(synthetic_batch())
    with duckdb.connect(str(archive.path)) as db:
        db.execute("UPDATE history_receipts SET candle_count=1")
    result = compare(archive)
    assert result.returncode == 2
    assert "checksum" in result.stdout
    assert "ending_equity_inr" not in result.stdout
    assert "hypothetical_pnl_inr" not in result.stdout


def test_partial_secondary_mapping_cannot_silently_skip_comparison(tmp_path: Path):
    archive = CandleArchive(tmp_path / "research.duckdb")
    archive.add(synthetic_batch())
    result = compare(archive, "--other-provider", "fyers")
    assert result.returncode == 2
    assert "requires both secondary" in result.stdout
