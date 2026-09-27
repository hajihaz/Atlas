# ADR 0015 — Point-in-Time, Reproducible Backtesting Engine

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 3)
> **Phase:** 3 (Reproducible Backtesting Engine)

---

## Context

Phase 3 must make backtests *believable* ([roadmap](../roadmap.md#phase-3--the-reproducible-backtesting-engine)). A backtest that can be trusted is the foundational asset of the whole enterprise; one that lies is worse than none. The engine must satisfy [ADR 0005](0005-point-in-time-and-reproducible-research.md): point-in-time correct (no look-ahead), reproducible bit-for-bit on the deterministic path, and cost-realistic.

## Decision

**Atlas backtests with a pure-stdlib, event-driven, point-in-time engine whose results are reproducible bit-for-bit** ([`engine.py`](../../src/atlas/backtest/engine.py); design in [backtesting.md](../research/backtesting.md)).

1. **Leakage-free timing.** At decision session `D` a strategy receives a [leak-proof DataView](0017-leak-proof-research-data-view.md) exposing **only data strictly before `D`**. Because the reference engine is close-based, that decision is applied to the next session's `D → D+1` return. The final decision without a following session is not scored. Look-ahead is structurally impossible, not merely discouraged.
2. **Pure standard library.** The engine, metrics, and statistics use only `math`/`statistics` — **no numpy/pandas**. This is deliberate: numpy's parallel/BLAS reductions are *not* bit-for-bit reproducible across machines ([ADR 0005](0005-point-in-time-and-reproducible-research.md)), whereas ordered pure-Python IEEE-754 `+−×÷` is. It also keeps the evidence path testable on a bare Python.
3. **Deterministic reproducibility identity.** A `BacktestResult.result_hash()` is taken over the **equity curve** (rounded to fixed decimals) plus the config/snapshot/seed/cost inputs — not over transcendental-function statistics, whose last-ULP can differ by platform. Instruments are summed in sorted order so the equity itself is order-stable. Same (strategy × snapshot × params × seed × costs) ⇒ identical hash (the Phase-3 exit criterion).
4. **Conservative, explicit, auditable costs.** Cost is charged on turnover via a documented [`CostModel`](../../src/atlas/backtest/costs.py); the default rounds *against* the strategy. A richer impact/participation model plugs in behind the same interface.
5. **No leverage by default.** Gross exposure is capped (`max_gross = 1.0`) — survival-first ([principle 1.3](../principles.md#13-survival-over-aggression)); leverage is an explicit, bounded opt-in.
6. **Capital-free.** Backtesting touches no capital and no broker; it produces *evidence*, consumed by the [evidence gates](0016-overfitting-policy-and-evidence-gates.md).

## Consequences

### Positive
- Backtests are believable: no look-ahead, reproducible from a pinned snapshot, honest costs.
- The whole evidence path is dependency-free, deterministic, and testable anywhere.

### Negative / costs
- Pure Python is slower than vectorized numeric libraries.
- Cross-platform transcendental last-ULP means *statistics* are reproducible-by-provenance, not bit-exact (the equity is bit-exact).

### Mitigations
- Atlas is [not HFT](0006-not-high-frequency-trading.md); backtest wall-time is not a binding constraint, and a vectorized engine can sit behind the same interface later for speed, validated against the pure reference.
- The reproducibility hash is deliberately over the deterministic equity, so the guarantee it makes is one it can keep.

## Alternatives considered
- **Vectorized (numpy/pandas) engine.** Rejected as the *reference*: not bit-for-bit reproducible; a fine optional accelerator later.
- **Hash over full metrics.** Rejected: transcendental functions break bit-exactness across platforms; equity is the honest identity.
- **Same-day decision & execution.** Rejected: decides and trades on information from the same close — a classic subtle look-ahead.

## Principles upheld / traded
Upholds [2.1 point-in-time](../principles.md#21-point-in-time-correctness-no-time-travel), [2.2 reproducibility](../principles.md#22-reproducibility-and-determinism), cost realism, [1.3 survival](../principles.md#13-survival-over-aggression). Trades raw speed for correctness and reproducibility.

## Related
[backtesting.md](../research/backtesting.md) · [ADR 0016](0016-overfitting-policy-and-evidence-gates.md) · [ADR 0017](0017-leak-proof-research-data-view.md) · [ADR 0005](0005-point-in-time-and-reproducible-research.md)
