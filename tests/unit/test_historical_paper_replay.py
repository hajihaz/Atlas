import datetime as dt
from pathlib import Path
from zipfile import ZipFile

import pytest

from atlas.paper.historical_replay import load_lean_daily, replay_lean_history

SAMPLES = Path(__file__).resolve().parents[2] / "Lean/Data/equity/usa/daily"


def _make_fixture(path: Path, contents: str) -> None:
    with ZipFile(path, "w") as archive:
        archive.writestr("spy.csv", contents)


def test_historical_replay_uses_distinct_next_day_fills_and_evidence() -> None:
    result = replay_lean_history(SAMPLES)
    assert result.sessions == 30
    assert len(result.dates) == 31
    assert result.source_kind == "historical_lean_fixture_not_live_paper"
    assert result.evidence.runtime_errors == 0
    assert result.evidence.clean_reconciliations
    assert len(set(result.equity_path)) > 1
    assert result.envelope.ledger_hash == result.evidence.ledger_head[1]
    assert result.envelope.data_snapshot_hash == result.snapshot_hash
    assert len(result.source_hashes["spy"]) == 64


def test_historical_replay_is_deterministic_across_process_restarts() -> None:
    first = replay_lean_history(SAMPLES, sessions=10)
    second = replay_lean_history(SAMPLES, sessions=10)
    assert first.envelope == second.envelope
    assert first.equity_path == second.equity_path
    assert first.equity_path[0] != first.equity_path[-1]


@pytest.mark.parametrize(
    "bad",
    [
        "20131008 00:00,10000,12000,9000,11000,10\n20131008 00:00,10000,12000,9000,11000,10",
        "20131008 00:00,10000,9000,11000,10000,10\n20131009 00:00,10000,12000,9000,10000,10",
        "20131008 00:00,10000,12000,9000,11000,10\n20131009 00:00,0,12000,9000,11000,10",
    ],
)
def test_historical_loader_rejects_duplicate_malformed_and_nonpositive_rows(
    tmp_path: Path, bad: str
) -> None:
    path = tmp_path / "spy.zip"
    _make_fixture(path, bad)
    with pytest.raises(ValueError):
        load_lean_daily(path, symbol="spy")


def test_historical_replay_rejects_missing_trading_sessions() -> None:
    with pytest.raises(ValueError, match="insufficient"):
        replay_lean_history(SAMPLES, start=dt.date(2021, 3, 31), sessions=30)


def test_historical_replay_refuses_mislabeled_live_evidence() -> None:
    result = replay_lean_history(SAMPLES, sessions=5)
    assert result.source_kind != "live_market_session"
    assert result.envelope.sessions_completed == 5
