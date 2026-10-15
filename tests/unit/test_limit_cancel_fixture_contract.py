from pathlib import Path

from scripts.lean_golden_certify import FIXTURES


def test_actual_lean_fixture_contract_includes_unfilled_limit_cancellation():
    expected = FIXTURES["AtlasLimitCancelFixtureAlgorithm"]
    assert expected["Total Orders"] == "1"
    assert expected["Total Fees"] == "$0.00"
    assert expected["Portfolio Turnover"] == "0%"
    script = Path("scripts/lean_golden_certify.py").read_text()
    assert 'status_chain != ("submitted", "cancelPending", "canceled")' in script
    source = Path("scripts/lean-fixtures/AtlasLimitCancelFixtureAlgorithm.cs").read_text()
    assert "LimitOrder(" in source
    assert ".Cancel(" in source
