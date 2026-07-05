# Atlas — Strategic Roadmap

> **Status:** Ratified · Phase 1 (Foundation & Architecture)
> **Last updated:** 2026-07-05
> **Owner:** Atlas Division (operating within Jarvis)
> **Related:** [vision.md](vision.md) · [mission.md](mission.md) · [success-criteria.md](success-criteria.md) · [architecture/overview.md](architecture/overview.md)

---

## How to read this roadmap

This roadmap describes **strategic milestones**, not implementation tasks. Each phase names an *intent*, the *capability* it delivers, and the *exit criteria* that must be met — with evidence — before the next phase begins. Deliberately, there are **no engineering to-dos, no schedules, and no code** here; those belong to the plan for each phase when it starts.

Two rules govern the entire roadmap:

1. **Capital is introduced late and grows slowly.** No real money is at risk until the honesty and safety machinery is proven. Capital escalates only by evidence and explicit human approval ([automated-trading-charter.md](automated-trading-charter.md)).
2. **No phase begins until the previous phase's exit criteria are demonstrably met.** Phases may take as long as they take. Skipping a gate is a [governance failure](failure-criteria.md#category-d--governance--control-failures).

The through-line: **build the honest laboratory → build the strategy factory → prove safety in simulation → introduce tiny supervised capital → earn bounded autonomy → operate a durable division.**

---

## Phase 1 — Foundation & Architecture  *(this phase)*

**Intent:** Establish the vision, governance, principles, and system architecture before any code exists, so that everything built afterward inherits the right constraints.

**Delivers:** This documentation set — vision, mission, principles, success/failure criteria, the ten-layer architecture, the domain model, Jarvis integration design, non-functional requirements, the automated-trading charter, and the ADR process.

**Exit criteria:**
- All Phase 1 documents complete, internally consistent, and cross-linked.
- Architecture reviewed adversarially from CTO, Quant, Risk, and Security perspectives.
- Every load-bearing decision captured as an [ADR](adr/0001-record-architecture-decisions.md).
- A **security threat-model baseline** exists ([ADR 0009](adr/0009-threat-model-and-security-baseline.md)), treated with the same "before the code" rigor as safety.
- A clear statement of what Atlas is and is not, ratified.

**Capital at risk:** None.

---

## Phase 2 — The Trustworthy Data Foundation

**Intent:** Build the single source of truth. Nothing downstream can be more honest than its data, so data integrity comes first.

**Delivers (capability, not tasks):** A data layer that ingests, normalizes, validates, versions, and serves market and reference data with **point-in-time correctness**, corporate-action handling, survivorship-bias-free universes, and continuous data-quality monitoring — all behind a vendor-agnostic boundary.

**Exit criteria:**
- Any historical query returns *the world as it was known at that time*, provably.
- Data-quality gates exist and can halt downstream use of bad/stale data.
- At least one full vendor can be swapped behind the abstraction without downstream changes.

**Capital at risk:** None.

---

## Phase 3 — The Reproducible Backtesting Engine

**Intent:** Make backtests *believable*. A backtest that can be trusted is the foundational asset of the whole enterprise.

**Delivers:** A backtesting layer with realistic cost/slippage/liquidity modeling, **bit-for-bit reproducibility**, walk-forward and out-of-sample protocols, and first-class **overfitting defenses** (multiple-testing correction, deflated performance metrics, probability-of-backtest-overfitting, stress and Monte-Carlo testing).

**Exit criteria:**
- A given (strategy version × data snapshot × parameters × seed) reproduces exactly.
- Known-overfit strategies are reliably *rejected* by the validation protocol.
- Cost assumptions are explicit, conservative, and auditable.

**Capital at risk:** None.

---

## Phase 4 — The Strategy Factory (Lifecycle & Registry)

**Intent:** Turn one-off backtesting into a *repeatable pipeline* — the industrial core of Atlas.

**Delivers:** A formal strategy specification format, a versioned strategy registry, and the **strategy lifecycle state machine** with pre-declared **evidence gates** governing every promotion ([domain-model.md](architecture/domain-model.md#3-the-strategy-lifecycle)). Ideas flow in, are validated, and either graduate to paper or die with a recorded post-mortem.

**Exit criteria:**
- Every strategy has a version, a lifecycle state, and an audit trail of its promotions.
- No promotion is possible without passing its declared gates (or a logged override).
- The pipeline can move a hypothesis from "proposed" to "validated (paper-eligible)" end-to-end.

**Capital at risk:** None.

---

## Phase 5 — The Risk & Portfolio Engine (in simulation)

**Intent:** Prove that Atlas can *construct and control a book*, not just evaluate strategies in isolation.

**Delivers:** The risk layer (position/strategy/portfolio/system limits, sizing rules, drawdown controls, VaR/CVaR/stress, independent veto) and the portfolio layer (multi-strategy allocation, diversification, rebalancing) operating **end-to-end on simulated capital**.

**Exit criteria:**
- Risk holds an independent, testable veto over simulated trades.
- Portfolio construction respects all limits and diversification constraints.
- A simulated multi-strategy book runs through a full historical cycle within its risk mandate.

**Capital at risk:** None (simulated).

---

## Phase 6 — Observability & Intelligence

**Intent:** Make the whole system *visible and explainable* before it ever touches money.

**Delivers:** The reporting layer (dashboards, attribution, audit presentation) and the AI Intelligence layer as an **advisory** service (cited intelligence reports, regime and degradation detection, plain-language explanations), plus real-time monitoring and alerting surfaced through Jarvis.

**Exit criteria:**
- The operator can, via Jarvis, see and understand the state of the simulated system at any time.
- Degradation and anomaly detection fire correctly on simulated conditions.
- Every AI-generated claim is cited and traceable; no AI output can move capital.

**Capital at risk:** None.

---

## Phase 7 — Shadow / Paper Execution

**Intent:** Prove the *money-touching* machinery against a real broker — without real money.

**Delivers:** The execution layer connected to a broker in **paper/simulated mode**: order lifecycle management, execution algorithms, reconciliation between Atlas's books and the broker, the **kill switch**, and the **human-approval workflow** — all exercised against live market plumbing.

**Exit criteria:**
- **Halt** drills pass reliably — *including* failed-liquidity / broker-down scenarios — and the **independent kill path** with its standing credential is proven ([charter §6](automated-trading-charter.md#6-kill-switch-requirements)).
- Reconciliation is exact; in-flight order recovery works; no phantom or lost orders.
- The human-approval gate provably blocks unapproved orders.
- Full end-to-end trace works on paper trades.
- **Security & DR gate:** the [threat model](architecture/threat-model.md)'s money-path and audit-integrity controls (trade-only keys, hash-chained/anchored audit, market-data corroboration) are implemented and tested; the immutable record is replicated and **test-restored**; and the [operator-continuity](automated-trading-charter.md#9-operator-availability--continuity) dead-man's-switch works.

**Capital at risk:** None (paper), but the *execution path* is real.

---

## Phase 8 — Supervised Live Trading (tiny capital, human-in-the-loop)

**Intent:** Cross the line to real money at a size where total loss is *irrelevant* to the operator, with maximum supervision.

**Delivers:** Real capital, trivially small, deployed to one or a few fully validated strategies. **Every live trade is human-approved**, risk-checked, and fully traced. This phase is about proving the *system in reality*, not about returns.

**Exit criteria:**
- A sustained period of live trading with zero survival/integrity/governance failures ([failure-criteria.md](failure-criteria.md)).
- Live behavior matches paper behavior within tolerance.
- The operator has exercised override and kill switch on real positions successfully.

**Capital at risk:** Minimal, capped, human-gated.

---

## Phase 9 — Bounded Semi-Autonomous Operation

**Intent:** Earn *bounded* autonomy — Atlas acts within a mandate the human sets, not without a human.

**Delivers:** Pre-approved strategies trade within hard, independently enforced limits without per-trade approval, while the operator retains an always-live kill switch, sets the mandate, and monitors. Atlas **detects its own strategy degradation** and de-risks/retires automatically. Capital escalates in small, evidence-gated increments.

**Exit criteria:**
- Autonomy operates for a sustained period within mandate, with no breach.
- Automatic degradation-driven de-risking/retirement demonstrably works on live strategies.
- Every autonomous action remains fully explainable and reversible.

**Capital at risk:** Bounded, escalating only by evidence and approval.

---

## Phase 10 — The Durable Quantitative OS (production-ready Atlas)

**Intent:** Operate as a self-monitoring, diversified quantitative division built to last a decade.

**Delivers:** A continuously running strategy factory managing a diversified, low-correlation book; self-monitoring health, risk, and degradation; robust governance; and end-to-end auditability — the mature state described in [vision.md §4](vision.md#4-the-10-year-vision).

**Exit criteria (the real proof):**
- Atlas has survived **at least one full market regime change** with capital and integrity intact.
- Strategies are continuously and honestly recycled; the book stays diversified.
- Any single component, vendor, or strategy can fail without endangering survival.
- The operator can always get a truthful, cited, plain-language account of what Atlas is doing and why.

**Capital at risk:** Managed within a mature, proven mandate — survival always first.

---

## Roadmap principles (invariants across all phases)

- **Documentation and safety lead code; code leads capital.** Each phase proves safety before value.
- **Security, disaster-recovery, and operator-continuity are gates, not afterthoughts** — held to the same "before the code" rigor as safety ([ADR 0009](adr/0009-threat-model-and-security-baseline.md), [charter §9](automated-trading-charter.md#9-operator-availability--continuity)).
- **Operating cost is a survival constraint.** A 10-year personal system plans its ongoing infra/data cost envelope; runaway cost is itself a slow failure mode.
- **Reversibility is preserved at every step** — capital, autonomy, and complexity can always be dialed back.
- **Evidence gates the transitions**, not calendar dates. The roadmap has an order, not a schedule.
- **The kill switch and human override exist from Phase 7 onward and are never removed.**
- **A phase can be re-entered.** Discovering a Phase 3 integrity flaw during Phase 8 sends the relevant work back to Phase 3 — survival and honesty outrank momentum.

> The roadmap is not a race to trading. It is a deliberate accumulation of *trust* — in the data, the backtests, the risk controls, and finally the live system — earned one proven capability at a time.
