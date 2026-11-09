"""Synthetic-only historical provenance. A receipt is NOT proof of exchange rights."""

from __future__ import annotations

import datetime as dt
import json
import subprocess
import sys
from decimal import Decimal
from pathlib import Path

import duckdb
import pytest

from atlas.integrations.history_store import CandleArchive
from atlas.integrations.nse_sources import Candle, HistoricalBatch
from tests.unit.test_atlas_nse_integrations import minute, synthetic_batch

PROVIDER = "upstox_v3"
SYMBOL = "NSE_EQ|INE123456789"
WHEN = dt.datetime(2026, 10, 26, 5, 0, tzinfo=dt.UTC)


def test_receipt_is_atomic_source_time_bound_and_uncertified(tmp_path: Path) -> None:
    db = CandleArchive(tmp_path / "evidence.duckdb")
    sample = synthetic_batch()
    assert db.add(sample, received_at=WHEN) == 65
    receipt = db.provenance(PROVIDER, SYMBOL, "1m")
    assert receipt.receipt_count == 1
    assert receipt.observed_candles == 65
    assert receipt.legacy_unattributed_candles == 0
    assert len(receipt.receipts[0].receipt_digest) == 64
    assert receipt.receipts[0].first_ingested_at_utc == WHEN.isoformat()
    assert receipt.receipts[0].payload_sha256 == sample.payload_sha256
    assert receipt.receipts[0].rights_status == "UNVERIFIED"
    assert receipt.source_rights_verified is False
    assert receipt.point_in_time_universe_verified is False
    assert receipt.receipts[0].provider_authentication_verified is False

    # Idempotent retry may not rewrite the original evidence timestamp.
    assert db.add(sample, received_at=WHEN + dt.timedelta(days=2)) == 0
    assert db.provenance(PROVIDER, SYMBOL, "1m") == receipt


def test_conflicting_ingestion_rolls_back_new_bars_and_receipt(tmp_path: Path) -> None:
    db = CandleArchive(tmp_path / "evidence.duckdb")
    first = synthetic_batch()
    db.add(first)
    early = Candle(
        minute(-1).astimezone(dt.UTC),
        Decimal("100"),
        Decimal("101"),
        Decimal("99"),
        Decimal("100.5"),
        1999,
    )
    # First new bar would insert; second bar conflicts with immutable source.
    changed = HistoricalBatch(
        first.provider,
        first.instrument,
        first.interval,
        first.from_date,
        first.to_date,
        (early, first.candles[0]),
        "b" * 64,
    )
    with pytest.raises(ValueError, match="conflicting historical bar"):
        db.add(changed)
    result = db.provenance(PROVIDER, SYMBOL, "1m")
    assert result.receipt_count == 1
    assert result.observed_candles == 65
    assert db.rows(PROVIDER, SYMBOL, "1m")[0][0] == first.candles[0].timestamp


def test_corrupt_receipt_fails_closed_in_reads_and_replay(tmp_path: Path) -> None:
    db = CandleArchive(tmp_path / "evidence.duckdb")
    batch = synthetic_batch()
    db.add(batch)
    with duckdb.connect(str(db.path)) as connection:
        connection.execute(
            "UPDATE history_receipts SET candle_count=1 WHERE provider=?",
            (PROVIDER,),
        )
    with pytest.raises(RuntimeError, match="checksum"):
        db.provenance(PROVIDER, SYMBOL, "1m")
    with pytest.raises(ValueError, match="tampered archive receipt"):
        db.add(batch)
    assert len(db.rows(PROVIDER, SYMBOL, "1m")) == 65


def test_older_archive_rows_never_gain_fake_receipts(tmp_path: Path) -> None:
    db = CandleArchive(tmp_path / "legacy.duckdb")
    batch = synthetic_batch()
    # Simulate the previous schema's contents before receipts were deployed.
    conn = db._connect()
    try:
        candle = batch.candles[0]
        conn.execute(
            "INSERT INTO candles VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                batch.provider,
                batch.instrument,
                batch.interval,
                candle.timestamp,
                candle.open,
                candle.high,
                candle.low,
                candle.close,
                candle.volume,
                batch.payload_sha256,
                batch.status,
            ),
        )
    finally:
        conn.close()
    result = db.provenance(PROVIDER, SYMBOL, "1m")
    assert result.observed_candles == 1
    assert result.receipt_count == 0
    assert result.legacy_unattributed_candles == 1
    assert result.source_rights_verified is False


def test_provenance_is_scoped_to_provider_instrument_interval(tmp_path: Path) -> None:
    db = CandleArchive(tmp_path / "scope.duckdb")
    db.add(synthetic_batch())
    for provider, symbol, interval in [
        ("fyers_v3", SYMBOL, "1m"),
        (PROVIDER, "NSE_EQ|INEOTHER", "1m"),
        (PROVIDER, SYMBOL, "5m"),
    ]:
        r = db.provenance(provider, symbol, interval)
        assert (r.receipt_count, r.observed_candles) == (0, 0)
        assert r.source_rights_verified is False


def test_receipt_rejects_missing_timezone_and_malformed_hash(tmp_path: Path) -> None:
    db = CandleArchive(tmp_path / "invalid.duckdb")
    with pytest.raises(ValueError, match="timezone"):
        db.add(synthetic_batch(), received_at=dt.datetime(2026, 10, 26))
    batch = synthetic_batch()
    bad = HistoricalBatch(
        batch.provider,
        batch.instrument,
        batch.interval,
        batch.from_date,
        batch.to_date,
        batch.candles,
        "not-a-sha256",
    )
    with pytest.raises(ValueError, match="SHA-256"):
        db.add(bad)
    assert not db.path.exists()


def test_provenance_cli_never_claims_rights_or_exposes_tokens(tmp_path: Path) -> None:
    db = CandleArchive(tmp_path / "cli.duckdb")
    db.add(synthetic_batch(), received_at=WHEN)
    result = subprocess.run(
        [
            sys.executable,
            "scripts/atlas_research_command.py",
            "provenance",
            "--provider",
            "upstox",
            "--instrument",
            SYMBOL,
            "--archive",
            str(db.path),
        ],
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )
    assert result.returncode == 0, result.stderr + result.stdout
    payload = json.loads(result.stdout)
    assert payload["receipt_count"] == 1
    assert payload["receipts"][0]["rights_status"] == "UNVERIFIED"
    assert payload["source_rights_verified"] is False
    assert payload["point_in_time_universe_verified"] is False
    assert "Authorization" not in result.stdout
    assert "Bearer" not in result.stdout
