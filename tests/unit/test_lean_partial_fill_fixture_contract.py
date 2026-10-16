from pathlib import Path

from scripts.lean_golden_certify import FIXTURES


def test_actual_lean_partial_fill_fixture_must_verify_three_observed_fills():
    expected = FIXTURES["AtlasPartialFillFixtureAlgorithm"]
    assert expected["Total Orders"] == "1"
    assert expected["Total Fees"] == "$1.00"
    script = Path("scripts/lean_golden_certify.py").read_text()
    assert '"partiallyFilled", "partiallyFilled", "filled"' in script
    assert "quantities != [0.0, 4.0, 4.0, 4.0]" in script
    source = Path("scripts/lean-fixtures/AtlasPartialFillFixtureAlgorithm.cs").read_text()
    assert "MarketOnOpenFill(" in source
    assert "OrderStatus.PartiallyFilled" in source
