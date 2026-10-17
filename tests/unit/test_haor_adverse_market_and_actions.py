"""Fail-closed synthetic market-stress and event correction guards."""

import datetime as dt
from decimal import Decimal

import pytest

from atlas.backtest.costs import AdverseMarketCostModel, CostModel
from atlas.common.types import CorporateActionType
from atlas.data.adjustments import CorporateAction, cumulative_price_factor


def test_adverse_costs_never_understate_standard_cost() -> None:
    normal = CostModel(10)
    stressed = AdverseMarketCostModel(10, 5, 20, 15)
    for turnover in (0.0, 0.25, 1.0, 3.0):
        assert stressed.cost(turnover) >= normal.cost(turnover)
        assert stressed.cost(turnover) == pytest.approx(turnover * 50 / 10000)
    assert stressed.describe()["gap_bps_per_side"] == 20


@pytest.mark.parametrize("invalid", [-1.0, float("nan"), float("inf")])
def test_market_shock_must_be_finite_and_positive(invalid: float) -> None:
    with pytest.raises(ValueError):
        AdverseMarketCostModel(spread_bps_per_side=invalid)
    with pytest.raises(ValueError):
        AdverseMarketCostModel(gap_bps_per_side=invalid)
    with pytest.raises(ValueError):
        AdverseMarketCostModel(liquidity_impact_bps_per_side=invalid)


def test_market_stress_never_swallows_overflow() -> None:
    with pytest.raises(ValueError, match="overflow"):
        AdverseMarketCostModel(1e308, 1e308, 1e308, 1e308)


def test_mixed_instrument_adjustment_and_duplicate_events_refused() -> None:
    ex = dt.date(2024, 3, 15)
    spy = CorporateAction("SPY", CorporateActionType.SPLIT, ex, {"old": "1", "new": "2"})
    aapl = CorporateAction("AAPL", CorporateActionType.SPLIT, ex, {"old": "1", "new": "4"})
    with pytest.raises(ValueError, match="mixed-instrument"):
        cumulative_price_factor([spy, aapl], ex - dt.timedelta(days=1))
    with pytest.raises(ValueError, match="duplicate"):
        cumulative_price_factor([spy, spy], ex - dt.timedelta(days=1))
    assert cumulative_price_factor([spy], ex - dt.timedelta(days=1)) == Decimal("0.5")


def test_adverse_costs_flow_through_actual_archived_backtest() -> None:
    from atlas.backtest import run_backtest
    from atlas.research.dataview import InMemoryBarSource
    from atlas.research.synthetic import random_walk, sessions, unbounded_calendar
    from atlas.strategy import BuyAndHold

    cal = unbounded_calendar()
    dates = sessions(cal, dt.date(2023, 1, 2), dt.date(2023, 6, 30))
    src = InMemoryBarSource({"SPY": random_walk("SPY", dates, seed=9, drift=0.0004)})
    kwargs = {"start": dates[10], "end": dates[-1], "calendar": cal}
    baseline = run_backtest(BuyAndHold(), src, cost_model=CostModel(10), **kwargs)
    adverse = run_backtest(
        BuyAndHold(),
        src,
        cost_model=AdverseMarketCostModel(10, 5, 20, 15),
        **kwargs,
    )
    assert adverse.total_return <= baseline.total_return
    assert adverse.result_hash() != baseline.result_hash()
