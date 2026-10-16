from decimal import Decimal

import pytest

from atlas.paper.runtime import PaperConfig, PaperRuntime
from atlas.risk.gate import RiskGate, RiskLimits


def test_paper_runtime_refuses_turnover_change_without_mutating_prior_state():
    risk = RiskGate(RiskLimits(max_turnover=Decimal("0.5")))
    rt = PaperRuntime(PaperConfig(enabled=True), risk)
    rt.simulate(
        cash=Decimal("10000"),
        prices={"A": Decimal("100")},
        targets={"A": Decimal("0.2")},
        fill_prices={"A": Decimal("100")},
        valuation_prices={"A": Decimal("100")},
        session_id="first",
    )
    assert rt.account is not None
    before = rt.snapshot("first")
    with pytest.raises(RuntimeError, match="turnover_limit"):
        rt.simulate(
            cash=Decimal("10000"),
            prices={"A": Decimal("100")},
            targets={"A": Decimal("0.9")},
            fill_prices={"A": Decimal("100")},
            valuation_prices={"A": Decimal("100")},
            session_id="second",
        )
    assert rt.snapshot("first") == before


def test_paper_runtime_tracks_peak_and_blocks_large_drawdown_without_new_orders():
    risk = RiskGate(RiskLimits(max_drawdown=Decimal("0.05")))
    rt = PaperRuntime(PaperConfig(enabled=True), risk)
    rt.simulate(
        cash=Decimal("10000"),
        prices={"A": Decimal("100")},
        targets={"A": Decimal("0.2")},
        fill_prices={"A": Decimal("100")},
        valuation_prices={"A": Decimal("100")},
        session_id="normal",
    )
    snapshot = rt.snapshot("normal")
    assert rt._peak_equity is not None and rt._peak_equity > Decimal("9000")
    with pytest.raises(RuntimeError, match="drawdown_limit"):
        rt.simulate(
            cash=Decimal("10000"),
            prices={"A": Decimal("10")},
            targets={"A": Decimal("0.2")},
            fill_prices={"A": Decimal("10")},
            valuation_prices={"A": Decimal("10")},
            session_id="market-gap",
        )
    assert rt.snapshot("normal") == snapshot


def test_restart_does_not_reset_prior_peak_equity_drawdown_limit():
    risk = RiskGate(RiskLimits(max_drawdown=Decimal("0.05")))
    previous = PaperRuntime(PaperConfig(enabled=True), risk)
    previous.simulate(
        cash=Decimal("10000"),
        prices={"A": Decimal("100")},
        targets={"A": Decimal("0.2")},
        fill_prices={"A": Decimal("100")},
        valuation_prices={"A": Decimal("100")},
        session_id="pre-restart",
    )
    restarted = PaperRuntime(PaperConfig(enabled=True), risk)
    restarted.account = previous.account
    restarted.ledger = previous.ledger
    assert restarted._peak_equity is None
    before = restarted.snapshot("pre-restart")
    with pytest.raises(RuntimeError, match="drawdown_limit"):
        restarted.simulate(
            cash=Decimal("10000"),
            prices={"A": Decimal("10")},
            targets={"A": Decimal("0.2")},
            fill_prices={"A": Decimal("10")},
            valuation_prices={"A": Decimal("10")},
            session_id="post-restart-gap",
        )
    assert restarted.snapshot("pre-restart") == before
