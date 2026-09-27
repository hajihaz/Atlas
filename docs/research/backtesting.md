# Atlas — Backtesting Engine (Phase 3)

> **Status:** Ratified · Phase 3 · **Owner:** Atlas Division
> **Related:** [research-workflow.md](research-workflow.md) · [metrics-and-risk.md](metrics-and-risk.md) · [overfitting.md](overfitting.md) · [ADR 0015](../adr/0015-backtesting-engine.md) · [ADR 0017](../adr/0017-leak-proof-research-data-view.md) · [ADR 0018](../adr/0018-open-source-integration-boundary.md)

---

## 1. What the engine does

Given a strategy idea, Atlas can **backtest it** — simulate holding its positions over history, point-in-time correct and cost-aware, and produce a reproducible equity curve that everything downstream (metrics, overfitting tests, comparison, the trial ledger) is computed from. It is the deterministic evidence path ([ADR 0015](../adr/0015-backtesting-engine.md)); pure standard library, so it runs and reproduces anywhere.

## 2. The timing convention (leakage-free)

The single most important property. At each session `D`:

1. The strategy is handed a [leak-proof `DataView`](../../src/atlas/research/dataview.py) pinned to decision session `D`, exposing **only bars strictly before `D`** ([ADR 0017](../adr/0017-leak-proof-research-data-view.md)).
2. From that past-only view it returns target weights at `D`.
3. Because this reference engine models close-to-close returns only, those weights become effective for the **next session, `D → D+1`**. The final decision has no following return and is not scored.

This explicit one-session lag prevents a decision made at `D` from receiving the return that ended at `D`. A future-aware fill model can later define open/intraday execution explicitly, but it must not silently change this reference convention. Warm-up history before the evaluation `start` is available for lookbacks but not scored.

```mermaid
flowchart LR
    subgraph day D
      V[DataView@D<br/>bars < D only] --> S[strategy.target_weights] --> W[weights effective D→D+1]
      W --> R["× return(D→D+1)"] --> E[equity ×= 1+net]
      W --> T[turnover vs prior] --> C[− cost] --> R
    end
```

## 3. Returns & corporate actions

Per-instrument returns come from a **fully back-adjusted** close series ([`returns.py`](../../src/atlas/research/returns.py)): each raw close is scaled by the cumulative factor of corporate actions with a later ex-date (Phase-2 adjust-on-read), so a split/bonus/dividend yields the correct *economic* return, not a spurious gap. Dividend reference closes are sourced **from the series** (the raw prior-session close), as-of correct — closing a Phase-2 recommendation.

## 4. Costs (explicit, conservative, auditable)

Cost is charged on **turnover** (Σ|Δweight|) via [`CostModel`](../../src/atlas/backtest/costs.py). The default is deliberately conservative for NSE cash equities — optimistic costs are how a backtest lies, so Atlas rounds *against* the strategy. The assumptions are recorded with every result. A participation-rate / market-impact model plugs in behind the same interface later.

## 5. Leverage & survival

Gross exposure is capped (`max_gross = 1.0` by default): **no leverage** unless explicitly, boundedly opted in — survival-first ([principle 1.3](../principles.md#13-survival-over-aggression)). The backtest touches **no capital and no broker**; it produces evidence, judged by the [evidence gates](overfitting.md).

## 6. Reproducibility

A [`BacktestResult`](../../src/atlas/backtest/result.py) carries the equity curve, per-session net/gross returns, turnover, and full provenance (config, snapshot, seed, cost model, code version). `result_hash()` is taken over the **equity curve** (rounded) plus the inputs — the equity uses only deterministic IEEE-754 `+−×÷` (instruments summed in sorted order), so the same `(strategy × snapshot × params × seed × costs)` reproduces the same hash bit-for-bit. This is the Phase-3 exit criterion, tested in `tests/reproducibility/test_backtest_reproducibility.py`. (Derived *statistics* use transcendental functions whose last-ULP can vary by platform, so the hash is deliberately over the equity, not the stats.)

## 7. Strategies

A strategy is a versioned [`StrategySpec`](../../src/atlas/strategy/base.py) + a `target_weights(view)` method. The [library](../../src/atlas/strategy/library.py) (buy-and-hold, SMA crossover, momentum) exists to **exercise the engine** — reference constructs, **not** validated alpha. Real strategies enter through the [research funnel](research-workflow.md) and must clear the evidence gates.


## 8. External realistic-simulation engine boundary

The pure Atlas engine is the deterministic reference/evidence path. For richer market microstructure, fill, fee, slippage, and brokerage simulation, Atlas will integrate a dedicated engine behind an adapter. The current source audit selects **LEAN** as the preferred candidate because its checkout contains first-class portfolio, transaction, fill, fee, slippage, risk, execution, and brokerage abstractions.

The two paths have different jobs: the Atlas reference engine proves deterministic research semantics; the LEAN-backed path tests execution realism. They must be compared on controlled fixtures, with every difference explained by an explicit modeling convention. Neither path may bypass Atlas evidence governance.

## 9. What Phase 3 does not do

No live capital, no broker, no execution, no portfolio/risk *engine* (Phase 5), no strategy *deployment*. Backtesting produces evidence; deciding what to do with it is a later phase, gated by the [charter](../automated-trading-charter.md).
