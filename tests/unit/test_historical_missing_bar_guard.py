import datetime as dt
from pathlib import Path
from zipfile import ZipFile

import pytest

from atlas.paper.historical_replay import replay_lean_history


def _store_symbol(folder: Path, symbol: str, dates: list[dt.date]):
    with ZipFile(folder / f"{symbol}.zip", "w") as archive:
        archive.writestr(
            f"{symbol}.csv",
            "\n".join(f"{day:%Y%m%d} 00:00,100000,105000,99000,101000,1500" for day in dates),
        )


def test_missing_single_instrument_bar_blocks_replay(tmp_path):
    days = [dt.date(2013, 10, 7) + dt.timedelta(days=d) for d in range(15)]
    _store_symbol(tmp_path, "spy", days)
    _store_symbol(tmp_path, "aapl", [day for day in days if day != days[2]])
    with pytest.raises(ValueError, match="asymmetric historical bar"):
        replay_lean_history(tmp_path, start=days[0], sessions=5)


def test_shared_market_holiday_is_not_interpreted_as_missing_bar(tmp_path):
    days = [dt.date(2013, 10, 7) + dt.timedelta(days=d) for d in range(15) if d != 2]
    _store_symbol(tmp_path, "spy", days)
    _store_symbol(tmp_path, "aapl", days)
    report = replay_lean_history(tmp_path, start=days[0], sessions=5)
    assert report.sessions == 5
    assert dt.date(2013, 10, 9).isoformat() not in report.dates
