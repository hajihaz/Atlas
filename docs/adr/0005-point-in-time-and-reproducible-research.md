# ADR 0005 — Point-in-Time Data & Reproducible Backtesting

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 1)
> **Phase:** 1 (Foundation & Architecture)

---

## Context

Every downstream decision in Atlas rests on the belief that its **backtests tell the truth.** That belief is fragile. The two most common ways a quantitative system silently lies to itself are:

1. **Time travel (look-ahead / survivorship / restatement leakage).** Using information that was not actually available at the simulated moment — future prices, later-corrected fundamentals, or a universe that excludes companies that went bankrupt — produces spectacular backtests that evaporate in live trading ([failure F-B1](../failure-criteria.md#category-b--integrity--honesty-failures)).
2. **Non-reproducibility.** If a result cannot be regenerated exactly, it cannot be verified, debugged, or trusted — and "we got a great number once" is not evidence.

These are not exotic risks; they are the *default* outcome of naïve backtesting. If Atlas does not defend against them structurally, its entire evidence base is corrupt and everything built on it is worthless — or worse, confidently wrong.

## Decision

**Atlas treats point-in-time correctness and bit-for-bit reproducibility as non-negotiable, foundational properties of all data, research, and backtesting.**

1. **Point-in-time everywhere — including feature computation and model fitting.** All data is stored **bitemporally** (event time + knowledge/as-of time); any historical query returns the world **as it was known then**. This binds not just data *serving* but *feature computation and model fitting*: every feature declares its look-back window and is read through an as-of-aware accessor that cannot cross the decision timestamp, and all fitting (scalers, dimensionality reduction, model parameters) happens strictly inside the training fold. It guards against look-ahead, survivorship, silent restatement, **feature/label leakage**, and **in-sample fitting leakage** ([F-B1](../failure-criteria.md#category-b--integrity--honesty-failures)). It binds the [Research layer](../architecture/overview.md#32-research-layer) as strictly as the [Backtesting layer](../architecture/overview.md#34-backtesting-layer): a hypothesis born of leaked data poisons everything downstream.
2. **Immutable, referenceable snapshots.** Research and backtests run against specific, versioned [data snapshots](../architecture/high-level-components.md#21-data-layer), referenced by identity.
3. **Reproducible by class — not naïvely "bit-for-bit everywhere."** The **deterministic evidence path** (data → signal → backtest → risk calc) is bit-for-bit reproducible (same code + snapshot + parameters + seed ⇒ identical result; seeds recorded). Paths that *cannot* be bit-exact — parallel/accelerated floating-point reductions, and **non-deterministic hosted LLMs** in the AI layer — are **reproducible-by-provenance**: the exact output artifact is frozen and immutably recorded the moment it is used, so an AI-assisted hypothesis's *artifact* is fixed evidence even though re-running the model may differ. A result reproducible in *neither* sense does not count as evidence ([NFR §6](../architecture/non-functional-requirements.md#6-reproducibility--determinism)).
4. **Provenance on every result.** Every backtest carries the inputs, code version, parameters, and seed needed to regenerate it ([lineage](../architecture/non-functional-requirements.md#4-traceability-lineage)).
5. **Overfitting is assumed until disproven — corrected against the *whole program*.** Validation includes out-of-sample/walk-forward protocols, deflated performance metrics, and probability-of-backtest-overfitting. Critically, the **multiplicity denominator is the family-level trial count** from an append-only [Trial ledger](../architecture/domain-model.md#26-backtests-strategy) (every sweep, variant, and AI-proposed candidate increments it) — correcting a single strategy while ignoring its hundreds of mined siblings is how an overfit strategy passes a "corrected" gate ([F-C6](../failure-criteria.md#category-c--process--discipline-failures), [principle: statistical humility](../principles.md#cross-cutting-philosophical-stances)).
6. **Cost, capacity & selection realism.** Backtests model costs/slippage/market-impact conservatively with an explicit functional form; **capacity is a hard limit** derived from a participation-rate ceiling, not a note; and promoted strategies' expectancies carry a **selection/survivor-inflation haircut** ([F-B7](../failure-criteria.md#category-b--integrity--honesty-failures)).

## Consequences

### Positive
- **Backtests can be believed** — the foundational asset of the whole enterprise.
- **Results are verifiable, debuggable, and defensible** years later.
- **Overfit strategies are caught before capital**, not after ([success I1/I2](../success-criteria.md#dimension-2--integrity--honesty-non-negotiable)).

### Negative / costs
- **Significant engineering cost**: point-in-time storage and deterministic replay are harder than naïve approaches.
- **More storage** (versioned snapshots, provenance) — a [data-retention](../architecture/non-functional-requirements.md#8-data-retention) cost.
- **Slower research iteration** than sloppy backtesting that ignores these constraints.

### Mitigations
- The cost is **the point**: it is precisely the discipline that separates Atlas from systems that lose money confidently.
- Storage is managed with tiering over the 10-year horizon.
- Reproducibility *speeds* debugging and review over the long run, offsetting slower first-pass iteration.

## Alternatives considered
- **Naïve backtesting on latest-available data.** Rejected: the classic way to build a beautiful lie.
- **Point-in-time only in backtesting, not research.** Rejected: leakage at the research stage poisons the hypothesis before backtesting ever sees it.
- **"We'll be careful" (discipline without enforcement).** Rejected: careful humans still leak the future; the property must be structural.

## Principles upheld / traded
Upholds [2.1 Point-in-time correctness](../principles.md#21-point-in-time-correctness-no-time-travel), [2.2 Reproducibility & determinism](../principles.md#22-reproducibility-and-determinism), [1.4 Evidence over opinions](../principles.md#14-evidence-over-opinions), and statistical humility. Trades iteration speed and storage for evidence integrity — a foundational, non-negotiable trade.

## Related
[Backtesting layer](../architecture/overview.md#34-backtesting-layer) · [Data layer](../architecture/overview.md#31-data-layer) · [NFR §6](../architecture/non-functional-requirements.md#6-reproducibility--determinism) · [roadmap Phase 2–3](../roadmap.md)
