"""No fabricated stock symbols or profits in the public ScalpStorm report."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from scripts.scalpstorm_build_breakdown import as_text, build

ROOT = Path(__file__).resolve().parents[2]


def test_public_breakdown_has_20_days_and_200_unknown_stock_slots():
    campaign = json.loads((ROOT / "frontend/src/data/scalpstorm-campaign.json").read_text())
    result = build(campaign)
    public = json.loads((ROOT / "frontend/public/scalpstorm-breakdown.json").read_text())
    assert result == public
    assert public["virtualCapitalINR"] == 100000
    assert public["allocation"]["reservedCashPerStockINR"] == 10000
    assert [
        (v["multiplier"], v["totalNotionalINR"])
        for v in public["allocation"]["marginScenariosEducationOnly"]
    ] == [(1, 100000), (2, 200000), (5, 500000)]
    assert public["indexSignalCounts"] == {"BUY": 8, "SELL": 5, "NO_TRADE": 7}
    assert public["stockTradeDaysVerified"] == 0
    assert public["actualRealizedPnlINR"] is None
    assert public["monthlyFeesINR"] is None
    assert public["maxDrawdown"] is None
    assert len(public["days"]) == 20
    assert sum(len(d["slots"]) for d in public["days"]) == 200
    assert all(d["netPnlINR"] is None and d["feesINR"] is None for d in public["days"])
    assert all(
        slot["stock"] is None and slot["entry"] is None and slot["netPnl"] is None
        for d in public["days"]
        for slot in d["slots"]
    )
    assert result["liveCapitalBlocked"] is True
    assert (ROOT / "frontend/public/scalpstorm-breakdown.txt").read_text() == as_text(result)


def test_export_rejects_fictional_or_incomplete_market_data():
    campaign = json.loads((ROOT / "frontend/src/data/scalpstorm-campaign.json").read_text())
    campaign["days"][2]["netPnl"] = "1542"
    with pytest.raises(ValueError, match="unexpected"):
        build(campaign)
    campaign["days"][2]["netPnl"] = None
    campaign["liveCapitalBlocked"] = False
    with pytest.raises(ValueError, match="lock mismatch"):
        build(campaign)
    campaign["liveCapitalBlocked"] = True
    campaign["signalCounts"]["BUY"] = 9
    with pytest.raises(ValueError, match="reconcile"):
        build(campaign)
