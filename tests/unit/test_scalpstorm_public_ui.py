"""Atlas public campaign must never imply paper positions are verified."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from atlas.paper.scalpstorm import SESSIONS

ROOT = Path(__file__).resolve().parents[2]


def test_scalpstorm_public_status_is_explicitly_unverified():
    obj = json.loads((ROOT / "frontend/src/data/scalpstorm-campaign.json").read_text())
    assert obj["liveCapitalBlocked"] is True
    assert obj["capitalINR"] == 100000
    assert obj["expectedSessions"] == len(SESSIONS) == 20
    assert obj["verifiedSessions"] == 0
    assert obj["netPnlINR"] is None
    assert obj["sourceStatus"] == "COMMUNITY_NIFTY_OHLC_VALIDATED_NOT_EXCHANGE_ATTESTED"
    assert [date.fromisoformat(d["date"]) for d in obj["days"]] == list(SESSIONS)
    assert all(d["netPnl"] is None and d["trades"] is None for d in obj["days"])


def test_public_ui_never_sources_prices_or_credentials():
    ui = (ROOT / "frontend/src/App.tsx").read_text()
    detail = (ROOT / "frontend/src/components/ScalpStormDetailed.tsx").read_text()
    # Archived campaign remains as evidence, not as a public P&L display.
    assert "ScalpStormDetailed" not in ui
    assert "OwnerStrategyPage" in ui
    assert "StrategyLabPage" in ui
    assert "NET STOCK TRADING P&L" in detail
    assert "scalpstorm-report.json" in detail
    assert "Broker orders remain disabled" in ui
    assert "fetch(" not in detail
    assert "UPSTOX_ACCESS_TOKEN" not in detail
    assert "GROWW_API_TOKEN" not in detail
