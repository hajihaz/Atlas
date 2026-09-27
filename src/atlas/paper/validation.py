"""Repeated-session paper validation with deterministic failure accounting."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import cast

from atlas.paper.session import PaperSessionRunner


@dataclass(frozen=True)
class SessionObservation:
    session_id: str
    equity: Decimal
    checkpoint: tuple[int, str]
    reconciled: bool
    error: str | None = None


@dataclass(frozen=True)
class MultiSessionEvidence:
    sessions_requested: int
    sessions_completed: int
    observations: tuple[SessionObservation, ...]
    clean_reconciliations: bool
    runtime_errors: int

    @property
    def ledger_head(self) -> tuple[int, str]:
        return self.observations[-1].checkpoint if self.observations else (-1, "0" * 64)


def run_sessions(
    runner: PaperSessionRunner, session_inputs: Sequence[Mapping[str, object]]
) -> MultiSessionEvidence:
    observations: list[SessionObservation] = []
    errors = 0
    for raw in session_inputs:
        session_id = str(raw["session_id"])
        try:
            result = runner.run_cycle(
                session_id=session_id,
                cash=Decimal(str(raw["cash"])),
                prices=cast(Mapping[str, Decimal], raw["prices"]),
                targets=cast(Mapping[str, Decimal], raw["targets"]),
                fill_prices=cast(Mapping[str, Decimal], raw["fill_prices"]),
                valuation_prices=cast(Mapping[str, Decimal], raw["valuation_prices"]),
                data_fresh=bool(raw.get("data_fresh", True)),
                kill_switch=bool(raw.get("kill_switch", False)),
            )
            observations.append(
                SessionObservation(session_id, result.snapshot.equity, result.checkpoint, True)
            )
        except Exception as exc:
            errors += 1
            state = runner.recover_checkpoint()
            checkpoint = state.checkpoint if state else (-1, "0" * 64)
            observations.append(
                SessionObservation(session_id, Decimal("0"), checkpoint, False, type(exc).__name__)
            )
    completed = sum(o.error is None for o in observations)
    return MultiSessionEvidence(
        len(session_inputs),
        completed,
        tuple(observations),
        all(o.reconciled for o in observations),
        errors,
    )
