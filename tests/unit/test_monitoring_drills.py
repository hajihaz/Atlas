import pytest

from atlas.monitoring_drills import simulate_fail_closed_incident
from atlas.operations_hardening import DurableEmergencyStore


def test_incident_halt_survives_recovery_without_broker_orders(tmp_path):
    path = tmp_path / "drill-halt.json"
    report = simulate_fail_closed_incident(path)
    assert report.live_orders_submitted == 0
    assert report.blocking_health_verified
    assert report.emergency_persisted_across_reopen
    assert report.still_halted_at_finish
    assert len(report.evidence_hash) == 64
    assert DurableEmergencyStore(path).load().engaged


def test_existing_emergency_state_is_not_reset_by_simulated_drill(tmp_path):
    path = tmp_path / "halt.json"
    store = DurableEmergencyStore(path)
    store.engage("real owner halt")
    with pytest.raises(RuntimeError, match="already exists"):
        simulate_fail_closed_incident(path)
    assert DurableEmergencyStore(path).load().reason == "real owner halt"
