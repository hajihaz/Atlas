"""Deterministic tests using test-only fabricated quotes; no market performance claims."""

from __future__ import annotations

import datetime as dt
import tempfile
import unittest
from pathlib import Path
from zoneinfo import ZoneInfo

from atlas.cloud_paper.engine import CloudPaperEngine, OrderError, to_iso

IST = ZoneInfo("Asia/Kolkata")


def clock(hour=10, minute=0, second=0, day=27):
    return dt.datetime(2026, 10, day, hour, minute, second, tzinfo=IST).astimezone(dt.timezone.utc)  # noqa: UP017 - CI also exercises Python 3.9


def quote(symbol, now, price=10000, volume=123456):
    return {
        "symbol": symbol,
        "price_paise": price,
        "cumulative_volume": volume,
        "source": "TEST_ONLY_PROVIDER",
        "observed_at": to_iso(now),
        "exchange_open": True,
    }


class CloudPaperTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.tmp.name) / "state.sqlite")
        self.e = CloudPaperEngine(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def schedule(self, now=None, qty=5, key="client1234567890", side="BUY", symbol="INFY"):
        now = now or clock(10, 0)
        return self.e.schedule(
            {
                "symbol": symbol,
                "side": side,
                "quantity": qty,
                "scheduled_at": to_iso(now + dt.timedelta(seconds=5)),
                "idempotency_key": key,
            },
            now,
        )

    def test_fill_and_restart_persists(self):
        now = clock(10, 0)
        order = self.schedule(now)
        self.e.ingest(
            {"quotes": [quote("INFY", now + dt.timedelta(seconds=5))]},
            now + dt.timedelta(seconds=5),
        )
        CloudPaperEngine(self.path).tick(now + dt.timedelta(seconds=5))
        state = CloudPaperEngine(self.path).overview(now + dt.timedelta(seconds=5))
        self.assertEqual(state["orders"][0]["status"], "FILLED")
        self.assertEqual(state["positions"], [{"symbol": "INFY", "qty": 5}])
        self.assertEqual(state["cash_paise"], 100_000_00 - 5 * 10005 - 51)
        self.assertEqual(order["kind"], "MANUAL")

    def test_idempotency_replay_and_conflict(self):
        first = self.schedule()
        second = self.schedule()
        self.assertEqual(first["id"], second["id"])
        with self.assertRaises(OrderError):
            self.schedule(qty=6)

    def test_late_does_not_backfill(self):
        self.schedule()
        self.e.tick(clock(10, 1))
        self.assertEqual(self.e.overview()["orders"][0]["reason"], "SCHEDULER_LATE_NO_BACKFILL")

    def test_stale_quote_skips(self):
        self.schedule()
        self.e.ingest({"quotes": [quote("INFY", clock(10, 0))]}, clock(10, 0))
        self.e.tick(clock(10, 0, 20))
        self.assertEqual(self.e.overview()["orders"][0]["reason"], "MISSING_OR_STALE_MARKET_QUOTE")

    def test_no_quote_skips_without_invented_fill(self):
        self.schedule()
        self.e.tick(clock(10, 0, 5))
        self.assertIsNone(self.e.overview()["orders"][0]["fill_paise"])

    def test_budget_never_negative(self):
        now = clock(10, 0)
        self.schedule(now, qty=100000)
        self.e.ingest({"quotes": [quote("INFY", now)]}, now)
        self.e.tick(now + dt.timedelta(seconds=5))
        state = self.e.overview()
        self.assertEqual(state["cash_paise"], 100_000_00)
        self.assertEqual(state["orders"][0]["reason"], "INSUFFICIENT_VIRTUAL_CASH")

    def test_sell_requires_holdings(self):
        now = clock(10, 0)
        self.schedule(now, key="sellclient12345", side="SELL")
        self.e.ingest({"quotes": [quote("INFY", now)]}, now)
        self.e.tick(now + dt.timedelta(seconds=5))
        self.assertEqual(self.e.overview()["orders"][0]["reason"], "INSUFFICIENT_VIRTUAL_HOLDINGS")

    def test_cancel_atomic_and_no_fill(self):
        a = self.schedule()
        self.e.cancel(a["id"])
        self.e.tick(clock(10, 0, 5))
        self.assertEqual(self.e.overview()["orders"][0]["status"], "CANCELLED")
        with self.assertRaises(OrderError):
            self.e.cancel(a["id"])

    def test_duplicate_tick_no_double_fill(self):
        now = clock(10, 0)
        self.schedule(now)
        self.e.ingest({"quotes": [quote("INFY", now)]}, now)
        self.e.tick(now + dt.timedelta(seconds=5))
        self.e.tick(now + dt.timedelta(seconds=5))
        self.assertEqual(self.e.overview()["positions"][0]["qty"], 5)

    def test_unverified_coverage_never_triggers_strategy(self):
        now = clock(9, 40)
        self.e.set_strategy(True, now)
        self.e.ingest({"quotes": [quote("INFY", now)]}, now)
        self.e.tick(now)
        self.assertEqual(self.e.overview(now)["orders"], [])

    def test_full_coverage_entry_and_exit(self):
        enter = clock(9, 40)
        self.e.set_strategy(True, enter)
        symbols = [f"ST{i:04d}" for i in range(500)]
        # Strict stock-symbol filter: only uppercase letters and digits.
        qs = [quote(s, enter, price=10000, volume=100000 + i) for i, s in enumerate(symbols)]
        self.e.ingest(
            {
                "quotes": qs,
                "coverage": {"complete": True, "eligible_count": 500, "nifty_change_bps": 40},
            },
            enter,
        )
        self.e.tick(enter)
        state = self.e.overview(enter)
        self.assertEqual(len([x for x in state["orders"] if x["status"] == "FILLED"]), 10)
        self.assertEqual(len(state["positions"]), 10)
        self.e.tick(enter)
        self.assertEqual(len(self.e.overview(enter)["orders"]), 10)
        exit_at = clock(15, 15)
        self.e.ingest(
            {"quotes": [quote(p["symbol"], exit_at) for p in state["positions"]]}, exit_at
        )
        self.e.tick(exit_at)
        result = self.e.overview(exit_at)
        self.assertEqual(result["positions"], [])
        self.assertEqual(len([x for x in result["orders"] if x["status"] == "FILLED"]), 20)

    def test_negative_nifty_opens_short_and_exits(self):
        enter = clock(9, 40)
        self.e.set_strategy(True, enter)
        qs = [quote(f"ST{i:04d}", enter, volume=10**6 + i) for i in range(500)]
        self.e.ingest(
            {
                "quotes": qs,
                "coverage": {"complete": True, "eligible_count": 500, "nifty_change_bps": -30},
            },
            enter,
        )
        self.e.tick(enter)
        state = self.e.overview(enter)
        self.assertEqual(len(state["positions"]), 10)
        self.assertTrue(all(p["qty"] < 0 for p in state["positions"]))
        close = clock(15, 15)
        self.e.ingest({"quotes": [quote(p["symbol"], close) for p in state["positions"]]}, close)
        self.e.tick(close)
        self.assertEqual(self.e.overview(close)["positions"], [])

    def test_two_percent_stop_closes_long(self):
        enter = clock(9, 40)
        self.e.set_strategy(True, enter)
        qs = [quote(f"ST{i:04d}", enter, volume=10**6 + i) for i in range(500)]
        self.e.ingest(
            {
                "quotes": qs,
                "coverage": {"complete": True, "eligible_count": 500, "nifty_change_bps": 30},
            },
            enter,
        )
        self.e.tick(enter)
        symbol = self.e.overview(enter)["positions"][0]["symbol"]
        later = clock(9, 41)
        self.e.ingest({"quotes": [quote(symbol, later, price=9700)]}, later)
        self.e.tick(later)
        self.assertNotIn(symbol, [p["symbol"] for p in self.e.overview(later)["positions"]])
        self.assertTrue(any(o["kind"] == "STOP" for o in self.e.overview(later)["orders"]))

    def test_neutral_signal_does_not_trade(self):
        enter = clock(9, 40)
        self.e.set_strategy(True, enter)
        qs = [quote(f"ST{i:04d}", enter, volume=10**6 + i) for i in range(500)]
        self.e.ingest(
            {
                "quotes": qs,
                "coverage": {"complete": True, "eligible_count": 500, "nifty_change_bps": 0},
            },
            enter,
        )
        self.e.tick(enter)
        self.assertEqual(self.e.overview(enter)["orders"], [])

    def test_unverified_signal_records_missed_entry_after_window(self):
        now = clock(9, 40)
        self.e.set_strategy(True, now)
        self.e.tick(now)
        self.e.tick(clock(9, 41))
        self.assertEqual(self.e.overview(clock(9, 41))["last_strategy_phase"]["status"], "SKIPPED")
        self.assertEqual(self.e.overview(clock(9, 41))["orders"], [])

    def test_unavailable_exit_records_open_risk_and_blocks_next_entry(self):
        enter = clock(9, 40)
        self.e.set_strategy(True, enter)
        qs = [quote(f"ST{i:04d}", enter, volume=10**6 + i) for i in range(500)]
        self.e.ingest(
            {
                "quotes": qs,
                "coverage": {"complete": True, "eligible_count": 500, "nifty_change_bps": 30},
            },
            enter,
        )
        self.e.tick(enter)
        self.e.tick(clock(15, 16))  # No authentic exit prices are available.
        state = self.e.overview(clock(15, 16))
        self.assertEqual(state["last_strategy_phase"]["status"], "PARTIAL")
        self.assertEqual(len(state["positions"]), 10)

    def test_weekend_rejected(self):
        with self.assertRaises(OrderError):
            self.schedule(clock(10, 0, day=31))

    def test_bad_quotes_and_credentials_safe_by_design(self):
        with self.assertRaises(OrderError):
            self.e.ingest({"quotes": [quote("INFY", clock(10, 0))]}, clock(10, 1))
        self.assertEqual(self.e.overview()["positions"], [])


if __name__ == "__main__":
    unittest.main()
