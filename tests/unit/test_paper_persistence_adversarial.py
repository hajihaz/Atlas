import json
from decimal import Decimal

import pytest

from atlas.execution.ledger import ExecutionLedger
from atlas.paper.persistence import DurablePaperAccountStore
from atlas.portfolio.account import PortfolioAccount


def test_snapshot_with_broad_permissions_is_refused(tmp_path) -> None:
    path = tmp_path / "account.json"
    store = DurablePaperAccountStore(path)
    store.save(PortfolioAccount(cash=Decimal("100")), ExecutionLedger())
    path.chmod(0o644)
    with pytest.raises(RuntimeError, match="permissions"):
        store.load(ledger=ExecutionLedger(), valuation_prices={})


def test_snapshot_hash_tamper_is_refused(tmp_path) -> None:
    path = tmp_path / "account.json"
    store = DurablePaperAccountStore(path)
    store.save(PortfolioAccount(cash=Decimal("100")), ExecutionLedger())
    raw = json.loads(path.read_text())
    raw["body"]["cash"] = "999"
    path.write_text(json.dumps(raw))
    path.chmod(0o600)
    with pytest.raises(RuntimeError, match="recovery refused"):
        store.load(ledger=ExecutionLedger(), valuation_prices={})


def test_unknown_snapshot_version_is_refused(tmp_path) -> None:
    path = tmp_path / "account.json"
    store = DurablePaperAccountStore(path)
    store.save(PortfolioAccount(cash=Decimal("100")), ExecutionLedger())
    raw = json.loads(path.read_text())
    raw["body"]["version"] = 999
    # Even a self-consistent forged body must fail version validation.
    from atlas.common.hashing import content_hash
    raw["hash"] = content_hash(raw["body"])
    path.write_text(json.dumps(raw))
    path.chmod(0o600)
    with pytest.raises(RuntimeError, match="recovery refused"):
        store.load(ledger=ExecutionLedger(), valuation_prices={})
