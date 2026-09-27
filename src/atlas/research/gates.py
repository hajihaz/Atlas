"""Evidence gates — the promotion criteria a strategy's backtest must clear (ADR 0016).

These operationalize the Phase-1 lifecycle transition *Backtesting → Validated* and
principle 3.3: **gates are declared before results are seen.** An ``EvidenceGates`` object is
meant to be committed (e.g. to the config registry) *before* a strategy is run, so the bar
cannot be moved to fit a result (F-C2). The evaluator is pure and returns a transparent,
reasoned verdict.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EvidenceGates:
    """Pre-declared thresholds. Defaults are deliberately demanding — Atlas assumes a
    strategy is overfit until the evidence says otherwise, and survival caps the drawdown."""

    min_annualized_sharpe: float = 0.5
    min_deflated_sharpe: float = 0.95  # DSR is a probability; require high confidence
    max_pbo: float = 0.5  # probability of backtest overfitting
    max_drawdown_floor: float = -0.30  # reject if worse than this (survival-first)
    max_oos_degradation: float = -0.75  # OOS Sharpe may fall at most this vs. in-sample
    min_periods: int = 252  # at least ~1 year of observations
    require_positive_expectancy: bool = True
    min_walk_forward_sharpe: float = 0.0
    min_monte_carlo_prob_positive: float = 0.55
    min_sensitivity_frac_positive: float = 0.50


@dataclass(frozen=True)
class Evidence:
    """The measured evidence a verdict is rendered on."""

    annualized_sharpe: float
    deflated_sharpe: float
    pbo: float
    max_drawdown: float
    oos_degradation: float
    n_periods: int
    expectancy: float
    walk_forward_sharpe: float = 0.0
    monte_carlo_prob_positive: float = 0.0
    sensitivity_frac_positive: float = 0.0


@dataclass(frozen=True)
class GateVerdict:
    passed: bool
    checks: dict[str, bool]
    reasons: tuple[str, ...]  # human-readable failing reasons (empty if passed)

    @property
    def status_word(self) -> str:
        return "validated" if self.passed else "rejected"


def evaluate_gates(evidence: Evidence, gates: EvidenceGates | None = None) -> GateVerdict:
    """Render a pass/reject verdict with a transparent per-check breakdown."""
    g = gates or EvidenceGates()
    checks: dict[str, bool] = {
        "sharpe": evidence.annualized_sharpe >= g.min_annualized_sharpe,
        "deflated_sharpe": evidence.deflated_sharpe >= g.min_deflated_sharpe,
        "pbo": evidence.pbo <= g.max_pbo,
        "drawdown": evidence.max_drawdown >= g.max_drawdown_floor,
        "oos_degradation": evidence.oos_degradation >= g.max_oos_degradation,
        "sample_size": evidence.n_periods >= g.min_periods,
        "expectancy": (evidence.expectancy > 0) or not g.require_positive_expectancy,
        "walk_forward": evidence.walk_forward_sharpe >= g.min_walk_forward_sharpe,
        "monte_carlo": evidence.monte_carlo_prob_positive >= g.min_monte_carlo_prob_positive,
        "sensitivity": evidence.sensitivity_frac_positive >= g.min_sensitivity_frac_positive,
    }
    reasons: list[str] = []
    if not checks["sharpe"]:
        reasons.append(f"Sharpe {evidence.annualized_sharpe:.2f} < {g.min_annualized_sharpe}")
    if not checks["deflated_sharpe"]:
        reasons.append(
            f"deflated Sharpe {evidence.deflated_sharpe:.2f} < {g.min_deflated_sharpe} "
            "(likely selection/overfitting)"
        )
    if not checks["pbo"]:
        reasons.append(f"PBO {evidence.pbo:.2f} > {g.max_pbo} (overfitting probable)")
    if not checks["drawdown"]:
        reasons.append(
            f"max drawdown {evidence.max_drawdown:.2f} worse than {g.max_drawdown_floor}"
        )
    if not checks["oos_degradation"]:
        reasons.append(f"out-of-sample degradation {evidence.oos_degradation:.2f} too severe")
    if not checks["sample_size"]:
        reasons.append(f"only {evidence.n_periods} periods < {g.min_periods}")
    if not checks["expectancy"]:
        reasons.append("non-positive expectancy")
    if not checks["walk_forward"]:
        reasons.append(
            f"walk-forward Sharpe {evidence.walk_forward_sharpe:.2f} < "
            f"{g.min_walk_forward_sharpe:.2f}"
        )
    if not checks["monte_carlo"]:
        reasons.append(
            f"Monte-Carlo probability of positive return {evidence.monte_carlo_prob_positive:.2f} "
            f"< {g.min_monte_carlo_prob_positive:.2f}"
        )
    if not checks["sensitivity"]:
        reasons.append(
            f"parameter sensitivity positive fraction {evidence.sensitivity_frac_positive:.2f} "
            f"< {g.min_sensitivity_frac_positive:.2f}"
        )
    return GateVerdict(passed=all(checks.values()), checks=checks, reasons=tuple(reasons))
