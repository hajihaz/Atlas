# ADR 0008 — Fail-Safe Defaults & a First-Class Kill Switch

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 1)
> **Phase:** 1 (Foundation & Architecture)

---

## Context

Any long-lived automated capital system will, at some point, encounter conditions its designers did not anticipate: a data feed goes stale, a component crashes mid-decision, a broker connection drops, a strategy behaves pathologically, a credential is compromised, or the world simply does something unprecedented. The defining question for such a system is: **what does it do when it is confused, broken, or under stress?**

There are only two possible default postures:
- **Fail-open** — when in doubt, keep trading / take more risk. This is how automated systems destroy capital in minutes.
- **Fail-safe** — when in doubt, stop / reduce risk / halt.

For a system whose first mission-priority is [survival](../mission.md#the-mission-hierarchy-in-priority-order), only one of these is acceptable.

## Decision

**Atlas fails safe by default, and provides an always-available, first-class kill switch.** On any error, timeout, ambiguity, stale/failed data, loss of confidence, or unreachable dependency, Atlas defaults to the safe action — do not trade, reduce risk, or halt — **never** to more risk. Silence or uncertainty is never interpreted as permission to act.

1. **The safe state is the default and is always reachable.** No-trade / de-risk / halt requires no special conditions to enter; *acting* is what requires positive, validated conditions.
2. **Fail-safe on every ambiguity:** stale data halts rather than trades ([F-E1](../failure-criteria.md#category-e--system--operational-failures)); a missing approval blocks ([ADR 0004](0004-human-in-the-loop-for-capital.md)); a risk-check failure vetoes ([ADR 0003](0003-risk-as-independent-veto.md)); an unreachable Jarvis takes no new risk ([ADR 0007](0007-jarvis-anti-corruption-layer.md)).
3. **The kill switch is sacred** ([charter §6](../automated-trading-charter.md#6-kill-switch-requirements)):
   - **Two primitives:** **Halt** (cease new orders) is *immediate and unconditional*; **Flatten/Exit** (reduce existing exposure) is *best-effort*, conditional on a market and broker that may be closed, halted, or illiquid ([F-A7](../failure-criteria.md#category-a--survival-failures)) — never conflate them.
   - **Halt always available**, including when Jarvis is degraded, via an independent kill path with a standing credential — a hard [Phase-7 gate](../roadmap.md#phase-7--shadow--paper-execution); no live capital before it exists and is drilled.
   - **Highest reliability & redundancy** in the system; must not depend on the health of what it halts.
   - **Automatic *and* manual** — circuit breakers trip it on threshold breach; the human can trip it anytime.
   - **Regularly drilled** — an untested kill switch is *assumed broken* and blocks live trading until proven.
   - **Recorded** — every trigger, cause, and resulting action is logged and the operator notified.
4. **Fail toward halt about the safety machinery itself.** If it is unclear whether the kill switch or risk checks are functional, trading is treated as disabled.

## Consequences

### Positive
- **Unknown-unknowns default to safety** — the system protects capital precisely when its designers' foresight has run out.
- **The worst case is "we stopped trading,"** which is survivable, rather than "we traded uncontrollably," which may not be.
- **Operator always has a big red button** that actually works, tested regularly.

### Negative / costs
- **False halts**: the system will sometimes stop when it could have safely continued, forgoing some opportunity or requiring a manual restart.
- **Redundancy cost**: the kill/risk/monitoring paths must be more reliable and more tested than the rest of the system.
- **Drill discipline**: safety controls must be exercised on a schedule, which is ongoing effort.

### Mitigations
- False halts are an **explicitly accepted cost** — [conservatism compounds](../principles.md#37-conservatism-compounds); a needless stop is cheap, an uncontrolled run is not.
- Redundancy is concentrated only where it matters most (kill/risk/monitoring), not everywhere, bounding its cost.
- Drills are scheduled NFRs ([§12](../architecture/non-functional-requirements.md#12-testability--assurance)), turning "assumed working" into "proven working."

## Alternatives considered
- **Fail-open / trade-through-uncertainty.** Rejected categorically: the fastest route to ruin.
- **Kill switch as a later add-on.** Rejected: a kill switch retrofitted onto a system that can bypass it is not sacred; it must be a first-class constraint from the start.
- **Kill switch dependent on Jarvis being healthy.** Rejected: the ability to halt must not share a fate with the interface ([ADR 0007](0007-jarvis-anti-corruption-layer.md)).

## Principles upheld / traded
Upholds [2.4 Fail-safe defaults](../principles.md#24-fail-safe-defaults), [3.2 The kill switch is sacred](../principles.md#32-the-kill-switch-is-sacred), [1.3 Survival over aggression](../principles.md#13-survival-over-aggression), [3.7 Conservatism compounds](../principles.md#37-conservatism-compounds). Trades some forgone opportunity (false halts) and redundancy cost for survival — the defining bargain of the system.

## Related
[automated-trading-charter.md](../automated-trading-charter.md) · [ADR 0003](0003-risk-as-independent-veto.md) · [ADR 0004](0004-human-in-the-loop-for-capital.md) · [failure-criteria.md](../failure-criteria.md) · [NFR §1](../architecture/non-functional-requirements.md#1-reliability)
