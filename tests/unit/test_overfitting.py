"""Overfitting defenses (PSR/DSR/PBO/MinTRL) and robustness protocols."""

from __future__ import annotations

import math
import random
import unittest

from atlas.backtest.overfitting import (
    deflated_sharpe,
    expected_max_sharpe,
    min_track_record_length,
    per_period_sharpe,
    probabilistic_sharpe,
    probability_of_backtest_overfitting,
)
from atlas.backtest.validation import monte_carlo, out_of_sample, parameter_sensitivity


def _noise(seed, n, mu=0.0, sd=0.01):
    rng = random.Random(seed)
    return [rng.gauss(mu, sd) for _ in range(n)]


class TestSharpeSignificance(unittest.TestCase):
    def test_psr_high_for_strong_series(self):
        strong = _noise(1, 500, mu=0.002, sd=0.01)  # ~0.2 daily sharpe
        self.assertGreater(probabilistic_sharpe(strong), 0.99)

    def test_psr_near_half_for_zero_mean(self):
        flat = _noise(2, 500, mu=0.0, sd=0.01)
        self.assertLess(probabilistic_sharpe(flat), 0.9)

    def test_deflation_lowers_confidence(self):
        rets = _noise(3, 400, mu=0.0015, sd=0.01)
        psr = probabilistic_sharpe(rets)
        # A family of many trials with dispersed Sharpes raises the bar (SR0 > 0).
        trial_sharpes = [per_period_sharpe(_noise(10 + i, 400, mu=0.0, sd=0.01)) for i in range(50)]
        dsr = deflated_sharpe(rets, trial_sharpes)
        self.assertGreater(expected_max_sharpe(trial_sharpes), 0.0)
        self.assertLessEqual(dsr, psr)  # deflation never increases confidence

    def test_min_trl_finite_iff_positive_sr(self):
        self.assertTrue(math.isfinite(min_track_record_length(_noise(4, 500, mu=0.002))))
        self.assertEqual(min_track_record_length(_noise(5, 500, mu=-0.002)), math.inf)


class TestPBO(unittest.TestCase):
    def test_consistent_winner_has_low_pbo(self):
        # Configs = shared noise + a per-config drift; higher drift is uniformly better,
        # so the IS-best is always the OOS-best -> PBO == 0.
        base = _noise(7, 200, mu=0.0, sd=0.01)
        configs = [[base[t] + j * 0.003 for t in range(200)] for j in range(5)]
        res = probability_of_backtest_overfitting(configs, n_splits=8)
        self.assertEqual(res.pbo, 0.0)

    def test_independent_noise_configs_overfit_more(self):
        noise_configs = [_noise(100 + j, 200, mu=0.0, sd=0.01) for j in range(8)]
        res = probability_of_backtest_overfitting(noise_configs, n_splits=8)
        self.assertTrue(0.0 <= res.pbo <= 1.0)
        base = _noise(7, 200, mu=0.0, sd=0.01)
        winner = [[base[t] + j * 0.003 for t in range(200)] for j in range(8)]
        self.assertGreater(res.pbo, probability_of_backtest_overfitting(winner, n_splits=8).pbo)


class TestRobustness(unittest.TestCase):
    def test_out_of_sample_degradation_sign(self):
        # Good (positive-mean) in-sample, bad (negative-mean) out-of-sample — with real
        # volatility so Sharpe is defined.
        rets = _noise(11, 100, mu=0.003, sd=0.01) + _noise(12, 100, mu=-0.003, sd=0.01)
        oos = out_of_sample(rets, 252, train_frac=0.5)
        self.assertLess(oos.degradation, 0.0)

    def test_monte_carlo_is_seed_deterministic(self):
        rets = _noise(9, 300, mu=0.001, sd=0.01)
        a = monte_carlo(rets, n_sims=200, seed=42)
        b = monte_carlo(rets, n_sims=200, seed=42)
        self.assertEqual(a.p05_total_return, b.p05_total_return)
        self.assertEqual(a.median_max_drawdown, b.median_max_drawdown)

    def test_sensitivity_plateau_vs_spike(self):
        plateau = parameter_sensitivity([1.0, 1.1, 0.9, 1.05, 0.95])
        spike = parameter_sensitivity([3.0, -0.1, -0.2, 0.0, -0.1])
        self.assertGreater(plateau.stability, spike.stability)


if __name__ == "__main__":
    unittest.main()
