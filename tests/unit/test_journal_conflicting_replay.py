import datetime as dt
import sqlite3
from decimal import Decimal

import pytest

from atlas.broker.adapter import BrokerFill
from atlas.execution.journal import TransactionalExecutionJournal
from atlas.execution.ledger import ExecutionLedger
from atlas.portfolio.account import PortfolioAccount

WHEN = dt.datetime(2026, 10, 16, tzinfo=dt.UTC)


def _apply(journal, account, ledger, *, order="order-1", price="10", event_id="fill-1"):
    return journal.apply_broker_fill(
        account=account,
        ledger=ledger,
        fill=BrokerFill(order, "A", 2, Decimal(price), Decimal("1")),
        event_id=event_id,
        side="BUY",
        valuation_prices={"A": Decimal("11")},
        event_time=WHEN,
    )


def test_identical_broker_fill_replay_is_idempotent(tmp_path):
    journal = TransactionalExecutionJournal(tmp_path / "state.db")
    account = PortfolioAccount(cash=Decimal("100"))
    ledger = ExecutionLedger()
    assert _apply(journal, account, ledger)
    assert not _apply(journal, account, ledger)
    assert account.state.cash == Decimal("79")
    assert len(ledger.entries()) == 1


@pytest.mark.parametrize("changed", [{"order": "new-order"}, {"price": "12"}])
def test_same_event_id_with_changed_broker_observation_is_rejected(tmp_path, changed):
    journal = TransactionalExecutionJournal(tmp_path / "state.db")
    account = PortfolioAccount(cash=Decimal("100"))
    ledger = ExecutionLedger()
    assert _apply(journal, account, ledger)
    with pytest.raises(RuntimeError, match="conflicting replay"):
        _apply(journal, account, ledger, **changed)
    assert journal.recover(initial_cash=Decimal("100")).applied_event_ids == {"fill-1"}


def test_corrupted_old_fill_cannot_be_acknowledged_as_duplicate_or_extended(tmp_path):
    path = tmp_path / "state.db"
    journal = TransactionalExecutionJournal(path)
    account = PortfolioAccount(cash=Decimal("100"))
    ledger = ExecutionLedger()
    assert _apply(journal, account, ledger)
    with sqlite3.connect(path) as db:
        db.execute("UPDATE execution_events SET cash_after='999' WHERE seq=0")
    with pytest.raises(RuntimeError):
        _apply(journal, account, ledger)
    with pytest.raises(RuntimeError):
        _apply(journal, account, ledger, event_id="fill-2")
