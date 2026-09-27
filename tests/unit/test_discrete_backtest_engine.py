import datetime as dt
import unittest
from decimal import Decimal

from atlas.backtest import CostModel, run_backtest
from atlas.data.market.records import OHLCVBar
from atlas.execution.simulator import ExecutionConfig
from atlas.market import MarketDataStatus
from atlas.research.dataview import InMemoryBarSource
from atlas.research.synthetic import sessions, unbounded_calendar
from atlas.risk import RiskGate, RiskLimits
from atlas.strategy import Strategy, StrategySpec


class FixedWeight(Strategy):
    def __init__(self, weight=0.625):
        super().__init__(StrategySpec("fixed_weight", "1"))
        self.weight = weight

    def target_weights(self, view):
        return {"SPY": self.weight}


class DiscreteBacktestEngineTests(unittest.TestCase):
    def setUp(self):
        self.cal = unbounded_calendar()
        self.dates = sessions(self.cal, dt.date(2024, 1, 2), dt.date(2024, 1, 5))
        self.src = InMemoryBarSource(
            {
                "SPY": [
                    OHLCVBar(
                        "SPY",
                        self.dates[0],
                        Decimal("100"),
                        Decimal("101"),
                        Decimal("99"),
                        Decimal("100"),
                        100,
                        "test",
                    ),
                    OHLCVBar(
                        "SPY",
                        self.dates[1],
                        Decimal("110"),
                        Decimal("112"),
                        Decimal("109"),
                        Decimal("111"),
                        100,
                        "test",
                    ),
                    OHLCVBar(
                        "SPY",
                        self.dates[2],
                        Decimal("120"),
                        Decimal("121"),
                        Decimal("119"),
                        Decimal("120"),
                        100,
                        "test",
                    ),
                    OHLCVBar(
                        "SPY",
                        self.dates[3],
                        Decimal("130"),
                        Decimal("131"),
                        Decimal("129"),
                        Decimal("130"),
                        100,
                        "test",
                    ),
                ]
            }
        )

    def test_discrete_mode_is_explicit_and_uses_next_open_then_next_close(self):
        result = run_backtest(
            FixedWeight(),
            self.src,
            start=self.dates[1],
            end=self.dates[3],
            calendar=self.cal,
            execution_mode="discrete",
            execution_config=ExecutionConfig(fee_bps_per_side=Decimal("0")),
            cost_model=CostModel(999),
        )
        self.assertEqual(result.meta["execution_mode"], "discrete")
        self.assertTrue(result.execution_ledger)
        self.assertEqual(result.execution_ledger[0].event.event_type, "decision")
        self.assertIsNotNone(result.execution_ledger[-1].event)
        prev = result.execution_ledger[0].prev_hash
        self.assertTrue(prev)
        for entry in result.execution_ledger:
            self.assertTrue(entry.chain_hash)
        self.assertEqual(len(result.dates), 2)
        # First decision sizes from the 111 close, fills at 120 open, then marks at 120 close.
        self.assertAlmostEqual(result.equity[0], 1.0, places=12)
        self.assertGreater(result.equity[1], result.equity[0])
        # The reference cost model is intentionally not used in discrete mode.
        self.assertEqual(result.net_returns[0], result.gross_returns[0])

    def test_reference_mode_remains_default_and_uses_continuous_costs(self):
        explicit = run_backtest(
            FixedWeight(), self.src, start=self.dates[1], end=self.dates[3], calendar=self.cal
        )
        default = run_backtest(
            FixedWeight(), self.src, start=self.dates[1], end=self.dates[3], calendar=self.cal
        )
        self.assertEqual(explicit.result_hash(), default.result_hash())
        self.assertEqual(explicit.meta["execution_mode"], "reference")
        self.assertLess(explicit.net_returns[0], explicit.gross_returns[0])

    def test_risk_gate_is_enforced_when_supplied(self):
        result = run_backtest(
            FixedWeight(0.625),
            self.src,
            start=self.dates[1],
            end=self.dates[3],
            calendar=self.cal,
            execution_mode="discrete",
            risk_gate=RiskGate(
                RiskLimits(max_gross=Decimal("1"), max_single_weight=Decimal("0.25"))
            ),
            execution_config=ExecutionConfig(fee_bps_per_side=Decimal("0")),
        )
        self.assertEqual(result.meta["risk_gate"], True)
        self.assertLessEqual(
            result.execution_ledger[0].event.metadata["target_weights"]["SPY"], Decimal("0.25")
        )

    def test_market_data_gate_is_enforced_when_supplied(self):
        now = dt.datetime(2024, 1, 3, tzinfo=dt.UTC)
        result = run_backtest(
            FixedWeight(),
            self.src,
            start=self.dates[1],
            end=self.dates[3],
            calendar=self.cal,
            market_data_status=MarketDataStatus("snap", now, now, dt.timedelta(minutes=1)),
        )
        self.assertTrue(result.meta["market_data_gate"])
        with self.assertRaises(ValueError):
            run_backtest(
                FixedWeight(),
                self.src,
                start=self.dates[1],
                end=self.dates[3],
                calendar=self.cal,
                market_data_status=MarketDataStatus(
                    "snap", now, now + dt.timedelta(seconds=1), dt.timedelta(minutes=1)
                ),
            )

    def test_discrete_mode_is_reproducible(self):
        kw = dict(
            start=self.dates[1],
            end=self.dates[3],
            calendar=self.cal,
            execution_mode="discrete",
            execution_config=ExecutionConfig(fee_bps_per_side=Decimal("1")),
        )
        a = run_backtest(FixedWeight(), self.src, **kw)
        b = run_backtest(FixedWeight(), self.src, **kw)
        self.assertEqual(a.result_hash(), b.result_hash())


if __name__ == "__main__":
    unittest.main()
