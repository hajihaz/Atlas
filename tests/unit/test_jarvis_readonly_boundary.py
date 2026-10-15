import pytest

from atlas.governance.jarvis_boundary import JarvisReadOnlyBoundary
from atlas.governance.live_gate import LiveReadiness


def test_jarvis_status_cannot_control_orders_or_live_mode():
    boundary = JarvisReadOnlyBoundary(LiveReadiness())
    status = boundary.snapshot()
    assert status.live_capital_blocked
    assert status.deployment_policy_passed
    assert "human_authorization" in status.readiness_blockers
    assert "governance_live_mode" in status.readiness_blockers
    assert set(vars(status)) == {
        "live_capital_blocked",
        "readiness_blockers",
        "deployment_policy_passed",
        "deployment_policy_hash",
    }
    with pytest.raises(PermissionError, match="read-only"):
        boundary.request_order({"instrument": "AAPL", "quantity": 100})
    with pytest.raises(PermissionError, match="cannot authorize"):
        boundary.enable_live_mode()
