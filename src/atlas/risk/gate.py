"""Independent risk gate: it can approve, reduce, or veto, never increase risk."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class RiskLimits:
    max_gross: Decimal = Decimal("1")
    max_single_weight: Decimal = Decimal("0.25")
    min_equity: Decimal = Decimal("0")
    max_positions: int = 100
    max_turnover: Decimal = Decimal("2")
    max_drawdown: Decimal = Decimal("0.25")
    require_fresh_data: bool = True


@dataclass(frozen=True)
class RiskDecision:
    approved: bool
    target_weights: Mapping[str, Decimal]
    reasons: tuple[str, ...] = ()
    reduced: bool = False


class RiskGate:
    """Pure pre-trade gate with deterministic reductions and fail-closed vetoes."""

    def __init__(self, limits: RiskLimits | None = None):
        self.limits = limits or RiskLimits()
        monetary_limits = (
            self.limits.max_gross,
            self.limits.max_single_weight,
            self.limits.min_equity,
            self.limits.max_turnover,
            self.limits.max_drawdown,
        )
        if (
            any(not value.is_finite() or value < 0 for value in monetary_limits)
            or type(self.limits.max_positions) is not int
            or self.limits.max_positions < 0
            or self.limits.max_drawdown > 1
        ):
            raise ValueError("invalid or non-finite risk limits")

    def evaluate(
        self,
        target_weights: Mapping[str, Decimal],
        *,
        equity: Decimal,
        data_fresh: bool = True,
        kill_switch: bool = False,
        current_weights: Mapping[str, Decimal] | None = None,
        peak_equity: Decimal | None = None,
    ) -> RiskDecision:
        reasons: list[str] = []
        weights = {k: Decimal(v) for k, v in target_weights.items()}
        if kill_switch:
            reasons.append("kill_switch_active")
        if equity.is_nan() or equity.is_infinite():
            reasons.append("non_finite_equity")
        elif equity < self.limits.min_equity:
            reasons.append("equity_below_floor")
        if self.limits.require_fresh_data and not data_fresh:
            reasons.append("stale_data")
        if any(w.is_nan() or w.is_infinite() for w in weights.values()):
            reasons.append("non_finite_weight")
        if any(w < 0 for w in weights.values()):
            reasons.append("negative_weight")
        if sum(1 for w in weights.values() if w > 0) > self.limits.max_positions:
            reasons.append("position_count_limit")
        if current_weights is not None:
            if any(
                Decimal(w).is_nan() or Decimal(w).is_infinite() for w in current_weights.values()
            ):
                reasons.append("non_finite_current_weight")
                current_weights = None
        if current_weights is not None:
            keys = set(weights) | set(current_weights)
            turnover = sum(
                abs(weights.get(k, Decimal("0")) - Decimal(current_weights.get(k, Decimal("0"))))
                for k in keys
            )
            if turnover > self.limits.max_turnover:
                reasons.append("turnover_limit")
        if peak_equity is not None:
            if peak_equity.is_nan() or peak_equity.is_infinite():
                reasons.append("invalid_peak_equity")
            elif peak_equity <= 0:
                reasons.append("invalid_peak_equity")
            elif equity < peak_equity:
                drawdown = Decimal("1") - equity / peak_equity
                if drawdown > self.limits.max_drawdown:
                    reasons.append("drawdown_limit")
        if reasons:
            return RiskDecision(False, {}, tuple(reasons))

        reduced = False
        bounded = dict(weights)
        for iid, weight in list(bounded.items()):
            if weight > self.limits.max_single_weight:
                bounded[iid] = self.limits.max_single_weight
                reduced = True
        gross = sum(abs(w) for w in bounded.values())
        if gross > self.limits.max_gross and gross > 0:
            scale = self.limits.max_gross / gross
            bounded = {iid: w * scale for iid, w in bounded.items()}
            reduced = True
        if reduced:
            reasons.append("risk_reduced_target")
        return RiskDecision(True, bounded, tuple(reasons), reduced)
