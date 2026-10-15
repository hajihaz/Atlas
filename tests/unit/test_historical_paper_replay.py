import datetime as dt
from pathlib import Path
from zipfile import ZipFile

import pytest

from atlas.paper.historical_replay import load_lean_daily, replay_lean_history

REAL_LEAN_SAMPLES = Path(__file__).resolve().parents[2] / "Lean/Data/equity/usa/daily"


@pytest.fixture(scope="module")
def sample_data(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Use archived LEAN market files locally; reproducible synthetic files in isolated CI.

    Synthetic CI fixtures test the replay engine, not real external market performance.
    The separate offline certification gate always reads genuine archived LEAN samples.
    """
    if all((REAL_LEAN_SAMPLES / f"{symbol}.zip").is_file() for symbol in ("spy", "aapl")):
        return REAL_LEAN_SAMPLES

    directory = tmp_path_factory.mktemp("atlas-synthetic-lean-daily")
    start = dt.date(2013, 9, 25)
    days = []
    for offset in range(260):
        day = start + dt.timedelta(days=offset)
        if day.weekday() < 5:
            days.append(day)
    for symbol, basis in (("spy", 1500000), ("aapl", 500000)):
        rows = []
        for index, day in enumerate(days):
            opening = basis + index * 281 + (index % 7) * 73
            closing = opening + ((index % 5) - 2) * 97
            high = max(opening, closing) + 211
            low = min(opening, closing) - 173
            rows.append(f"{day:%Y%m%d} 00:00,{opening},{high},{low},{closing},{1500 + index}")
        with ZipFile(directory / f"{symbol}.zip", "w") as archive:
            archive.writestr(f"{symbol}.csv", "\n".join(rows))
    return directory


def _make_fixture(path: Path, contents: str) -> None:
    with ZipFile(path, "w") as archive:
        archive.writestr("spy.csv", contents)


def test_historical_replay_uses_distinct_next_day_fills_and_evidence(sample_data: Path) -> None:
    result = replay_lean_history(sample_data)
    assert result.sessions == 30
    assert len(result.dates) == 31
    assert result.source_kind == "historical_lean_fixture_not_live_paper"
    assert result.evidence.runtime_errors == 0
    assert result.evidence.clean_reconciliations
    assert len(set(result.equity_path)) > 1
    assert result.envelope.ledger_hash == result.evidence.ledger_head[1]
    assert result.envelope.data_snapshot_hash == result.snapshot_hash
    assert len(result.source_hashes["spy"]) == 64


def test_historical_replay_is_deterministic_across_process_restarts(sample_data: Path) -> None:
    first = replay_lean_history(sample_data, sessions=10)
    second = replay_lean_history(sample_data, sessions=10)
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


def test_historical_replay_rejects_missing_trading_sessions(sample_data: Path) -> None:
    with pytest.raises(ValueError, match="insufficient"):
        replay_lean_history(sample_data, start=dt.date(2021, 3, 31), sessions=30)


def test_historical_replay_refuses_mislabeled_live_evidence(sample_data: Path) -> None:
    result = replay_lean_history(sample_data, sessions=5)
    assert result.source_kind != "live_market_session"
    assert result.envelope.sessions_completed == 5


def test_historical_replay_hundred_sessions_still_reproducible(sample_data: Path) -> None:
    a = replay_lean_history(sample_data, sessions=100)
    b = replay_lean_history(sample_data, sessions=100)
    assert a.sessions == b.sessions == 100
    assert len(a.equity_path) == len(b.equity_path) == 100
    assert a.envelope == b.envelope
    assert a.evidence.clean_reconciliations and b.evidence.clean_reconciliations
    assert a.envelope.observations_hash
