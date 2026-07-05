# Atlas — Threat Model & Security Architecture

> **Status:** Ratified (Phase 1 baseline; living document — expanded before Phase 7)
> **Last updated:** 2026-07-05
> **Owner:** Atlas Division (operating within Jarvis)
> **Related:** [system-boundaries.md](system-boundaries.md) · [non-functional-requirements.md](non-functional-requirements.md) · [../automated-trading-charter.md](../automated-trading-charter.md) · [../adr/0009-threat-model-and-security-baseline.md](../adr/0009-threat-model-and-security-baseline.md)

---

## Why this document exists

Atlas applies "write the constraints before the code" rigorously to *safety* — the [automated-trading charter](../automated-trading-charter.md), the [kill switch](../adr/0008-fail-safe-defaults-and-kill-switch.md), and [fail-safe defaults](../adr/0008-fail-safe-defaults-and-kill-switch.md) are all written pre-code. This document extends that same rigor to *security*, which a capital-bearing system cannot treat as a list of good intentions. Security controls are only meaningful against a **named adversary and a mapped attack surface**; a control list with no threat model cannot be shown to be complete.

This is a **Phase-1 baseline threat model**. It is deliberately technology-agnostic (no code, no vendor choices) and will be deepened into concrete mechanisms as each capability is built, with a hard expansion required before any live capital ([Phase 7](../roadmap.md#phase-7--shadow--paper-execution)).

---

## 1. Attacker taxonomy (who we defend against)

| # | Adversary | Motivation | Example capability |
|---|-----------|-----------|--------------------|
| T1 | **External network attacker** | Steal capital / credentials | Intercept traffic, exploit an exposed service |
| T2 | **Compromised dependency / supply chain** | Run code inside the trust boundary | Malicious package, backdoored SDK |
| T3 | **Malicious/compromised data vendor or feed** | Manipulate decisions | Poisoned but in-range prices, MITM on a feed |
| T4 | **Compromised Jarvis / platform** | Escalate into Atlas | Forge operator identity, read secrets |
| T5 | **AI/LLM prompt-injection & data-poisoning** | Move capital via the human | Crafted input → persuasive false approval narrative |
| T6 | **Insider / operator compromise** | Total authority | Phished/stolen/coerced operator session |
| T7 | **Broker/counterparty compromise or failure** | Freeze/steal capital | Insolvency, fraud, account takeover |
| T8 | **Opportunistic malware / stolen device** | Whatever it can reach | Keylogger, exfiltrate the audit trail |

The operator is a **trusted but attackable** principal: trusted to hold authority, but explicitly *not* assumed incorruptible — especially for the audit trail (T6/T8).

## 2. Asset register (what we protect, ranked)

| Rank | Asset | Why it matters | Loss if compromised |
|---|---|---|---|
| 1 | **Broker credentials / trading authority** | Directly moves money | Capital theft, ruinous unauthorized trades |
| 2 | **The audit trail** | Ground truth for reconstruction & honesty | Undetectable fraud, unrecoverable state |
| 3 | **Kill switch & risk controls** | Last line of defense | Uncontrolled trading, denied halt |
| 4 | **Mandate & limits configuration** | Defines what's allowed | Silent expansion of risk |
| 5 | **Market/reference data integrity** | Feeds decisions *and* risk checks | Manufactured trades + suppressed risk |
| 6 | **The AI decision-influence path** | Shapes human approvals | Manipulated capital allocation |
| 7 | **Strategy IP & research** | The edge | Competitive/economic loss |

## 3. Trust boundaries and their assumptions

These map to the five crossings in [system-boundaries §5](system-boundaries.md#5-trust-boundaries-where-dataauthority-crosses-a-security-line). Each is treated as **adversarial** — inputs validated, authority checked, records written.

| Boundary | Trust extended | Key threats | Baseline defense |
|---|---|---|---|
| Vendor → Data | *None until validated* | T3 poisoning, MITM | Feed auth/integrity; cross-vendor corroboration for capital-affecting prices; quality gates halt on anomaly |
| Operator → Jarvis → ACL | Authenticated operator only | T4, T6 | Strong auth; step-up for capital actions; velocity caps; every action logged |
| Portfolio → Risk → Execution | *Re-checked at each hop* | T2 internal compromise | No hop assumes the prior; Risk veto independent; final gate re-validates |
| Execution ↔ Broker | Broker as fill-of-record only | T7 | Trade-only keys; reconciliation; idempotency-key binding; counterparty limits |
| AI → everything | *Advice only, never authority* | T5 | Citation verification; primary evidence shown independently of AI narrative; no wire to capital |

## 4. Principal threats and required mitigations

### 4.1 Broker-credential theft (T1/T6/T8 → Asset 1)
- **[MUST] Trade-only scope.** Broker keys are provisioned with **withdrawal / transfer / ACH disabled** at the broker, so a stolen key cannot exfiltrate capital — only trade (which risk limits and the kill switch still bound).
- **[MUST] Isolation & least privilege.** Keys are held by the [Secrets Broker](high-level-components.md#1-cross-cutting-components-the-spine), never in research/reporting, never logged, sourced only by Execution's adapter.
- **[MUST] Rotation & emergency revocation.** Documented rotation cadence and a revocation runbook (leaked key → revoked fast).
- **[MUST] Standing kill/flatten credential** for the independent kill path is separately scoped and equally protected ([charter §6](../automated-trading-charter.md#6-kill-switch-requirements)).

### 4.2 Audit-trail tampering (T6/T8 → Asset 2)
- **[MUST] Cryptographic integrity, not just "append-only" policy.** Records are **hash-chained** (each commits to the prior); periodic commitments are **anchored to an external, write-once store the operator cannot rewrite** (object-lock/WORM or third-party notarization).
- **[MUST] Independently verifiable.** Integrity is checkable by a party other than the operator; "operator is fully trusted" is **not** an acceptable assumption for the audit trail. Detection of a gap/mutation is [terminal F-B4](../failure-criteria.md#category-b--integrity--honesty-failures).

### 4.3 AI as an injection surface into capital (T5 → Asset 6)
"AI is advisory" defends the *direct* wire — but the AI authors the **approval narratives, rankings, and explanations** the operator reads when approving capital ([Jarvis §5.1](jarvis-integration.md#51-human-approval-of-a-capital-escalation-the-most-important-flow)). That is the real attack channel: poisoned data or a malicious research doc → a persuasive, fabricated-but-cited rationale → a manipulated human approval ([F-D2](../failure-criteria.md#category-d--governance--control-failures)).
- **[MUST] Citation verification.** Every AI citation must resolve to a specific, hash-referenced snapshot/record; unverifiable citations are **stripped, not shown** (a hallucinated citation looks identical to a real one).
- **[MUST] Primary evidence shown independently.** The approval view presents the actual backtest verdict and risk numbers *separately from* the AI narrative, so the human can approve on evidence even if the narrative is adversarial.
- **[MUST] Treat LLM inputs as untrusted** (market data, research docs, web content); prompt-injection and data-poisoning are named threats.

### 4.4 Supply-chain compromise (T2 → all assets)
A malicious dependency runs *inside* the trust boundary and defeats every separation-of-duties control (which all assume honest components).
- **[MUST] (money/audit path)** Pinned + hash-verified dependencies; provenance/SBOM; review-before-adoption. This is elevated from a `[SHOULD]` for anything on the money or audit path.
- **[MUST] Least-privilege adapters.** A data-vendor SDK has *no* ambient access to broker credentials; each external SDK runs constrained inside its [adapter](high-level-components.md#4-design-notes), which doubles as a security chokepoint, not only a portability seam.

### 4.5 Market-data poisoning (T3 → Asset 5)
Data quality checks defend against *noise*, not a crafted attacker feeding plausible, in-range, false prices — which can simultaneously *manufacture a signal* and *suppress the risk control* (Risk consumes the same data). Risk's independence is only as strong as its input integrity.
- **[MUST] Feed authentication & integrity** (pinned TLS, signed/verified feeds where available).
- **[MUST] Cross-vendor corroboration** for capital-affecting prices — a second independent source must agree within tolerance before data drives a live decision.

### 4.6 Operator compromise & blast radius (T6 → Asset 1/3/4)
The [authority matrix](system-boundaries.md#4-authority-boundaries-who-is-allowed-to-do-what) gives the operator every capability; a stolen session is therefore total, unrecoverable authority. Defenses that don't break the single-operator model:
- **[MUST] Step-up re-authentication** for capital-increasing approvals and limit overrides.
- **[MUST] Velocity caps** on mandate/capital escalation — an attacker in the operator's seat cannot 10× the mandate in one action (mirrors [small, reversible steps](../principles.md#34-small-reversible-observable-steps)).
- **[MUST] Compromise/recovery runbook** and succession access ([charter §9](../automated-trading-charter.md#9-operator-availability--continuity)).

### 4.7 Kill-switch denial & abuse (T1/T2/T6 → Asset 3)
- **[MUST] Availability under attack.** The *halt* path withstands resource-exhaustion/DoS and does not depend on the health of what it halts ([charter §6](../automated-trading-charter.md#6-kill-switch-requirements)).
- **[MUST] Abuse resistance.** A malicious *forced flatten* is itself an attack; large-flatten actions are attributable, high-severity-logged, and rate-limited, while a *halt* (safe direction) stays easy.

### 4.8 Order replay / duplication (T1/T2 → Asset 1)
- **[MUST] Bound, single-use, expiring authorizations.** Each approval token cryptographically binds to (strategy version × size × time window) and cannot be replayed for a different size/strategy; each order carries a unique idempotency key the broker adapter deduplicates ([F-E8](../failure-criteria.md#category-e--system--operational-failures)).

## 5. Assumptions & explicitly out of scope (Phase 1)

- Physical security of the operator's devices and Jarvis's internal security are **assumed but not controlled by Atlas**; Atlas limits blast radius (trade-only keys, external audit anchoring) so that a breach *there* is survivable.
- Concrete mechanisms (which vault, which WORM store, which auth) are **later-phase ADR decisions**; this baseline fixes the *requirements*, and secrets/key custody gets its own ADR before Phase 7 (currently an unresolved either/or in [system-boundaries §2](system-boundaries.md#2-what-is-outside-atlas-out-of-scope--owned-elsewhere)).

## 6. Review cadence

This threat model is reviewed at **every roadmap phase transition** and after any security-relevant incident, and MUST be expanded into concrete, tested mechanisms as a **Phase-7 entry gate** — no live capital before its money-path and audit-integrity controls are implemented and drilled ([ADR 0009](../adr/0009-threat-model-and-security-baseline.md)).

> Security, like safety, is written before the code so the code inherits it. A control Atlas cannot name an attacker for is a control it cannot prove it needs — and one it cannot prove it has.
