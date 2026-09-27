import unittest
from decimal import Decimal

from atlas.paper import PaperConfig, PaperRuntime


class PaperRuntimeTests(unittest.TestCase):
    def test_disabled_by_default(self):
        with self.assertRaises(RuntimeError):
            PaperRuntime().simulate(
                cash=Decimal("10000"),
                prices={"SPY": Decimal("100")},
                targets={"SPY": Decimal("0.5")},
                fill_prices={"SPY": Decimal("101")},
                valuation_prices={"SPY": Decimal("102")},
            )

    def test_enabled_paper_path_still_requires_risk(self):
        rt = PaperRuntime(PaperConfig(enabled=True))
        result = rt.simulate(
            cash=Decimal("10000"),
            prices={"SPY": Decimal("100")},
            targets={"SPY": Decimal("0.2")},
            fill_prices={"SPY": Decimal("101")},
            valuation_prices={"SPY": Decimal("102")},
        )
        self.assertGreaterEqual(result.ending_cash, Decimal("0"))
        with self.assertRaises(RuntimeError):
            rt.simulate(
                cash=Decimal("10000"),
                prices={"SPY": Decimal("100")},
                targets={"SPY": Decimal("0.2")},
                fill_prices={"SPY": Decimal("101")},
                valuation_prices={"SPY": Decimal("102")},
                kill_switch=True,
            )


if __name__ == "__main__":
    unittest.main()
