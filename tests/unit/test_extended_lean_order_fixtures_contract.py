"""Source-backed contracts for two new executable LEAN golden fixtures."""

from pathlib import Path

from scripts.lean_golden_certify import FIXTURES


def test_limit_replacement_golden_contract_checks_actual_price_transition() -> None:
    assert FIXTURES["AtlasLimitReplaceFixtureAlgorithm"]["Total Orders"] == "1"
    code = Path("scripts/lean-fixtures/AtlasLimitReplaceFixtureAlgorithm.cs").read_text()
    assert "LimitOrder(" in code and "UpdateOrderFields" in code
    assert "LimitPrice = 0.02m" in code
    runner = Path("scripts/lean_golden_certify.py").read_text()
    assert 'prices != (0.01, 0.02, 0.02, 0.02)' in runner
    assert '("submitted", "updateSubmitted", "cancelPending", "canceled")' in runner


def test_partial_then_cancel_golden_contract_checks_no_phantom_remaining_fill() -> None:
    assert FIXTURES["AtlasPartialCancelFixtureAlgorithm"]["Total Orders"] == "1"
    code = Path("scripts/lean-fixtures/AtlasPartialCancelFixtureAlgorithm.cs").read_text()
    assert "OrderStatus.PartiallyFilled" in code
    assert 'Cancel("ATLAS cancel unfilled remainder")' in code
    runner = Path("scripts/lean_golden_certify.py").read_text()
    assert 'fills != (0.0, 4.0, 0.0, 0.0)' in runner
    assert '("submitted", "partiallyFilled", "cancelPending", "canceled")' in runner
