"""Archive quality indicators based on synthetic candles, never NSE certification."""

from __future__ import annotations

import datetime as dt
import json
import subprocess
import sys
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from atlas.integrations.history_quality import audit_history
from atlas.integrations.history_store import CandleArchive
from atlas.integrations.nse_sources import Candle, HistoricalBatch

IST = ZoneInfo("Asia/Kolkata")


def archive_with(
    path: Path,
    minutes: list[int],
    *,
    day: dt.date = dt.date(2026, 10, 26),
    interval: str = "1m",
    hash_id: str = "a" * 64,
) -> CandleArchive:
    start = dt.datetime.combine(day, dt.time(9, 15), tzinfo=IST)
    bars = []
    for m in minutes:
        candle = Candle(
            start + dt.timedelta(minutes=m),
            Decimal("100"),
            Decimal("101"),
            Decimal("99"),
            Decimal("100.5"),
            m + 100,
        )
        bars.append(candle)
    batch = HistoricalBatch(
        "upstox_v3",
        "NSE_EQ|INE123456789",
        interval,
        day,
        day,
        tuple(bars),
        hash_id,
    )
    archive = CandleArchive(path)
    archive.add(batch)
    return archive


def test_contiguous_fixture_not_claimed_certified(tmp_path) -> None:
    archive = archive_with(tmp_path / "ticks.duckdb", list(range(90)))
    report = audit_history(
        archive,
        provider="upstox_v3",
        instrument="NSE_EQ|INE123456789",
    )
    assert report.observed_bars == 90
    assert report.observed_dates == 1
    assert report.unique_source_payloads == 1
    assert report.observed_missing_intraday_bars == 0
    assert report.gaps == ()
    assert report.certified is False
    assert report.complete_point_in_time_universe is False
    assert report.status == "UNCERTIFIED_INCOMPLETE_EXCHANGE_COVERAGE_PROOF"


def test_missing_in_session_candles_are_counted(tmp_path) -> None:
    archive = archive_with(tmp_path / "bars.duckdb", [0, 1, 4, 6])
    report = audit_history(archive, provider="upstox_v3", instrument="NSE_EQ|INE123456789")
    assert report.observed_missing_intraday_bars == 3
    assert len(report.gaps) == 2
    assert report.gaps[0].missing_bars == 2
    assert report.gaps[1].missing_bars == 1
    assert "GAPS" in report.status
    assert report.certified is False


def test_overnight_or_weekend_not_called_intraday_gap(tmp_path) -> None:
    archive = archive_with(tmp_path / "bars.duckdb", [0, 1])
    next_day = dt.date(2026, 10, 27)
    archive_with(archive.path, [0, 1], day=next_day, hash_id="b" * 64)
    report = audit_history(archive, provider="upstox_v3", instrument="NSE_EQ|INE123456789")
    assert report.observed_dates == 2
    assert report.observed_missing_intraday_bars == 0
    assert report.unique_source_payloads == 2


def test_off_hours_are_not_silently_accepted(tmp_path) -> None:
    archive = archive_with(tmp_path / "bars.duckdb", [0, 1, 400])
    report = audit_history(archive, provider="upstox_v3", instrument="NSE_EQ|INE123456789")
    assert report.unusual_off_session_bars == 1
    assert report.observed_missing_intraday_bars > 0
    assert report.certified is False


def test_interval_and_provider_validation(tmp_path) -> None:
    archive = archive_with(tmp_path / "bars.duckdb", [0, 1])
    for value in ("0m", "61m", "1h", "00m", "5;DROP"):
        with pytest.raises(ValueError):
            audit_history(
                archive,
                provider="upstox_v3",
                instrument="NSE_EQ|INE123456789",
                interval=value,
            )
    with pytest.raises(ValueError):
        audit_history(archive, provider="bogus", instrument="NSE_EQ|INE123456789")
    with pytest.raises(ValueError):
        audit_history(
            CandleArchive(tmp_path / "absent.duckdb"),
            provider="upstox_v3",
            instrument="NSE_EQ|INE123456789",
        )


def test_json_cli_reports_uncertified_and_no_orders(tmp_path) -> None:
    path = tmp_path / "archive.duckdb"
    archive_with(path, [0, 1, 5])
    command = [
        sys.executable,
        "scripts/atlas_research_command.py",
        "audit-history",
        "--provider",
        "upstox",
        "--instrument",
        "NSE_EQ|INE123456789",
        "--archive",
        str(path),
    ]
    outcome = subprocess.run(command, capture_output=True, text=True, check=False, timeout=20)
    assert outcome.returncode == 0, outcome.stderr
    report = json.loads(outcome.stdout)
    assert report["observed_missing_intraday_bars"] == 3
    assert report["certified"] is False
    assert report["authenticated_exchange_calendar"] is False
    assert report["complete_point_in_time_universe"] is False
