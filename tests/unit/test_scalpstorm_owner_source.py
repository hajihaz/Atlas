import datetime as dt
import gzip
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.run_scalpstorm_source import (
    prior_daily_reference,
    recover_signals,
    validated_nifty_signal,
)

from atlas.integrations.scalpstorm_owner_source import (
    broad_snapshot,
    fetch_quotes,
    provider_timestamp,
    universe_from_bytes,
)


class OwnerSourceTests(unittest.TestCase):
    def test_absent_provider_event_is_not_replaced_with_fetch_time(self):
        now = dt.datetime.now(dt.UTC)
        for missing in (0, "0", None, ""):
            self.assertIsNone(provider_timestamp(missing, now))
        with self.assertRaises(ValueError):
            provider_timestamp("malformed", now)

    def test_complete_universe_includes_inactive_quotes_without_fabricated_time(self):
        def getter(url, headers):
            self.assertIn("/v3/market-quote/quotes?", url)
            self.assertEqual(headers["Authorization"], "Bearer UNIT_ONLY")
            return {
                "status": "success",
                "data": {
                    "NSE_EQ:X": {
                        "instrument_token": "NSE_EQ|INE000000001",
                        "volume": 0,
                        "last_price": 0,
                        "last_trade_time": "0",
                        "timestamp": "0",
                        "ohlc": {"close": 1},
                        "depth": {},
                    }
                },
            }

        rows, raw_hash = fetch_quotes({"NSE_EQ|INE000000001": "X"}, "UNIT_ONLY", getter=getter)
        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0]["lastTradeAt"])
        self.assertIsNone(rows[0]["quoteTimestamp"])
        self.assertEqual(len(raw_hash), 64)

    def test_index_previous_close_uses_net_change_not_current_candle_close(self):
        def getter(_url, _headers):
            return {
                "status": "success",
                "data": {
                    "NSE_INDEX:Nifty 50": {
                        "instrument_token": "NSE_INDEX|Nifty 50",
                        "volume": None,
                        "last_price": 99.7,
                        "net_change": -0.3,
                        "prev_close_price": None,
                        "timestamp": "0",
                        "last_trade_time": "0",
                        "ohlc": {"close": 99.7},
                        "depth": {},
                    }
                },
            }

        rows, _ = fetch_quotes({"NSE_INDEX|Nifty 50": "NIFTY 50"}, "UNIT_ONLY", getter=getter)
        self.assertAlmostEqual(rows[0]["previousClose"], 100.0)
        self.assertEqual(rows[0]["previousCloseMethod"], "LAST_PRICE_MINUS_NET_CHANGE")
        self.assertNotEqual(rows[0]["previousClose"], 99.7)

    def test_missing_previous_close_is_not_invented_from_current_candle(self):
        def getter(_url, _headers):
            return {
                "status": "success",
                "data": {
                    "NSE_INDEX:Nifty 50": {
                        "instrument_token": "NSE_INDEX|Nifty 50",
                        "volume": None,
                        "last_price": 99.7,
                        "prev_close_price": None,
                        "net_change": None,
                        "timestamp": "0",
                        "last_trade_time": "0",
                        "ohlc": {"close": 99.7},
                    }
                },
            }

        rows, _ = fetch_quotes({"NSE_INDEX|Nifty 50": "NIFTY 50"}, "UNIT_ONLY", getter=getter)
        self.assertIsNone(rows[0]["previousClose"])
        self.assertEqual(rows[0]["previousCloseMethod"], "UNAVAILABLE")

    def test_previous_session_daily_reference_guards_nifty_direction(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "scalpstorm-history.json"
            history = {
                "schema": "atlas.scalpstorm-history.v1",
                "realOrdersEnabled": False,
                "actualCapitalINR": 0,
                "prices": {
                    "instrumentKey": "NSE_INDEX|Nifty 50",
                    "source": "Upstox Analytics V3 / days / 1",
                    "sourcePayloadSHA256": "a" * 64,
                    "lastDate": "2026-10-26",
                    "bars": [{"time": "2026-10-26T00:00:00+05:30", "close": 100}],
                },
            }
            path.write_text(json.dumps(history))
            path.chmod(0o600)
            prior = prior_daily_reference(Path(folder), "2026-10-27")
            self.assertEqual(prior["date"], "2026-10-26")
            self.assertEqual(prior["close"], 100)
            self.assertIsNone(validated_nifty_signal({"previousClose": 99}, prior))
            self.assertIsNone(validated_nifty_signal({"previousClose": None}, prior))
            accepted = validated_nifty_signal({"previousClose": 100}, prior)
            self.assertEqual(accepted["previousClose"], 100)
            self.assertEqual(accepted["previousCloseDate"], "2026-10-26")
            history["prices"]["sourcePayloadSHA256"] = "z" * 64
            path.write_text(json.dumps(history))
            self.assertIsNone(prior_daily_reference(Path(folder), "2026-10-27"))

    def test_restart_rejects_legacy_unverified_previous_close(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "scalpstorm-owner-input.json"
            signal = {"observedAt": "2026-10-27T04:00:01+00:00", "previousClose": 100}
            payload = {
                "schema": "atlas.scalpstorm-owner-input.v1",
                "dataClass": "BROKER_API_OBSERVATION",
                "ranking": None,
                "niftySignal": signal,
            }
            file.write_text(json.dumps(payload))
            file.chmod(0o600)
            prior = {"date": "2026-10-26", "close": 100, "sourcePayloadSHA256": "a" * 64}
            with patch("scripts.run_scalpstorm_source.prior_daily_reference", return_value=prior):
                self.assertIsNone(recover_signals(Path(folder), "2026-10-27", "b" * 64)[1])
                signal["previousCloseMethod"] = "LAST_PRICE_MINUS_NET_CHANGE"
                file.write_text(json.dumps(payload))
                recovered = recover_signals(Path(folder), "2026-10-27", "b" * 64)[1]
                self.assertEqual(recovered["previousCloseDate"], "2026-10-26")

    def test_universe_selection_is_eligible_unique_and_broad(self):
        rows = [
            {
                "segment": "NSE_EQ",
                "exchange": "NSE",
                "instrument_type": "EQ",
                "security_type": "NORMAL",
                "lot_size": 1,
                "instrument_key": f"NSE_EQ|INE{i:09d}",
                "trading_symbol": f"S{i}",
            }
            for i in range(100)
        ]
        raw = gzip.compress(json.dumps(rows).encode())
        result = universe_from_bytes(raw, dt.datetime.now(dt.UTC))
        self.assertEqual(len(result["instruments"]), 100)
        self.assertFalse(result["historicalPointInTimeUniverse"])
        rows[1] = rows[0]
        with self.assertRaises(ValueError):
            universe_from_bytes(gzip.compress(json.dumps(rows).encode()), dt.datetime.now(dt.UTC))

    def test_failed_or_missing_batch_never_counts_as_complete_ranking(self):
        universe = {
            "instruments": [
                {"instrumentKey": f"NSE_EQ|INE{i:09d}", "symbol": f"S{i}"} for i in range(450)
            ],
            "payloadSHA256": "a" * 64,
        }
        with patch(
            "atlas.integrations.scalpstorm_owner_source.fetch_quotes", return_value=([], "a" * 64)
        ):
            result = broad_snapshot(universe, "UNIT_ONLY")
        self.assertFalse(result["complete"])
        self.assertEqual(result["eligibleCount"], 450)
        self.assertEqual(result["receivedCount"], 0)
