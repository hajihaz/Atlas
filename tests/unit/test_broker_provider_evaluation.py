import unittest
from pathlib import Path


class BrokerProviderEvaluationTests(unittest.TestCase):
    def test_evaluation_keeps_production_selection_open(self):
        text = Path("docs/adr/0035-broker-paper-provider-evaluation.md").read_text()
        self.assertIn("Upstox Sandbox", text)
        self.assertIn("DhanHQ remains a production candidate", text)
        self.assertIn("does not authorize live trading", text)

    def test_next_step_is_sandbox_only(self):
        text = Path("docs/adr/0035-broker-paper-provider-evaluation.md").read_text()
        self.assertIn("sandbox-only Upstox adapter", text)
        self.assertIn("reject non-sandbox configuration", text)
        self.assertIn("credentials outside source control", text)


if __name__ == "__main__":
    unittest.main()
