# ADR 0007 — Integrate with Jarvis via an Anti-Corruption Layer

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 1)
> **Phase:** 1 (Foundation & Architecture)

---

## Context

Atlas is a division inside [Jarvis](../architecture/jarvis-integration.md), an AI operating system. Atlas depends on Jarvis for identity, the operator interface, notifications, scheduling, secrets, human-approval routing, and shared AI services. This is a deep dependency on a platform that will itself evolve over the system's 10-year life.

Two coupling risks follow:

1. **Atlas's core becomes entangled with Jarvis's current shape.** If Jarvis's concepts and interfaces leak into Atlas's internals, then every change to Jarvis forces changes across Atlas — and a capital-managing system cannot be destabilized every time its host platform is refactored.
2. **Governance is scattered.** Human authority, approvals, and the kill switch are the highest-stakes interactions; if they enter Atlas through many ad-hoc paths, they cannot be uniformly authenticated, authorized, and audited.

## Decision

**All interaction between Atlas and Jarvis passes through a single Anti-Corruption Layer (ACL): the [Jarvis Integration layer](../architecture/overview.md#310-jarvis-integration-layer). Atlas's internal domain is never exposed raw to Jarvis, and Jarvis's concepts never leak into Atlas's core.**

1. **One boundary, translated.** The ACL translates between Atlas's domain vocabulary and Jarvis's OS concepts in both directions; neither side's model contaminates the other.
2. **Independent evolution.** Jarvis can be re-platformed and Atlas can be restructured internally as long as the ACL contract holds ([principle 2.9](../principles.md#29-loose-coupling-and-replaceability)).
3. **Governance concentrated at the boundary.** Authentication, authorization, the human-approval workflow, and the kill-switch endpoint are enforced *at the ACL* — one place to secure, audit, and reason about ([integration §7](../architecture/jarvis-integration.md#7-boundary-responsibilities-summary)).
4. **Defined degraded mode.** If Jarvis is unavailable, the ACL's behavior is specified: no new risk is taken, protection of existing positions continues, and an independent kill path remains ([integration §6](../architecture/jarvis-integration.md#6-degraded-mode-what-happens-if-jarvis-is-unavailable)).
5. **Semi-independent operability.** Atlas is designed so its core survival functions (monitoring, risk, kill) do not *require* a healthy Jarvis moment-to-moment.

## Consequences

### Positive
- **Longevity:** neither side is trapped by the other's technology choices over a decade.
- **Security & auditability:** the highest-stakes interactions cross exactly one, well-guarded boundary.
- **Testability:** the ACL contract can be tested/mocked in isolation.
- **Resilience:** a defined degraded mode means Jarvis's failure never becomes a *risk-control* failure.

### Negative / costs
- **Translation overhead** and some duplication of concepts across the boundary.
- **Extra indirection** for every operator interaction.
- Requires **discipline** to keep the boundary from leaking over time.

### Mitigations
- Overhead is negligible at Atlas's [non-HFT cadence](0006-not-high-frequency-trading.md).
- The boundary's integrity is itself reviewed each phase; leaks are treated as architectural debt.

## Alternatives considered
- **Tight integration / shared internal models with Jarvis.** Rejected: couples a capital system to a moving platform; scatters governance.
- **Multiple ad-hoc integration points.** Rejected: multiplies the attack/audit surface for the highest-stakes interactions.
- **Full independence from Jarvis.** Rejected: Atlas is *defined* as a division inside Jarvis and should reuse, not reimplement, identity/interface/orchestration.

## Principles upheld / traded
Upholds [2.9 Loose coupling and replaceability](../principles.md#29-loose-coupling-and-replaceability), [2.3 Separation of duties](../principles.md#23-separation-of-duties) (governance concentrated and checked), and the [human-in-the-loop](0004-human-in-the-loop-for-capital.md) guarantee (enforced at one boundary). Trades a little indirection for longevity, security, and resilience.

## Related
[architecture/jarvis-integration.md](../architecture/jarvis-integration.md) · [ADR 0002](0002-layered-architecture-and-separation-of-duties.md) · [ADR 0008](0008-fail-safe-defaults-and-kill-switch.md) · [system-boundaries.md](../architecture/system-boundaries.md)
