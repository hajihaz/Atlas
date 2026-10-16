"""Real LEAN golden evidence must cover never-filled stop-market cancellation."""

from pathlib import Path

from scripts.lean_golden_certify import FIXTURES


def test_stop_market_cancellation_fixture_and_verification_contract() -> None:
    expected = FIXTURES["AtlasStopCancelFixtureAlgorithm"]
    assert expected["Total Orders"] == "1"
    assert expected["End Equity"] == "100000"
    assert expected["Total Fees"] == "$0.00"
    assert expected["Portfolio Turnover"] == "0%"
    source = Path("scripts/lean-fixtures/AtlasStopCancelFixtureAlgorithm.cs").read_text()
    assert "StopMarketOrder(" in source
    assert ".Cancel(" in source
    assert "999999m" in source
    runner = Path("scripts/lean_golden_certify.py").read_text()
    assert 'if name == "AtlasStopCancelFixtureAlgorithm":' in runner
    assert '("submitted", "cancelPending", "canceled")' in runner
