"""Artificial sessions are confined to private temporary folders, never the owner account."""

import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest

from atlas.paper.scalpstorm_audit import audit_session
from atlas.paper.scalpstorm_owner import OwnerStore

ROOT = Path(__file__).resolve().parents[2]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


fixtures = module("owner_audit_fixtures", "tests/unit/test_scalpstorm_owner.py")
worker = module("owner_audit_worker", "scripts/run_scalpstorm_owner.py")


def session(tmp_path, change=0.3, close=True, receipts=True):
    tmp_path.chmod(0o700)
    history = tmp_path / "scalpstorm-history.json"
    history.write_text(
        json.dumps(
            {
                "schema": "atlas.scalpstorm-history.v1",
                "prices": {
                    "instrumentKey": "NSE_INDEX|Nifty 50",
                    "source": "Upstox Analytics V3 / days / 1",
                    "bars": [{"time": "2026-10-26T00:00:00+05:30", "close": 100}],
                },
            }
        )
    )
    history.chmod(0o600)
    store = OwnerStore(tmp_path / "scalpstorm-owner.sqlite3", fixtures.at("09:15:00"))
    saved = set()
    for clock in ["09:40:00", "09:40:02", "15:15:02"] if close else ["09:40:00", "09:40:02"]:
        inp = fixtures.payload(clock, change)
        inp["niftySignal"]["previousCloseMethod"] = "PROVIDER_PREVIOUS_CLOSE"
        inp["niftySignal"]["previousCloseDate"] = "2026-10-26"
        if clock.startswith("15:"):
            inp["quotes"] = [fixtures.quote(i, "15:15:01", 102) for i in range(10)]
        now = fixtures.at(clock)
        if receipts:
            worker.archive_input(tmp_path, inp, saved)
            worker.archive_processing(tmp_path, inp, now, store.load()[1])
        store.advance(inp, now)
    store.close()


@pytest.mark.parametrize("change", [0.3, -0.3, 0.0])
def test_complete_long_short_and_moderate_sessions_audit_from_actual_receipts(tmp_path, change):
    session(tmp_path, change)
    before = (tmp_path / "scalpstorm-owner.sqlite3").read_bytes()
    result = audit_session(tmp_path)
    assert result["accountingVerified"]
    assert result["sessionAccepted"]
    assert result["entries"] == result["exits"] == 10
    assert result["sourceGroupsVerified"] == 3
    assert result["sourceGroupsMissing"] == 0
    assert result["timedSelectionVerified"]
    assert result["qualified"] is False
    assert result["realOrdersEnabled"] is False
    assert (tmp_path / "scalpstorm-owner.sqlite3").read_bytes() == before


def test_first_session_missing_books_cannot_be_certified_even_when_flat(tmp_path):
    session(tmp_path, receipts=False)
    result = audit_session(tmp_path)
    assert result["accountingVerified"]
    assert not result["sessionAccepted"]
    assert result["sourceGroupsMissing"] == 3
    assert result["status"] == "SOURCE_EVIDENCE_MISSING"


def test_open_positions_remain_incomplete_despite_complete_entry_receipts(tmp_path):
    session(tmp_path, close=False)
    result = audit_session(tmp_path)
    assert result["accountingVerified"]
    assert result["openPositions"] == 10
    assert not result["sessionAccepted"]


def test_tampered_source_book_is_not_accepted(tmp_path):
    session(tmp_path)
    file = (
        tmp_path / "scalpstorm-observations/2026-10-27" / (str(fixtures.at("09:40:02")) + ".json")
    )
    value = json.loads(file.read_text())
    value["input"]["quotes"][0]["depth"]["sell"]["quantity"] = 1
    file.write_text(json.dumps(value))
    result = audit_session(tmp_path)
    assert not result["sessionAccepted"]
    assert result["sourceGroupsInvalid"]


def test_processing_receipt_must_bind_the_pre_mutation_ledger_head(tmp_path):
    session(tmp_path)
    file = tmp_path / "scalpstorm-processing/2026-10-27" / (str(fixtures.at("15:15:02")) + ".json")
    value = json.loads(file.read_text())
    value["beforeLedgerHead"] = "GENESIS"
    file.write_text(json.dumps(value))
    result = audit_session(tmp_path)
    assert not result["sessionAccepted"]
    assert result["sourceGroupsInvalid"]


def test_corrupt_immutable_accounting_is_rejected_without_repair(tmp_path):
    session(tmp_path)
    file = tmp_path / "scalpstorm-owner.sqlite3"
    with sqlite3.connect(file) as db:
        db.execute("UPDATE owner_events SET hash='corrupt' WHERE seq=2")
    with pytest.raises(ValueError, match="event chain"):
        audit_session(tmp_path)


def test_world_readable_evidence_is_refused(tmp_path):
    session(tmp_path)
    file = tmp_path / "scalpstorm-processing/2026-10-27" / (str(fixtures.at("15:15:02")) + ".json")
    file.chmod(0o644)
    result = audit_session(tmp_path)
    assert not result["sessionAccepted"]
    assert result["sourceGroupsInvalid"]


def test_wrong_nifty_daily_reference_cannot_certify_a_session(tmp_path):
    session(tmp_path)
    file = tmp_path / "scalpstorm-history.json"
    value = json.loads(file.read_text())
    value["prices"]["bars"][0]["close"] = 105
    file.write_text(json.dumps(value))
    result = audit_session(tmp_path)
    assert result["accountingVerified"]
    assert not result["sessionAccepted"]
    assert result["sourceGroupsInvalid"]
