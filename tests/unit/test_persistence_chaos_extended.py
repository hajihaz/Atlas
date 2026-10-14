"""Process death around atomic-replace and competing journal writers."""

from __future__ import annotations

import os
import subprocess
import sys
from decimal import Decimal

from atlas.execution.journal import TransactionalExecutionJournal
from atlas.operations_hardening import AppliedEventStore, DurableEmergencyStore

ENV = {**os.environ, "PYTHONPATH": "src"}


def _run_child(code: str, path: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-c", code, path],
        env=ENV,
        capture_output=True,
        text=True,
        timeout=20,
    )


def test_kill_before_emergency_replace_preserves_committed_halt(tmp_path) -> None:
    path = tmp_path / "halt.json"
    store = DurableEmergencyStore(path)
    store.engage("operator emergency")
    code = """
import os,sys
from atlas.operations_hardening import DurableEmergencyStore
def exit_before_replace(*args):
    os._exit(79)
os.replace = exit_before_replace
DurableEmergencyStore(sys.argv[1]).clear("unexpected")
"""
    assert _run_child(code, str(path)).returncode == 79
    assert DurableEmergencyStore(path).load().engaged


def test_kill_after_applied_id_replace_preserves_new_registry(tmp_path) -> None:
    path = tmp_path / "events.json"
    AppliedEventStore(path).save({"first"})
    code = """
import os,sys
from atlas.operations_hardening import AppliedEventStore
real_replace=os.replace
def exit_after_replace(*args):
    real_replace(*args)
    os._exit(81)
os.replace=exit_after_replace
AppliedEventStore(sys.argv[1]).save({"first","second"})
"""
    assert _run_child(code, str(path)).returncode == 81
    assert AppliedEventStore(path).load() == frozenset({"first", "second"})


def test_two_independent_processes_cannot_append_stale_states(tmp_path) -> None:
    path = tmp_path / "execution.db"
    TransactionalExecutionJournal(path)
    code = """
import datetime as dt,sys
from decimal import Decimal
from atlas.broker.adapter import BrokerFill
from atlas.execution.journal import TransactionalExecutionJournal
from atlas.execution.ledger import ExecutionLedger
from atlas.portfolio.account import PortfolioAccount
try:
    TransactionalExecutionJournal(sys.argv[1]).apply_broker_fill(
        account=PortfolioAccount(cash=Decimal('100')),
        ledger=ExecutionLedger(),
        fill=BrokerFill('order', 'A', 1, Decimal('10'), Decimal('0')),
        event_id=str(__import__('os').getpid()), side='BUY',
        valuation_prices={'A':Decimal('10')},
        event_time=dt.datetime(2026,10,15,tzinfo=dt.UTC),
    )
except RuntimeError:
    sys.exit(77)
"""
    processes = [
        subprocess.Popen(
            [sys.executable, "-c", code, str(path)],
            env=ENV,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for _ in range(2)
    ]
    outcomes = []
    for process in processes:
        process.communicate(timeout=20)
        outcomes.append(process.returncode)
    assert sorted(outcomes) == [0, 77]
    recovery = TransactionalExecutionJournal(path).recover(initial_cash=Decimal("100"))
    assert len(recovery.applied_event_ids) == 1
    assert recovery.account.state.cash == Decimal("90")


def test_kill_before_paper_account_replace_preserves_original_snapshot(tmp_path) -> None:
    from atlas.execution.ledger import ExecutionLedger
    from atlas.paper.persistence import DurablePaperAccountStore
    from atlas.portfolio.account import PortfolioAccount

    path = tmp_path / "paper.json"
    store = DurablePaperAccountStore(path)
    store.save(PortfolioAccount(cash=Decimal("100")), ExecutionLedger())
    code = """
import os,sys
from decimal import Decimal
from atlas.execution.ledger import ExecutionLedger
from atlas.paper.persistence import DurablePaperAccountStore
from atlas.portfolio.account import PortfolioAccount
def terminate(*args):
    os._exit(82)
os.replace=terminate
DurablePaperAccountStore(sys.argv[1]).save(
    PortfolioAccount(cash=Decimal('999')), ExecutionLedger())
"""
    assert _run_child(code, str(path)).returncode == 82
    restored = store.load(ledger=ExecutionLedger(), valuation_prices={})
    assert restored.state.cash == Decimal("100")
