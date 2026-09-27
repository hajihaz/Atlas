"""Phase-3 exit criteria, as executable tests:

* a backtest reproduces bit-for-bit for fixed (strategy x params x seed x costs);
* a **known-overfit** strategy (mined on pure noise) is **rejected** by the evidence gates,
  while a strategy on a genuine, robust signal fares strictly better.
"""

from __future__ import annotations

import datetime as dt
import unittest

from atlas.common.time_utils import UTC
from atlas.research.dataview import InMemoryBarSource
from atlas.research.experiment import run_experiment
from atlas.research.synthetic import random_walk, sessions, unbounded_calendar
from atlas.strategy.library import SmaCrossover
from atlas.trials import TrialLedger

_CAL = unbounded_calendar()
_DATES = sessions(_CAL, dt.date(2020, 1, 1), dt.date(2023, 6, 30))  # ~3.5y, warm-up + eval
_START, _END = _DATES[60], _DATES[-1]
_AS_OF = dt.datetime(2023, 7, 1, 12, 0, tzinfo=UTC)
_GRID = [{"fast": f, "slow": s} for f in (5, 10, 20) for s in (30, 50, 100) if f < s]


def _run(drift: float, seed: int):
    src = InMemoryBarSource({"X": random_walk("X", _DATES, seed=seed, drift=drift, vol=0.012)})
    return run_experiment(
        strategy_factory=lambda p: SmaCrossover(p["fast"], p["slow"]),
        param_grid=_GRID,
        source=src,
        start=_START,
        end=_END,
        calendar=_CAL,
        ledger=TrialLedger(),
        as_of=_AS_OF,
        seed=1,
        pbo_splits=10,
    )


class TestReproducibility(unittest.TestCase):
    def test_same_inputs_same_result_hash(self):
        src = InMemoryBarSource({"X": random_walk("X", _DATES, seed=3, drift=0.0006)})
        a = run_experiment(
            strategy_factory=lambda p: SmaCrossover(p["fast"], p["slow"]),
            param_grid=_GRID,
            source=src,
            start=_START,
            end=_END,
            calendar=_CAL,
            ledger=TrialLedger(),
            as_of=_AS_OF,
            seed=1,
            pbo_splits=10,
        )
        b = run_experiment(
            strategy_factory=lambda p: SmaCrossover(p["fast"], p["slow"]),
            param_grid=_GRID,
            source=src,
            start=_START,
            end=_END,
            calendar=_CAL,
            ledger=TrialLedger(),
            as_of=_AS_OF,
            seed=1,
            pbo_splits=10,
        )
        self.assertEqual(
            a.results[a.best_config_id].result_hash(), b.results[b.best_config_id].result_hash()
        )
        self.assertEqual(a.evidence.deflated_sharpe, b.evidence.deflated_sharpe)
        self.assertEqual(a.pbo.pbo, b.pbo.pbo)


class TestOverfitRejection(unittest.TestCase):
    def test_noise_family_is_rejected(self):
        """Mining SMA configs on pure noise (drift=0) must NOT pass the evidence gates."""
        noise = _run(drift=0.0, seed=99)
        self.assertFalse(noise.verdict.passed)

    def test_signal_beats_noise_on_overfitting_metrics(self):
        """A genuine, persistent trend fares strictly better than noise on the honest metrics.

        Note: the robust discriminator here is the **deflated Sharpe** (and the raw Sharpe),
        not PBO — on a strong trend every SMA config becomes near-identical, so PBO (which
        measures overfitting of *selection among differing configs*) degenerates to ~0.5 and
        stops discriminating. That is a real property of PBO, documented in overfitting.md.
        """
        signal = _run(drift=0.0012, seed=7)
        noise = _run(drift=0.0, seed=99)
        self.assertGreater(signal.evidence.deflated_sharpe, noise.evidence.deflated_sharpe)
        self.assertGreater(signal.evidence.annualized_sharpe, noise.evidence.annualized_sharpe)


if __name__ == "__main__":
    unittest.main()
