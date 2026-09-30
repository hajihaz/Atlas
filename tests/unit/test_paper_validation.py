import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from atlas.operations import StateStore
from atlas.paper.runtime import PaperConfig, PaperRuntime
from atlas.paper.session import PaperSessionRunner
from atlas.paper.validation import run_sessions


class PaperValidationTests(unittest.TestCase):
    def test_multiple_sessions_accumulate_deterministically(self):
        def run():
            with tempfile.TemporaryDirectory() as d:
                r = PaperSessionRunner(
                    PaperRuntime(PaperConfig(enabled=True)), StateStore(Path(d) / "s.json")
                )
                base = {
                    "cash": Decimal("100000"),
                    "prices": {"X": Decimal("100")},
                    "targets": {"X": Decimal("0.1")},
                    "fill_prices": {"X": Decimal("100")},
                    "valuation_prices": {"X": Decimal("101")},
                }
                return run_sessions(r, [dict(base, session_id=f"s{i}") for i in range(3)])

        a, b = run(), run()
        self.assertEqual(a.sessions_completed, 3)
        self.assertEqual(a.ledger_head, b.ledger_head)
        self.assertTrue(a.clean_reconciliations)

    def test_failed_session_is_counted_and_checkpointed(self):
        with tempfile.TemporaryDirectory() as d:
            r = PaperSessionRunner(
                PaperRuntime(PaperConfig(enabled=True)), StateStore(Path(d) / "s.json")
            )
            out = run_sessions(
                r,
                [
                    {
                        "session_id": "bad",
                        "cash": Decimal("100000"),
                        "prices": {"X": Decimal("100")},
                        "targets": {"X": Decimal("0.1")},
                        "fill_prices": {"X": Decimal("100")},
                        "valuation_prices": {"X": Decimal("101")},
                        "kill_switch": True,
                    }
                ],
            )
            self.assertEqual(out.runtime_errors, 1)
            self.assertFalse(out.clean_reconciliations)
            self.assertEqual(r.recover_checkpoint().status, "running")


if __name__ == "__main__":
    unittest.main()


def test_thirty_session_durability_campaign_is_deterministic(tmp_path) -> None:
    def campaign(path):
        runner = PaperSessionRunner(PaperRuntime(PaperConfig(enabled=True)), StateStore(path))
        base = {
            "cash": Decimal("100000"), "prices": {"X": Decimal("100")},
            "targets": {"X": Decimal("0.1")}, "fill_prices": {"X": Decimal("100")},
            "valuation_prices": {"X": Decimal("101")},
        }
        return run_sessions(runner, [dict(base, session_id=f"market-{i:02d}") for i in range(30)])
    first = campaign(tmp_path / "a.json")
    second = campaign(tmp_path / "b.json")
    assert first.sessions_completed == second.sessions_completed == 30
    assert first.runtime_errors == second.runtime_errors == 0
    assert first.clean_reconciliations and second.clean_reconciliations
    assert first.ledger_head == second.ledger_head
