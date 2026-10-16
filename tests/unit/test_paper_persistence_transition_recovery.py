import datetime as dt
import json
from decimal import Decimal

import pytest

from atlas.common.hashing import content_hash
from atlas.execution.ledger import ExecutionEvent, ExecutionLedger
from atlas.execution.simulator import Fill
from atlas.paper.persistence import DurablePaperAccountStore
from atlas.portfolio.account import PortfolioAccount


def _portfolio_and_ledger():
    account = PortfolioAccount(cash=Decimal("1000"))
    ledger = ExecutionLedger()
    for index, signed in enumerate((2, 1, -1)):
        item = account.apply_fill(
            Fill("A", signed, Decimal("100"), Decimal("1")),
            event_id=f"fill-{index}",
            valuation_prices={"A": Decimal("105")},
        )
        ledger.append(
            ExecutionEvent(
                item.event_id,
                "fill",
                dt.datetime(2026, 10, 16, tzinfo=dt.UTC),
                item.instrument_id,
                item.quantity,
                item.fill_price,
                item.fee,
                item.cash_after,
                item.equity_after,
            )
        )
    return account, ledger


def test_restored_snapshot_keeps_all_fill_identities_and_blocks_duplicate(tmp_path):
    account, ledger = _portfolio_and_ledger()
    path = tmp_path / "snapshot.json"
    store = DurablePaperAccountStore(path)
    store.save(account, ledger)
    restored = store.load(ledger=ledger, valuation_prices={"A": Decimal("105")})
    assert restored.state == account.state
    assert restored.transitions() == account.transitions()
    with pytest.raises(RuntimeError, match="duplicate portfolio fill"):
        restored.apply_fill(
            Fill("A", 2, Decimal("100"), Decimal("1")),
            event_id="fill-0",
            valuation_prices={"A": Decimal("105")},
        )
    assert restored.state == account.state


def test_rehashed_forgery_of_fill_price_fails_ledger_binding(tmp_path):
    account, ledger = _portfolio_and_ledger()
    path = tmp_path / "snapshot.json"
    store = DurablePaperAccountStore(path)
    store.save(account, ledger)
    raw = json.loads(path.read_text())
    raw["body"]["transitions"][0]["fill_price"] = "101"
    raw["hash"] = content_hash(raw["body"])
    path.write_text(json.dumps(raw))
    path.chmod(0o600)
    with pytest.raises(RuntimeError, match="recovery refused"):
        store.load(ledger=ledger, valuation_prices={"A": Decimal("105")})


def test_legacy_snapshot_with_fills_is_not_silently_upgraded(tmp_path):
    account, ledger = _portfolio_and_ledger()
    path = tmp_path / "snapshot.json"
    store = DurablePaperAccountStore(path)
    store.save(account, ledger)
    raw = json.loads(path.read_text())
    raw["body"]["version"] = 1
    del raw["body"]["transitions"]
    raw["hash"] = content_hash(raw["body"])
    path.write_text(json.dumps(raw))
    path.chmod(0o600)
    with pytest.raises(RuntimeError, match="recovery refused"):
        store.load(ledger=ledger, valuation_prices={"A": Decimal("105")})


def test_save_refuses_portfolio_fill_without_corresponding_ledger_entry(tmp_path):
    account, _ = _portfolio_and_ledger()
    with pytest.raises(ValueError, match="independently bound"):
        DurablePaperAccountStore(tmp_path / "untrusted.json").save(account, ExecutionLedger())
