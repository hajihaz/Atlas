"""ScalpStorm export cannot show synthetic trades or mix index and stock evidence."""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import pytest
from scripts.scalpstorm_nifty_signals import build_campaign, chat_digest, load_index_sources

from atlas.paper.scalpstorm import SESSIONS

ROOT = Path(__file__).resolve().parents[2]


def test_one_public_report_drives_atlas_and_chat():
    data_path = ROOT / "frontend/src/data/scalpstorm-campaign.json"
    ui = json.loads(data_path.read_text())
    exported = json.loads((ROOT / "frontend/public/scalpstorm-report.json").read_text())
    assert ui == exported
    assert ui["expectedSessions"] == len(SESSIONS) == 20
    assert ui["indexSignalSessionsValidated"] == 20
    assert ui["calendarSessionsVerified"] == 20
    assert ui["verifiedSessions"] == 0
    assert ui["netPnlINR"] is None
    assert ui["liveCapitalBlocked"] is True
    assert ui["signalCounts"] == {"BUY": 8, "SELL": 5, "NO_TRADE": 7}
    assert [x["date"] for x in ui["days"]] == [x.isoformat() for x in SESSIONS]
    assert all(x["niftyMinutesChecked"] == 375 for x in ui["days"])
    assert all(
        x["selected"] is None and x["trades"] is None and x["netPnl"] is None for x in ui["days"]
    )
    report = (ROOT / "frontend/public/scalpstorm-chat-report.txt").read_text()
    assert "20/20 community NIFTY index signals reconstructed" in report
    assert "0/20 complete top-volume-stock" in report
    assert "ACTUAL INTRADAY P&L: UNAVAILABLE" in report
    assert "NOT VERIFIED" in report


def test_public_ui_cannot_place_orders():
    ui = (ROOT / "frontend/src/components/ScalpStormDetailed.tsx").read_text()
    app = (ROOT / "frontend/src/App.tsx").read_text()
    assert "ScalpStormDetailed" in app
    assert "scalpstorm-report.json" in ui
    assert "scalpstorm-chat-report.txt" in ui
    assert "NET STOCK TRADING P&L" in ui
    assert "fetch(" not in ui
    assert "GROWW_API_TOKEN" not in ui
    assert "broker/order" not in ui


def _synthetic_index() -> dict[dt.date, dict[dt.time, dict]]:
    from decimal import Decimal

    m = {}
    for day in SESSIONS:
        m[day] = {
            (dt.datetime.combine(day, dt.time(9, 15)) + dt.timedelta(minutes=i)).time(): {
                "open": Decimal("100"),
                "close": Decimal("100"),
            }
            for i in range(375)
        }
    return m


def test_neutral_synthetic_input_never_creates_trades():
    raw = _synthetic_index()
    digest = build_campaign(raw, [], "a" * 40)
    assert digest["signalCounts"]["NO_TRADE"] == 20
    assert digest["verifiedSessions"] == 0
    assert digest["netPnlINR"] is None
    assert all(d["trades"] is None for d in digest["days"])
    assert "Net trading" not in chat_digest(digest) or "UNAVAILABLE" in chat_digest(digest)


def test_requires_full_index_coverage(tmp_path: Path):
    path = tmp_path / "sep.csv"
    path.write_text("Epoch,Timestamp,Open,High,Low,Close,Volume\n")
    with pytest.raises(ValueError, match="two public NIFTY"):
        load_index_sources([path])
    q = tmp_path / "oct.csv"
    q.write_text("Epoch,Timestamp,Open,High,Low,Close,Volume\n")
    with pytest.raises(ValueError, match="incomplete NIFTY"):
        load_index_sources([path, q])


def test_bad_git_commit_rejected():
    with pytest.raises(ValueError, match="exact SHA1"):
        build_campaign(_synthetic_index(), [], "INVALID")


def test_atlas_direct_link_opens_scalpstorm_without_router():
    ui = (ROOT / "frontend/src/App.tsx").read_text()
    assert "window.location.hash === '#scalpstorm'" in ui
