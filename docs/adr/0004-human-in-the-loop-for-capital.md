# ADR 0004 — Human-in-the-Loop for All Capital Deployment

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 1)
> **Phase:** 1 (Foundation & Architecture)

---

## Context

Atlas will eventually execute trades automatically ([automated-trading-charter.md](../automated-trading-charter.md)). Automation converts human error into fast, scalable, repeatable error. An unsupervised system with a bug, an overfit strategy, a stale-data condition, or a compromised credential can destroy capital faster than any human could notice — the terminal [survival failures](../failure-criteria.md#category-a--survival-failures).

At the same time, requiring a human for *every* micro-action forever would defeat the purpose of a strategy factory. The question is not "human or automation" but **where the human sits, and what they must authorize.**

## Decision

**The deployment of real capital, and every increase in capital or autonomy, requires explicit, authenticated, logged human authorization.** Atlas *proposes*; the operator *disposes*. Autonomy is earned gradually, bounded hard, and revocable instantly.

Specific rules:

1. **Human approval gates every capital-increasing lifecycle transition** — Paper→Incubating and Incubating→Active ([strategy lifecycle](../architecture/domain-model.md#3-the-strategy-lifecycle)) — and every mandate/limit escalation.
2. **Silence is never approval.** Absent an explicit, authenticated approval, the action does not proceed ([fail-safe](0008-fail-safe-defaults-and-kill-switch.md)).
3. **Autonomy is staged**, per the [roadmap](../roadmap.md): human-approves-every-trade (tiny capital) → bounded semi-autonomous (pre-approved strategies within hard limits) → mature managed operation. The human sets and can lower the autonomy level at any time.
4. **The human can always make Atlas safer unilaterally and instantly** (pause, de-risk, kill, revoke autonomy); making it riskier requires a deliberate, logged act ([charter §5](../automated-trading-charter.md#5-human-override-mechanisms)).
5. **Approval requests are decision-grade:** the proposal, its evidence, and its risk profile are presented in plain language through Jarvis ([integration §5.1](../architecture/jarvis-integration.md#51-human-approval-of-a-capital-escalation-the-most-important-flow)).
6. **Automation bias is actively monitored** — a trend toward rubber-stamped approvals is a tracked [warning indicator](../failure-criteria.md#category-d--governance--control-failures).

## Consequences

### Positive
- **A human check stands between any bug/overfit/compromise and catastrophic capital loss.**
- **Autonomy is earned by evidence**, matching trust to demonstrated reliability.
- **Reversibility**: autonomy can be dialed back instantly if something feels wrong.

### Negative / costs
- **Human latency and effort**: approvals take time and attention; the operator is a bottleneck by design.
- **Automation-bias risk**: humans may approve reflexively, weakening the check.
- Does not scale to high-frequency decisions — acceptable, since Atlas is [not HFT](0006-not-high-frequency-trading.md).

### Mitigations
- Approvals are **batched at meaningful decision points** (lifecycle transitions, mandate changes), not per micro-trade, so the human governs *policy and escalation*, not mechanics.
- In **bounded semi-autonomous** operation, pre-approved strategies trade within hard limits without per-trade approval — the human's approval moves *up* to the strategy/mandate level, preserving the check without the bottleneck.
- Automation bias is **actively countered by structural forcing functions**, not merely measured: approval requests must present the case *against* and the worst-case; friction scales with stakes; standing mandates lapse and must be re-justified ([charter §5](../automated-trading-charter.md#5-human-override-mechanisms)). Honest caveat: batching approvals *relieves the bottleneck but increases* rubber-stamp risk ([F-D7](../failure-criteria.md#category-d--governance--control-failures)) — the forcing functions are the acknowledged compensating control, not a free lunch.

## Alternatives considered
- **Full autonomy from the start.** Rejected outright: violates the [charter's prime directive](../automated-trading-charter.md#1-the-prime-directives-non-negotiable) — Atlas must never trade blindly.
- **Human approves every individual trade forever.** Rejected: defeats the strategy-factory purpose and does not scale; also worsens automation bias through volume.
- **Autonomy with post-hoc review only.** Rejected: review after the loss is not prevention.

## Principles upheld / traded
Upholds [3.1 Human-in-the-loop for capital](../principles.md#31-human-in-the-loop-for-capital), [3.4 Small, reversible, observable steps](../principles.md#34-small-reversible-observable-steps), [2.8 Explainability](../principles.md#28-explainability). Trades throughput/convenience for safety and reversibility.

## Related
[ADR 0003](0003-risk-as-independent-veto.md) · [ADR 0008](0008-fail-safe-defaults-and-kill-switch.md) · [automated-trading-charter.md](../automated-trading-charter.md) · [roadmap.md](../roadmap.md)
