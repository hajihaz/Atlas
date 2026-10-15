"""Crash-safe, multi-session paper validation orchestration.

This layer coordinates the deterministic paper runtime with the durable state store. It never
selects a live broker, never sends network requests, and never changes live governance state.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal

from atlas.operations import DurableState, StateStore
from atlas.paper.runtime import PaperRuntime, PaperSnapshot


@dataclass(frozen=True)
class SessionResult:
    session_id: str
    completed: bool
    snapshot: PaperSnapshot
    checkpoint: tuple[int, str]


class PaperSessionRunner:
    """Run paper sessions while checkpointing after successful cycles."""

    def __init__(self, runtime: PaperRuntime, state_store: StateStore):
        self.runtime = runtime
        self.state_store = state_store

    def run_cycle(
        self,
        *,
        session_id: str,
        cash: Decimal,
        prices: Mapping[str, Decimal],
        targets: Mapping[str, Decimal],
        fill_prices: Mapping[str, Decimal],
        valuation_prices: Mapping[str, Decimal],
        data_fresh: bool = True,
        kill_switch: bool = False,
        event_time: dt.datetime | None = None,
    ) -> SessionResult:
        self.state_store.save(
            DurableState(1, session_id, "running", self.runtime.ledger.head_checkpoint())
        )
        self.runtime.simulate(
            cash=cash,
            prices=prices,
            targets=targets,
            fill_prices=fill_prices,
            valuation_prices=valuation_prices,
            data_fresh=data_fresh,
            kill_switch=kill_switch,
            session_id=session_id,
            event_time=event_time,
        )
        snapshot = self.runtime.snapshot(session_id)
        checkpoint = snapshot.ledger_checkpoint
        self.state_store.save(DurableState(1, session_id, "completed", checkpoint))
        return SessionResult(session_id, True, snapshot, checkpoint)

    def recover_checkpoint(self) -> DurableState | None:
        return self.state_store.load()
