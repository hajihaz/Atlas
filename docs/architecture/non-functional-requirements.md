# Atlas — Non-Functional Requirements

> **Status:** Ratified · Phase 1 (Foundation & Architecture)
> **Last updated:** 2026-07-05
> **Owner:** Atlas Division (operating within Jarvis)
> **Related:** [overview.md](overview.md) · [../principles.md](../principles.md) · [../failure-criteria.md](../failure-criteria.md) · [../automated-trading-charter.md](../automated-trading-charter.md)

---

## How to read this document

These are the **quality attributes** Atlas must exhibit — the properties that matter regardless of which specific strategies it runs. For a system managing capital over a decade, the NFRs are not secondary to features; **they largely *are* the product.** Auditability, integrity, and fail-safety are what separate Atlas from "a script that trades."

Each requirement below states an **intent** (binding now) and an **illustrative target** (a placeholder to be ratified per phase in the [roadmap](../roadmap.md)). Requirements are marked **[MUST]** (non-negotiable) or **[SHOULD]** (strong default, may be traded with a recorded ADR).

A guiding priority runs through all of them:

> **The ability to *observe and stop* ranks above the ability to *act*. Atlas may be unable to trade; it must never be unable to *see* or *halt*.**

---

## 1. Reliability

- **[MUST] Never go blind to live capital.** The monitoring/risk path has the highest availability target in the system — higher than the trading path. Losing the ability to *watch* a live position is a [critical failure](../failure-criteria.md#category-e--system--operational-failures).
- **[MUST] Fail safe, always.** On any error, timeout, or ambiguity, the system defaults to no-trade / de-risk / halt ([ADR 0008](../adr/0008-fail-safe-defaults-and-kill-switch.md)). The safe state is always reachable.
- **[MUST] No single point of failure may cause uncontrolled trading or blindness.** Redundancy is required specifically on the *risk, monitoring, and kill* paths.
- **[MUST] Recoverable state.** System state (positions, orders, book of record) is reconstructable from the immutable record after any crash — target **RPO ≈ 0** for capital records; **RTO** within a defined window during market hours.
- **[MUST] Disaster recovery for the immutable record.** The audit log / capital record is the source of truth for reconstruction, so it is **replicated across ≥ 2 independent locations**; a concrete crash-recovery procedure (rebuild positions/orders, re-reconcile with the broker on restart) is defined; and **test-restore is a `[MUST]`, drilled on a schedule** (an untested backup is assumed broken). An immutable ledger that exists in only one place is a single point of total data loss.
- **[MUST] Idempotency, reconciliation & in-flight recovery.** Order submission is idempotent (no duplicate trades on retry) via a unique idempotency key the broker adapter deduplicates; a durable **order-intent record is written *before* submission** so a crash between intent and broker-acknowledgement is recoverable (was the order placed?); Atlas's book is continuously reconciled against the broker, and a reconciliation break freezes the affected instrument, treats the **broker as source of truth for fills**, and escalates to the human ([F-E8](../failure-criteria.md#category-e--system--operational-failures)).
- **[SHOULD] Graceful degradation.** Loss of a non-critical component (e.g. research, a data vendor, Jarvis interface) degrades capability without endangering existing positions ([Jarvis degraded mode](jarvis-integration.md#6-degraded-mode-what-happens-if-jarvis-is-unavailable)).

## 2. Security

Security is specified against a named adversary in the [threat model](threat-model.md); the requirements below are its baseline.

- **[MUST] Isolate money-touching credentials, trade-only.** Broker credentials are held under the tightest scope via the [Secrets Broker](high-level-components.md#1-cross-cutting-components-the-spine), separated from research/reporting, never hard-coded or logged — and provisioned **trade-only (withdrawal/transfer disabled)** so a stolen key cannot exfiltrate capital. Documented rotation cadence and emergency revocation.
- **[MUST] Least privilege everywhere.** Each component gets only the access it needs; research and reporting can never reach a broker; external SDKs run constrained inside their adapter (a data-vendor SDK has no access to broker credentials).
- **[MUST] Defense against unauthorized orders.** Only Execution can submit orders, only for risk-approved and (per phase) human-approved targets; every order is attributable to an authenticated authority and carries a **single-use, bound, expiring** authorization (approval binds to strategy version × size × window; cannot be replayed).
- **[MUST] Tamper-evident audit trail — cryptographically.** Append-only is a policy, not a guarantee: records are **hash-chained** and periodically **anchored to an external write-once store the operator cannot rewrite**, with integrity **independently verifiable by a party other than the operator** (who is trusted-but-attackable). Unauthorized mutation is [terminal F-B4](../failure-criteria.md#category-b--integrity--honesty-failures).
- **[MUST] Encryption in transit and at rest** for credentials, capital records, and the audit trail.
- **[MUST] Market-data integrity.** Capital-affecting data is authenticated and **corroborated across ≥ 2 independent sources** before it drives a live decision — poisoned-but-in-range data must not both trigger a trade and suppress the risk check that consumes the same feed.
- **[MUST] Authenticated, authority-checked human actions,** with **step-up re-authentication and velocity caps** for capital-increasing approvals and overrides, so a compromised operator session cannot escalate the mandate in a single action.
- **[MUST] Supply-chain hygiene on the money/audit path.** Dependencies on the money-touching or audit path are pinned, hash-verified, provenance-tracked (SBOM), and reviewed before adoption. *(Elevated from `[SHOULD]`: a malicious dependency runs inside the trust boundary and defeats separation of duties.)*
- **[SHOULD] Access audit.** Access to secrets, trading authority, and the audit store is itself logged.

## 3. Auditability

- **[MUST] Everything that influences capital is recorded** — decisions, orders, fills, config/limit changes, overrides, lifecycle transitions, kill events — **append-only and immutable.**
- **[MUST] Who / what / when / why** on every record. A decision without a recorded rationale is a [terminal failure](../failure-criteria.md#category-b--integrity--honesty-failures).
- **[MUST] Tamper-evident (cryptographically, and against the operator).** The record can be *independently* shown not to have been altered — hash-chained and externally anchored, verifiable by a non-operator party (see [§2](#2-security) and the [threat model](threat-model.md)).
- **[MUST] Exportable & durable.** The trail can be exported for review and survives for the full retention horizon ([§8](#8-data-retention)).
- **Rationale:** auditability is what makes honest post-mortems, debugging, and trust possible; it is Atlas's defense against self-deception.

## 4. Traceability (lineage)

- **[MUST] End-to-end lineage.** Any trade traces backward through fill → order → risk approval → portfolio target → signal → strategy version → data snapshot; any research result traces to its inputs. Broken lineage is a [terminal failure](../failure-criteria.md#category-b--integrity--honesty-failures).
- **[MUST] Provenance on every artifact.** Snapshots, signals, backtests, trades, and reports carry the code version, inputs, parameters, and seed that produced them.
- **[MUST] Version everything that matters.** Data, strategies, limits, and config are versioned; references are by identity+version, never by mutable copy.

## 5. Explainability

- **[MUST] No black-box capital decisions.** Every automated action carries a human-readable rationale the operator can understand via Jarvis ([principle 2.8](../principles.md)). If it can't be explained, it isn't done ([failure F-F2](../failure-criteria.md)).
- **[MUST] AI outputs cite evidence.** Every AI-generated claim carries citations, confidence, and provenance; unsourced AI assertions never influence capital.
- **[SHOULD] Counterfactual-friendly.** Explanations should convey *why this and not the alternative*, not just *what*.

## 6. Reproducibility & determinism

- **[MUST] Reproducible by class ([ADR 0005](../adr/0005-point-in-time-and-reproducible-research.md)).** The **deterministic evidence path** (data → signal → backtest → risk calc) is **bit-for-bit** reproducible: same code + snapshot + parameters + seed ⇒ identical result. Paths that *cannot* be bit-exact — parallel/accelerated compute with floating-point reductions, and **non-deterministic hosted LLMs** in the AI layer — are **reproducible-by-provenance**: the exact output artifact is *frozen and immutably recorded the moment it is used*, with its inputs/model/version, so the artifact that counted as evidence is fixed even if a re-run would differ. A result reproducible in *neither* sense is not evidence ([F-B2](../failure-criteria.md#category-b--integrity--honesty-failures)).
- **[MUST] Point-in-time correctness — of features and fitting, not just data.** Only information available at the simulated/decision moment may be used: no look-ahead, survivorship, or restatement leakage, **and** no feature/label leakage or in-sample fitting across the split ([ADR 0005](../adr/0005-point-in-time-and-reproducible-research.md), [principle 2.1](../principles.md)).
- **[MUST] Seeded, recorded randomness.** All stochastic elements are seeded and the seed is stored.
- **[MUST] Clock integrity.** The [Time Authority](high-level-components.md#1-cross-cutting-components-the-spine) uses a trusted, monotonic time source; clock skew/anomaly is detected and **halts trading** — a wrong "as-of" clock silently breaks every point-in-time guarantee.

## 7. Scalability & performance

- **[MUST] Scale in the right dimensions.** Atlas scales with *number of strategies, instruments, data volume, and backtest compute* — **not** with latency ([ADR 0006](../adr/0006-not-high-frequency-trading.md)).
- **[MUST] Latency posture: seconds-to-days.** Decision and execution cadence is low/mid-frequency (intraday to daily); there is no microsecond requirement, and none may be introduced without an ADR overturning the [HFT stance](../adr/0006-not-high-frequency-trading.md).
- **[SHOULD] Horizontal research/backtest scaling.** Backtesting and research compute can scale out (many strategies/parameter sets in parallel) without touching the trading path.
- **[SHOULD] Throughput sufficiency.** The system comfortably handles daily/intraday rebalancing across the intended universe with headroom.
- **[SHOULD] Bounded resource growth.** Storage/compute growth over a decade is planned for (data retention is large — [§8](#8-data-retention)).

## 8. Data retention

- **[MUST] Retain capital and decision records for a regulatory-grade horizon.** Trades, orders, approvals, overrides, and the audit trail are retained for **≥ 7 years, and effectively indefinitely** where feasible — long enough to reconstruct any past decision.
- **[MUST] Retain data snapshots and backtests needed for reproducibility** for the life of any strategy that relied on them, plus the audit horizon.
- **[MUST] Immutability over the retention window.** Retained records cannot be silently altered.
- **[SHOULD] Tiered storage.** Hot/warm/cold tiers manage cost over a decade without sacrificing durability or immutability.
- **[MUST] Right-to-recover.** Retained data is periodically **test-restored** (see [§1 disaster recovery](#1-reliability)); an untested backup is assumed broken.

## 9. Risk controls *(NFR-level; see [Risk layer](overview.md#35-risk-layer) & [charter](../automated-trading-charter.md) for detail)*

- **[MUST] Defense in depth.** Independent risk checks at pre-trade, position, strategy, portfolio, and system levels; no single check is trusted alone ([principle 2.5](../principles.md)).
- **[MUST] Independent veto.** Risk can block/reduce any action and cannot be overridden by any automated component — only by a logged human override ([ADR 0003](../adr/0003-risk-as-independent-veto.md)).
- **[MUST] Hard limits with automatic response.** Drawdown, exposure, concentration, and leverage limits trigger de-risking/halt automatically.
- **[MUST] Always-available kill switch,** tested regularly; an untested kill switch is assumed broken.
- **[MUST] Conservative sizing.** Fractional-Kelly-with-haircut / volatility-targeted sizing; bounded leverage; no full-Kelly.

## 10. Maintainability & evolvability *(a 10-year system)*

- **[MUST] Modular, replaceable components** behind stable contracts; all externals behind adapters ([principle 2.9](../principles.md)).
- **[MUST] Documented decisions.** Every load-bearing choice is an [ADR](../adr/0001-record-architecture-decisions.md); the "why" survives staff/tooling changes.
- **[SHOULD] Understandability.** A competent engineer can reason about any component from its docs; complexity that no one can reason about is a [failure mode](../failure-criteria.md#category-f--strategic--mission-drift).
- **[SHOULD] No lock-in as a single point of failure.** No vendor/broker/model is irreplaceable.

## 11. Observability

- **[MUST] Metrics, structured logs, traces, and health checks** across all layers, feeding Reporting.
- **[MUST] Actionable, severity-tagged alerting** delivered via Jarvis within target latency; a missed critical alert is a [failure](../failure-criteria.md#category-e--system--operational-failures).
- **[SHOULD] Golden-path dashboards** for book, risk, strategy lifecycle, and system health.

## 12. Testability & assurance

- **[MUST] Deterministic test harness** for backtests and decisions (flows from reproducibility).
- **[MUST] Regular drills.** Kill-switch, failover, and recovery drills are scheduled; results are recorded; untested safety controls are assumed broken.
- **[SHOULD] Simulation before reality.** Every capability is proven in paper/simulation before touching capital ([roadmap](../roadmap.md)).

## 13. Compliance-readiness *(designed-in, even for a personal system)*

- **[SHOULD] Record-keeping to institutional standard.** Even though Atlas is personal in scope, its records are kept as if a regulator could ask — because that same rigor protects a solo operator ([mission scope](../mission.md#scope-of-this-mission)).
- **[SHOULD] Clear separation of advice vs. execution vs. governance** in the record, to support any future compliance posture.

---

## Priority ordering of NFRs

When NFRs conflict, resolve in this order (consistent with the [mission hierarchy](../mission.md#the-mission-hierarchy-in-priority-order)):

1. **Integrity** (auditability, traceability, reproducibility, point-in-time) — never compromised.
2. **Safety** (fail-safe, risk controls, kill switch, security).
3. **Reliability** (don't go blind; recover).
4. **Explainability** (no black boxes).
5. **Maintainability / evolvability** (survive a decade).
6. **Performance / scalability** (sufficient, never at the cost of the above).

Performance is explicitly *last* — a deliberate consequence of [not being an HFT system](../adr/0006-not-high-frequency-trading.md). Atlas buys correctness, safety, and longevity with the latency budget it refuses to spend on speed.
