from atlas.risk.stress_certification import run_risk_stress


def test_independent_risk_stress_scenarios_fail_closed_or_reduce():
    proof = run_risk_stress()
    assert proof.passed
    assert len(proof.cases) == 7
    assert proof == run_risk_stress()
    assert len(proof.evidence_hash) == 64
    veto = [case for case in proof.cases if case.expected.startswith("VETO:")]
    reductions = [case for case in proof.cases if case.expected == "BOUNDED_REDUCTION"]
    assert len(veto) == 5 and len(reductions) == 2


def test_decimal_weight_normalization_never_overshoots_gross_limit():
    from decimal import Decimal

    from atlas.risk.gate import RiskGate, RiskLimits

    limit = Decimal("0.5")
    gate = RiskGate(RiskLimits(max_gross=limit, max_single_weight=Decimal("1")))
    for targets in (
        {"A": Decimal("0.25"), "B": Decimal("0.25"), "C": Decimal("0.25")},
        {"x": Decimal("0.37"), "y": Decimal("0.73")},
        {str(index): Decimal("0.33") for index in range(17)},
    ):
        decision = gate.evaluate(targets, equity=Decimal("100"))
        assert decision.approved and decision.reduced
        assert sum(abs(weight) for weight in decision.target_weights.values()) <= limit
        assert decision == gate.evaluate(
            dict(reversed(list(targets.items()))), equity=Decimal("100")
        )
