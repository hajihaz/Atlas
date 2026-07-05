# Atlas — Automated Trading Charter

> **Status:** Ratified · Phase 1 (Foundation & Architecture)
> **Last updated:** 2026-07-05
> **Owner:** Atlas Division (operating within Jarvis)
> **Related:** [principles.md](principles.md) · [failure-criteria.md](failure-criteria.md) · [architecture/system-boundaries.md](architecture/system-boundaries.md) · [architecture/non-functional-requirements.md](architecture/non-functional-requirements.md) · [adr/0008-fail-safe-defaults-and-kill-switch.md](adr/0008-fail-safe-defaults-and-kill-switch.md)

---

## Preamble

Automated execution of capital is the single most dangerous capability Atlas will ever hold. This charter governs it. It is written **now, in Phase 1, before any execution code exists,** precisely so that the safeguards constrain the implementation rather than being retrofitted onto it.

This charter is **binding.** No later phase, feature, optimization, or convenience may weaken it except by a deliberate, argued [ADR](adr/0001-record-architecture-decisions.md) that the operator explicitly ratifies. The governing sentence of the entire document:

> ## **Atlas must never be allowed to trade blindly.**

"Blindly" means: without evidence, without independent risk approval, without traceability, without a reachable human, or without a working kill switch. Any one of those absent, and trading stops.

---

## 1. The prime directives (non-negotiable)

1. **Evidence first.** No strategy trades live capital until it has passed every [lifecycle gate](architecture/domain-model.md#3-the-strategy-lifecycle). Automation may only act on *validated* strategies.
2. **Independent risk approval.** Every automated order passes an [independent risk veto](adr/0003-risk-as-independent-veto.md) that no automated component can override.
3. **Human governance of capital and mandate.** Deploying real capital, and every *increase* in capital or autonomy, requires explicit, logged human authorization ([ADR 0004](adr/0004-human-in-the-loop-for-capital.md)).
4. **Always-live kill switch.** A human can halt all trading and drive Atlas to a safe posture at any instant; the kill path is the most reliable, most tested path in the system ([ADR 0008](adr/0008-fail-safe-defaults-and-kill-switch.md)).
5. **Fail safe.** On any error, ambiguity, stale data, or loss of confidence, automation *stops*, never escalates risk.
6. **Full traceability.** Every automated trade is recorded immutably and traceable end-to-end, with a rationale.
7. **Bounded and reversible.** Autonomy is granted in small increments, within hard limits, and can be revoked instantly.

If any prime directive cannot be satisfied for a given action, **that action does not happen.**

---

## 2. Benefits of automated trading (why Atlas pursues it at all)

Automation is not sought for its own sake; it is sought because, *properly governed*, it directly serves the [mission](mission.md):

- **Discipline & consistency.** Machines execute the validated process without fear, greed, fatigue, or hope — removing the largest source of retail failure: human emotion under stress.
- **Repeatability & scale.** A single operator cannot manually monitor and rebalance a diversified, multi-strategy book continuously; automation makes the strategy-factory model feasible.
- **Speed of protection.** Automated risk response (drawdown de-risking, circuit breakers) can protect capital faster than a human watching a screen — automation's *first* value is defense, not offense.
- **Auditability.** A machine process is fully logged by construction; automation makes the honesty and traceability guarantees achievable.
- **Freed human attention.** The operator supervises *governance and exceptions* rather than mechanics — spending judgment where it matters.

**Crucially: the primary benefit Atlas seeks from automation is better *risk control and discipline*, not faster *risk-taking.***

## 3. Risks of automated trading (named honestly)

Automation converts human mistakes into fast, scalable, repeatable mistakes. The specific dangers:

- **Runaway execution** — loops, wrong sizes, duplicate orders, "fat-finger at machine speed" ([failure F-A4](failure-criteria.md#category-a--survival-failures)).
- **Silent divergence** — the system's model of the world drifts from reality (stale data, un-reconciled books) and it keeps trading on a false picture.
- **Over-optimization deployed** — an overfit strategy passes weak gates and bleeds capital efficiently ([F-C1](failure-criteria.md)).
- **Correlated blow-up** — "diversified" automated strategies fail together in a regime shift ([F-A6](failure-criteria.md)).
- **Automation bias** — the human rubber-stamps because "the machine is usually right," eroding the human check ([F-D-leading indicators](failure-criteria.md#category-d--governance--control-failures)).
- **AI overreach** — an advisory AI signal is wired, directly or through erosion of process, into capital ([F-D2](failure-criteria.md)).
- **Security compromise** — stolen credentials or a compromised component submitting malicious orders ([F-E5](failure-criteria.md)).
- **Feedback/reflexivity** — Atlas's own trading moves the market against it, or interacts badly with its other strategies.
- **Loss of explainability** — automated decisions become too complex/fast to understand in time ([F-F2/F-F5](failure-criteria.md)).

This charter's safeguards exist to make each of these *containable and survivable.*

## 4. Required safeguards (defense in depth)

Safeguards are layered so that no single failure permits uncontrolled trading ([principle 2.5](principles.md)).

### 4.1 Pre-deployment safeguards
- **Evidence gates** — validated, out-of-sample, overfitting-tested, capacity-aware ([lifecycle](architecture/domain-model.md#3-the-strategy-lifecycle)).
- **Paper/shadow proof** — every strategy and the execution path itself are proven against live plumbing with *no* real money first ([roadmap Phase 7](roadmap.md#phase-7--shadow--paper-execution)).
- **Human approval to deploy** — explicit, logged, per [ADR 0004](adr/0004-human-in-the-loop-for-capital.md).

### 4.2 Pre-trade safeguards (every single order)
- **Independent risk gate** — limits, sizing, exposure, correlation, drawdown state checked before approval.
- **Sanity/plausibility checks** — order size, price, and notional within expected bounds; reject the absurd.
- **Fresh-data check** — stale or failed data *halts* the order rather than trading on it ([F-E1](failure-criteria.md)).
- **Kill-switch & pause-state check** — no order if trading is halted.
- **Idempotency** — retries cannot create duplicate trades.

### 4.3 Position & portfolio safeguards (continuous)
- **Hard limits** on per-position, per-strategy, per-day, and portfolio loss and exposure, independently enforced.
- **Bounded leverage** and conservative (fractional-Kelly-with-haircut) sizing.
- **Correlation/concentration monitoring** to prevent hidden all-eggs-one-basket exposure.
- **Continuous reconciliation** of Atlas's book against the broker; a mismatch triggers halt-and-alert.

### 4.4 System-level safeguards
- **Circuit breakers** — drawdown/volatility/anomaly thresholds that automatically de-risk or halt.
- **Rate limits** on order submission to bound any runaway loop.
- **Redundant monitoring** — Atlas never goes blind to a live position ([NFR reliability](architecture/non-functional-requirements.md#1-reliability)).
- **Independent kill path** — the ability to halt does not depend on the health of the component being halted.

### 4.5 Autonomy staging
Autonomy is earned in the [roadmap](roadmap.md)'s order: paper → human-approved-every-trade (tiny) → bounded semi-autonomous (pre-approved strategies within hard limits) → mature managed operation. **Each step is small, observed, and reversible;** none is skipped.

## 5. Human override mechanisms

The human is never *designed out.* At every autonomy level, the operator (via Jarvis) retains:

| Mechanism | Effect |
|---|---|
| **Approve / Deny** | Gates every capital or mandate escalation; silence is *not* approval. |
| **Pause** | Stop new orders; hold existing positions; keep monitoring. |
| **De-risk** | Force reduction of exposure toward a target. |
| **Override a limit** | Relax a specific limit — only via an authenticated, **logged** action with a recorded reason; never silent. |
| **Kill** | Immediate full halt + move to safe posture ([§6](#6-kill-switch-requirements)). |
| **Revoke autonomy** | Drop Atlas to a lower autonomy level (e.g. back to human-approve-every-trade) instantly. |

Rules governing overrides and approvals:
- **Overrides are exceptional and audited.** A rising rate of overrides — especially rubber-stamped approvals — is a monitored [warning indicator](failure-criteria.md#category-d--governance--control-failures) of automation bias. But a metric is not a control, so **structural forcing functions** keep the human check real:
  - **Every approval request presents the case *against*** — the strongest disconfirming evidence and the worst-case outcome — not just the bullish proposal, so the human must actually engage ([F-D7](failure-criteria.md#category-d--governance--control-failures)).
  - **Friction scales with stakes.** Larger capital/leverage/mandate escalations require a waiting period, a written operator rationale, and — for the largest — a deliberate second look. A distracted or compromised operator must not be able to 10× the mandate in one reflexive click.
  - **Standing mandates lapse.** Pre-approved autonomy must be periodically re-justified ("re-approve or it expires"), so autopilot cannot run forever.
- **The human can always make Atlas *safer* unilaterally and instantly.** Making it *riskier* (override, escalate) requires an authenticated, logged, deliberate act, and — for capital-increasing approvals — step-up re-authentication ([threat model](architecture/threat-model.md)).
- **Batching approvals trades throughput for higher automation-bias.** Moving approval up to the strategy/mandate level ([ADR 0004](adr/0004-human-in-the-loop-for-capital.md)) relieves the bottleneck but *increases* rubber-stamp risk; the forcing functions above are the acknowledged compensating control, not a free lunch.
- **Atlas must surface, not hide, conflicts** between a human's short-term wish and the long-term mandate ([mission §5](mission.md#5-who-atlas-serves)).

## 6. Kill-switch requirements

The kill switch is **sacred** ([principle 3.2](principles.md)). It is **two distinct primitives**, because they have different physics and must never be conflated:

- **Halt** — *cease all new order origination.* This is **immediate, unconditional, and always achievable**: it needs no counterparty and no other component's permission.
- **Flatten / reduce (Exit)** — *wind existing exposure down toward the safe posture.* This is **best-effort and conditional on the market and broker**, because flattening is itself trading and can be impossible or ruinous in a halted, limit-locked, gapped, or illiquid market, or when the broker is down. Exit follows a pre-declared **exit-policy matrix** keyed to regime (normal · illiquid/wide-spread · limit-move · halted-symbol · broker-degraded · market-closed) that chooses reduce-now / hedge / hold-and-alert rather than dumping into no liquidity. Because Exit is *not* guaranteed, unmanaged residual exposure after a kill is its own failure mode ([F-A7](failure-criteria.md#category-a--survival-failures)) — and the **primary** defense against it is ex-ante sizing (see [§7](#7-capital-protection-requirements)), not the kill switch.

Requirements:

- **[MUST] Halt is always available**, including when the Jarvis interface is degraded. This depends on an **independent kill path**: its own authentication plus a pre-provisioned, tightly-scoped standing kill/flatten credential that does not require a healthy Jarvis to act. **Until that independent path exists and is drilled, no live capital is permitted** — it is a hard [Phase-7 exit criterion](roadmap.md#phase-7--shadow--paper-execution), not a mid-phase nicety. This reconciles the "always available" guarantee with the [Jarvis degraded mode](architecture/jarvis-integration.md#6-degraded-mode-what-happens-if-jarvis-is-unavailable).
- **[MUST] Highest reliability & availability.** The kill path is the most redundant, most tested path; it must not depend on the health of what it is halting, and must withstand resource-exhaustion / denial attempts against it.
- **[MUST] Regularly drilled — including the hard cases.** Drills are scheduled and MUST include a **failed-liquidity / rejected-order / broker-down** scenario, not only a happy-path flatten. A kill switch not tested recently is **assumed broken** and blocks live trading until proven ([NFR testability](architecture/non-functional-requirements.md#12-testability--assurance)).
- **[MUST] Automatic *and* manual.** Circuit breakers can trigger it automatically on threshold breach; the human can trigger it manually at any time.
- **[MUST] Guard against malicious/coerced actuation.** A *halt* is safe-direction and stays easy. A *forced flatten* can itself cause harm (dumping a book at the worst moment), so large-flatten actuations are high-severity logged events, attributable, and rate-limited against sabotage.
- **[MUST] Recorded.** Every trigger (auto or manual), its cause, and the resulting actions are logged immutably, and the operator is notified.
- **[MUST] Fail toward halt.** If it is unclear whether the kill switch is functional, the system treats trading as disabled ([fail-safe](adr/0008-fail-safe-defaults-and-kill-switch.md)).

## 7. Capital protection requirements

Protecting the capital base precedes every profit motive ([principle 1.7](principles.md), [mission hierarchy](mission.md#the-mission-hierarchy-in-priority-order)):

- **[MUST] Hard drawdown limit — with the honest caveat that continuous limits cannot stop a gap.** A system-level maximum drawdown triggers full de-risking/halt. But a monitor-and-act limit only fires *after* a move; an overnight/weekend gap can breach it in a single print before any control acts. The drawdown limit is a backstop, **not** a guarantee — the real gap defense is the overnight-exposure cap below. (De-risking triggers are graduated rather than a single cliff, to avoid selling into the teeth of a normal drawdown — see [F-C8](failure-criteria.md#category-c--process--discipline-failures).)
- **[MUST] Layered loss limits.** Independent per-position, per-strategy, per-day, and per-portfolio loss caps; breaching any one triggers its defined response. Limits are tested as an *ensemble* (which binds first, do they conflict), not only in isolation.
- **[MUST] No single point of ruin.** No strategy, position, or day may be sized such that its worst *stressed* case is catastrophic ([F-A2](failure-criteria.md#category-a--survival-failures)).
- **[MUST] Bounded leverage — by an explicit taxonomy.** Limits apply to **gross, net, AND economic/embedded** leverage (options delta/gamma/vega, futures notional, levered instruments), not just gross notional — behind which real leverage hides. Leverage is capped such that the **worst plausible stressed move** (not a *normal* move — sizing to the normal case is the classic ruin error) cannot force liquidation or breach the survival limit. No "just this once" exception without a ratified ADR.
- **[MUST] Margin buffer & forced-liquidation modeling.** Maintain a margin cushion sized against the stressed move; model the broker's margin-call / forced-liquidation dynamics explicitly — that is the mechanism by which leverage actually causes ruin.
- **[MUST] Overnight / gap exposure cap.** A separate, lower limit on exposure held across the close/weekend, sized so the worst historical *and* a synthetic worse-than-historical gap stays within the survival drawdown *even with no ability to act*. Sizing consumes explicit **jump/gap scenarios**, not just VaR/CVaR (which are blind to jumps). Holding across known event risk (earnings, FOMC, elections) is an explicit, limited decision.
- **[MUST] Live liquidity limit.** Cap each position by days-to-liquidate / % of average daily volume, so Atlas never holds what it cannot exit in a crisis — distinct from backtest slippage modeling ([F-A7](failure-criteria.md#category-a--survival-failures)).
- **[MUST] Counterparty concentration limit.** Cap capital at any single broker/custodian; diversify or hold a contingency above a threshold; monitor counterparty health ([F-G5](failure-criteria.md#category-g--counterparty--custody-failures)). Broker keys are provisioned **trade-only** (withdrawal/transfer disabled) — see [threat model](architecture/threat-model.md).
- **[MUST] Capital escalates only by evidence + approval.** Size grows in small increments justified by live evidence and explicit human sign-off — never automatically, never by "it's been working."
- **[MUST] Reserve / worst-case thinking.** Position sizing assumes stress conditions (gaps, illiquidity, correlation → 1), not calm ones, and applies a margin-of-safety haircut to the *risk model's own estimates* ([F-E7](failure-criteria.md#category-e--system--operational-failures)).
- **[SHOULD] Segregation of live vs. experimental capital.** Experimental/incubating strategies operate on trivial, ring-fenced capital, isolated from the core book.

## 8. Governance review & change control

- This charter is reviewed at **every roadmap phase transition** and after **every 🔴 incident** ([failure-response protocol](failure-criteria.md#the-failure-response-protocol-summary)).
- Any change that would *weaken* a safeguard requires a ratified ADR that argues the case openly and is explicitly approved by the operator; safeguards are **strengthened freely, weakened only deliberately.**
- The charter's guarantees are verified by drills and audits, not assumed; an unverified safeguard is treated as absent.

## 9. Operator availability & continuity

Atlas's entire safety model leans on **one human** — the operator approves capital, holds the override, and runs the post-mortems. That makes the single operator a *governance* single point of failure, in tension with the software "no single point of failure" rule ([NFR §1](architecture/non-functional-requirements.md#1-reliability)). This section supplies the compensating controls ([Category H failures](failure-criteria.md#category-h--continuity--operator-failures)).

- **[MUST] Defined operator-unavailable posture.** What Atlas is *allowed to hold* when the operator is unreachable is explicit and conservative — default to de-risked/minimal exposure, not "keep running." "Fail safe = halt" only protects against *new* risk; a live leveraged book still needs a defined fallback.
- **[MUST] Dead-man's-switch (heartbeat).** Prolonged operator silence (no heartbeat/approval within a defined window) automatically drives the book to a minimal-risk posture rather than leaving it unmanaged.
- **[MUST] Response-time expectations by severity.** Alert severities carry expected operator response windows; lapses escalate to the automatic de-risk above.
- **[MUST] Coverage realism.** Autonomy staging ([§4.5](#45-autonomy-staging)) accounts for market-hours / time-zone reality — Atlas may not hold exposure it cannot supervise (e.g. an overnight foreign-session gap while the sole operator sleeps) beyond the [gap cap](#7-capital-protection-requirements).
- **[MUST] Succession & emergency access.** For a 10-year, capital-bearing system, a documented plan exists for who can reach the kill switch, broker, and audit trail if the operator is incapacitated — with the same auth/audit rigor, not a backdoor.
- **[SHOULD] Bus-factor defense.** The reasoning to operate Atlas lives in the docs and the immutable audit trail, not only in the operator's head ([F-H5](failure-criteria.md#category-h--continuity--operator-failures)).

---

## The charter in one paragraph

Atlas may eventually trade capital automatically because, governed well, automation delivers discipline, consistent risk protection, and auditability that a human alone cannot. But automation turns mistakes into fast, scalable mistakes, so Atlas surrounds it with defense in depth: only validated strategies, an independent risk veto, human authorization for all capital and autonomy, continuous reconciliation and monitoring, hard layered loss limits, conservative sizing, and an always-live, always-tested kill switch — with everything recorded and traceable. Autonomy is earned in small, reversible steps and can be revoked in an instant. **Atlas must never be allowed to trade blindly, and this charter is how that promise is kept.**
