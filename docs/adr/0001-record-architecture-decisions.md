# ADR 0001 — Record Architecture Decisions

> **Status:** Accepted
> **Date:** 2026-07-05
> **Deciders:** Atlas Division (Phase 1)
> **Phase:** 1 (Foundation & Architecture)

---

## Context

Atlas is designed to operate for **10+ years**. Over that lifespan, every current contributor, tool, vendor, broker, and model will change at least once. The single most valuable thing that can be preserved across those changes is not code — it is the **reasoning** behind decisions: *why* the architecture is shaped as it is, *what alternatives were weighed*, and *what would have to change for a decision to be revisited.*

Without a durable record of decisions, a long-lived system rots in a predictable way: the "why" is lost, constraints are violated by contributors who never knew they existed, safety properties are quietly eroded ("Chesterton's fence" is removed), and the same debates are re-litigated repeatedly without memory. For a system that manages capital, this rot is not merely inefficient — it is dangerous, because the eroded constraints are often the *safety* ones ([failure F-F5](../failure-criteria.md#category-f--strategic--mission-drift)).

We therefore need a lightweight, permanent mechanism for capturing architecturally significant decisions.

## Decision

**Atlas will record every architecturally significant decision as an Architecture Decision Record (ADR)** — a short, numbered, immutable Markdown document in `docs/adr/`, following the lightweight format popularized by Michael Nygard.

Rules:

1. **One decision per ADR.** Numbered sequentially (`0001`, `0002`, …), never renumbered.
2. **Immutable once Accepted.** An ADR is not edited to change its decision; instead it is **superseded** by a new ADR that references it. The history is the point.
3. **Status lifecycle:** `Proposed → Accepted → (Deprecated | Superseded by NNNN)`. A superseded ADR stays in the repo, marked, forever.
4. **"Architecturally significant"** means: it affects structure, boundaries, safety, risk posture, data integrity, external dependencies, or any [principle](../principles.md). When in doubt, write one.
5. **Every ADR states which [principles](../principles.md) it upholds** and any it trades against — an ADR that violates a principle must argue the case openly, and either lose or amend the principle explicitly.
6. **Safety-critical constraints may only be weakened by a ratified ADR** that the operator explicitly approves ([automated-trading-charter §8](../automated-trading-charter.md#8-governance-review--change-control)).

### ADR template

```
# ADR NNNN — <Title>
> Status: Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
> Date: YYYY-MM-DD
> Deciders: <who>
> Phase: <roadmap phase>

## Context
<the forces at play: technical, business, risk, and the problem being decided>

## Decision
<the choice made, stated plainly>

## Consequences
### Positive
### Negative / costs
### Mitigations
## Alternatives considered
## Principles upheld / traded
## Related
```

## Consequences

### Positive
- The **"why" survives** contributors, tools, and years.
- New contributors (human or AI) can learn the system's constraints and their rationale from one directory.
- Decisions are **deliberate and reviewable**, reducing accidental erosion of safety properties.
- Re-litigation is bounded: a settled question points to its ADR.

### Negative / costs
- A small, ongoing discipline cost: significant decisions must be written up.
- Risk of over- or under-use (too many trivial ADRs, or skipping real ones).

### Mitigations
- Keep ADRs **short**; the format is deliberately lightweight.
- Bias toward writing one when unsure — a cheap ADR beats a lost rationale.

## Related
- All Phase 1 architecture documents in [`docs/architecture/`](../architecture/overview.md) and the [principles](../principles.md) they implement.
- The foundational Phase 1 decisions recorded as [ADRs 0002–0008](#appendix-a--adr-index).

---

## Appendix A — ADR index

Phase 1 ratified the following foundational decisions. Each is load-bearing and referenced throughout the documentation.

| ADR | Decision | Status |
|-----|----------|--------|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions (this ADR) | Accepted |
| [0002](0002-layered-architecture-and-separation-of-duties.md) | Layered architecture with separation of duties | Accepted |
| [0003](0003-risk-as-independent-veto.md) | Risk as an independent veto authority | Accepted |
| [0004](0004-human-in-the-loop-for-capital.md) | Human-in-the-loop for all capital deployment | Accepted |
| [0005](0005-point-in-time-and-reproducible-research.md) | Point-in-time data & reproducible backtesting | Accepted |
| [0006](0006-not-high-frequency-trading.md) | Atlas is not a high-frequency trading system | Accepted |
| [0007](0007-jarvis-anti-corruption-layer.md) | Integrate with Jarvis via an anti-corruption layer | Accepted |
| [0008](0008-fail-safe-defaults-and-kill-switch.md) | Fail-safe defaults & first-class kill switch | Accepted |
| [0009](0009-threat-model-and-security-baseline.md) | Threat model & security baseline as a Phase-1 artifact | Accepted |

### Decision backlog (future ADRs, not yet decided)
These significant choices are deliberately **deferred** to the phase that needs them, and will each get an ADR:
- Physical data store, bitemporal point-in-time storage & the Trial ledger (Phase 2).
- Backtesting engine, reproducibility mechanism, overfitting tests & cost/impact/capacity methodology (Phase 3).
- Strategy specification format, registry & the performance-envelope / decay-detection method (Phase 4).
- Risk-limit representation, sizing model & the tail/factor correlation method (Phase 5).
- Secrets/key custody, audit integrity (hash-chain/WORM anchoring) & the rest of the [threat-model](../architecture/threat-model.md) mechanisms (pre-Phase 7).
- Broker selection, execution-venue abstraction & the in-flight/idempotency protocol (Phase 7).
- LLM/model providers & AI guardrail (citation-verification) implementation (Phase 6).
- Deployment topology, environment isolation, redundancy, disaster recovery & the operating-cost envelope (pre-Phase 7).

---

## Appendix B — Phase 1 architecture review

Before Phase 1 was closed, the architecture was subjected to an **independent adversarial review** by four reviewers, each briefed to adopt one perspective and to *find weaknesses*, not to approve: **Hedge Fund CTO**, **Quant Research Director**, **Risk Manager**, and **Security Architect**. They read the full document set (read-only) and reported concrete findings. This appendix records what they found and what changed — honestly, including what was *not* fully closed.

A deliberate distinction runs through the outcome:

> **Phase 1 fixes constraints, requirements, and structure. It does not implement mechanisms.** Where a finding is answered by "we now *require* X," that is a Phase-1-appropriate closure; where it needs "we now *build* X," it is recorded as a **deferred mechanism** with a phase and an owning ADR — not silently marked resolved. (An earlier draft's temptation to call everything "resolved" was itself flagged by the reviewers and corrected here.)

### B.1 Hedge Fund CTO — operational resilience & longevity
**Findings:** single-operator continuity is an unaddressed SPOF (contradicting the "no SPOF" NFR); disaster recovery / immutable-record replication is asserted but undesigned; kill-switch "flatten" hand-waves the illiquid-market case; idempotency/reconciliation named but the in-flight-crash mechanics undefined; bit-for-bit reproducibility collides with non-deterministic LLMs; the lifecycle lacks a fault state and a version-supersession path; deployment/cost realities deferred so far they make availability MUSTs uncheckable.
**Revisions (constraint-level):** added [operator availability & continuity](../automated-trading-charter.md#9-operator-availability--continuity) + [Category H failures](../failure-criteria.md#category-h--continuity--operator-failures); added DR/replication + in-flight order recovery as [MUST] [reliability NFRs](../architecture/non-functional-requirements.md#1-reliability); split the kill switch into **Halt (unconditional) vs. Flatten (best-effort)** ([charter §6](../automated-trading-charter.md#6-kill-switch-requirements), [F-A7](../failure-criteria.md#category-a--survival-failures)); scoped reproducibility "[by class](0005-point-in-time-and-reproducible-research.md)"; added the `Suspended` state + version-supersession invariant to the [lifecycle](../architecture/domain-model.md#3-the-strategy-lifecycle). **Deferred (mechanism):** deployment topology & cost envelope, and concrete DR implementation (pre-Phase-7 / Phase 2 ADRs).

### B.2 Quant Research Director — evidence integrity & overfitting
**Findings:** multiple-testing correction named but the *multiplicity denominator* undefined (no trial ledger across the research program); point-in-time covered data but not *feature/label* or *in-sample-fitting* leakage; backtest realism sloganised (no capacity/impact methodology, no live-vs-model cost feedback loop); success/failure thresholds defer *decision rules*, not just constants; strategy-decay detection undefined (symmetric risk of zombies **and** spurious kills); the "antifragility" claim sits in tension with a stop-loss control loop.
**Revisions (constraint-level):** added a family-level **[Trial ledger](../architecture/domain-model.md#26-backtests-strategy)** as the multiplicity denominator; bound point-in-time onto **feature computation and fitting** ([ADR 0005](0005-point-in-time-and-reproducible-research.md), [F-B1](../failure-criteria.md#category-b--integrity--honesty-failures)); added a **pre-declared performance envelope**, **hard capacity limit**, **regime-coverage**, and **selection haircut** to the [Strategy entity](../architecture/domain-model.md#24-strategies-strategy--the-central-entity); separated **decision rule from constant** and added a **limit-setting methodology** in [success criteria](../success-criteria.md); added spurious-retirement ([F-C8](../failure-criteria.md#category-c--process--discipline-failures)) and survivor-inflation ([F-B7](../failure-criteria.md#category-b--integrity--honesty-failures)). **Open/deferred:** the concrete *methods* (which overfitting test, which decay statistic, which impact model) are Phase-3 ADRs; the antifragility-vs-stop-loss tension is flagged as a live design question, not resolved.

### B.3 Risk Manager — survival & control independence
**Findings:** the kill switch cannot flatten what the market won't (see B.1); gap/overnight risk unaddressed and continuous limits can't stop a gap; counterparty/broker risk scoped *out*; the correlation defense (average pairwise) is toothless against tail-correlation and hidden common factors; "leverage" undefined (gross vs. net vs. economic) and sized to a *normal* not stressed move; single-operator key-person risk; automation bias "monitored" but not structurally controlled — and ADR 0004's batching *increases* it.
**Revisions (constraint-level):** added a **gap/overnight exposure cap** + jump/gap scenarios, a **leverage taxonomy (gross/net/economic)** sized to the *worst stressed move*, **margin-buffer/forced-liquidation** modeling, a **live liquidity limit**, and a **counterparty concentration limit** ([charter §7](../automated-trading-charter.md#7-capital-protection-requirements)); upgraded correlation to **tail/stressed + common-factor** ([Risk layer](../architecture/overview.md#35-risk-layer), [components](../architecture/high-level-components.md#25-risk-layer), P4); added [Category G](../failure-criteria.md#category-g--counterparty--custody-failures) & [Category H](../failure-criteria.md#category-h--continuity--operator-failures); made counterparty risk explicitly in-scope ([system-boundaries §2](../architecture/system-boundaries.md#2-what-is-outside-atlas-out-of-scope--owned-elsewhere)); replaced automation-bias *measurement* with **structural forcing functions** and corrected the ADR-0004 batching claim honestly.

### B.4 Security Architect — credential & authority protection
**Findings:** *no threat model existed at all* — security was aspirational NFR bullets while safety got a full charter; broker-credential custody was deferred with no scope-minimization; "tamper-evident" audit had no mechanism and no defense against the operator/insider; "AI is advisory" defends the direct wire but not the **approval-narrative** persuasion channel; supply-chain was only `[SHOULD]`; market-data poisoning treated as a *quality* not *adversarial* problem; order replay and operator-compromise blast-radius unmodeled.
**Revisions:** created a first-class **[threat model](../architecture/threat-model.md)** and [ADR 0009](0009-threat-model-and-security-baseline.md); made broker keys **trade-only**; specified **hash-chained, externally-anchored, independently-verifiable** audit integrity (operator trusted-but-attackable); added **citation verification + primary-evidence-shown-independently** for AI; elevated **supply-chain to `[MUST]`** on the money/audit path; required **cross-vendor market-data corroboration**; added **step-up auth, velocity caps, and single-use bound authorizations**. **Deferred (mechanism):** concrete vault/WORM/auth choices are pre-Phase-7 ADRs; the threat model is expanded into tested controls as a **Phase-7 entry gate**.

### B.5 Standing conclusion (honest)
The reviewers concurred that the architecture's *shape* is sound — a layered pipeline with an independent risk veto and a single, governed money path. The review did **not** find the shape wrong. It found that the first draft **named** its hardest disciplines (multiplicity correction, feature-leakage prevention, kill-switch-under-illiquidity, correlation-under-stress, audit tamper-evidence) more confidently than it had **specified** them, and that two whole risk domains (counterparty, operator-continuity) and the entire **security** discipline were under-treated. Those gaps are now closed *at the constraint level*, and their *mechanisms* are explicitly scheduled, owned, and gated. Phase 1 is closed on the honest basis that **the requirements are now right and complete enough to constrain the build — while the methods and mechanisms are named, deferred, and gated, not pretended-done.**
