from decimal import Decimal

import pytest

from atlas.health import HealthSignal, evaluate_health
from atlas.operations_hardening import DurableEmergencyStore
from atlas.paper import PaperConfig, PaperRuntime


def _simulate(runtime: PaperRuntime, **extra: object) -> None:
    runtime.simulate(
        cash=Decimal("10000"), prices={"SPY": Decimal("100")},
        targets={"SPY": Decimal("0.2")}, fill_prices={"SPY": Decimal("100")},
        valuation_prices={"SPY": Decimal("100")}, **extra,
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
