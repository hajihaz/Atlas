# ADR 0017 — Leak-Proof Research Data View

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 3)
> **Phase:** 3 (Reproducible Backtesting Engine)

---

## Context

[ADR 0005](0005-point-in-time-and-reproducible-research.md) requires point-in-time correctness to bind **feature computation**, not just data storage — and the Phase-2 review explicitly flagged that Phase 2 delivered the as-of *data* primitive but **not** the feature-layer enforcement that stops a strategy from peeking past its decision time (feature/label leakage, the dominant modern backtest-killer, [F-B1](../failure-criteria.md#category-b--integrity--honesty-failures)). Phase 3 must close that gap: a strategy must be *unable* to see the future, by construction.

## Decision

**Strategies access market data exclusively through a leak-proof [`DataView`](../../src/atlas/research/dataview.py) pinned to a decision date, which exposes only bars strictly before that date.** There is no accessor that returns a current-or-future bar; requesting one raises `PointInTimeViolation`.

1. **Strictly-before semantics.** Every method (`history`, `closes`, `last_close`, `bar_on`) returns data with `event_date < decision_date`. A feature computed from the view therefore *cannot* incorporate information from the decision day or later.
2. **The engine drives the view.** The backtester advances the decision date over sessions, hands the strategy a fresh view each step, and applies the realized return *after* the decision — the strategy never touches the return it will earn ([ADR 0015](0015-backtesting-engine.md)).
3. **Knowledge-time is upstream.** The underlying `BarSource` is assumed materialized as-of a single snapshot knowledge time ([ADR 0011](0011-bitemporal-point-in-time-model.md)), so the view enforces the *event-time* boundary while the snapshot enforces the *knowledge-time* one — together, full point-in-time correctness.
4. **Structural, not disciplinary.** Leakage prevention is a property of the type a strategy is given, not a rule a researcher must remember — the only reliable kind ([principle 2.1](../principles.md#21-point-in-time-correctness-no-time-travel)).

## Consequences

### Positive
- Feature/label leakage is impossible for any strategy that only uses the view — closing the biggest honest gap from Phase 2.
- Backtests become trustworthy at the *feature* level, not just the data level.

### Negative / costs
- A strategy could still leak if it reaches around the view to the raw `BarSource` — so the engine, not the strategy, owns the source; strategies receive only the view.
- Fold-isolation for in-sample model *fitting* (training a model without touching the test fold) is a related concern handled by the [validation protocols](../../src/atlas/backtest/validation.py), not the view alone.

### Mitigations
- The strategy interface passes only a `DataView`; the raw source is never handed to strategy code.
- Walk-forward and OOS protocols enforce train/test isolation on top of the view.

## Alternatives considered
- **Trust researchers to avoid look-ahead.** Rejected: careful people still leak the future; it must be structural.
- **Post-hoc leakage detection.** Useful as a check, but prevention-by-construction is stronger and is the primary control.

## Principles upheld / traded
Upholds [2.1 point-in-time correctness](../principles.md#21-point-in-time-correctness-no-time-travel), [1.5 process over prediction](../principles.md#15-process-over-prediction), [2.10 simplicity/robustness](../principles.md#210-simplicity-and-robustness-over-cleverness). No material trade — it is pure integrity infrastructure.

## Related
[research-workflow.md](../research/research-workflow.md) · [ADR 0005](0005-point-in-time-and-reproducible-research.md) · [ADR 0011](0011-bitemporal-point-in-time-model.md) · [ADR 0015](0015-backtesting-engine.md)
