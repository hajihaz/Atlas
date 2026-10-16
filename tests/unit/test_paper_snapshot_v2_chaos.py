"""Physical child-process crash after a v2 account snapshot commit."""

from __future__ import annotations

import datetime as dt
import os
import subprocess
import sys
from decimal import Decimal

import pytest

from atlas.execution.ledger import ExecutionEvent, ExecutionLedger
from atlas.execution.simulator import Fill
from atlas.paper.persistence import DurablePaperAccountStore


def _reference_ledger() -> ExecutionLedger:
    ledger = ExecutionLedger()
    ledger.append(
        ExecutionEvent(
            "fill-1",
            "fill",
            dt.datetime(2026, 10, 16, tzinfo=dt.UTC),
            "A",
            2,
            Decimal("10"),
            Decimal("1"),
            Decimal("79"),
            Decimal("101"),
        )
    )
    return ledger


def test_v2_snapshot_committed_before_child_exit_retains_fill_history(tmp_path):
    path = tmp_path / "account.json"
    code = """
import datetime as dt,os,sys
from decimal import Decimal
from atlas.execution.ledger import ExecutionEvent,ExecutionLedger
from atlas.execution.simulator import Fill
from atlas.paper.persistence import DurablePaperAccountStore
from atlas.portfolio.account import PortfolioAccount
account=PortfolioAccount(cash=Decimal('100'))
transition=account.apply_fill(Fill('A',2,Decimal('10'),Decimal('1')),
  event_id='fill-1',valuation_prices={'A':Decimal('11')})
ledger=ExecutionLedger()
ledger.append(ExecutionEvent('fill-1','fill',
  dt.datetime(2026,10,16,tzinfo=dt.UTC),'A',2,Decimal('10'),Decimal('1'),
  transition.cash_after,transition.equity_after))
DurablePaperAccountStore(sys.argv[1]).save(account,ledger)
os._exit(75)
"""
    result = subprocess.run(
        [sys.executable, "-c", code, str(path)],
        env={**os.environ, "PYTHONPATH": "src"},
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert result.returncode == 75
    account = DurablePaperAccountStore(path).load(
        ledger=_reference_ledger(), valuation_prices={"A": Decimal("11")}
    )
    assert account.state.cash == Decimal("79")
    assert account.state.holdings == {"A": 2}
    assert account.transitions()[0].event_id == "fill-1"
    with pytest.raises(RuntimeError, match="duplicate portfolio fill"):
        account.apply_fill(
            Fill("A", 2, Decimal("10"), Decimal("1")),
            event_id="fill-1",
            valuation_prices={"A": Decimal("11")},
        )
