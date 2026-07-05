# CLAUDE.md — Working Guidance for Atlas

This file orients any AI assistant (and any human) working in this repository. **Read it before making changes.** It is the operational contract for *how* work is done in Atlas; the [principles](docs/principles.md) are *why*.

---

## 1. What this project is (in one breath)

Atlas is the **Quantitative Trading & Investment Division inside Jarvis** (an AI operating system). It is a long-lived (10+ year) system whose job is to **continuously discover, validate, deploy, monitor, and retire trading strategies on evidence**, while **preserving capital and never risking survival.** Its edge is disciplined *process*, not *prediction*.

**Phase 1 (architecture/governance) and Phase 2 (the data foundation) are complete.** Atlas now has real, tested code — but **only the market-data layer**: bitemporal point-in-time storage, survivorship-free universe, corporate-action adjustment, a fail-safe data-quality gate, reproducibility snapshots, and a hash-chained trial ledger. There are still **no strategies, signals, backtester, portfolio/risk engine, broker, or dashboards** — those are later phases. See [README.md](README.md), [docs/roadmap.md](docs/roadmap.md), and [docs/data/data-architecture.md](docs/data/data-architecture.md).

## 2. The golden rules (never violate without a ratified ADR)

These are the safety-critical constraints. They may be **strengthened freely**, but **weakened only** through a deliberate [ADR](docs/adr/0001-record-architecture-decisions.md) that argues the case and that the operator explicitly approves ([charter §8](docs/automated-trading-charter.md#8-governance-review--change-control)).

1. **Atlas must never trade blindly.** No capital action without evidence, independent risk approval, traceability, a reachable human, and a working kill switch. ([charter](docs/automated-trading-charter.md))
2. **Survival and honesty outrank growth — always.** When goals conflict, follow the [mission hierarchy](docs/mission.md#the-mission-hierarchy-in-priority-order): Survive → Stay honest → Preserve capital → Compound → Improve → Explain.
3. **Fail safe.** On any error, ambiguity, or stale data, default to no-trade / de-risk / halt — never to more risk. Silence is never approval. ([ADR 0008](docs/adr/0008-fail-safe-defaults-and-kill-switch.md))
4. **Risk is an independent veto.** No value-seeking or execution component may authorize its own risk. Risk can only *reduce* risk. ([ADR 0003](docs/adr/0003-risk-as-independent-veto.md))
5. **Human-in-the-loop for capital.** Deploying or increasing capital/autonomy requires explicit, logged human approval. ([ADR 0004](docs/adr/0004-human-in-the-loop-for-capital.md))
6. **Point-in-time & reproducible, or it isn't evidence.** No look-ahead/survivorship/restatement/**feature** leakage; the deterministic evidence path reproduces **bit-for-bit**, and non-deterministic (LLM/parallel) outputs are **frozen by provenance** the moment they are used ("reproducible by class"). ([ADR 0005](docs/adr/0005-point-in-time-and-reproducible-research.md))
7. **Everything that touches capital is immutable, traceable, and explainable.** Who/what/when/why on every decision; end-to-end lineage; no black boxes. ([NFRs](docs/architecture/non-functional-requirements.md))
8. **The AI layer advises; it never authorizes capital.** No wire from an AI output to money that skips validation, risk, and human governance — *including* the approval narrative it writes for the human. (This applies to *you.*)
9. **Atlas is not HFT.** No latency arms race; cadence is seconds-to-days. ([ADR 0006](docs/adr/0006-not-high-frequency-trading.md))
10. **Security is written before the code, like safety.** Broker keys are trade-only (no withdrawal); the audit trail is tamper-evident *against the operator*; treat data feeds and LLM inputs as adversarial. ([threat model](docs/architecture/threat-model.md), [ADR 0009](docs/adr/0009-threat-model-and-security-baseline.md))

If a request would breach one of these, **do not silently comply.** Surface the conflict, explain it, and propose a safe alternative or a proper ADR.

## 2a. Data-layer rules (Phase 2 — read before touching `src/atlas/`)

The market-data foundation has its own load-bearing rules ([data-architecture.md](docs/data/data-architecture.md)):

- **Keep the domain core pure.** `atlas.common`, `atlas.data.{bitemporal,market,calendars,adjustments,universe,quality,snapshots,lineage}`, and `atlas.trials` import **zero third-party packages**. Heavy deps (SQLAlchemy, Pydantic, pandas, Typer) live only in adapters (`data.models`, `ingestion.adapters`, `config`, `cli`). CI's `core-no-deps` job fails if this is violated. ([ADR 0010](docs/adr/0010-phase-2-technology-stack.md))
- **All datetimes are timezone-aware.** Naive datetimes are rejected (`require_aware`). Knowledge time is UTC; sessions are IST. A wrong clock silently breaks point-in-time truth. ([ADR 0011](docs/adr/0011-bitemporal-point-in-time-model.md))
- **Bitemporal facts are append-only.** Never UPDATE a price/membership/CA in place — a correction *appends* a new version and closes the old one. Never store adjusted prices; adjust **on read** from actions known as-of the query.
- **Never delete an instrument.** Delisted names persist — that is what makes the universe survivorship-free.
- **Bad data halts, it does not pass.** Route ingestion through the quality gate; a halting finding means the batch is quarantined (nothing loaded). Do not add a code path that loads unvalidated data. ([ADR 0013](docs/adr/0013-data-quality-gating.md))
- **Prices are `Decimal`, never `float`.** Float breaks reproducibility.
- **Reproducibility: pin snapshots, record provenance.** Research reads a `snapshot_id`, not "latest". Every experiment writes to the [trial ledger](docs/research/trial-ledger.md). ([ADR 0014](docs/adr/0014-reproducibility-and-snapshots.md))
- **The pure reference semantics define correctness; the SQL layer must match them** (asserted by the integration test).
- **Run `make core-test`** (no deps) or `make test` (full) before proposing changes; keep coverage ≥ 85%.

## 3. What NOT to do

- **Do not build ahead of the roadmap phase.** Phase 2 is the **data layer only**. Do **not** add strategies, signals, a backtester, portfolio/risk engines, broker integrations, AI prediction, APIs, or dashboards — those belong to later phases and their safety machinery must precede them.
- **Do not write anything that could place, size, or approve a real trade** outside the governed path (evidence gate → risk veto → human approval → execution with kill switch). Even in later phases.
- **Do not weaken a safety constraint to make something easier.** Convenience never outranks survival.
- **Do not introduce a strategy, metric, or ranking based on win rate alone** — expectancy and the full outcome distribution govern. ([principle 1.1](docs/principles.md#11-expectancy-over-win-rate))
- **Do not let an impressive backtest bypass overfitting checks.** Assume overfit until adversarial testing says otherwise.
- **Do not create a dependency (vendor, broker, model, storage) without an adapter** and a replacement story — this is a 10-year system.
- **Do not treat AI/LLM output (including your own) as ground truth about markets or as authorization.** It is a hypothesis, subject to the same gates as any idea.
- **Do not commit, push, or take outward-facing actions unless asked.** If on `main`, branch first.

## 4. How to work here

- **Documentation-first.** Design and its rationale precede code. If you build a capability, its governing docs/ADR come with it.
- **Match the house style.** Docs use a consistent header (status · date · owner · related), cross-link liberally with relative Markdown links, prefer tables and Mermaid diagrams for structure, and state which [principles](docs/principles.md) a design upholds or trades.
- **Keep the ubiquitous language.** Use the exact terms from the [domain model](docs/architecture/domain-model.md) (the twelve domains, the [strategy lifecycle](docs/architecture/domain-model.md#3-the-strategy-lifecycle) states) and the ten [layer](docs/architecture/overview.md) names. Consistency of vocabulary is a feature.
- **Significant decision? Write an ADR.** Anything affecting structure, boundaries, safety, risk, data integrity, or a principle. When in doubt, write one — a cheap ADR beats a lost rationale. Follow the [template](docs/adr/0001-record-architecture-decisions.md#adr-template); never renumber or edit an Accepted ADR's decision (supersede it instead).
- **Respect the phase gates.** No phase's work begins until the previous phase's exit criteria are met. Discovering an integrity flaw in an earlier layer sends work *back*, not forward.
- **Small, reversible, observable.** Prefer changes that can be reviewed and undone. This mirrors how Atlas treats capital and autonomy.

## 5. Where to look (doc map)

| If you need to know… | Read |
|---|---|
| The 10-year vision | [docs/vision.md](docs/vision.md) |
| What Atlas does / doesn't do / for whom | [docs/mission.md](docs/mission.md) · [docs/architecture/system-boundaries.md](docs/architecture/system-boundaries.md) |
| The rules of the road | [docs/principles.md](docs/principles.md) |
| What success/failure means | [docs/success-criteria.md](docs/success-criteria.md) · [docs/failure-criteria.md](docs/failure-criteria.md) |
| The system architecture | [docs/architecture/overview.md](docs/architecture/overview.md) |
| The concepts & their relationships | [docs/architecture/domain-model.md](docs/architecture/domain-model.md) |
| Components inside each layer | [docs/architecture/high-level-components.md](docs/architecture/high-level-components.md) |
| Quality attributes (reliability, security, audit…) | [docs/architecture/non-functional-requirements.md](docs/architecture/non-functional-requirements.md) |
| The security threat model & attacker taxonomy | [docs/architecture/threat-model.md](docs/architecture/threat-model.md) |
| How Atlas connects to Jarvis | [docs/architecture/jarvis-integration.md](docs/architecture/jarvis-integration.md) |
| The rules for ever trading automatically | [docs/automated-trading-charter.md](docs/automated-trading-charter.md) |
| Why a decision was made | [docs/adr/](docs/adr/) |
| What to build next | [docs/roadmap.md](docs/roadmap.md) |

## 6. Repository conventions

- **Docs live in `docs/`.** ADRs in `docs/adr/NNNN-kebab-title.md`, sequentially numbered, never renumbered.
- **Code directories** (`backend/`, `frontend/`, `database/`, `strategies/`, `backtests/`, `reports/`) are **reserved and empty** until their roadmap phase. Do not populate them ahead of their phase.
- **Dates** in docs are absolute (`YYYY-MM-DD`), never relative.
- **Commit messages** describe the *why*, not just the *what*, in keeping with the ADR culture.

## 7. The mindset

Atlas is engineered to make **self-deception structurally difficult** and **survival the default**. Every constraint that feels inconvenient — the risk veto, the human approval, the reproducibility burden, the fail-safe halt — is load-bearing. When you are tempted to route around one, that is exactly the moment the constraint is doing its job.

> Build Atlas the way it invests: **evidence-first, survival-first, honestly, and for the long haul.**
