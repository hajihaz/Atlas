"""Offline Upstox/FYERS dispute checks; all market data here is synthetic."""

from __future__ import annotations

import dataclasses
import datetime as dt
import json
import subprocess
import sys
from decimal import Decimal
from pathlib import Path

import pytest

from atlas.integrations.history_store import CandleArchive
from atlas.integrations.nse_sources import HistoricalBatch
from atlas.integrations.source_comparison import compare_history_sources
from tests.unit.test_atlas_nse_integrations import synthetic_batch

S1 = "NSE_EQ|INE123456789"
S2 = "NSE:TEST-EQ"


def _archive(
    tmp_path: Path, *, disagree: bool = False, lose_first: bool = False, no_overlap: bool = False
) -> CandleArchive:
    archive = CandleArchive(tmp_path / "cross-check.duckdb")
    first = synthetic_batch()
    archive.add(first)
    rows = list(first.candles)
    if disagree:
        rows[4] = dataclasses.replace(
            rows[4], close=rows[4].close + Decimal("0.1"), volume=rows[4].volume + 30
        )
        rows[5] = dataclasses.replace(rows[5], volume=rows[5].volume + 42)
    if lose_first:
        rows = rows[1:]
    if no_overlap:
        rows = [
            dataclasses.replace(x, timestamp=x.timestamp + dt.timedelta(hours=3)) for x in rows[:10]
        ]
    other = HistoricalBatch(
        "fyers_v3", S2, first.interval, first.from_date, first.to_date, tuple(rows), "b" * 64
    )
    archive.add(other)
    return archive


def _run(archive: CandleArchive):
    return compare_history_sources(
        archive,
        primary_provider="upstox_v3",
        primary_instrument=S1,
        secondary_provider="fyers_v3",
        secondary_instrument=S2,
    )


def test_agreeing_sources_not_equivalent_to_certified_nse_history(tmp_path: Path) -> None:
    db = _archive(tmp_path)
    result = _run(db)
    assert result.aligned_bars == 65
    assert result.price_disagreement_bars == 0
    assert result.volume_disagreement_bars == 0
    assert result.only_primary_bars == 0
    assert result.only_secondary_bars == 0
    assert result.status == "UNCERTIFIED_VENDOR_OBSERVATIONS_AGREE_ON_OVERLAP"
    assert result.source_rights_verified is False
    assert result.point_in_time_universe_verified is False
    assert result.write_authority is False


def test_price_and_volume_disputes_are_preserved_and_unmodified(tmp_path: Path) -> None:
    db = _archive(tmp_path, disagree=True)
    before = db.rows("fyers_v3", S2, "1m")
    r = _run(db)
    assert r.price_disagreement_bars == 1
    assert r.volume_disagreement_bars == 2
    assert len(r.examples) == 2
    assert r.examples[0].price_fields == ("close",)
    assert r.examples[0].volume_differs is True
    assert r.examples[1].volume_differs is True
    assert Decimal(r.max_close_delta_pct or "0") > 0
    assert r.status == "UNCERTIFIED_VENDOR_DIFFERENCES_REVIEW_REQUIRED"
    assert db.rows("fyers_v3", S2, "1m") == before


def test_missing_history_is_reported_not_filled(tmp_path: Path) -> None:
    r = _run(_archive(tmp_path, lose_first=True))
    assert r.aligned_bars == 64
    assert r.only_primary_bars == 1
    assert r.only_secondary_bars == 0
    assert r.price_disagreement_bars == 0
    assert r.status == "UNCERTIFIED_VENDOR_DIFFERENCES_REVIEW_REQUIRED"


def test_no_shared_timestamps_do_not_generate_false_agreement(tmp_path: Path) -> None:
    r = _run(_archive(tmp_path, no_overlap=True))
    assert r.aligned_bars == 0
    assert r.only_primary_bars == 65
    assert r.only_secondary_bars == 10
    assert r.status == "UNCERTIFIED_NO_ALIGNED_SOURCE_TIMESTAMPS"


def test_untrusted_or_absent_vendor_mapping_refused(tmp_path: Path) -> None:
    db = _archive(tmp_path)
    with pytest.raises(ValueError, match="distinct NSE provider"):
        compare_history_sources(
            db,
            primary_provider="upstox_v3",
            primary_instrument=S1,
            secondary_provider="upstox_v3",
            secondary_instrument=S1,
        )
    with pytest.raises(ValueError, match="both exact"):
        compare_history_sources(
            db,
            primary_provider="upstox_v3",
            primary_instrument=S1,
            secondary_provider="fyers_v3",
            secondary_instrument="NSE:WRONG-EQ",
        )


def test_json_cli_cross_check_does_not_claim_execution_quality(tmp_path: Path) -> None:
    db = _archive(tmp_path, disagree=True)
    command = [
        sys.executable,
        "scripts/atlas_research_command.py",
        "compare-sources",
        "--archive",
        str(db.path),
        "--provider",
        "upstox",
        "--instrument",
        S1,
        "--other-provider",
        "fyers",
        "--other-instrument",
        S2,
    ]
    child = subprocess.run(command, capture_output=True, text=True, check=False, timeout=20)
    assert child.returncode == 0, child.stderr + child.stdout
    result = json.loads(child.stdout)
    assert result["price_disagreement_bars"] == 1
    assert result["volume_disagreement_bars"] == 2
    assert result["source_rights_verified"] is False
    assert result["point_in_time_universe_verified"] is False
    assert result["write_authority"] is False
