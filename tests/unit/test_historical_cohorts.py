from pathlib import Path

from atlas.paper.historical_cohorts import verify_disjoint_historical_cohorts

SOURCE = Path("Lean/Data/equity/usa/daily")


def test_disjoint_archived_cohorts_are_deterministic_and_labeled_historical():
    if not all((SOURCE / f"{symbol}.zip").is_file() for symbol in ("spy", "aapl")):
        import pytest

        pytest.skip("Real LEAN sample data not present; validated via offline certification")
    first = verify_disjoint_historical_cohorts(SOURCE)
    second = verify_disjoint_historical_cohorts(SOURCE)
    assert first == second
    assert first.source_kind.endswith("not_live_paper")
    assert len(first.cohorts) == 3
    assert all(item.sessions == 125 for item in first.cohorts)
    assert all(len(item.source_snapshot_hash) == 64 for item in first.cohorts)
    assert len({item.source_snapshot_hash for item in first.cohorts}) == 3
