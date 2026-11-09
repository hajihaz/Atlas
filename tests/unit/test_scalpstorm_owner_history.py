"""Artificial source envelopes exercise the replay pipeline in temporary folders only."""

import gzip
import importlib.util
import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

from atlas.paper.scalpstorm_owner import digest, session_time

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/replay_scalpstorm_owner_history.py"
spec = importlib.util.spec_from_file_location("owner_replay_under_test", SCRIPT)
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)


def candle(date, clock, price, volume=100000):
    return [date + "T" + clock + ":00+05:30", price, price + 1, price - 1, price, volume, 0]


def test_replay_is_causal_unqualified_and_cannot_reset_existing_research(tmp_path):
    tmp_path.chmod(0o700)
    source = tmp_path / "source"
    source.mkdir(mode=0o700)
    date = "2026-10-01"
    instruments = [
        {"instrumentKey": f"NSE_EQ|INE{i:09d}", "symbol": f"QA{i:03d}"} for i in range(101)
    ]
    universe = {"instruments": instruments, "payloadSHA256": "a" * 64}
    (source / "universe.json").write_text(json.dumps(universe))
    (source / "progress.json").write_text(
        json.dumps(
            {
                "complete": True,
                "failed": 0,
                "eligibleCount": 101,
                "candles": 600,
                "fromDate": date,
                "toDate": date,
            }
        )
    )
    for row in instruments:
        response = {
            "status": "success",
            "data": {
                "candles": [
                    candle(date, "09:15", 100),
                    candle(date, "09:38", 100),
                    candle(date, "09:40", 100),
                    candle(date, "09:41", 100),
                    candle(date, "15:14", 102),
                    candle(date, "15:15", 102),
                ]
            },
        }
        if row["symbol"] == "QA100":
            response["data"]["candles"] = []
        envelope = {
            "instrumentKey": row["instrumentKey"],
            "universeHash": "a" * 64,
            "response": response,
            "sourcePayloadSHA256": digest(response),
        }
        file = source / (
            replay.hashlib.sha256(row["instrumentKey"].encode()).hexdigest() + ".json.gz"
        )
        with gzip.open(file, "wt") as h:
            json.dump(envelope, h)
        file.chmod(0o600)
    (tmp_path / "scalpstorm-history.json").write_text(
        json.dumps(
            {
                "schema": "atlas.scalpstorm-history.v1",
                "realOrdersEnabled": False,
                "actualCapitalINR": 0,
                "prices": {
                    "bars": [
                        {"time": "2026-09-30T00:00:00+05:30", "close": 100},
                        {"time": date + "T00:00:00+05:30", "close": 100.3},
                    ]
                },
            }
        )
    )
    # The production check rejects group/world-readable snapshot files. Make the fixture
    # owner-private explicitly so the test does not depend on the runner's umask (CI uses 022).
    for fixture_file in tmp_path.rglob("*"):
        if fixture_file.is_file():
            fixture_file.chmod(0o600)
    args = [
        "replay",
        "--upstox-credential-file",
        str(tmp_path / "never-read"),
        "--state-dir",
        str(tmp_path),
        "--source-dir",
        str(source),
    ]
    nifty = {"status": "success", "data": {"candles": [candle(date, "09:29", 100.3)]}}
    with (
        patch.object(sys, "argv", args),
        patch.object(replay, "read_analytics_credential", return_value="QA_ONLY"),
        patch.object(replay, "market_data_get", return_value=nifty),
    ):
        assert replay.main() == 0
        report = json.loads((source / "replay-report.json").read_text())
        assert report["mode"] == "HISTORICAL_REPLAY"
        assert report["ledgerVerified"] is True
        assert report["realOrdersEnabled"] is False
        assert report["fills"] == 20
        assert report["netPnlINR"] > 0
        entries = [e for e in report["events"] if e.get("phase") == "ENTRY"]
        assert all(
            e["at"] == session_time(date, 581) and e["sourceTradeAt"] > e["signalAt"]
            for e in entries
        )
        history = json.loads((tmp_path / "scalpstorm-history.json").read_text())["replay"]
        assert history["qualified"] is False
        assert history["historicalPointInTimeUniverse"] is False
        assert history["coverageByDay"] == [
            {
                "date": date,
                "universeCount": 101,
                "observedCount": 100,
                "missingCount": 1,
            }
        ]
        assert report["days"][0]["decision"]["eligibleCount"] == 100
        assert len(history["monthly"]) == 1
        before = (source / "scalpstorm-owner-history.sqlite3").read_bytes()
        with pytest.raises(ValueError, match="already exists"):
            replay.main()
        assert (source / "scalpstorm-owner-history.sqlite3").read_bytes() == before


def test_changed_historical_payload_cannot_reuse_a_source_digest(tmp_path):
    file = tmp_path / "source.json.gz"
    response = {"status": "success", "data": {"candles": []}}
    value = {
        "instrumentKey": "NSE_EQ|INE000000001",
        "universeHash": "a" * 64,
        "response": response,
        "sourcePayloadSHA256": "incorrect",
    }
    with gzip.open(file, "wt") as h:
        json.dump(value, h)
    file.chmod(0o600)
    with pytest.raises(ValueError, match="checksum"):
        replay.read_source(file, value["instrumentKey"], value["universeHash"])
