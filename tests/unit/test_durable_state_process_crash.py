import os
import subprocess
import sys
from decimal import Decimal

from atlas.execution.ledger import ExecutionLedger
from atlas.operations_hardening import DurableEmergencyStore
from atlas.paper.persistence import DurablePaperAccountStore
from atlas.portfolio.account import PortfolioAccount


def _child(code: str, path: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = "src"
    return subprocess.run(
        [sys.executable, "-c", code, path], env=env, text=True, capture_output=True
    )


def test_emergency_committed_before_process_exit_recovers_engaged(tmp_path) -> None:
    path = tmp_path / "halt.json"
    code = r"""import os,sys
from pathlib import Path
from atlas.operations_hardening import DurableEmergencyStore
DurableEmergencyStore(Path(sys.argv[1])).engage("crash drill")
os._exit(94)
"""
    assert _child(code, str(path)).returncode == 94
    state = DurableEmergencyStore(path).load()
    assert state.engaged and state.reason == "crash drill"


def test_paper_snapshot_repeated_recovery_is_stable(tmp_path) -> None:
    path = tmp_path / "paper.json"
    store = DurablePaperAccountStore(path)
    ledger = ExecutionLedger()
    store.save(PortfolioAccount(cash=Decimal("123")), ledger)
    for _ in range(10):
        restored = DurablePaperAccountStore(path).load(ledger=ledger, valuation_prices={})
        assert restored.state.cash == Decimal("123")
