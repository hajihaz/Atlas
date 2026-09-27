"""The point-in-time backtest engine.

Timing convention (leakage-free): at decision session ``D`` the strategy decides target weights
from data **strictly before ``D``** (the leak-proof :class:`DataView`). Because this reference
engine only models session-close prices, those weights become effective for the *next* session
return ``D → D+1``. This explicit one-session lag prevents the engine from silently assuming
that a decision made at ``D`` was already held during the ``D-1 → D`` return. Warm-up history
before ``start`` is used for lookbacks but not scored. Costs are charged at the decision/rebalance.

Determinism: instruments are summed in sorted order and equity uses only IEEE-754 +-x/, so
a run is reproducible bit-for-bit for a fixed (strategy x snapshot x params x seed x costs)
— the Phase-3 exit criterion (ADR 0015).
"""

from __future__ import annotations

import datetime as _dt
from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Literal

from atlas.backtest.costs import CostModel
from atlas.backtest.result import BacktestResult
from atlas.common.hashing import content_hash
from atlas.data.adjustments.corporate_actions import CorporateAction
from atlas.data.calendars.nse_calendar import TradingCalendar
from atlas.execution.ledger import ExecutionEvent, ExecutionLedger
from atlas.execution.simulator import DiscreteExecutionSimulator, ExecutionConfig
from atlas.market.boundary import MarketDataBoundary, MarketDataStatus
from atlas.portfolio.account import PortfolioAccount
from atlas.research.dataview import BarSource, DataView
from atlas.research.returns import daily_returns
from atlas.risk.gate import RiskGate
from atlas.strategy.base import Strategy


def _cap_gross(weights: Mapping[str, float], max_gross: float) -> dict[str, float]:
    """Scale weights down so Σ|w| ≤ max_gross (no leverage by default — survival-first)."""
    gross = sum(abs(w) for w in weights.values())
    if gross <= max_gross or gross == 0:
        return dict(weights)
    scale = max_gross / gross
    return {k: w * scale for k, w in weights.items()}


def run_backtest(
    strategy: Strategy,
    source: BarSource,
    *,
    start: _dt.date,
    end: _dt.date,
    calendar: TradingCalendar,
    cost_model: CostModel | None = None,
    corporate_actions: Mapping[str, Sequence[CorporateAction]] | None = None,
    max_gross: float = 1.0,
    periods_per_year: int = 252,
    snapshot_id: str | None = None,
    seed: int | None = None,
    code_version: str | None = None,
    execution_mode: Literal["reference", "discrete"] = "reference",
    execution_config: ExecutionConfig | None = None,
    initial_cash: Decimal = Decimal("100000"),
    risk_gate: RiskGate | None = None,
    market_data_status: MarketDataStatus | None = None,
) -> BacktestResult:
    """Run one deterministic, point-in-time backtest over ``[start, end]``."""
    cost_model = cost_model or CostModel()
    cas = corporate_actions or {}
    sessions = calendar.sessions_in_range(start, end)
    if execution_mode not in ("reference", "discrete"):
        raise ValueError(f"unsupported execution_mode: {execution_mode!r}")
    if initial_cash <= 0:
        raise ValueError("initial_cash must be positive")
    if market_data_status is not None:
        MarketDataBoundary().admit(market_data_status)

    # Per-instrument adjusted daily returns over the *full* available series (warm-up incl.).
    returns_by_instrument: dict[str, dict[_dt.date, float]] = {
        iid: daily_returns(source.series(iid), cas.get(iid, ())) for iid in source.instruments()
    }

    prev_weights: dict[str, float] = {}
    equity = 1.0
    dates: list[_dt.date] = []
    net_returns: list[float] = []
    gross_returns: list[float] = []
    turnovers: list[float] = []
    equities: list[float] = []
    simulator = (
        DiscreteExecutionSimulator(execution_config) if execution_mode == "discrete" else None
    )
    cash = initial_cash
    holdings: dict[str, int] = {}
    execution_ledger = ExecutionLedger()
    portfolio_account = PortfolioAccount(cash=initial_cash)

    # A close-based reference engine cannot honestly apply a decision to the same
    # close-to-close return that ends on the decision date. The target decided at D
    # therefore earns the next session's return. The final decision has no following
    # return and is intentionally not scored.
    for idx, day in enumerate(sessions[:-1]):
        next_day = sessions[idx + 1]
        target = _cap_gross(strategy.target_weights(DataView(source, day)), max_gross)
        if risk_gate is not None:
            risk = risk_gate.evaluate(
                {iid: Decimal(str(w)) for iid, w in target.items()},
                equity=portfolio_account.state.equity
                if execution_mode == "discrete"
                else Decimal(str(equity)),
                data_fresh=True,
            )
            if not risk.approved:
                raise RuntimeError("backtest order set rejected by risk: " + ",".join(risk.reasons))
            target = {iid: float(w) for iid, w in risk.target_weights.items()}
        event_time = _dt.datetime.combine(day, _dt.time.min, tzinfo=_dt.UTC)
        decision_id = content_hash(
            {"config_id": strategy.spec.config_id(), "day": day.isoformat(), "target": target}
        )
        execution_ledger.append(
            ExecutionEvent(
                event_id=decision_id,
                event_type="decision",
                event_time=event_time,
                decision_id=decision_id,
                metadata={
                    "strategy_config_id": strategy.spec.config_id(),
                    "strategy_name": strategy.spec.name,
                    "strategy_version": strategy.spec.version,
                    "decision_date": day.isoformat(),
                    "effective_date": next_day.isoformat(),
                    "snapshot_id": snapshot_id,
                    "execution_mode": execution_mode,
                    "target_weights": dict(sorted(target.items())),
                },
            )
        )

        if execution_mode == "reference":
            keys = sorted(set(target) | set(prev_weights))
            turnover = sum(abs(target.get(k, 0.0) - prev_weights.get(k, 0.0)) for k in keys)
            cost = cost_model.cost(turnover)
            gross = sum(
                target[iid] * returns_by_instrument.get(iid, {}).get(next_day, 0.0)
                for iid in sorted(target)
            )
            net = gross - cost
            equity *= 1.0 + net
        else:
            assert simulator is not None
            bars = {
                iid: {b.event_date: b for b in source.series(iid)}
                for iid in sorted(set(target) | set(holdings))
            }
            sizing_prices = {iid: bars[iid][day].close for iid in bars if day in bars[iid]}
            fill_prices = {iid: bars[iid][next_day].open for iid in bars if next_day in bars[iid]}
            valuation_prices = {
                iid: bars[iid][next_day].close for iid in bars if next_day in bars[iid]
            }
            required = set(target) | set(holdings)
            missing = sorted(
                required - set(sizing_prices)
                | required - set(fill_prices)
                | required - set(valuation_prices)
            )
            if missing:
                raise ValueError(f"missing bar data for discrete execution: {missing}")
            before_value = cash + sum(
                Decimal(qty) * sizing_prices[iid] for iid, qty in holdings.items()
            )
            result = simulator.execute(
                starting_cash=cash,
                prices=sizing_prices,
                target_weights={iid: Decimal(str(w)) for iid, w in target.items()},
                existing_holdings=holdings,
                fill_prices=fill_prices,
                valuation_prices=valuation_prices,
            )
            for fill in result.fills:
                fill_event_id = content_hash(
                    {
                        "decision_id": decision_id,
                        "type": "fill",
                        "instrument": fill.instrument_id,
                        "qty": fill.quantity,
                    }
                )
                portfolio_account.apply_fill(
                    fill, event_id=fill_event_id, valuation_prices=valuation_prices
                )
            cash, holdings = result.ending_cash, dict(result.holdings)
            fees = sum(fill.fee for fill in result.fills)
            for intent, fill in zip(result.intents, result.fills, strict=False):
                execution_ledger.append(
                    ExecutionEvent(
                        event_id=content_hash(
                            {
                                "decision_id": decision_id,
                                "type": "order_intent",
                                "instrument": intent.instrument_id,
                                "qty": intent.quantity,
                            }
                        ),
                        event_type="order_intent",
                        event_time=event_time,
                        instrument_id=intent.instrument_id,
                        quantity=intent.quantity,
                        price=intent.reference_price,
                        decision_id=decision_id,
                        metadata={
                            "target_weight": str(intent.target_weight),
                            "effective_date": next_day.isoformat(),
                        },
                    )
                )
                execution_ledger.append(
                    ExecutionEvent(
                        event_id=content_hash(
                            {
                                "decision_id": decision_id,
                                "type": "fill",
                                "instrument": fill.instrument_id,
                                "qty": fill.quantity,
                            }
                        ),
                        event_type="fill",
                        event_time=_dt.datetime.combine(next_day, _dt.time.min, tzinfo=_dt.UTC),
                        instrument_id=fill.instrument_id,
                        quantity=fill.quantity,
                        price=fill.fill_price,
                        fee=fill.fee,
                        decision_id=decision_id,
                        metadata={"execution_mode": execution_mode},
                    )
                )
            after_value = result.equity
            gross = float((after_value + fees) / before_value - Decimal("1"))
            net = float(after_value / before_value - Decimal("1"))
            turnover = float(
                sum(Decimal(abs(fill.quantity)) * fill.fill_price for fill in result.fills)
                / before_value
            )
            equity *= 1.0 + net

        dates.append(day)
        gross_returns.append(gross)
        net_returns.append(net)
        turnovers.append(turnover)
        equities.append(equity)
        prev_weights = target

    return BacktestResult(
        config_id=strategy.spec.config_id(),
        strategy_name=strategy.spec.name,
        strategy_version=strategy.spec.version,
        params=dict(strategy.spec.params),
        start=start,
        end=end,
        dates=tuple(dates),
        net_returns=tuple(net_returns),
        gross_returns=tuple(gross_returns),
        turnover=tuple(turnovers),
        equity=tuple(equities),
        periods_per_year=periods_per_year,
        cost_model=cost_model.describe(),
        snapshot_id=snapshot_id,
        seed=seed,
        code_version=code_version,
        meta={
            "universe": len(source.instruments()),
            "max_gross": max_gross,
            "execution_mode": execution_mode,
            "initial_cash": str(initial_cash),
            "risk_gate": risk_gate is not None,
            "market_data_gate": market_data_status is not None,
        },
        execution_ledger=execution_ledger.entries(),
        portfolio_transitions=portfolio_account.transitions(),
    )
