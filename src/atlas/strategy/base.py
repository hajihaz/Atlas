"""Strategy protocol and versioned specification."""

from __future__ import annotations

import abc
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from atlas.common.ids import deterministic_id
from atlas.research.dataview import DataView


@dataclass(frozen=True)
class StrategySpec:
    """A strategy's identity: name, version, and parameters.

    ``config_id`` is deterministic in the parameters, so every point in a parameter sweep
    gets a stable, distinct id — exactly what the trial ledger needs to count trials
    honestly (one trial per config; ADR 0005 / 0012).
    """

    name: str
    version: str
    params: Mapping[str, Any] = field(default_factory=dict)

    def config_id(self) -> str:
        return deterministic_id("cfg", self.name, self.version, dict(self.params))

    def family_id(self) -> str:
        """Return the shared trial-ledger family for this strategy idea."""
        return deterministic_id("fam", self.name, self.version)


class Strategy(abc.ABC):
    """A strategy maps a leak-proof view to target weights. Pure and deterministic."""

    def __init__(self, spec: StrategySpec) -> None:
        self.spec = spec

    @abc.abstractmethod
    def target_weights(self, view: DataView) -> dict[str, float]:
        """Target portfolio weights per instrument, decided from *past-only* data.

        Weights are held over the session following the decision date. The engine treats
        absent instruments as weight 0 and may cap gross exposure.
        """
        raise NotImplementedError
