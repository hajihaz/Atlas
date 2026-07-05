# Atlas — Principles

> **Status:** Ratified · Phase 1 (Foundation & Architecture)
> **Last updated:** 2026-07-05
> **Owner:** Atlas Division (operating within Jarvis)
> **Related:** [mission.md](mission.md) · [vision.md](vision.md) · [success-criteria.md](success-criteria.md) · [failure-criteria.md](failure-criteria.md) · [architecture/overview.md](architecture/overview.md)

---

These principles are the **constitution** of Atlas. Every architectural decision, every strategy promotion, and every future line of code must be reconcilable with them. When a design choice conflicts with a principle, the principle wins or the principle is deliberately amended through an [ADR](adr/0001-record-architecture-decisions.md) — it is never silently violated.

Principles are grouped into three tiers: the **Philosophy** (how Atlas thinks about markets), the **Engineering Principles** (how Atlas is built), and the **Operating Principles** (how Atlas runs day to day).

---

## Tier 1 — Philosophy (how Atlas thinks about markets)

These nine tenets are the intellectual core of Atlas. Each is stated as a preference ("X over Y") that resolves ties whenever the two goods conflict.

### 1.1 Expectancy over win rate
A strategy that wins 40% of the time but wins big and loses small can be excellent; a strategy that wins 90% of the time but occasionally loses everything is a time bomb. Atlas optimizes and ranks strategies by **mathematical expectancy** (average outcome per unit of risk) and the full distribution of outcomes — never by hit rate alone. *Implication:* win rate is never a promotion criterion by itself; tail behavior and payoff asymmetry are always examined.

### 1.2 Risk-adjusted returns over raw returns
A 30% return taken with ruinous volatility is worse than a 12% return taken calmly. Atlas measures performance **per unit of risk** (e.g., Sharpe, Sortino, Calmar, return-over-max-drawdown) and net of costs, always relative to a benchmark and the risk consumed. *Implication:* no strategy is ranked or sized on headline return; the denominator (risk) is always present.

### 1.3 Survival over aggression
The first job is to still be here next year. A strategy or allocation that maximizes expected return but carries meaningful ruin risk is rejected regardless of its expected value, because **ruin is absorbing** — you cannot compound from zero. *Implication:* position sizing is conservative (fractional-Kelly with heavy haircuts, never full-Kelly); leverage is constrained; drawdown triggers de-risking automatically.

### 1.4 Evidence over opinions
Conviction, narrative, and intuition are inputs to *research*, never justifications for *deploying capital*. A strategy advances only on reproducible, out-of-sample, statistically examined evidence. *Implication:* "I have a good feeling about this" is a valid reason to open a research ticket and an invalid reason to allocate a dollar.

### 1.5 Process over prediction
Atlas does not predict the market; it runs a **process** that behaves well across many possible futures. The goal is a robust decision procedure, not a correct forecast. *Implication:* strategies are judged on how they behave under stress, across regimes, and out-of-sample — not on whether a single prediction came true.

### 1.6 Research over guessing
New edges come from structured investigation — hypotheses, experiments, controls, replication — not from tinkering until a backtest looks good. *Implication:* the [Research layer](architecture/high-level-components.md) is disciplined and documented; every candidate strategy traces back to a stated hypothesis.

### 1.7 Capital preservation before capital growth
Protecting existing capital strictly precedes seeking new gains. This is a **hard ordering**, encoded in the [mission hierarchy](mission.md#the-mission-hierarchy-in-priority-order): growth is never pursued at the expense of preservation. *Implication:* when in doubt, hold less risk, not more.

### 1.8 Continuous validation
Validation is not a one-time gate at deployment; it is a **permanent condition of being deployed.** Every live strategy is continuously re-tested against its expected behavior, and evidence of degradation triggers de-risking or retirement. *Implication:* a strategy that stops earning the right to be deployed is removed, promptly and unsentimentally.

### 1.9 Continuous improvement
Because all edges decay, the pipeline must always be replenishing its inventory of strategies. Standing still is losing. *Implication:* research never stops; the retirement of a strategy is a normal, healthy event, not a failure.

### Cross-cutting philosophical stances

- **Statistical humility.** Overfitting is the *default* outcome of naïve backtesting, not a rare accident. Atlas assumes any impressive backtest is overfit until adversarial testing says otherwise, and it accounts for multiple-hypothesis testing (data mining across many candidates inflates apparent significance).
- **Cost realism.** There is no such thing as a gross return. Every backtest and every decision models transaction costs, slippage, market impact, financing, and taxes-where-relevant. Atlas thinks only in *net* terms.
- **Reflexivity awareness.** Markets adapt; a known edge is a decaying edge. Crowding, regime change, and one's own market impact are treated as first-class risks.
- **Antifragility bias.** Prefer strategies and structures that tolerate — or benefit from — volatility, surprise, and error, over fragile ones that are optimized for calm and blow up on surprise.

---

## Tier 2 — Engineering Principles (how Atlas is built)

### 2.1 Point-in-time correctness (no time travel)
Atlas may only ever use information that was actually available at the moment being simulated or decided. **No look-ahead bias, no survivorship bias, no restatement leakage.** All data is stored point-in-time; backtests see the world as it was, not as it was later corrected to be. This is the single most important defense against self-deception and is treated as sacred.

### 2.2 Reproducibility and determinism
Any result on the **deterministic evidence path** (data → signal → backtest → risk) must be reproducible **bit-for-bit** given the same code version and data snapshot; non-deterministic outputs (LLM/parallel) are instead **frozen by provenance** the moment they are used ("reproducible by class" — [ADR 0005](adr/0005-point-in-time-and-reproducible-research.md)). Randomness is explicitly seeded and recorded. *Implication:* every result carries the provenance (code version, data snapshot, parameters, seed) needed to regenerate it. A result reproducible in neither sense does not count as evidence.

### 2.3 Separation of duties
The functions that *seek return* (research, strategy, portfolio), the function that *constrains risk* (risk), and the function that *touches money* (execution) are architecturally independent, so that no single component can both want a trade and authorize its own risk. **Risk holds an independent veto; Execution is the only component that reaches a broker.** See [ADR 0003](adr/0003-risk-as-independent-veto.md).

### 2.4 Fail-safe defaults
On any error, ambiguity, timeout, data-quality failure, or loss of confidence, Atlas defaults to the **safe** action: do not trade, reduce risk, or halt — **never** to more risk. The safe state is always reachable and is the default. Silence or uncertainty must never be interpreted as permission to act. See [ADR 0008](adr/0008-fail-safe-defaults-and-kill-switch.md).

### 2.5 Defense in depth for risk
Risk is enforced at multiple independent layers — pre-trade checks, position limits, strategy limits, portfolio limits, and system-level circuit breakers — so that the failure of any one control does not permit uncontrolled risk. No single check is trusted to be sufficient.

### 2.6 Immutability and auditability
Records of data snapshots, signals, decisions, orders, fills, and configuration changes are **append-only and immutable.** Nothing that influenced a capital decision can be silently rewritten. Every record answers *who/what/when/why*. See [architecture/non-functional-requirements.md](architecture/non-functional-requirements.md).

### 2.7 Full traceability (lineage)
Every trade can be traced backward through the complete chain: fill → order → risk approval → portfolio target → signal → strategy version → data snapshot. Every research result can be traced to its inputs. Lineage is a first-class product of the system, not an afterthought.

### 2.8 Explainability
No capital decision is a black box. Every automated action carries a human-readable rationale; every AI-generated insight cites its evidence. If Atlas cannot explain *why* in terms the operator can understand through Jarvis, Atlas does not act. See [ADR 0004](adr/0004-human-in-the-loop-for-capital.md).

### 2.9 Loose coupling and replaceability
Atlas is a 10-year system; every external dependency (data vendor, broker, LLM provider, storage) will change at least once. All externals sit behind abstraction boundaries so they can be swapped without rewriting the core. Jarvis is reached only through an anti-corruption layer. See [ADR 0007](adr/0007-jarvis-anti-corruption-layer.md).

### 2.10 Simplicity and robustness over cleverness
Atlas explicitly declines the low-latency arms race (it is [not an HFT system](adr/0006-not-high-frequency-trading.md)). Freed from microsecond competition, it spends its complexity budget on correctness, auditability, and robustness. A boring, verifiable component beats a clever, opaque one.

---

## Tier 3 — Operating Principles (how Atlas runs)

### 3.1 Human-in-the-loop for capital
The deployment of real capital, and every escalation in capital or mandate, requires explicit, logged human authorization — especially in early phases. Atlas *proposes*; the operator *disposes*. Autonomy is earned gradually and can be revoked instantly. See [automated-trading-charter.md](automated-trading-charter.md).

### 3.2 The kill switch is sacred
An always-available, human-triggerable kill switch can halt all trading and flatten or safely hold positions. It is tested regularly; a kill switch that has not been tested is assumed broken. No feature, optimization, or convenience may ever compromise it.

### 3.3 Evidence gates, not vibes, promote strategies
A strategy advances through its lifecycle only by passing explicit, pre-declared gates (statistical significance, out-of-sample robustness, risk profile, capacity, correlation to existing book). Gates are defined *before* results are seen, to prevent moving the goalposts. See [architecture/domain-model.md](architecture/domain-model.md#3-the-strategy-lifecycle).

### 3.4 Small, reversible, observable steps
Capital, autonomy, and complexity all increase in small increments that can be observed and reversed. Atlas never makes a large, irreversible, unobservable jump. New strategies start at trivial size; new autonomy starts tightly bounded.

### 3.5 Assume degradation; monitor relentlessly
Every deployed strategy is assumed to be decaying. Monitoring, drift detection, and post-deployment validation are not optional add-ons; they are the price of keeping a strategy live.

### 3.6 Honest post-mortems, no blame
Every retired strategy, every incident, every kill-switch event produces a recorded, honest post-mortem focused on *what the system should learn*, not on defending a prior decision. The audit trail exists to enable this.

### 3.7 Conservatism compounds
When two designs are equally supported by evidence, choose the one that fails more gracefully, loses less in the bad case, and is easier to explain. Over a decade, conservative defaults compound into survival.

---

## How to use these principles

- **In design:** every architecture document and ADR states which principles it upholds and any it trades against.
- **In review:** the [architecture review](architecture/overview.md#7-architecture-review) tests each design against this list, adversarially.
- **In conflict:** consult the [mission hierarchy](mission.md#the-mission-hierarchy-in-priority-order). Survival and honesty outrank growth, always.
- **In change:** a principle may only be amended by a deliberate, recorded ADR that argues the case openly. Principles are stable, but not frozen; they evolve by evidence, like everything else in Atlas.
