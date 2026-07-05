# ADR 0006 — Atlas Is Not a High-Frequency Trading System

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 1)
> **Phase:** 1 (Foundation & Architecture)

---

## Context

"Automated trading" is often conflated with "high-frequency trading" (HFT). They are profoundly different disciplines. HFT competes on **microsecond latency**: co-located servers, kernel bypass, custom hardware, and an engineering budget spent almost entirely on speed, in a winner-take-all arms race against extremely well-capitalized firms.

Atlas is a **personal quantitative operating system** whose edge is intended to come from research quality, risk discipline, and survival — not speed. If Atlas drifted into competing on latency, it would (a) lose that race to firms with vastly greater resources, and (b) be forced to spend its entire complexity budget on speed, sacrificing the correctness, auditability, and robustness that are its actual reason for existing ([failure F-F3](../failure-criteria.md#category-f--strategic--mission-drift)).

A system cannot be simultaneously optimized for microsecond latency **and** for deep auditability, reproducibility, human-in-the-loop governance, and explainability. A choice is required.

## Decision

**Atlas is explicitly not a high-frequency trading system. Its decision and execution cadence is seconds-to-minutes-to-days (low/mid frequency), and it competes on research, risk, and survival — never on latency.**

1. **No microsecond requirement.** There is no latency target that would require co-location, kernel bypass, or a speed arms race. None may be introduced without an ADR explicitly overturning this decision.
2. **Performance is the *lowest*-priority NFR** ([NFR priority ordering](../architecture/non-functional-requirements.md#priority-ordering-of-nfrs)) — sufficient, never dominant.
3. **The latency budget is spent elsewhere.** The "slack" from not racing is deliberately reinvested in correctness, immutability, reproducibility, defense-in-depth risk checks, human approval, and explainability.
4. **Strategy universe is constrained accordingly.** Atlas pursues edges that persist at low/mid frequency (factor, trend, mean-reversion, allocation, risk-premia style approaches), not fleeting microstructure edges that require speed to capture.

## Consequences

### Positive
- **Massive simplification.** Freed from the latency arms race, Atlas can use clear, verifiable, immutable, human-governed designs that would be impossible under HFT constraints.
- **Winnable game.** Atlas competes where a disciplined solo operator *can* have durable edge, not where it is structurally outgunned.
- **Safety is affordable.** Human-in-the-loop, defense-in-depth risk, and full auditability are only feasible because microseconds are not being counted.

### Negative / costs
- **Forgoes entire classes of strategy** (latency arbitrage, market making, microstructure) — permanently, by design.
- Could feel like "leaving money on the table" to someone measuring only gross opportunity, not net-of-competition, net-of-cost survivability.

### Mitigations
- The forgone strategies are ones Atlas would *lose at* anyway; excluding them is removing losing bets, not winning ones.
- The decision is revisitable in principle — but only by a deliberate ADR that honestly accounts for the correctness/auditability/governance it would cost.

## Alternatives considered
- **Build for HFT.** Rejected: unwinnable against incumbents; would destroy Atlas's actual value proposition and safety properties.
- **Stay latency-agnostic / "fast where we can."** Rejected as a slippery slope: without an explicit stance, latency creep silently erodes the safety budget ([complexity ratchet, F-F5](../failure-criteria.md)). An explicit "no" is a protective constraint.

## Principles upheld / traded
Upholds [2.10 Simplicity and robustness over cleverness](../principles.md#210-simplicity-and-robustness-over-cleverness) and, indirectly, every safety principle that low latency would have made unaffordable. Trades access to speed-based strategies for correctness, safety, and survivability.

## Related
[NFR §7 Scalability & performance](../architecture/non-functional-requirements.md#7-scalability--performance) · [system-boundaries §3.4](../architecture/system-boundaries.md#34-atlas-is-not-a-high-frequency-trading-platform) · [principles.md](../principles.md)
