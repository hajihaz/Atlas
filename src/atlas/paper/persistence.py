"""Crash-safe paper account snapshots with integrity validation."""

from __future__ import annotations

import json
import os
import tempfile
from collections.abc import Mapping
from decimal import Decimal
from pathlib import Path

from atlas.common.hashing import content_hash
from atlas.execution.ledger import ExecutionLedger
from atlas.portfolio.account import PortfolioAccount


class DurablePaperAccountStore:
    VERSION = 1

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def save(self, account: PortfolioAccount, ledger: ExecutionLedger) -> None:
        ledger.verify_integrity()
        body = {
            "version": self.VERSION,
            "cash": str(account.state.cash),
            "holdings": dict(sorted(account.state.holdings.items())),
            "equity": str(account.state.equity),
            "ledger_checkpoint": list(ledger.head_checkpoint()),
            "transition_event_ids": [t.event_id for t in account.transitions()],
        }
        payload = {"body": body, "hash": content_hash(body)}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, raw_tmp = tempfile.mkstemp(prefix=self.path.name + ".", dir=self.path.parent)
        tmp = Path(raw_tmp)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, sort_keys=True, separators=(",", ":"))
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp, self.path)
            os.chmod(self.path, 0o600)
        finally:
            if tmp.exists():
                tmp.unlink()

    def load(
        self,
        *,
        ledger: ExecutionLedger,
        valuation_prices: Mapping[str, Decimal],
    ) -> PortfolioAccount:
        if not self.path.exists():
            raise RuntimeError("paper account snapshot does not exist")
        if self.path.stat().st_mode & 0o077:
            raise RuntimeError("paper account snapshot permissions are too broad")
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            body = payload["body"]
            if content_hash(body) != payload["hash"] or body["version"] != self.VERSION:
                raise ValueError("snapshot integrity failure")
            checkpoint = (int(body["ledger_checkpoint"][0]), str(body["ledger_checkpoint"][1]))
            if ledger.head_checkpoint() != checkpoint:
                raise ValueError("ledger checkpoint mismatch")
            holdings = {str(k): int(v) for k, v in body["holdings"].items()}
            if set(holdings) - set(valuation_prices):
                raise ValueError("missing valuation price during recovery")
            cash = Decimal(body["cash"])
            equity = Decimal(body["equity"])
            expected = cash + sum(Decimal(q) * valuation_prices[i] for i, q in holdings.items())
            if expected != equity:
                raise ValueError("recovered equity does not reconcile")
            return PortfolioAccount(cash=cash, holdings=holdings, equity=equity)
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise RuntimeError("paper account recovery refused") from exc
