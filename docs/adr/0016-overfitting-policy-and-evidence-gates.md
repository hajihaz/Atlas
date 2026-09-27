# ADR 0016 — Overfitting Policy & Evidence Gates

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 3)
> **Phase:** 3 (Reproducible Backtesting Engine)

---

## Context

Overfitting is the **default** outcome of naive backtesting, not a rare accident ([principle: statistical humility](../principles.md#cross-cutting-philosophical-stances)). A beautiful backtest is the single most dangerous artifact in quant finance because it is *persuasive* ([threat model §4.3](../architecture/threat-model.md)). Phase 3 must be able to **reject** an overfit strategy reliably ([roadmap exit criterion](../roadmap.md#phase-3--the-reproducible-backtesting-engine)) and must turn "how many things did we try?" (the trial ledger, [ADR 0012](0012-trial-ledger.md)) into a real correction.

## Decision

**Atlas assumes every strategy is overfit until adversarial evidence says otherwise, and promotes only through pre-declared evidence gates fed by first-class overfitting tests** ([`overfitting.py`](../../src/atlas/backtest/overfitting.py), [`gates.py`](../../src/atlas/research/gates.py); [overfitting.md](../research/overfitting.md)).

1. **Deflated Sharpe Ratio consumes the trial count.** The [DSR](../../src/atlas/backtest/overfitting.py) evaluates a strategy's Sharpe against the *expected maximum* Sharpe under the number of configurations tried and their cross-trial variance — the family's trial set from the [ledger](0012-trial-ledger.md). Mine 1,000 configs and the bar rises accordingly. This is the multiple-testing correction made concrete, closing the Phase-2 gap.
2. **Probability of Backtest Overfitting (PBO) via CSCV** measures how often the in-sample-best config underperforms out-of-sample across combinatorial splits. *Honest caveat:* PBO discriminates only when configs genuinely differ — on a degenerate family (e.g. all-long on a strong trend) it tends to ~0.5 and is uninformative; the DSR remains the robust discriminator there. (Documented, and shown in the tests.)
3. **Robustness is required, not optional** — out-of-sample split, walk-forward re-selection, seeded Monte-Carlo bootstrap, and parameter-sensitivity (plateau vs. lone spike) ([validation.py](../../src/atlas/backtest/validation.py)). The experiment runner executes all four and feeds walk-forward Sharpe, Monte-Carlo probability of positive outcome, and sensitivity positive-fraction into the pre-declared gates.
4. **Pre-declared evidence gates.** An [`EvidenceGates`](../../src/atlas/research/gates.py) object (min Sharpe, min DSR, max PBO, max-drawdown floor, max OOS degradation, min sample size, positive expectancy) is meant to be committed **before** results are seen ([principle 3.3](../principles.md#33-evidence-gates-not-vibes-promote-strategies), F-C2). The evaluator returns a transparent, reasoned pass/reject verdict, recorded to the ledger.
5. **Defaults are demanding and survival-aware** — a high-return, high-ruin strategy fails the drawdown floor regardless of its Sharpe.

## Consequences

### Positive
- A known-overfit strategy is reliably rejected (tested); the "how many did we try" question finally affects the verdict.
- Promotion is transparent and pre-committed — no goalpost-moving.

### Negative / costs
- Demanding gates reject some genuinely good strategies (false negatives) and need enough history/trials to be powerful.
- DSR needs the *whole family's* Sharpes (from the ledger) to be correct — discipline the runner enforces automatically.

### Mitigations
- False negatives are the acceptable direction of error ([survival-first](../principles.md#13-survival-over-aggression)); a rejected good idea can be re-examined, a deployed overfit one bleeds capital.
- The experiment runner writes one trial per config, so the multiplicity denominator is honest by construction.

## Alternatives considered
- **Rank on in-sample Sharpe / raw return.** Rejected: exactly the overfitting trap.
- **A single OOS split only.** Kept, but insufficient alone; combined with DSR + PBO + walk-forward.
- **Ad-hoc, post-hoc thresholds.** Rejected: gates must be pre-declared to mean anything.

## Principles upheld / traded
Upholds statistical humility, [1.1 expectancy](../principles.md#11-expectancy-over-win-rate), [1.2 risk-adjusted](../principles.md#12-risk-adjusted-returns-over-raw-returns), [3.3 evidence gates](../principles.md#33-evidence-gates-not-vibes-promote-strategies). Trades some good strategies (false negatives) to keep overfit ones out.

## Related
[overfitting.md](../research/overfitting.md) · [research-workflow.md](../research/research-workflow.md) · [ADR 0012](0012-trial-ledger.md) · [ADR 0005](0005-point-in-time-and-reproducible-research.md)
