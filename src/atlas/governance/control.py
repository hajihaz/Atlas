"""Fail-safe capital governance state machine."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class TradingMode(StrEnum):
    RESEARCH = "research"
    PAPER = "paper"
    LIVE = "live"
    HALTED = "halted"


@dataclass(frozen=True)
class GovernanceState:
    mode: TradingMode = TradingMode.RESEARCH
    human_approval: bool = False
    risk_approval: bool = False
    kill_switch: bool = False

    def can_execute(self) -> bool:
        return (
            self.mode == TradingMode.LIVE
            and self.human_approval
            and self.risk_approval
            and not self.kill_switch
        )

    def assert_live(self) -> None:
        if not self.can_execute():
            raise RuntimeError("live execution denied by governance gates")
