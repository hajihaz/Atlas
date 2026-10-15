from atlas.governance.lean_runtime_security import (
    PATCHED_ZIP,
    REQUIRED_RUNTIME_PACKAGES,
    evaluate_lean_candidate,
)


def _deps(packages: set[str]) -> dict[str, object]:
    return {"libraries": {f"{p}/1.0": {"type": "package"} for p in packages}}


def test_security_candidate_requires_complete_runtime_dependency_closure() -> None:
    verdict = evaluate_lean_candidate(_deps({PATCHED_ZIP}), known_advisory_count=0)
    assert not verdict.passed
    assert "missing_runtime_dependency:RestSharp" in verdict.blockers


def test_candidate_with_zip_replacement_and_all_required_dependencies_passes() -> None:
    verdict = evaluate_lean_candidate(
        _deps(set(REQUIRED_RUNTIME_PACKAGES) | {PATCHED_ZIP}), known_advisory_count=0
    )
    assert verdict.passed
    assert verdict.observed_packages == len(REQUIRED_RUNTIME_PACKAGES) + 1


def test_legacy_zip_and_advisories_block_even_if_other_dependencies_exist() -> None:
    verdict = evaluate_lean_candidate(
        _deps(set(REQUIRED_RUNTIME_PACKAGES) | {PATCHED_ZIP, "DotNetZip"}),
        known_advisory_count=2,
    )
    assert not verdict.passed
    assert "legacy_dotnetzip_present" in verdict.blockers
    assert "known_vulnerable_packages" in verdict.blockers
