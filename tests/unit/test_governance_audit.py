import tempfile
import unittest
from pathlib import Path

from atlas.governance.audit import scan_tree


class GovernanceAuditTests(unittest.TestCase):
    def test_clean_atlas_source_has_no_unisolated_authority_or_secret_literals(self):
        findings = scan_tree(Path("src/atlas"))
        self.assertEqual(findings, ())

    def test_audit_detects_suspicious_network_and_secret(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.py"
            p.write_text("requests.post('x')\nUPSTOX_ACCESS_TOKEN=\"secret\"\n")
            codes = {f.code for f in scan_tree(Path(d))}
            self.assertEqual(codes, {"NETWORK_AUTHORITY", "SECRET_LITERAL"})


if __name__ == "__main__":
    unittest.main()
