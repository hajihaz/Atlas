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


def test_fatal_host_evidence_overrides_forged_pass_summary() -> None:
    summary = "Passed! - Failed: 0, Passed: 1, Skipped: 0, Total: 1,"
    assert classify_lean_test_output(summary, 0) == "PASS"
    assert (
        classify_lean_test_output(summary + " Unhandled exception. GIL must always be released", 0)
        == "BLOCKED_PYTHONNET_GIL"
    )
    assert classify_lean_test_output(summary + " Test Run Aborted.", 0) == "HOST_ABORTED"
    assert classify_lean_test_output(summary + " Skipped: 1", 0) == "SKIPPED"
    assert classify_lean_test_output(summary + "\n" + summary, 0) == "FAILED"


def test_run_directory_is_unique_and_rejects_traversal(tmp_path) -> None:
    import pytest
    from scripts.lean_test_isolation import new_run_dir

    first = new_run_dir("diag-20261017-a", root=tmp_path)
    (first / "evidence.log").write_text("upstream failure must persist")
    with pytest.raises(FileExistsError):
        new_run_dir("diag-20261017-a", root=tmp_path)
    assert (first / "evidence.log").read_text() == "upstream failure must persist"
    for invalid in ("../outside", "../../foo", "one.dot", "bad/id", "a", ""):
        with pytest.raises(ValueError):
            new_run_dir(invalid, root=tmp_path)
