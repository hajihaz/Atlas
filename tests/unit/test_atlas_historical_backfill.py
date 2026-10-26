"""Read-only multi-chunk NSE historical backfill; all fixture prices synthetic."""

from __future__ import annotations

import datetime as dt
import hashlib
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from atlas.integrations.historical_backfill import backfill, date_chunks
from atlas.integrations.history_store import CandleArchive
from atlas.integrations.nse_sources import Candle, HistoricalBatch

START = dt.date(2022, 1, 3)
INSTRUMENT = "NSE_EQ|INE123456789"
IST = ZoneInfo("Asia/Kolkata")


def chunk_fixture(a: dt.date, b: dt.date, *, provider: str = "upstox_v3") -> HistoricalBatch:
    bar = Candle(
        dt.datetime.combine(a, dt.time(9, 15), IST),
        Decimal("100"),
        Decimal("102"),
        Decimal("99"),
        Decimal("101"),
        1234,
    )
    return HistoricalBatch(
        provider, INSTRUMENT, "1m", a, b, (bar,), hashlib.sha256(f"{a}/{b}".encode()).hexdigest()
    )


class BackfillTests(unittest.TestCase):
    def test_chunk_boundaries_and_years(self):
        end = START + dt.timedelta(days=69)
        chunks = date_chunks(START, end, provider="upstox")
        self.assertEqual(len(chunks), 3)
        self.assertEqual(chunks[0], (START, START + dt.timedelta(days=27)))
        self.assertEqual(chunks[1][0], chunks[0][1] + dt.timedelta(days=1))
        self.assertEqual(chunks[-1][1], end)
        self.assertEqual(
            len(date_chunks(START, START + dt.timedelta(days=299), provider="fyers")), 3
        )
        with self.assertRaises(ValueError):
            date_chunks(end, START, provider="upstox")
        with self.assertRaises(ValueError):
            date_chunks(START, START, provider="fake")

    def test_multi_chunk_archive_restart_idempotence(self):
        end = START + dt.timedelta(days=69)
        calls = []
        sleeps = []

        def fetch(a, b):
            calls.append((a, b))
            return chunk_fixture(a, b)

        with tempfile.TemporaryDirectory() as directory:
            archive = CandleArchive(Path(directory) / "history.duckdb")
            run = backfill(
                archive,
                provider="upstox",
                instrument=INSTRUMENT,
                start=START,
                end=end,
                fetcher=fetch,
                sleeper=sleeps.append,
                pause_seconds=0.1,
            )
            self.assertEqual(run.requests, 3)
            self.assertEqual(run.bars_added, 3)
            self.assertEqual(len(sleeps), 2)
            self.assertEqual(run.status, "UNCERTIFIED_HISTORICAL_ARCHIVE")
            second = backfill(
                archive,
                provider="upstox",
                instrument=INSTRUMENT,
                start=START,
                end=end,
                fetcher=fetch,
                pause_seconds=0,
            )
            self.assertEqual(second.bars_added, 0)
            self.assertEqual(len(archive.rows("upstox_v3", INSTRUMENT, "1m")), 3)

    def test_provider_swap_fails_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = CandleArchive(Path(directory) / "history.duckdb")
            with self.assertRaises(ValueError):
                backfill(
                    archive,
                    provider="fyers",
                    instrument=INSTRUMENT,
                    start=START,
                    end=START,
                    fetcher=chunk_fixture,
                    pause_seconds=0,
                )
            self.assertEqual(archive.rows("fyers_v3", INSTRUMENT, "1m"), [])

    def test_missing_real_credentials_no_download(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = CandleArchive(Path(directory) / "archive.duckdb")
            with self.assertRaises(RuntimeError):
                backfill(
                    archive,
                    provider="upstox",
                    instrument=INSTRUMENT,
                    start=START,
                    end=START,
                    token="",
                )
            self.assertFalse(archive.path.exists())


if __name__ == "__main__":
    unittest.main()
