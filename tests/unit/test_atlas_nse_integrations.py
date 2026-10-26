"""Offline broker-free integration contract tests. Test candles are SYNTHETIC."""

from __future__ import annotations

import datetime as dt
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

from atlas.integrations.backtrader_bridge import run_backtrader_sma
from atlas.integrations.history_store import CandleArchive
from atlas.integrations.nse_sources import (
    Candle,
    HistoricalBatch,
    fyers_history,
    upstox_history,
)
from atlas.integrations.openalgo_sandbox import observe_analyzer, preview_order
from atlas.integrations.point_in_time import VolumeObservation, certify_volume_rank

IST = ZoneInfo("Asia/Kolkata")
START = dt.date(2026, 10, 5)
END = dt.date(2026, 10, 5)


def minute(m: int) -> dt.datetime:
    return dt.datetime(2026, 10, 5, 9, 15, tzinfo=IST) + dt.timedelta(minutes=m)


def synthetic_batch(n: int = 65) -> HistoricalBatch:
    bars = []
    for i in range(n):
        p = Decimal(100) + Decimal(i % 16) + Decimal(i // 14)
        bars.append(
            Candle(minute(i).astimezone(dt.UTC), p, p + 1, p - 1, p + Decimal("0.4"), 5000 + i)
        )
    return HistoricalBatch(
        "upstox_v3", "NSE_EQ|INE123456789", "1m", START, END, tuple(bars), "a" * 64
    )


class ProviderContracts(unittest.TestCase):
    def test_upstox_v3_read_only_and_sorted(self):
        captures = []

        def fake(url, headers):
            captures.append((url, headers))
            return {
                "status": "success",
                "data": {
                    "candles": [
                        [minute(1).isoformat(), 101, 102, 100, 101, 5, 0],
                        [minute(0).isoformat(), 100, 101, 99, 100, 4, 0],
                    ]
                },
            }

        batch = upstox_history("NSE_EQ|INE123456789", START, END, token="example-only", getter=fake)
        self.assertEqual(len(batch.candles), 2)
        self.assertTrue(batch.candles[0].timestamp < batch.candles[1].timestamp)
        self.assertIn("/v3/historical-candle/NSE_EQ%7C", captures[0][0])
        self.assertEqual(captures[0][1]["Authorization"], "Bearer example-only")
        self.assertNotIn("example-only", captures[0][0])
        self.assertEqual(batch.status, "UNCERTIFIED_INSTRUMENT_HISTORY")

    def test_fyers_market_data_only(self):
        calls = []

        def fake(url, headers):
            calls.append((url, headers))
            return {"s": "ok", "candles": [[int(minute(0).timestamp()), 100, 102, 99, 101, 10000]]}

        batch = fyers_history(
            "NSE:RELIANCE-EQ", START, END, app_id="example_app", token="example_token", getter=fake
        )
        self.assertEqual(batch.provider, "fyers_v3")
        self.assertEqual(parse_qs(urlsplit(calls[0][0]).query)["symbol"], ["NSE:RELIANCE-EQ"])
        self.assertEqual(calls[0][1]["Authorization"], "example_app:example_token")
        self.assertNotIn("example_token", calls[0][0])

    def test_reject_bad_prices_duplicates_future_and_credentials(self):
        with self.assertRaises(ValueError):
            Candle(minute(0), Decimal(100), Decimal(90), Decimal(95), Decimal(100), 1)
        with self.assertRaises(ValueError):
            upstox_history(
                "NSE_EQ|bad",
                START,
                END,
                token="x",
                getter=lambda u, h: {"status": "success", "data": {"candles": []}},
            )
        with self.assertRaises(RuntimeError):
            upstox_history("NSE_EQ|INE123456789", START, END, token="")
        with self.assertRaises(ValueError):
            upstox_history(
                "NSE_EQ|INE123456789",
                START,
                END,
                token="x",
                getter=lambda u, h: {
                    "status": "success",
                    "data": {
                        "candles": [
                            [minute(0).isoformat(), 100, 101, 99, 100, 4],
                            [minute(0).isoformat(), 100, 101, 99, 100, 4],
                        ]
                    },
                },
            )
        with self.assertRaises(ValueError):
            fyers_history(
                "NSE:RELIANCE-EQ",
                START,
                END,
                app_id="a",
                token="b",
                getter=lambda u, h: {
                    "s": "ok",
                    "candles": [
                        [int(minute(0).timestamp()), 100, 101, 99, 100, 1],
                        [int((minute(0) + dt.timedelta(days=1)).timestamp()), 100, 101, 99, 100, 2],
                    ],
                },
            )

    def test_chunks_are_bounded(self):
        with self.assertRaises(ValueError):
            upstox_history("NSE_EQ|INE123456789", START, START + dt.timedelta(days=28), token="x")
        with self.assertRaises(ValueError):
            fyers_history(
                "NSE:SBIN-EQ", START, START + dt.timedelta(days=100), app_id="a", token="b"
            )


class ArchiveContracts(unittest.TestCase):
    def test_immutable_idempotent_and_parquet(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = CandleArchive(Path(tmp) / "nse.duckdb")
            batch = synthetic_batch()
            self.assertEqual(archive.add(batch), 65)
            self.assertEqual(archive.add(batch), 0)
            self.assertEqual(len(archive.rows(batch.provider, batch.instrument, "1m")), 65)
            parquet = archive.export_parquet(Path(tmp) / "snapshot.parquet")
            self.assertGreater(parquet.stat().st_size, 0)
            with self.assertRaises(ValueError):
                archive.export_parquet(parquet)
            conflicting = HistoricalBatch(
                batch.provider,
                batch.instrument,
                batch.interval,
                batch.from_date,
                batch.to_date,
                batch.candles,
                "b" * 64,
            )
            with self.assertRaises(ValueError):
                archive.add(conflicting)
            self.assertEqual(len(archive.rows(batch.provider, batch.instrument, "1m")), 65)

    def test_independent_sma_replay(self):
        b = synthetic_batch()
        r = run_backtrader_sma(b)
        self.assertEqual(r.bars, 65)
        self.assertEqual(r.source_hash, b.payload_sha256)
        self.assertTrue(r.ending_equity_inr.is_finite())
        self.assertIn("HYPOTHETICAL", r.status)


class SafetyContracts(unittest.TestCase):
    def test_openalgo_never_enables_broker_orders(self):
        self.assertFalse(preview_order("RELIANCE", "BUY", 5).submit_enabled)
        logs = []

        def fake(url, body):
            logs.append((url, body))
            return {"analyze_mode": True}

        response = observe_analyzer("http://127.0.0.1:5000", "test-only", post_json=fake)
        self.assertTrue(response["analyzer_enabled"])
        self.assertFalse(response["orders_enabled"])
        self.assertEqual(logs[0][0], "http://127.0.0.1:5000/api/v1/analyzer")
        with self.assertRaises(ValueError):
            observe_analyzer("https://example.com", "test-only", post_json=fake)
        with self.assertRaises(ValueError):
            observe_analyzer("http://127.0.0.1:5000/evil", "test-only", post_json=fake)

    def test_pit_rejects_future_and_missing_symbols(self):
        as_of = minute(45)
        symbols = [f"SYM{i:02d}" for i in range(12)]
        obs = [
            VolumeObservation(s, 1000 + i, as_of - dt.timedelta(minutes=1), as_of)
            for i, s in enumerate(symbols)
        ]
        result = certify_volume_rank(as_of=as_of, listed_members=symbols, observations=obs)
        self.assertEqual(result.top_ten[0], "SYM11")
        self.assertEqual(len(result.top_ten), 10)
        with self.assertRaises(ValueError):
            certify_volume_rank(as_of=as_of, listed_members=symbols, observations=obs[:-1])
        obs[0] = VolumeObservation(symbols[0], 1000, as_of, as_of + dt.timedelta(seconds=1))
        with self.assertRaises(ValueError):
            certify_volume_rank(as_of=as_of, listed_members=symbols, observations=obs)


if __name__ == "__main__":
    unittest.main()


class ReadOnlyQuoteContracts(unittest.TestCase):
    def test_upstox_ltp_is_observational_only(self):
        from atlas.integrations.upstox_quote import upstox_ltp

        received = minute(44)
        calls = []

        def fake(url, headers):
            calls.append((url, headers))
            return {
                "status": "success",
                "data": {
                    "NSE_EQ:TEST": {
                        "instrument_token": "NSE_EQ|INE123456789",
                        "last_price": 124.25,
                        "volume": 10500,
                        "cp": 120,
                    }
                },
            }

        q = upstox_ltp(
            "NSE_EQ|INE123456789", token="example-only", received_at=received, getter=fake
        )
        self.assertFalse(q.execution_freshness_verified)
        self.assertIsNone(q.market_timestamp)
        self.assertEqual(q.last_price, Decimal("124.25"))
        self.assertIn("/v3/market-quote/ltp?", calls[0][0])
        self.assertNotIn("example-only", calls[0][0])

    def test_quote_rejects_provider_spoof_and_bad_price(self):
        from atlas.integrations.upstox_quote import upstox_ltp

        def forged(url, headers):
            return {
                "status": "success",
                "data": {
                    "NSE_EQ:WRONG": {
                        "instrument_token": "NSE_EQ|FORGED",
                        "last_price": 100,
                        "volume": 1,
                    }
                },
            }

        with self.assertRaises(ValueError):
            upstox_ltp("NSE_EQ|INE123456789", token="test", received_at=minute(3), getter=forged)
        with self.assertRaises(RuntimeError):
            upstox_ltp("NSE_EQ|INE123456789", token="", received_at=minute(3), getter=forged)

    def test_transport_rejects_quote_auth_redirection(self):
        from atlas.market.read_only_transport import market_data_get

        with self.assertRaises(ValueError):
            market_data_get("https://evil.example/v3/market-quote/ltp?instrument_key=X", {})
        with self.assertRaises(ValueError):
            market_data_get("https://api.upstox.com/v3/order/place?instrument_key=X", {})
