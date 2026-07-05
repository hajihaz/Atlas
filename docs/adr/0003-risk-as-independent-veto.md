# ADR 0003 — Risk as an Independent Veto Authority

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 1)
> **Phase:** 1 (Foundation & Architecture)

---

## Context

The [mission hierarchy](../mission.md#the-mission-hierarchy-in-priority-order) places **survival** and **capital preservation** above growth. For that ordering to be real rather than rhetorical, risk control cannot be a subordinate feature of a return-seeking engine — because whenever return and risk conflict, a subordinate risk function loses.

In most retail and many blown-up institutional systems, risk is *advisory* or *bolted on*: the strategy or portfolio logic decides, and risk "checks" in a way that can be ignored, tuned away, or bypassed under pressure. That arrangement fails exactly when it matters most — in the moment of temptation or stress ([failure F-D3](../failure-criteria.md#category-d--governance--control-failures)).

## Decision

**The Risk layer is an independent authority with veto power over every capital action, and it may only ever *reduce or block* risk — never increase it.** No automated component can override a risk veto; only an explicit, authenticated, **logged human override** under the [Automated Trading Charter](../automated-trading-charter.md#5-human-override-mechanisms) may relax a limit.

Concretely:

1. **Structural independence.** Risk is not part of, and does not report to, the value-seeking layers (Strategy, Portfolio) or Execution ([ADR 0002](0002-layered-architecture-and-separation-of-duties.md)).
2. **Veto, not vote.** Risk approves, sizes down, or blocks proposed targets/orders; a block is final for automation.
3. **Reduce-only authority.** Risk's power is asymmetric by design: it can make the book safer, never riskier.
4. **Defense in depth.** Risk enforces at pre-trade, position, strategy, portfolio, and system levels; Execution *re-checks* the risk approval at the point of action ([trade journey](../architecture/high-level-components.md#3-component-interaction-a-trades-journey-illustrative)).
5. **Owns the kill switch logic** and circuit breakers ([ADR 0008](0008-fail-safe-defaults-and-kill-switch.md)).
6. **Every decision recorded.** Approvals, vetoes, breaches, and overrides are immutable audit records.

## Consequences

### Positive
- **Survival-first becomes structural**, not aspirational: risk cannot be outvoted by the pursuit of return.
- **Single, auditable choke point** for capital risk — easy to reason about and to trace.
- **Human override is possible but expensive and visible** — you can relax a limit, but never silently.

### Negative / costs
- Risk can **block profitable trades** (false positives); some upside is forgone.
- A central risk authority is a **critical component** whose availability matters (addressed by redundancy — [NFR §1](../architecture/non-functional-requirements.md#1-reliability)).
- Requires discipline to keep limits meaningful (neither so loose they never bind nor so tight they halt everything).

### Mitigations
- Forgone upside is an **accepted cost** of survival-first ([principle 1.3](../principles.md#13-survival-over-aggression)) — losing some good trades is preferable to permitting a ruinous one.
- Risk sits on the **highest-availability path**; if risk is unavailable, trading halts (fail-safe), it does not proceed unchecked.
- Limits are versioned, reviewed each phase, and their breach/override rates are monitored as [health indicators](../failure-criteria.md#category-d--governance--control-failures).

## Alternatives considered
- **Advisory risk (warnings only).** Rejected: ignorable exactly when it matters.
- **Risk embedded in Portfolio/Strategy.** Rejected: reintroduces self-authorization; the value-seeker tunes its own leash.
- **Symmetric risk authority (can also grant more risk).** Rejected: risk must be a brake, not an accelerator; only the human may add risk.

## Principles upheld / traded
Upholds [1.3 Survival over aggression](../principles.md#13-survival-over-aggression), [1.7 Capital preservation before growth](../principles.md#17-capital-preservation-before-capital-growth), [2.3 Separation of duties](../principles.md#23-separation-of-duties), [2.5 Defense in depth](../principles.md#25-defense-in-depth-for-risk). Trades some expected return for survival — the central bargain of Atlas.

## Related
[ADR 0002](0002-layered-architecture-and-separation-of-duties.md) · [ADR 0004](0004-human-in-the-loop-for-capital.md) · [ADR 0008](0008-fail-safe-defaults-and-kill-switch.md) · [Risk layer](../architecture/overview.md#35-risk-layer) · [automated-trading-charter.md](../automated-trading-charter.md)
