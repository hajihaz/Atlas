from decimal import Decimal

import pytest

from atlas.health import HealthSignal, evaluate_health
from atlas.operations_hardening import DurableEmergencyStore
from atlas.paper import PaperConfig, PaperRuntime


def _simulate(runtime: PaperRuntime, **extra: object) -> None:
    runtime.simulate(
        cash=Decimal("10000"),
        prices={"SPY": Decimal("100")},
        targets={"SPY": Decimal("0.2")},
        fill_prices={"SPY": Decimal("100")},
        valuation_prices={"SPY": Decimal("100")},
        **extra,
    )


def test_persistent_emergency_blocks_paper_capital_action(tmp_path) -> None:
    store = DurableEmergencyStore(tmp_path / "halt.json")
    store.engage("operator halt")
    runtime = PaperRuntime(PaperConfig(enabled=True), emergency_store=store)
    with pytest.raises(RuntimeError, match="persistent emergency halt"):
        _simulate(runtime)


def test_capital_blocking_health_signal_blocks_paper_action() -> None:
    runtime = PaperRuntime(PaperConfig(enabled=True))
    health = evaluate_health((HealthSignal("reconciliation", False, "mismatch"),))
    with pytest.raises(RuntimeError, match="capital-increasing action blocked"):
        _simulate(runtime, health=health)


def test_nonblocking_degraded_health_does_not_bypass_risk() -> None:
    runtime = PaperRuntime(PaperConfig(enabled=True))
    health = evaluate_health((HealthSignal("reporting", False, "late", capital_blocking=False),))
    _simulate(runtime, health=health)


def test_strict_paper_runtime_refuses_missing_proofs(tmp_path) -> None:
    runtime = PaperRuntime(PaperConfig(enabled=True, require_operational_proofs=True))
    with pytest.raises(RuntimeError, match="mandatory emergency and health proofs"):
        _simulate(runtime)
    store = DurableEmergencyStore(tmp_path / "halt.json")
    runtime = PaperRuntime(
        PaperConfig(enabled=True, require_operational_proofs=True), emergency_store=store
    )
    with pytest.raises(RuntimeError, match="mandatory emergency and health proofs"):
        _simulate(runtime)
    health = evaluate_health((HealthSignal("reconciliation", True),))
    _simulate(runtime, health=health)
    store.engage("halt")
    with pytest.raises(RuntimeError, match="persistent emergency halt"):
        _simulate(runtime, health=health)


def test_empty_health_report_is_capital_blocking() -> None:
    health = evaluate_health(())
    with pytest.raises(RuntimeError, match="missing_or_blocked_health_evidence"):
        health.assert_capital_safe()


def test_strict_paper_cycle_blocks_before_ledger_or_order_creation(tmp_path) -> None:
    from atlas.execution.ledger import ExecutionLedger
    from atlas.paper.broker_simulator import DeterministicPaperBroker
    from atlas.paper.cycle import PaperCycle
    from atlas.portfolio.account import PortfolioAccount
    from atlas.risk.gate import RiskGate

    store = DurableEmergencyStore(tmp_path / "halt.json")
    ledger = ExecutionLedger()
    cycle = PaperCycle(
        PortfolioAccount(cash=Decimal("1000")),
        RiskGate(),
        DeterministicPaperBroker({"A": Decimal("10")}),
        ledger,
        emergency_store=store,
        require_operational_proofs=True,
    )
    with pytest.raises(RuntimeError, match="mandatory emergency"):
        cycle.run(
            {"A": Decimal("0.1")},
            valuation_prices={"A": Decimal("10")},
            approval_id="sandbox-approval",
        )
    assert ledger.head_checkpoint()[0] == -1
    health = evaluate_health((HealthSignal("risk", True),))
    store.engage("halt")
    with pytest.raises(RuntimeError, match="persistent emergency"):
        cycle.run(
            {"A": Decimal("0.1")},
            valuation_prices={"A": Decimal("10")},
            approval_id="sandbox-approval",
            health=health,
        )
    assert ledger.head_checkpoint()[0] == -1
