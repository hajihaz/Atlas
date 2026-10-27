import copy
import tempfile
import unittest
from pathlib import Path

from atlas.paper.scalpstorm_owner import (
    OwnerStore,
    advance,
    equity,
    iso,
    millis,
    new_state,
    nifty_decision,
    period_summaries,
    rank_volume,
)

DAY = "2026-10-27"


def at(clock):
    return millis(DAY + "T" + clock + "+05:30")


def quote(i, clock="09:40:01", price=100):
    return {
        "instrumentKey": f"NSE_EQ|INE{i:09d}",
        "symbol": f"STOCK{i:03d}",
        "volume": 10000 - i,
        "lastPrice": price,
        "priceUnit": "INR",
        "lastTradeAt": iso(at(clock)),
        "quoteTimestamp": iso(at(clock)),
        "depth": {
            "buy": {"price": price - 0.01, "quantity": 100000},
            "sell": {"price": price + 0.01, "quantity": 100000},
        },
    }


def payload(clock="09:40:00", change=0.3):
    rows = [quote(i, "09:39:49") for i in range(100)]
    return {
        "schema": "atlas.scalpstorm-owner-input.v1",
        "source": "Upstox Analytics",
        "dataClass": "BROKER_API_OBSERVATION",
        "realOrdersEnabled": False,
        "observedAt": iso(at(clock)),
        "market": {"exchange": "NSE", "status": "NORMAL_OPEN", "marketOpen": True},
        "marketObservedAt": iso(at(clock)),
        "quotes": [quote(i) for i in range(10)],
        "ranking": {
            "observedAt": iso(at("09:39:50")),
            "startedAt": iso(at("09:39:45")),
            "complete": True,
            "eligibleCount": 100,
            "universeHash": "a" * 64,
            "rows": rows,
        },
        "niftySignal": {
            "observedAt": iso(at("09:30:01")),
            "quoteTimestamp": iso(at("09:30:00")),
            "lastPrice": 100 + change,
            "previousClose": 100,
        },
    }


def entered(change=0.3):
    s, _ = advance(new_state(at("09:15:00")), payload(change=change), at("09:40:00"))
    p = payload("09:40:02", change)
    return advance(s, p, at("09:40:02"))


class OwnerStrategyTests(unittest.TestCase):
    def test_original_thresholds_and_boundary(self):
        for value, side in [
            (0.21, "BUY"),
            (0.2, "BUY"),
            (0, "BUY"),
            (-0.2, "BUY"),
            (-0.21, "SELL"),
        ]:
            p = payload(change=value)
            self.assertEqual(nifty_decision(p["niftySignal"], DAY, at("09:40:00"))["side"], side)

    def test_no_entry_before_0940(self):
        p = payload("09:39:59")
        s, e = advance(new_state(at("09:15:00")), p, at("09:39:59"))
        self.assertEqual(e, [])
        self.assertEqual(s["fills"], 0)

    def test_decision_requires_later_trade(self):
        s, e = advance(new_state(at("09:15:00")), payload(), at("09:40:00"))
        self.assertEqual(s["fills"], 0)
        self.assertEqual(e[0]["type"], "DECISION")

    def test_ten_long_slots_and_costs(self):
        s, _events = entered()
        self.assertEqual(len(s["positions"]), 10)
        self.assertEqual(s["fills"], 10)
        self.assertLess(equity(s), 10_000_000)
        self.assertTrue(all(p["entryCostPaise"] <= 1_000_000 for p in s["positions"].values()))
        self.assertGreaterEqual(s["cashPaise"], 0)

    def test_short_proceeds_are_not_available_cash(self):
        s, _events = entered(-0.3)
        self.assertEqual(len(s["positions"]), 10)
        self.assertEqual(s["cashPaise"], 0)
        self.assertTrue(
            all(
                p["side"] == "SELL" and p["collateralPaise"] == 1_000_000
                for p in s["positions"].values()
            )
        )
        self.assertLess(equity(s), 10_000_000)

    def test_exit_at_1515_realizes_short_loss(self):
        s, _ = entered(-0.3)
        p = payload("15:15:02", -0.3)
        p["quotes"] = [quote(i, "15:15:01", 102) for i in range(10)]
        s, e = advance(s, p, at("15:15:02"))
        self.assertEqual(len(e), 10)
        self.assertFalse(s["positions"])
        self.assertLess(s["realizedPaise"], 0)
        self.assertLess(s["cashPaise"], 10_000_000)

    def test_exit_not_early(self):
        s, _ = entered()
        p = payload("15:14:59")
        p["quotes"] = [quote(i, "15:14:58") for i in range(10)]
        s, e = advance(s, p, at("15:14:59"))
        self.assertEqual(len(s["positions"]), 10)
        self.assertEqual(e, [])

    def test_stale_exit_does_not_invent_liquidation(self):
        s, _ = entered()
        s, e = advance(s, payload("15:15:02"), at("15:15:02"))
        self.assertEqual(len(s["positions"]), 10)
        self.assertEqual(e, [])

    def test_no_duplicate_entries(self):
        s, _ = entered()
        p = payload("09:40:04")
        p["quotes"] = [quote(i, "09:40:03") for i in range(10)]
        s, e = advance(s, p, at("09:40:04"))
        self.assertEqual(s["fills"], 10)
        self.assertEqual(e, [])

    def test_missing_ranking_is_explicit_no_trade(self):
        p = payload()
        p["ranking"]["complete"] = False
        s, _events = advance(new_state(at("09:15:00")), p, at("09:40:00"))
        self.assertEqual(s["status"], "NO_TRADE")
        self.assertEqual(s["fills"], 0)

    def test_full_day_future_volume_rejected(self):
        p = payload()
        p["ranking"]["rows"][0]["quoteTimestamp"] = iso(at("15:00:00"))
        with self.assertRaises(ValueError):
            rank_volume(p["ranking"], DAY, at("09:40:00"))

    def test_previous_session_volume_is_excluded(self):
        p = payload()
        p["ranking"]["rows"][0]["lastTradeAt"] = "2026-10-26T09:39:00+05:30"
        rows = rank_volume(p["ranking"], DAY, at("09:40:00"))
        self.assertEqual(rows[0]["symbol"], "STOCK001")

    def test_period_returns_only_include_completed_sessions(self):
        s, _ = entered()
        self.assertEqual(period_summaries(s["days"], 7), [])
        p = payload("15:15:02")
        p["quotes"] = [quote(i, "15:15:01", 102) for i in range(10)]
        s, _ = advance(s, p, at("15:15:02"))
        month = period_summaries(s["days"], 7)[0]
        self.assertEqual(month["period"], "2026-10")
        self.assertEqual(month["netPnlINR"], (s["cashPaise"] - 10_000_000) / 100)
        self.assertEqual(month["fills"], 20)

    def test_closed_source_can_remain_visible_between_observations(self):
        p = payload("08:00:00")
        p["market"] = {"exchange": "NSE", "status": "CLOSING_END", "marketOpen": False}
        s, events = advance(new_state(at("07:59:00")), p, at("08:01:00"))
        self.assertEqual(s["status"], "MARKET_CLOSED")
        self.assertEqual(events, [])

    def test_changed_engine_identity_cannot_reset_or_reuse_account(self):
        state = new_state(at("09:15:00"))
        state["engineFingerprint"] = "obsolete"
        with self.assertRaises(ValueError):
            advance(state, payload(), at("09:40:00"))

    def test_historical_next_open_cannot_be_used_in_forward_account(self):
        p = payload("09:40:02")
        p["quotes"] = [
            {k: v for k, v in quote(i).items() if k != "depth"}
            | {"executionModel": "NEXT_MINUTE_OPEN", "previousMinuteVolume": 100000}
            for i in range(10)
        ]
        s, _ = advance(new_state(at("09:15:00")), payload(), at("09:40:00"))
        s, _ = advance(s, p, at("09:40:02"))
        self.assertEqual(s["fills"], 0)

    def test_historical_model_uses_next_open_and_previous_volume_without_fake_book(self):
        p = payload()
        p["dataClass"] = "HISTORICAL_CANDLE_SIMULATION"
        p["quotes"] = []
        s, _ = advance(new_state(at("09:15:00"), "HISTORICAL_REPLAY"), p, at("09:40:00"))
        p = payload("09:41:00")
        p["dataClass"] = "HISTORICAL_CANDLE_SIMULATION"
        p["quotes"] = [
            {k: v for k, v in quote(i, "09:41:00").items() if k != "depth"}
            | {"executionModel": "NEXT_MINUTE_OPEN", "previousMinuteVolume": 5000}
            for i in range(10)
        ]
        s, events = advance(s, p, at("09:41:00"))
        self.assertEqual(len(events), 10)
        self.assertTrue(all(position["quantity"] <= 50 for position in s["positions"].values()))
        self.assertTrue(all(event["sourceTradeAt"] > event["signalAt"] for event in events))

    def test_duplicate_universe_and_subset_rejected(self):
        p = payload()
        p["ranking"]["rows"][1] = copy.deepcopy(p["ranking"]["rows"][0])
        with self.assertRaises(ValueError):
            rank_volume(p["ranking"], DAY, at("09:40:00"))
        p = payload()
        p["ranking"]["rows"] = p["ranking"]["rows"][:10]
        with self.assertRaises(ValueError):
            rank_volume(p["ranking"], DAY, at("09:40:00"))

    def test_late_start_does_not_reconstruct_morning(self):
        p = payload("10:40:00")
        s, _events = advance(new_state(at("10:39:00")), p, at("10:40:00"))
        self.assertEqual(s["fills"], 0)
        self.assertEqual(s["days"][DAY]["decision"]["action"], "NO_TRADE")

    def test_nifty_late_signal_rejected(self):
        p = payload()
        p["niftySignal"]["observedAt"] = iso(at("09:31:00"))
        with self.assertRaises(ValueError):
            nifty_decision(p["niftySignal"], DAY, at("09:40:00"))

    def test_journal_reopen_and_corruption(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "owner.sqlite3"
            store = OwnerStore(path, at("09:15:00"))
            store.advance(payload(), at("09:40:00"))
            store.advance(payload("09:40:02"), at("09:40:02"))
            store.close()
            store = OwnerStore(path, at("09:40:04"))
            self.assertEqual(store.report(at("09:40:04"))["fills"], 10)
            store.db.execute("UPDATE owner_events SET hash='corrupt' WHERE seq=1")
            store.db.commit()
            with self.assertRaises(ValueError):
                store.verify()
            store.close()

    def test_synthetic_input_is_not_forward(self):
        p = payload()
        p["dataClass"] = "SYNTHETIC_FIXTURE"
        with self.assertRaises(ValueError):
            advance(new_state(at("09:15:00")), p, at("09:40:00"))


if __name__ == "__main__":
    unittest.main()
