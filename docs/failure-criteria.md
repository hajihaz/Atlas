# Atlas — Failure Criteria

> **Status:** Ratified · Phase 1 (Foundation & Architecture)
> **Last updated:** 2026-07-05
> **Owner:** Atlas Division (operating within Jarvis)
> **Related:** [success-criteria.md](success-criteria.md) · [principles.md](principles.md) · [automated-trading-charter.md](automated-trading-charter.md) · [architecture/non-functional-requirements.md](architecture/non-functional-requirements.md) · [architecture/threat-model.md](architecture/threat-model.md)

---

## Purpose

Naming failure precisely is a survival tool. This document defines **what counts as Atlas failing** and, just as importantly, the **leading indicators** that precede failure — so failure can be prevented, not just diagnosed in the post-mortem.

A crucial distinction runs through everything below:

> **A losing period is not a failure. A broken process, a breached limit, or a self-deception *is* a failure — even in a winning period.**

Atlas is designed to lose money sometimes. That is normal and survivable. What must never happen is that Atlas loses its integrity, breaches survival, or acts without evidence — because those failures compound silently and end the game.

Failures are graded in three severities:

- **🔴 Terminal** — an existential or integrity failure. Atlas has failed at its core purpose. Trading halts; a full stop-and-review is mandatory.
- **🟠 Critical** — a serious control or process breakdown that will cause terminal failure if not corrected. Immediate remediation required.
- **🟡 Warning (leading indicator)** — an early sign of drift toward failure. Investigate before it escalates.

Category headings are kept plain (no emoji/severity in the title) so their links stay stable; each category notes its dominant severity, and every row carries its own 🔴/🟠/🟡.

---

## Category A — Survival failures

*Dominant severity: 🔴 Terminal.* The failures Atlas exists to prevent.

| ID | Failure | Severity |
|----|---------|----------|
| F-A1 | **Ruin or near-ruin** — a drawdown deep enough to make recovery implausible, or that breaches the hard capital-preservation limit | 🔴 |
| F-A2 | **Uncontrolled loss event** — a single strategy, position, day, or bug causes catastrophic loss | 🔴 |
| F-A3 | **Kill switch fails to *halt*** when needed, or is discovered non-functional in a drill | 🔴 |
| F-A4 | **Runaway execution** — Atlas submits orders in a loop, at wrong size, or without authorization | 🔴 |
| F-A5 | **Over-leverage** — gross, net, or *economic* (options/futures-embedded) leverage exceeds hard limits such that a normal move threatens solvency | 🔴 |
| F-A6 | **Correlated blow-up** — "diversified" strategies fail together because hidden common-factor or tail-correlation exposure was not accounted for | 🔴 |
| F-A7 | **Kill fired but exit could not complete** — a halt succeeded but positions could not be flattened/reduced (no liquidity, limit-locked/halted market, broker down), leaving unmanaged live exposure | 🔴 |

**Leading indicators (🟡):** drawdown approaching the de-risk trigger; rising *stressed/tail* correlation and common-factor loading (not just average pairwise); creeping gross/net/economic leverage; falling margin cushion; position sizes drifting above the sizing ceiling; a single strategy growing to dominate the book; **overnight/weekend exposure above the survivable-gap limit**; rising days-to-liquidate / thinning position liquidity.

## Category B — Integrity & honesty failures

*Dominant severity: 🔴 Terminal.* If Atlas deceives itself or the operator, it has failed at its most fundamental duty ([principle 2.6](principles.md)).

| ID | Failure | Severity |
|----|---------|----------|
| F-B1 | **Leakage into a promotion-grade backtest** — look-ahead, survivorship, restatement, **feature/label leakage** (a feature or normalization peeking past the decision time), or **in-sample fitting leakage** (scalers/models fit on the full sample before the split) | 🔴 |
| F-B2 | **A backtest cannot be reproduced** from its recorded provenance (within its declared reproducibility class — [ADR 0005](adr/0005-point-in-time-and-reproducible-research.md)) | 🔴 |
| F-B3 | **A live trade cannot be traced** end-to-end to its originating data and decision | 🔴 |
| F-B4 | **The audit trail has a gap, or its integrity chain cannot be verified** (see [threat model](architecture/threat-model.md)) | 🔴 |
| F-B5 | **A capital decision has no recorded rationale** | 🔴 |
| F-B6 | **Reported performance diverges from reality** (paper-over of losses, cherry-picked windows, gross-not-net reporting, methodology drift) | 🔴 |
| F-B7 | **Survivor-inflation ignored** — promoted strategies' expected performance is reported without a selection/multiple-testing haircut, so the book's expectancy is systematically overstated | 🟠 |

**Leading indicators (🟡):** reproducibility-test flakiness; provenance fields missing on some results; reconciliation breaks between Atlas's books and the broker; reports that quietly change methodology; a rising cumulative trial count (data-snooping) without a matching multiplicity correction; pressure to "just ship" a strategy despite an unexplained result.

## Category C — Process & discipline failures

*Dominant severity: 🟠 Critical (→🔴 if capital is deployed).* The strategy factory is malfunctioning even if no money has been lost yet.

| ID | Failure | Severity |
|----|---------|----------|
| F-C1 | **An overfit strategy reaches live capital** — deployed despite failing (or bypassing) validation gates | 🟠→🔴 if capital deployed |
| F-C2 | **Goalpost-moving** — evidence gates weakened *after* seeing results to force a promotion | 🟠 |
| F-C3 | **Zombie strategies** — degraded/dead strategies remain allocated because no one retired them | 🟠 |
| F-C4 | **Win-rate chasing** — strategies selected on hit rate rather than expectancy ([principle 1.1](principles.md)) | 🟠 |
| F-C5 | **Empty funnel** — research stalls; no new strategies to replace decaying ones | 🟠 |
| F-C6 | **Unexamined multiple testing** — many strategies mined and the best kept, without correcting for data-snooping across the whole research program | 🟠 |
| F-C7 | **No post-mortem** — a strategy is retired or an incident occurs with nothing learned or recorded | 🟠 |
| F-C8 | **Spurious retirement** — a healthy strategy killed by normal-variance noise (degradation mistaken for a within-envelope drawdown), destroying compounding | 🟠 |

**Leading indicators (🟡):** validation gates passing "just barely" and suspiciously often; growing count of live strategies with deteriorating live-vs-backtest tracking; research backlog shrinking; strategies retired without breaching their pre-declared performance envelope; the same class of idea retried repeatedly without new insight.

## Category D — Governance & control failures

*Dominant severity: 🔴 Terminal (some 🟠).* The human-in-the-loop and authority boundaries have broken.

| ID | Failure | Severity |
|----|---------|----------|
| F-D1 | **Capital deployed without required human authorization** | 🔴 |
| F-D2 | **AI output moves capital without passing validation/risk gates** — an advisory layer acted as an authority, directly *or* by manipulating the human's approval via a fabricated/poisoned narrative ([threat model](architecture/threat-model.md)) | 🔴 |
| F-D3 | **Risk veto ignored or bypassed** — a trade executed against a risk block | 🔴 |
| F-D4 | **Human override ignored** — the operator's instruction (halt, reduce, stop) was not honored | 🔴 |
| F-D5 | **Separation of duties collapsed** — one component both wants a trade and authorizes its own risk | 🟠→🔴 |
| F-D6 | **Autonomy escalated without the required evidence and approval** | 🟠 |
| F-D7 | **Automation-bias capture** — approvals have become reflexive rubber-stamps; the human check exists on paper but not in substance | 🟠 |

**Leading indicators (🟡):** approval decision-times collapsing toward zero; approvals never presenting the disconfirming case; risk warnings increasing in frequency and being dismissed; the AI layer's suggestions actioned without independent validation; "temporary" limit exceptions that never get revoked; standing mandates running long past their re-justification date.

## Category E — System & operational failures

*Dominant severity: 🟠 Critical (some 🔴).* The platform itself is unreliable.

| ID | Failure | Severity |
|----|---------|----------|
| F-E1 | **Stale or bad data used for a live decision** (rather than halting) | 🟠→🔴 |
| F-E2 | **Silent monitoring failure** — Atlas stops watching a live position and does not notice | 🟠 |
| F-E3 | **Unrecoverable state** — system state cannot be reconstructed after a crash, or the immutable record is lost | 🔴 |
| F-E4 | **Single point of failure** whose failure causes uncontrolled trading or blindness | 🟠 |
| F-E5 | **Security breach** — unauthorized access to broker credentials, trading authority, or the audit trail ([threat model](architecture/threat-model.md)) | 🔴 |
| F-E6 | **Alert failure** — a critical condition occurred and the operator was never notified | 🟠 |
| F-E7 | **Risk-model model-risk realized** — the risk engine's own estimates (VaR/CVaR/correlation/vol) were trusted as truth and were materially wrong, so limits gave false comfort | 🟠 |
| F-E8 | **In-flight order ambiguity** — a crash between "order intent recorded" and "broker acknowledgement" leaves it unknown whether an order was placed, risking a duplicate or a phantom | 🟠 |

**Leading indicators (🟡):** rising data-quality warnings; monitoring-path latency creeping up; clock-skew/NTP anomalies; failed or skipped backups; **untested restore path**; overdue dependency/security patches; alert-delivery test failures; widening gap between modeled and realized risk.

## Category F — Strategic / mission drift

*Dominant severity: 🟠 Critical, slow-moving.* Atlas is quietly becoming something it was designed not to be ([system-boundaries.md](architecture/system-boundaries.md)).

| ID | Failure | Severity |
|----|---------|----------|
| F-F1 | **Prediction-oracle drift** — the system starts being trusted to "know" the future rather than run a process | 🟠 |
| F-F2 | **Black-box drift** — capital decisions become unexplainable | 🟠 |
| F-F3 | **HFT drift** — creeping toward a latency arms race Atlas explicitly rejected ([ADR 0006](adr/0006-not-high-frequency-trading.md)) | 🟠 |
| F-F4 | **Backtest-worship** — optimizing for a beautiful backtest at the expense of live robustness and survival | 🟠 |
| F-F5 | **Complexity ratchet** — the system grows so intricate that no one can reason about its risk | 🟠 |

## Category G — Counterparty & custody failures

*Dominant severity: 🔴 Terminal.* Ruin can arrive from *outside* Atlas's own logic. Order matching and custody are external ([system-boundaries §2](architecture/system-boundaries.md#2-what-is-outside-atlas-out-of-scope--owned-elsewhere)), but counterparty *risk* is explicitly in-scope for the Risk layer.

| ID | Failure | Severity |
|----|---------|----------|
| F-G1 | **Broker/custodian insolvency or fraud** — capital lost or frozen at a failed counterparty | 🔴 |
| F-G2 | **Asset freeze / withdrawal halt** — access to capital suspended by the broker or venue | 🔴 |
| F-G3 | **Prolonged broker outage during stress** — cannot manage or exit positions when it matters most (compounds F-A7) | 🔴 |
| F-G4 | **Settlement / clearing failure** — a trade does not settle as expected | 🟠 |
| F-G5 | **Counterparty concentration** — too much capital at a single broker with no diversification or contingency | 🟠 |

**Leading indicators (🟡):** widening counterparty credit spreads / negative solvency news; withdrawal or transfer delays; degraded broker API reliability; capital concentration at one venue exceeding the counterparty limit; absence of a tested "broker unavailable during a crash" playbook.

## Category H — Continuity & operator failures

*Dominant severity: 🟠 Critical (→🔴 with live leveraged exposure).* The safety model leans on one human; that human is itself a single point of failure the software SPOF rules would otherwise forbid.

| ID | Failure | Severity |
|----|---------|----------|
| F-H1 | **Operator unavailable during a live-risk event** — asleep, traveling, or incapacitated while a live book needs active management, with no defined de-risk fallback | 🟠→🔴 |
| F-H2 | **No successor / estate access** — if the operator is incapacitated, no one can reach the kill switch, broker, or audit trail | 🔴 |
| F-H3 | **Dead-man's-switch absent or failed** — prolonged operator silence does *not* force the book to a minimal-risk posture | 🟠 |
| F-H4 | **Operator compromise = total authority** — a phished/coerced/stolen operator session grants unrestricted, unrecoverable control (see [threat model](architecture/threat-model.md)) | 🔴 |
| F-H5 | **Knowledge/bus-factor loss** — the reasoning to operate Atlas lives only in one head, not the docs and audit trail | 🟠 |

**Leading indicators (🟡):** operator response-times lengthening; missed operator heartbeats; market-hours coverage gaps across time zones; no documented succession/recovery runbook; growing reliance on undocumented operator judgment.

---

## What is explicitly **not** failure

To protect Atlas's incentives, the following are declared *normal and acceptable*, never treated as failure:

- **A losing day, week, month, or quarter** within expected drawdown bounds.
- **A strategy being retired** on evidence — this is the process working, not failing.
- **A validated strategy underperforming its backtest** *within its declared performance envelope* — expected; only large, unexplained divergence is a concern.
- **Declining to trade / holding cash** when evidence or risk conditions do not support action — discipline, not failure.
- **A kill-switch *halt* that could not fully flatten** because the market was closed/illiquid — this is a known limit of physics (F-A7 is about *unmanaged* exposure), and the correct defense is ex-ante sizing, not blaming the halt.
- **Saying "no" often.** A high refusal rate is a feature.

Punishing these as failures would drive Atlas toward over-trading and over-fitting — the real failures.

---

## The failure-response protocol (summary)

1. **Detect** — automated monitors and drills surface the condition; severity is assigned.
2. **Contain** — 🔴 conditions *halt* trading and/or trigger the kill switch and fail-safe state automatically ([ADR 0008](adr/0008-fail-safe-defaults-and-kill-switch.md)); note that *halt* is always achievable but *exit* is best-effort ([charter §6](automated-trading-charter.md#6-kill-switch-requirements)).
3. **Notify** — the operator is alerted through Jarvis with severity and context.
4. **Diagnose** — root cause established from the immutable audit trail.
5. **Post-mortem** — honest, blameless, recorded; produces concrete corrective actions ([principle 3.6](principles.md)).
6. **Correct & re-test** — controls updated; drills re-run; only then does affected trading resume.

## The one-line test

> Atlas has failed if capital is not intact, the process is not honest, a limit was silently breached, or a dollar moved for a reason no one can defend — **regardless of whether the number went up.**
