import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from atlas.operations import StateStore
from atlas.paper.runtime import PaperConfig, PaperRuntime
from atlas.paper.session import PaperSessionRunner


class PaperSessionTests(unittest.TestCase):
    def test_successful_cycle_is_checkpointed(self):
        with tempfile.TemporaryDirectory() as d:
            runtime = PaperRuntime(PaperConfig(enabled=True))
            runner = PaperSessionRunner(runtime, StateStore(Path(d) / "state.json"))
            result = runner.run_cycle(
                session_id="s1",
                cash=Decimal("100000"),
                prices={"X": Decimal("100")},
                targets={"X": Decimal("0.2")},
                fill_prices={"X": Decimal("100")},
                valuation_prices={"X": Decimal("101")},
            )
            self.assertTrue(result.completed)
            self.assertEqual(runner.recover_checkpoint().status, "completed")
            self.assertEqual(runner.recover_checkpoint().checkpoint, result.checkpoint)

    def test_failed_cycle_leaves_running_checkpoint(self):
        with tempfile.TemporaryDirectory() as d:
            runtime = PaperRuntime(PaperConfig(enabled=True))
            runner = PaperSessionRunner(runtime, StateStore(Path(d) / "state.json"))
            with self.assertRaises(RuntimeError):
                runner.run_cycle(
                    session_id="s2",
                    cash=Decimal("100000"),
                    prices={"X": Decimal("100")},
                    targets={"X": Decimal("0.2")},
                    fill_prices={"X": Decimal("100")},
                    valuation_prices={"X": Decimal("101")},
                    kill_switch=True,
                )
            self.assertEqual(runner.recover_checkpoint().status, "running")


if __name__ == "__main__":
    unittest.main()
