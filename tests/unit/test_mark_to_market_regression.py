from decimal import Decimal

import pytest

from atlas.paper.runtime import PaperConfig, PaperRuntime
from atlas.portfolio.account import PortfolioAccount


def test_mark_to_market_without_fills_updates_equity_but_not_cash_or_transitions() -> None:
    account = PortfolioAccount(cash=Decimal("500"), holdings={"SPY": 5}, equity=Decimal("1000"))
    state = account.mark_to_market(valuation_prices={"SPY": Decimal("105")})
    assert state.cash == Decimal("500")
    assert state.equity == Decimal("1025")
    assert account.transitions() == ()
    with pytest.raises(ValueError, match="missing valuation"):
        account.mark_to_market(valuation_prices={})
    with pytest.raises(ValueError, match="invalid mark"):
        account.mark_to_market(valuation_prices={"SPY": Decimal("NaN")})


def test_paper_ledger_records_marked_equity_without_rebalancing() -> None:
    runtime = PaperRuntime(PaperConfig(enabled=True))
    first = runtime.simulate(
        cash=Decimal("10000"),
        prices={"SPY": Decimal("100")},
        targets={"SPY": Decimal("0.2")},
        fill_prices={"SPY": Decimal("100")},
        valuation_prices={"SPY": Decimal("100")},
        session_id="day-one",
    )
    assert runtime.account is not None
    old_cash = runtime.account.state.cash
    old_shares = runtime.account.state.holdings["SPY"]
    old_fills = len(runtime.account.transitions())
    second = runtime.simulate(
        cash=Decimal("10000"),
        prices={"SPY": Decimal("110")},
        targets={"SPY": Decimal("0.21")},
        fill_prices={"SPY": Decimal("110")},
        valuation_prices={"SPY": Decimal("110")},
        session_id="day-two",
    )
    assert second.fills == ()
    assert runtime.account.state.cash == old_cash
    assert runtime.account.state.holdings["SPY"] == old_shares
    assert len(runtime.account.transitions()) == old_fills
    assert runtime.account.state.equity == first.equity + Decimal(old_shares) * 10
    assert runtime.ledger.entries()[-1].event.event_type == "mark_to_market"
    assert runtime.ledger.entries()[-1].event.equity == second.equity
