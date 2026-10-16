"""Crash-safe paper snapshots, with authenticated transition replay on recovery."""

from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from atlas.common.hashing import content_hash
from atlas.execution.ledger import ExecutionLedger
from atlas.operations_hardening import _atomic_private_json, _read_private_json
from atlas.portfolio.account import PortfolioAccount, PortfolioTransition


def _serialize_transition(transition: PortfolioTransition) -> dict[str, str | int]:
    return {
        "sequence": transition.sequence,
        "event_id": transition.event_id,
        "instrument_id": transition.instrument_id,
        "quantity": transition.quantity,
        "fill_price": str(transition.fill_price),
        "fee": str(transition.fee),
        "cash_before": str(transition.cash_before),
        "cash_after": str(transition.cash_after),
        "position_before": transition.position_before,
        "position_after": transition.position_after,
        "equity_after": str(transition.equity_after),
    }


def _restore_transition(raw: Any) -> PortfolioTransition:
    if not isinstance(raw, dict) or set(raw) != {
        "sequence",
        "event_id",
        "instrument_id",
        "quantity",
        "fill_price",
        "fee",
        "cash_before",
        "cash_after",
        "position_before",
        "position_after",
        "equity_after",
    }:
        raise ValueError("invalid paper transition schema")
    strings = (
        "event_id",
        "instrument_id",
        "fill_price",
        "fee",
        "cash_before",
        "cash_after",
        "equity_after",
    )
    ints = ("sequence", "quantity", "position_before", "position_after")
    if any(not isinstance(raw[name], str) for name in strings) or any(
        type(raw[name]) is not int for name in ints
    ):
        raise ValueError("invalid paper transition field type")
    return PortfolioTransition(
        sequence=raw["sequence"],
        event_id=raw["event_id"],
        instrument_id=raw["instrument_id"],
        quantity=raw["quantity"],
        fill_price=Decimal(raw["fill_price"]),
        fee=Decimal(raw["fee"]),
        cash_before=Decimal(raw["cash_before"]),
        cash_after=Decimal(raw["cash_after"]),
        position_before=raw["position_before"],
        position_after=raw["position_after"],
        equity_after=Decimal(raw["equity_after"]),
    )


def _assert_ledger_fill_matches(
    transitions: tuple[PortfolioTransition, ...], ledger: ExecutionLedger
) -> None:
    event_map = {entry.event.event_id: entry.event for entry in ledger.entries()}
    for item in transitions:
        event = event_map.get(item.event_id)
        if (
            event is None
            or event.event_type not in {"fill", "broker_fill"}
            or event.instrument_id != item.instrument_id
            or event.quantity != item.quantity
            or event.price != item.fill_price
            or event.fee != item.fee
            or event.cash != item.cash_after
            or event.equity != item.equity_after
        ):
            raise ValueError("paper transition not independently bound to ledger fill")


class DurablePaperAccountStore:
    """Versioned, private, atomic snapshots bound to an independently verified ledger."""

    VERSION = 2

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def save(self, account: PortfolioAccount, ledger: ExecutionLedger) -> None:
        ledger.verify_integrity()
        transitions = account.transitions()
        PortfolioAccount.restore_with_transitions(
            cash=account.state.cash,
            holdings=account.state.holdings,
            equity=account.state.equity,
            transitions=transitions,
        )
        _assert_ledger_fill_matches(transitions, ledger)
        body = {
            "version": self.VERSION,
            "cash": str(account.state.cash),
            "holdings": dict(sorted(account.state.holdings.items())),
            "equity": str(account.state.equity),
            "ledger_checkpoint": list(ledger.head_checkpoint()),
            "transition_event_ids": [item.event_id for item in transitions],
            "transitions": [_serialize_transition(item) for item in transitions],
        }
        account.state.validate()
        _atomic_private_json(self.path, {"body": body, "hash": content_hash(body)})

    def load(
        self,
        *,
        ledger: ExecutionLedger,
        valuation_prices: Mapping[str, Decimal],
    ) -> PortfolioAccount:
        if not self.path.exists():
            raise RuntimeError("paper account snapshot does not exist")
        try:
            payload = _read_private_json(self.path)
            body = payload["body"]
            if not isinstance(body, dict) or content_hash(body) != payload["hash"]:
                raise ValueError("snapshot integrity failure")
            version = body["version"]
            if type(version) is not int or version not in (1, self.VERSION):
                raise ValueError("unsupported paper snapshot version")
            ledger.verify_integrity()
            checkpoint = body["ledger_checkpoint"]
            if (
                not isinstance(checkpoint, list)
                or len(checkpoint) != 2
                or type(checkpoint[0]) is not int
                or not isinstance(checkpoint[1], str)
                or ledger.head_checkpoint() != (checkpoint[0], checkpoint[1])
            ):
                raise ValueError("ledger checkpoint mismatch")
            raw_holdings = body["holdings"]
            if not isinstance(raw_holdings, dict) or any(
                not isinstance(symbol, str) or not symbol or type(quantity) is not int
                for symbol, quantity in raw_holdings.items()
            ):
                raise ValueError("invalid paper snapshot holdings")
            holdings = dict(raw_holdings)
            if set(holdings) - set(valuation_prices):
                raise ValueError("missing valuation price during recovery")
            cash = Decimal(body["cash"])
            equity = Decimal(body["equity"])
            if (
                not cash.is_finite()
                or not equity.is_finite()
                or any(
                    not Decimal(valuation_prices[symbol]).is_finite()
                    or Decimal(valuation_prices[symbol]) <= 0
                    for symbol in holdings
                )
            ):
                raise ValueError("non-finite recovered paper valuation")
            expected = cash + sum(Decimal(q) * valuation_prices[i] for i, q in holdings.items())
            if expected != equity:
                raise ValueError("recovered equity does not reconcile")
            transition_ids = body["transition_event_ids"]
            if not isinstance(transition_ids, list) or any(
                not isinstance(item, str) or not item for item in transition_ids
            ):
                raise ValueError("invalid transition identity registry")
            if version == 1:
                if transition_ids:
                    raise ValueError("legacy paper snapshot lacks transition history")
                transitions: tuple[PortfolioTransition, ...] = ()
            else:
                raw_transitions = body["transitions"]
                if not isinstance(raw_transitions, list):
                    raise ValueError("invalid persisted transition list")
                transitions = tuple(_restore_transition(item) for item in raw_transitions)
                if [item.event_id for item in transitions] != transition_ids:
                    raise ValueError("paper transition identity registry divergence")
            _assert_ledger_fill_matches(transitions, ledger)
            return PortfolioAccount.restore_with_transitions(
                cash=cash,
                holdings=holdings,
                equity=equity,
                transitions=transitions,
            )
        except (OSError, KeyError, TypeError, ValueError, InvalidOperation) as exc:
            raise RuntimeError("paper account recovery refused") from exc
