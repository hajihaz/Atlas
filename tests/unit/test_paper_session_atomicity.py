"""Ensure a simulated failed session cannot publish half of its fills."""

from decimal import Decimal

import pytest

from atlas.paper.runtime import PaperConfig, PaperRuntime
from atlas.portfolio.account import PortfolioAccount


def _simulate(rt: PaperRuntime, session: str) -> None:
    rt.simulate(
        cash=Decimal("100000"),
        prices={"A": Decimal("100"), "B": Decimal("50")},
        targets={"A": Decimal("0.2"), "B": Decimal("0.2")},
        fill_prices={"A": Decimal("101"), "B": Decimal("51")},
        valuation_prices={"A": Decimal("102"), "B": Decimal("52")},
        session_id=session,
    )


def test_failed_second_fill_leaves_initial_account_and_ledger_unmodified(monkeypatch):
    rt = PaperRuntime(PaperConfig(enabled=True))
    original_apply = PortfolioAccount.apply_fill
    calls = []

    def fail_second(self, *args, **kwargs):
        calls.append(1)
        if len(calls) == 2:
            raise RuntimeError("simulated later fill failure")
        return original_apply(self, *args, **kwargs)

    monkeypatch.setattr(PortfolioAccount, "apply_fill", fail_second)
    with pytest.raises(RuntimeError, match="later fill failure"):
        _simulate(rt, "failed-session")
    assert rt.account is None
    assert rt.ledger.entries() == ()
    assert rt._last_result_hash == ""


def test_failed_later_session_preserves_all_previous_account_and_ledger(monkeypatch):
    rt = PaperRuntime(PaperConfig(enabled=True))
    _simulate(rt, "completed-first")
    assert rt.account is not None
    account_state = rt.account.state
    transitions = rt.account.transitions()
    checkpoint = rt.ledger.head_checkpoint()
    last_result = rt._last_result_hash

    def refuse_fill(self, *args, **kwargs):
        raise RuntimeError("simulated unsafe late fill")

    monkeypatch.setattr(PortfolioAccount, "apply_fill", refuse_fill)
    with pytest.raises(RuntimeError, match="late fill"):
        rt.simulate(
            cash=Decimal("100000"),
            prices={"A": Decimal("110"), "B": Decimal("60")},
            targets={"A": Decimal("0"), "B": Decimal("0")},
            fill_prices={"A": Decimal("109"), "B": Decimal("59")},
            valuation_prices={"A": Decimal("108"), "B": Decimal("58")},
            session_id="failed-late",
        )
    assert rt.account.state == account_state
    assert rt.account.transitions() == transitions
    assert rt.ledger.head_checkpoint() == checkpoint
    assert rt._last_result_hash == last_result
