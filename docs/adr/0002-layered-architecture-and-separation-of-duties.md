# ADR 0002 — Layered Architecture with Separation of Duties

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 1)
> **Phase:** 1 (Foundation & Architecture)

---

## Context

Atlas must perform many functions — data, research, strategy, backtesting, risk, portfolio, execution, reporting, AI, and Jarvis integration — and do so safely with capital at stake for a decade. Two failure modes must be designed out from the start:

1. **Tangle.** If functions are intertwined, the system becomes impossible to reason about, test, trace, or evolve — and in a capital system, "impossible to reason about" is "impossible to trust" ([failure F-F5](../failure-criteria.md#category-f--strategic--mission-drift)).
2. **Conflict of interest inside the machine.** If the same component that *wants* a trade can also *authorize its own risk* or *reach the broker*, then a single bug, bad incentive, or compromise can produce an uncontrolled, self-approved trade ([failure F-D5](../failure-criteria.md#category-d--governance--control-failures)).

We need a structure that makes the system tractable *and* structurally prevents self-authorization.

## Decision

**Atlas adopts a layered architecture of ten layers, each with an explicit contract (responsibilities, inputs, outputs, boundaries, dependencies), and enforces separation of duties across three role classes.** The layers and their contracts are specified in [architecture/overview.md](../architecture/overview.md).

Separation of duties is the load-bearing rule:

- **Value-seeking roles** (Research, Strategy, Portfolio) may *propose* but may not authorize risk or move money.
- **The risk role** (Risk) may only *constrain* — approve, size down, or veto — never propose or execute ([ADR 0003](0003-risk-as-independent-veto.md)).
- **The money role** (Execution) may only act on *approved* targets and is the *sole* component that reaches a broker.
- **Observers** (Reporting, AI Intelligence) may inform and explain but hold no authority over capital.
- **The boundary** (Jarvis Integration) routes human authority but does not itself decide trades.

Value flows in one primary direction (data → research → strategy → backtest → portfolio → execution); risk gates it; observers watch it. See the [authority matrix](../architecture/system-boundaries.md#4-authority-boundaries-who-is-allowed-to-do-what).

## Consequences

### Positive
- **Tractability:** each layer is independently understandable, testable, and traceable.
- **No self-authorization:** structurally impossible for a proposer to approve its own risk or place its own trade.
- **Evolvability:** a layer can be changed behind its contract without rewriting others ([principle 2.9](../principles.md)).
- **Clear lineage:** the one-directional pipeline makes end-to-end tracing natural.

### Negative / costs
- Some latency and ceremony from crossing layer boundaries (acceptable — Atlas is [not HFT](0006-not-high-frequency-trading.md)).
- More upfront design effort than a monolith.
- Risk of "anemic" layers if boundaries are drawn poorly.

### Mitigations
- Boundaries are drawn around *authority and responsibility*, not arbitrary technical seams.
- Cross-cutting concerns (audit, provenance, kill switch) are shared [spine components](../architecture/high-level-components.md#1-cross-cutting-components-the-spine), not duplicated per layer.

## Alternatives considered
- **Monolith / tightly-coupled modules.** Rejected: untraceable and unsafe at capital scale; allows self-authorization.
- **Event-driven mesh with no fixed direction.** Rejected for Phase 1: harder to reason about lineage and authority; can be revisited internally within layers if ever needed.
- **Microservices-first.** Rejected as premature: physical decomposition is a later-phase deployment decision; Phase 1 fixes *logical* layers and authority, not deployment topology.

## Principles upheld / traded
Upholds [2.3 Separation of duties](../principles.md#23-separation-of-duties), [2.9 Loose coupling](../principles.md#29-loose-coupling-and-replaceability), [2.7 Traceability](../principles.md#27-full-traceability-lineage). Trades a little performance/ceremony for safety and clarity — an explicitly accepted trade.

## Related
[ADR 0003](0003-risk-as-independent-veto.md) · [ADR 0007](0007-jarvis-anti-corruption-layer.md) · [architecture/overview.md](../architecture/overview.md) · [system-boundaries.md](../architecture/system-boundaries.md)
