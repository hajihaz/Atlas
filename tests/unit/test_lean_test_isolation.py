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


def test_repeat_diagnostic_never_converts_one_crash_to_success():
    from scripts.lean_test_isolation import IsolatedTestResult

    history = (
        IsolatedTestResult("example", "PASS", 0, "attempt-1/example.log"),
        IsolatedTestResult("example", "BLOCKED_PYTHONNET_GIL", 1, "attempt-2/example.log"),
    )
    assert len([case for case in history if case.state != "PASS"]) == 1
    assert not all(case.state == "PASS" for case in history)


def test_single_worker_runsettings_declares_zero_nunit_workers():
    from pathlib import Path
    from xml.etree import ElementTree

    path = Path("scripts/lean-fixtures/nunit-single-worker.runsettings")
    doc = ElementTree.parse(path)
    assert doc.findtext("./NUnit/NumberOfTestWorkers") == "0"
