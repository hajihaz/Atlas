import pytest

from atlas.health import HealthReport, HealthSignal, HealthStatus, evaluate_health


def test_forged_healthy_report_with_empty_signals_fails_closed():
    with pytest.raises(RuntimeError, match="missing_or_blocked_health_evidence"):
        HealthReport(HealthStatus.HEALTHY, ()).assert_capital_safe()


def test_forged_status_ignoring_degraded_or_blocking_signals_fails_closed():
    with pytest.raises(RuntimeError, match="blocked"):
        HealthReport(
            HealthStatus.HEALTHY,
            (HealthSignal("monitor", False, capital_blocking=False),),
        ).assert_capital_safe()
    with pytest.raises(RuntimeError, match="blocked"):
        HealthReport(HealthStatus.HEALTHY, (HealthSignal("risk", False),)).assert_capital_safe()


def test_duplicate_or_blank_signal_names_and_incorrect_flag_types_fail_closed():
    bad = (
        (HealthSignal("recon", True), HealthSignal("recon", True)),
        (HealthSignal("", True),),
        (HealthSignal("risk", 1),),
    )
    for signals in bad:
        with pytest.raises(RuntimeError, match="blocked"):
            HealthReport(HealthStatus.HEALTHY, signals).assert_capital_safe()


def test_a_legitimate_nonblocking_degradation_remains_accepted_for_paper():
    report = evaluate_health(
        (
            HealthSignal("risk", True),
            HealthSignal("reporting", False, capital_blocking=False),
        )
    )
    assert report.status == HealthStatus.DEGRADED
    report.assert_capital_safe()
