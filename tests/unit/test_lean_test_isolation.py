from scripts.lean_test_isolation import classify_lean_test_output


def test_isolated_host_crash_never_counts_as_pass() -> None:
    crash = "The active test run was aborted\nUnhandled exception. GIL must always be released"
    assert classify_lean_test_output(crash, 1) == "BLOCKED_PYTHONNET_GIL"
    assert classify_lean_test_output("The active test run was aborted", 1) == "HOST_ABORTED"


def test_smoke_accepts_only_exactly_one_pass_no_skips() -> None:
    clean = "Passed!  - Failed:     0, Passed:     1, Skipped:     0, Total:     1, Duration: 10 ms"
    assert classify_lean_test_output(clean, 0) == "PASS"
    assert classify_lean_test_output(clean, 1) == "FAILED"
    assert classify_lean_test_output("Skipped! - Failed: 0, Passed: 0, Skipped: 1", 0) == "SKIPPED"
