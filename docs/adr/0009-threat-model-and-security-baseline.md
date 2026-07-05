# ADR 0009 — Threat Model & Security Baseline as a Phase-1 Artifact

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 1)
> **Phase:** 1 (Foundation & Architecture)

---

## Context

Atlas's governing philosophy is "write the constraints before the code, so the code inherits them." Phase 1 applied that rigor thoroughly to **safety** — the [automated-trading charter](../automated-trading-charter.md), the [kill switch](0008-fail-safe-defaults-and-kill-switch.md), and [fail-safe defaults](0008-fail-safe-defaults-and-kill-switch.md) are all written before any execution code exists.

The Phase-1 adversarial review found that the same rigor had **not** been applied to **security**: the security posture lived only as a half-page of `[MUST]`/`[SHOULD]` bullets in [NFR §2](../architecture/non-functional-requirements.md#2-security), with **no threat model** — no named adversaries, no asset register, no trust-assumption analysis. A control list without a threat model cannot be shown to be complete, and for a capital-bearing system that is the weakest-specified critical domain. Several load-bearing controls (secrets custody, audit-integrity mechanism, the AI-injection surface, supply-chain posture) were aspirational or deferred.

## Decision

**Atlas adopts a threat model and security baseline as a first-class Phase-1 artifact — [`architecture/threat-model.md`](../architecture/threat-model.md) — and treats security with the same "before the code" discipline as safety.** Concretely:

1. **A baseline threat model exists now**, covering an attacker taxonomy, a ranked asset register, per-boundary trust assumptions (mapped to [system-boundaries §5](../architecture/system-boundaries.md#5-trust-boundaries-where-dataauthority-crosses-a-security-line)), and required mitigations.
2. **Specific hardening is ratified as requirements** (mechanisms deferred to their phase): broker keys **trade-only** (withdrawal disabled); **hash-chained, externally-anchored, independently-verifiable** audit trail; **citation-verified** AI outputs with primary evidence shown independently of AI narrative; supply-chain hygiene **elevated to `[MUST]`** on the money/audit path; **cross-vendor corroboration** of capital-affecting data; **step-up auth + velocity caps** against operator compromise; **bound, single-use, expiring** order/approval authorizations.
3. **The operator is trusted-but-attackable** — not assumed incorruptible, especially for the audit trail (which must be tamper-evident *against the operator*).
4. **Security is a Phase-7 entry gate.** No live capital until the money-path and audit-integrity controls are implemented and drilled.
5. **The threat model is a living document**, reviewed every phase transition and after any security incident.

## Consequences

### Positive
- Security is now specifiable and reviewable against named threats, not vibes.
- The highest-value assets (broker keys, audit trail, kill switch) have concrete requirements.
- Blast radius is bounded (trade-only keys, external audit anchoring) so that a breach outside Atlas's control is survivable.

### Negative / costs
- Additional documentation and, later, real engineering (hash-chaining, WORM anchoring, cross-vendor corroboration) — non-trivial cost.
- Some controls (step-up auth, velocity caps) add friction to the operator experience.

### Mitigations
- Cost is incurred in the right order: requirements now (cheap), mechanisms per phase, all before live capital (where the cost is justified).
- Friction is scaled to stakes — routine reads are frictionless; only capital-increasing actions pay the security tax.

## Alternatives considered
- **Leave security as NFR bullets, model threats "later."** Rejected: inconsistent with treating safety before code; retrofitting security onto a capital system is how the crown-jewel credential leaks.
- **Full, mechanism-level security design now.** Rejected as premature: concrete vault/auth/WORM choices depend on later technology ADRs; Phase 1 fixes *requirements and threats*, not implementations.

## Principles upheld / traded
Upholds [2.6 Immutability & auditability](../principles.md#26-immutability-and-auditability), [2.3 Separation of duties](../principles.md#23-separation-of-duties), [3.2 kill switch is sacred](../principles.md#32-the-kill-switch-is-sacred), and the "before the code" discipline of [ADR 0008](0008-fail-safe-defaults-and-kill-switch.md). Trades some documentation/engineering cost and operator friction for defensible security.

## Related
[architecture/threat-model.md](../architecture/threat-model.md) · [NFR §2 Security](../architecture/non-functional-requirements.md#2-security) · [automated-trading-charter.md](../automated-trading-charter.md) · [ADR 0007](0007-jarvis-anti-corruption-layer.md) · [ADR 0008](0008-fail-safe-defaults-and-kill-switch.md)
