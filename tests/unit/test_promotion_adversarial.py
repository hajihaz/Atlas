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
