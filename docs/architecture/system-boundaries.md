# Atlas — System Boundaries

> **Status:** Ratified · Phase 1 (Foundation & Architecture)
> **Last updated:** 2026-07-05
> **Owner:** Atlas Division (operating within Jarvis)
> **Related:** [overview.md](overview.md) · [jarvis-integration.md](jarvis-integration.md) · [../mission.md](../mission.md) · [../automated-trading-charter.md](../automated-trading-charter.md)

---

## Purpose

A system is defined as much by what it *refuses* to do as by what it does. This document draws the **hard boundaries** of Atlas: what is inside the system, what is outside, what Atlas will never become, and where responsibility passes to external actors. These boundaries are load-bearing — several are enforced architecturally, and crossing them is classified as a [mission-drift failure](../failure-criteria.md#category-f--strategic--mission-drift).

---

## 1. What is inside Atlas (in scope)

Atlas owns, end to end, the **quantitative investment lifecycle**:

- The **data** pipeline (point-in-time market and reference data as a single source of truth).
- **Research** and hypothesis generation.
- **Strategy** specification, versioning, and lifecycle governance.
- **Backtesting**, validation, and overfitting defense.
- **Risk** definition and independent enforcement.
- **Portfolio** construction, allocation, and monitoring.
- **Execution** of approved trades through brokers (the sole money-touching function).
- **Reporting** and intelligence generation.
- **AI-assisted** analysis and explanation (advisory).
- The **integration contract** with Jarvis.

Everything required to *discover, validate, deploy, monitor, and retire strategies with capital preserved* is inside Atlas.

## 2. What is outside Atlas (out of scope / owned elsewhere)

| Concern | Owner | Atlas's relationship |
|---|---|---|
| Operator identity, authentication, session | **Jarvis** | Consumes via the integration layer |
| Natural-language operator interface / console | **Jarvis** | Surfaces intelligence and approval requests through it |
| Notifications / messaging transport | **Jarvis** | Hands alerts to Jarvis for delivery |
| Secrets storage / master key custody | **Jarvis** *or* dedicated vault | Consumes credentials via a secure boundary; the custody mechanism is decided in [ADR 0009](../adr/0009-threat-model-and-security-baseline.md) / [threat model](threat-model.md) (not left as an unmade either/or) |
| General scheduling / OS orchestration | **Jarvis** | Receives triggers |
| Market data *origination* | **Data vendors** | Ingests behind a vendor abstraction |
| Order matching, custody of assets, settlement | **Brokers / exchanges** | Interacts behind a broker abstraction — but counterparty *risk* is **in-scope** (see below) |
| Banking, funding, tax filing, legal/regulatory filing | **External / operator** | Out of scope; Atlas keeps records to *support* these |
| LLM / model hosting | **Jarvis / providers** | Consumes shared AI services behind an abstraction |

Atlas depends on these but does not own or reimplement them. Each external dependency sits behind an abstraction so it can be replaced over a 10-year life ([principle 2.9](../principles.md)).

**Important boundary nuance:** order matching and custody are *executed* externally, but **counterparty and custody *risk* is explicitly in-scope for the [Risk layer](overview.md#35-risk-layer)** ([Category G failures](../failure-criteria.md#category-g--counterparty--custody-failures)) — the boundary is about who *executes*, not who *bears the risk*. Treating broker insolvency, freezes, or outages as "someone else's problem" is exactly how a solo operator gets surprised; Atlas monitors counterparty health and caps concentration ([charter §7](../automated-trading-charter.md#7-capital-protection-requirements)).

## 3. What Atlas explicitly is **not** (the hard exclusions)

These are not disclaimers; they are **binding design constraints.**

### 3.1 Atlas is not a guaranteed money machine
Atlas makes **no promise of profit.** It promises *process, discipline, and survival-first risk control.* Any framing of Atlas as guaranteed returns is a category error and a [mission-drift failure](../failure-criteria.md#category-f--strategic--mission-drift).

### 3.2 Atlas is not a prediction engine
Atlas does not claim to know the future. It runs a **process that behaves well across many futures** ([principle 1.5](../principles.md#15-process-over-prediction)). It produces *probabilistic, risk-weighted, evidence-based* proposals — never point-forecasts to be trusted blindly. Treating Atlas as an oracle is failure **F-F1**.

### 3.3 Atlas is not a magic AI stock picker
The AI layer is **advisory**, not authoritative ([overview §3.9](overview.md#39-ai-intelligence-layer)). No AI output moves capital without passing the same backtesting, risk, and human-approval gates as any other idea. An AI suggestion is a hypothesis, not a trade. AI acting as an authority is failure **F-D2**.

### 3.4 Atlas is not a high-frequency trading platform
Atlas deliberately declines the microsecond latency arms race ([ADR 0006](../adr/0006-not-high-frequency-trading.md)). Its cadence is **seconds to minutes to days.** It competes on *research quality, risk discipline, and survival* — not speed. Creeping toward HFT is failure **F-F3**.

### 3.5 Atlas is not a black box
Every capital decision is **explainable and traceable** ([principle 2.8](../principles.md)). If Atlas cannot explain *why* in terms the operator can understand through Jarvis, Atlas does not act. Unexplainable capital decisions are failure **F-F2**.

### 3.6 Atlas is not an unsupervised autonomous trader
Atlas **never trades blindly.** Real capital requires evidence gates, independent risk approval, and — per phase — human authorization, always under an always-live kill switch ([automated-trading-charter.md](../automated-trading-charter.md)). Autonomy is bounded, earned, and revocable. Unsupervised capital deployment is failure **F-D1**.

### 3.7 Atlas is not a market-making, arbitrage-at-scale, or client-facing fund
Phase 1 scope is a **personal** quantitative operating system for a single principal's capital. Atlas does not make markets, does not run latency arbitrage, does not take external client money, and does not provide financial advice to third parties. (It is built to *institutional discipline* — see [mission scope](../mission.md#scope-of-this-mission) — but not to institutional *scope*.)

## 4. Authority boundaries (who is allowed to do what)

Boundaries are not only about scope; they are about **authority**. Atlas enforces strict internal authority limits:

| Actor / component | May propose | May approve risk | May move capital | May override |
|---|:---:|:---:|:---:|:---:|
| Research / Strategy / Portfolio | ✅ | ❌ | ❌ | ❌ |
| Backtesting / Reporting / AI Intelligence | ✅ (evidence/advice) | ❌ | ❌ | ❌ |
| **Risk layer** | ❌ | ✅ (may only *reduce/block*) | ❌ | ❌ |
| **Execution layer** | ❌ | ❌ | ✅ (only *approved* targets) | ❌ |
| **Operator (via Jarvis)** | ✅ | ✅ (sets mandate) | ✅ (authorizes) | ✅ (halt/kill/override) |

The load-bearing rules embedded above:
- **No component both seeks and authorizes its own risk** ([separation of duties](../principles.md#23-separation-of-duties)).
- **Risk can only ever reduce risk**, never grant more.
- **Only Execution touches money, and only for approved targets.**
- **Only the human can increase mandate or override a limit** — and every such act is logged.

## 5. Trust boundaries (where data/authority crosses a security line)

Each of these crossings is a point where inputs are validated, authority is checked, and records are written ([security NFRs](non-functional-requirements.md#2-security)):

1. **Vendor → Data layer.** External data is untrusted until validated; bad/stale data halts rather than propagates.
2. **Operator → Jarvis → Jarvis Integration layer.** Commands, approvals, and kill actions cross an authenticated, authorized boundary.
3. **Portfolio → Risk → Execution.** Internal authority handoff; each step re-checks rather than assuming the previous one was correct.
4. **Execution ↔ Broker.** The money boundary; credentials are isolated here, orders are reconciled, and the kill switch acts here.
5. **AI Intelligence → everything.** AI outputs cross into the system as *advice only*, tagged and validated, never as authority.

## 6. Temporal boundary (a 10-year system)

Atlas is designed to **outlive** every current vendor, broker, model, and storage technology. Therefore:
- No external dependency is assumed permanent; all are replaceable behind abstractions.
- No decision is made that cannot be revisited by a future [ADR](../adr/0001-record-architecture-decisions.md).
- The immutable record must remain readable and reproducible for the system's full retention horizon ([data retention NFRs](non-functional-requirements.md#8-data-retention)).

## 7. What crossing a boundary triggers

Any attempt — by code, AI, or human error — to cross a hard boundary (deploy without approval, let AI move capital, use stale data live, exceed a risk limit) must:
1. **Fail safe** — default to no-action/halt ([ADR 0008](../adr/0008-fail-safe-defaults-and-kill-switch.md)).
2. **Be recorded** immutably as an attempted breach.
3. **Alert** the operator through Jarvis.
4. **Require** deliberate, logged human action to proceed — never a silent pass-through.

> Boundaries that are merely documented are decoration. Atlas's boundaries are **enforced, recorded, and fail-safe** — that is what makes them real.
