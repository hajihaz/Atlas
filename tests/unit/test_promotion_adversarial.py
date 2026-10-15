import unittest

from atlas.research.gates import GateVerdict
from atlas.research.promotion import PaperEvidence, evaluate_paper_promotion


class PromotionAdversarialTests(unittest.TestCase):
    def test_clean_paper_cannot_override_failed_research(self):
        research = GateVerdict(False, {}, ("failed",))
        paper = PaperEvidence(100, "result", "ledger", True)
        self.assertFalse(evaluate_paper_promotion(research, paper).passed)

    def test_runtime_error_or_reconciliation_failure_blocks(self):
        research = GateVerdict(True, {}, ())
        for paper in (
            PaperEvidence(100, "result", "ledger", False),
            PaperEvidence(100, "result", "ledger", True, runtime_errors=1),
        ):
            self.assertFalse(evaluate_paper_promotion(research, paper).passed)


def test_risk_rejection_blocks_strategy_promotion() -> None:
    research = GateVerdict(True, {}, ())
    paper = PaperEvidence(30, "result", "ledger", True, risk_rejections=1)
    verdict = evaluate_paper_promotion(research, paper)
    assert not verdict.passed
    assert "no_risk_rejections" in verdict.checks


def test_synthetic_or_historical_sessions_never_qualify_for_market_paper_promotion() -> None:
    research = GateVerdict(True, {}, ())
    historical = PaperEvidence(
        30, "research", "ledger", True, market_source_type="historical_lean_fixture"
    )
    assert not evaluate_paper_promotion(research, historical).passed
    verdict = evaluate_paper_promotion(
        research,
        PaperEvidence(
            30,
            "research",
            "ledger",
            True,
            market_source_type="recorded_external_paper",
        ),
    )
    assert not verdict.passed
    assert not verdict.checks["recorded_external_market_paper"]
