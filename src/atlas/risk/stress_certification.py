"""Offline risk-gate stress evidence; all scenarios are synthetic, not broker data."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal

from atlas.common.hashing import content_hash
from atlas.risk.gate import RiskGate, RiskLimits


@dataclass(frozen=True)
class RiskStressCase:
    name: str
    expected: str
    observed: str
    passed: bool


@dataclass(frozen=True)
class RiskStressReport:
    cases: tuple[RiskStressCase, ...]
    evidence_hash: str

    @property
    def passed(self) -> bool:
        return bool(self.cases) and all(item.passed for item in self.cases)


def run_risk_stress() -> RiskStressReport:
    """Exercise independent risk veto/reduction under extreme market assumptions."""
    limits = RiskLimits(
        max_turnover=Decimal("0.4"),
        max_drawdown=Decimal("0.10"),
        max_single_weight=Decimal("0.25"),
        max_gross=Decimal("0.5"),
    )
    gate = RiskGate(limits)
    cases: list[RiskStressCase] = []

    def check(name: str, *, expected: str, **kwargs: object) -> None:
        # Explicit Decimal-only calls keep test values exact and reproducible.
        if name == "sudden_equity_gap":
            decision = gate.evaluate(
                {"A": Decimal("0.2")}, equity=Decimal("60"), peak_equity=Decimal("100")
            )
        elif name == "stale_market":
            decision = gate.evaluate({"A": Decimal("0.2")}, equity=Decimal("100"), data_fresh=False)
        elif name == "emergency_halt":
            decision = gate.evaluate({"A": Decimal("0.2")}, equity=Decimal("100"), kill_switch=True)
        elif name == "turnover_shock":
            decision = gate.evaluate(
                {"A": Decimal("0.8")},
                equity=Decimal("100"),
                current_weights={"A": Decimal("0.1")},
            )
        elif name == "nonfinite_equity":
            decision = gate.evaluate({"A": Decimal("0.2")}, equity=Decimal("NaN"))
        elif name == "oversized_concentration":
            decision = gate.evaluate({"A": Decimal("0.4")}, equity=Decimal("100"))
        elif name == "aggregate_leverage":
            decision = gate.evaluate(
                {"A": Decimal("0.25"), "B": Decimal("0.25"), "C": Decimal("0.25")},
                equity=Decimal("100"),
            )
        else:
            raise RuntimeError("unknown certified risk scenario")
        if expected.startswith("VETO:"):
            reason = expected.partition(":")[2]
            passed = not decision.approved and reason in decision.reasons
            observed = (
                "VETO:" + ",".join(decision.reasons) if not decision.approved else "UNSAFE_APPROVAL"
            )
        else:
            # A reduced recommendation must have valid nonnegative weights and
            # never exceed configured concentration or gross limits.
            total = sum(decision.target_weights.values())
            passed = (
                decision.approved
                and decision.reduced
                and total <= limits.max_gross
                and all(
                    Decimal("0") <= weight <= limits.max_single_weight
                    for weight in decision.target_weights.values()
                )
            )
            observed = "BOUNDED_REDUCTION" if passed else "UNSAFE_RISK_REDUCTION"
        cases.append(RiskStressCase(name, expected, observed, passed))

    for name, expectation in (
        ("sudden_equity_gap", "VETO:drawdown_limit"),
        ("stale_market", "VETO:stale_data"),
        ("emergency_halt", "VETO:kill_switch_active"),
        ("turnover_shock", "VETO:turnover_limit"),
        ("nonfinite_equity", "VETO:non_finite_equity"),
        ("oversized_concentration", "BOUNDED_REDUCTION"),
        ("aggregate_leverage", "BOUNDED_REDUCTION"),
    ):
        check(name, expected=expectation)
    proof = tuple(cases)
    return RiskStressReport(proof, content_hash([asdict(item) for item in proof]))
