# Atlas

**The quantitative research, risk and paper-trading system designed to integrate with [HajiHaz (formerly Jarvis)](docs/architecture/jarvis-integration.md).**

> Atlas is a personal hedge-fund operating system that survives changing markets by continuously **discovering, testing, validating, deploying, monitoring, and retiring** trading strategies on the basis of **evidence — not prediction.**

---

## Status (verified against the repository on 7 November 2026)

Atlas has progressed beyond the original Phase-2 data foundation, but **implementation is not strategy certification or authorization for live trading**. The architectural roadmap remains a target, not a claim that every gate has passed.

| Area | Current repository reality |
|---|---|
| Data foundation | Point-in-time/bitemporal data, universe, quality checks, snapshot provenance and a hash-chained trial ledger live in `src/atlas/`. |
| Research and strategies | Python strategy/backtest/research modules, ScalpStorm research scripts, a Node research/paper engine and a LEAN C# adapter exist. **No production-certified strategy or verified profitable track record is claimed.** |
| Risk and execution | Independent risk controls, kill-switch protections, portfolio/paper execution and an **Upstox sandbox** broker adapter exist. An adapter is not authorization or evidence of live broker trading. |
| Frontend | `frontend/` is an implemented React/Vite control center: paper trials, Strategy Lab, ScalpStorm, IPO Intelligence, risk audits and charts. |
| Scheduled checks | `.github/workflows/atlas-paper-scheduled.yml` attempts virtual paper checkpoints on a two-hour schedule with a second delayed attempt. Scheduling does not establish source coverage or successful market-session certification. |
| Real-money trading | **Blocked.** The scheduled workflow pins `ATLAS_EXECUTION_MODE=PAPER_ONLY` and rejects `frontend/public/real-orders.json`. See [ADR-0059](docs/adr/0059-atlas-readiness-status-2026-09-04.md) and the [automated-trading charter](docs/automated-trading-charter.md). |
| Verification | Automated Python, Node and conditional PostgreSQL integration tests exist. PostgreSQL execution/recovery coverage requires a disposable database; skips do not count as passes. |
| Still incomplete | Evidence-backed market-session/strategy certification, validated licensed source coverage and deployment/operational acceptance are distinct outstanding gates. Top-level `strategies/`, `backtests/`, `reports/` and `backend/` remain placeholders even though functional modules exist elsewhere. |

**Safety distinction:** a code module, successful unit test, simulated backtest or virtual paper checkpoint **does not** imply permission to execute a live trade or evidence of positive returns.

### Run the checks

Use Python 3.11+ and a supported Node.js version. From the repository root:

```bash
python -m pip install -e '.[dev]'
python -m pytest -q --disable-warnings --strict-markers
python -m ruff check src tests scripts
python -m mypy src/atlas

cd frontend
npm ci
npm run check
npm run build
node --test tests/*.test.mjs
```

The Python suite skips database integration tests unless `ATLAS_TEST_DB` and `ATLAS_EXECUTION_TEST_DB` point to an **isolated, disposable PostgreSQL test database**. Never point them at a production or shared database. GitHub CI defines a disposable PostgreSQL service in `.github/workflows/ci.yml`. `make core-test` also requires the development test dependencies (including pytest).

The pure-standard-library **data domain core** is documented in [development foundation](docs/development/development-foundation.md); adapters, UI and integrations have separate dependencies. Use the [roadmap](docs/roadmap.md) for intended milestones rather than treating the original phase label as an implementation inventory.

---

## What Atlas is (and is not)

**Atlas is** a *strategy lifecycle engine* wrapped in *independent risk control* and *human governance*. Its durable edge is not any single strategy — it is the disciplined machinery that manufactures, validates, and recycles strategies faster than markets erode them, while never taking a risk large enough to end the game.

**Atlas is not** a guaranteed money machine, a market-prediction engine, a magic AI stock picker, or a high-frequency trading platform. These exclusions are [binding design constraints](docs/architecture/system-boundaries.md#3-what-atlas-explicitly-is-not-the-hard-exclusions), not disclaimers.

## Core philosophy

Atlas is built on nine tenets ([full detail](docs/principles.md)):

- **Expectancy** over win rate
- **Risk-adjusted returns** over raw returns
- **Survival** over aggression
- **Evidence** over opinions
- **Process** over prediction
- **Research** over guessing
- **Capital preservation** before capital growth
- **Continuous validation** · **Continuous improvement**

The one-line test of success: *at any moment, the operator can be shown — with evidence — that capital is intact, the process is honest, risk is within limits, and every dollar at work is there for a documented, defensible reason.* ([success criteria](docs/success-criteria.md))

---

## Documentation map

Architecture and design rationale live in `docs/`; executable code lives in `src/`, `frontend/`, `scripts/` and `lean-adapter/`. Start with the documents below.

### Foundation & governance
| Document | What it answers |
|---|---|
| [docs/vision.md](docs/vision.md) | Where Atlas is going — the 10-year vision |
| [docs/mission.md](docs/mission.md) | What Atlas does, for whom, and by what standard — the ten defining questions |
| [docs/principles.md](docs/principles.md) | The constitution — philosophy, engineering, and operating principles |
| [docs/success-criteria.md](docs/success-criteria.md) | What success looks like (survival → integrity → process → risk → outcome) |
| [docs/failure-criteria.md](docs/failure-criteria.md) | What failure looks like, and its leading indicators |
| [docs/roadmap.md](docs/roadmap.md) | Strategic milestones from Phase 1 to production-ready Atlas |
| [docs/automated-trading-charter.md](docs/automated-trading-charter.md) | How Atlas may *ever* trade automatically — the safety charter |

### Architecture
| Document | What it covers |
|---|---|
| [docs/architecture/overview.md](docs/architecture/overview.md) | The ten-layer architecture and how value & control flow |
| [docs/architecture/system-boundaries.md](docs/architecture/system-boundaries.md) | What's in, what's out, hard exclusions, authority & trust boundaries |
| [docs/architecture/domain-model.md](docs/architecture/domain-model.md) | The twelve domains, their relationships, and the strategy lifecycle |
| [docs/architecture/high-level-components.md](docs/architecture/high-level-components.md) | The components inside each layer and the cross-cutting spine |
| [docs/architecture/jarvis-integration.md](docs/architecture/jarvis-integration.md) | How Atlas plugs into Jarvis (anti-corruption boundary) |
| [docs/architecture/non-functional-requirements.md](docs/architecture/non-functional-requirements.md) | Reliability, security, auditability, traceability, and more |
| [docs/architecture/threat-model.md](docs/architecture/threat-model.md) | Attacker taxonomy, asset register, trust boundaries, security baseline |

### Decisions
| Document | Decision |
|---|---|
| [ADR 0001](docs/adr/0001-record-architecture-decisions.md) | Record architecture decisions (+ the Phase 1 review) |
| [ADR 0002](docs/adr/0002-layered-architecture-and-separation-of-duties.md) | Layered architecture with separation of duties |
| [ADR 0003](docs/adr/0003-risk-as-independent-veto.md) | Risk as an independent veto authority |
| [ADR 0004](docs/adr/0004-human-in-the-loop-for-capital.md) | Human-in-the-loop for all capital deployment |
| [ADR 0005](docs/adr/0005-point-in-time-and-reproducible-research.md) | Point-in-time data & reproducible backtesting |
| [ADR 0006](docs/adr/0006-not-high-frequency-trading.md) | Atlas is not a high-frequency trading system |
| [ADR 0007](docs/adr/0007-jarvis-anti-corruption-layer.md) | Integrate with Jarvis via an anti-corruption layer |
| [ADR 0008](docs/adr/0008-fail-safe-defaults-and-kill-switch.md) | Fail-safe defaults & a first-class kill switch |
| [ADR 0009](docs/adr/0009-threat-model-and-security-baseline.md) | Threat model & security baseline as a Phase-1 artifact |
| [ADR 0010](docs/adr/0010-phase-2-technology-stack.md) | Phase 2 technology stack (Python · Postgres · pure-core/adapter split) |
| [ADR 0011](docs/adr/0011-bitemporal-point-in-time-model.md) | Bitemporal point-in-time data model |
| [ADR 0012](docs/adr/0012-trial-ledger.md) | The trial ledger (multiplicity denominator) |
| [ADR 0013](docs/adr/0013-data-quality-gating.md) | Data-quality gating (fail-safe) |
| [ADR 0014](docs/adr/0014-reproducibility-and-snapshots.md) | Reproducibility & content-addressed snapshots |

### Data foundation (Phase 2)
| Document | What it covers |
|---|---|
| [docs/data/data-architecture.md](docs/data/data-architecture.md) | Master data architecture, storage, ER model, pipeline, code map |
| [docs/data/point-in-time.md](docs/data/point-in-time.md) | Bitemporal design — no look-ahead, no survivorship, adjust-on-read |
| [docs/data/market-data-model.md](docs/data/market-data-model.md) | Instruments, OHLCV, corporate actions, indices/VIX, calendar |
| [docs/data/data-quality.md](docs/data/data-quality.md) | The validation framework, checks, and the fail-safe gate |
| [docs/data/reproducibility.md](docs/data/reproducibility.md) | Snapshots, provenance, and the four reproducibility questions |
| [docs/research/trial-ledger.md](docs/research/trial-ledger.md) | The append-only, hash-chained trial ledger |
| [docs/development/development-foundation.md](docs/development/development-foundation.md) | Repo structure, tech decisions, testing, workflow, CI |

---

## The ten-layer architecture at a glance

```
 External data ──▶ 1 Data ──▶ 2 Research ──▶ 3 Strategy ──▶ 4 Backtesting
                                                  │               │
                                                  ▼        (evidence gates)
                                             6 Portfolio ◀───────┘
                                                  │
                                          [ 5 Risk — independent veto ]
                                                  │
                                             7 Execution ──▶ Brokers   ($ only here)
                                                  │
        9 AI Intelligence (advisory) ····▶ 8 Reporting ····▶ 10 Jarvis Integration ──▶ Operator
```

Value flows left-to-right; **Risk gates every capital action and can veto**; **only Execution touches money**; the **operator (via Jarvis) can approve, override, or kill at any time.** Full detail in [architecture/overview.md](docs/architecture/overview.md).

---

## Repository structure

```text
Atlas/
├── README.md · AGENTS.md · CLAUDE.md  contributor and agent guidance
├── pyproject.toml · Makefile           Python package, tests and tooling
├── src/atlas/
│   ├── common/ · data/ · trials/       provenance, bitemporal data, quality, trial ledger
│   ├── strategy/ · research/           signal/research primitives
│   ├── backtest/ · lean/               research replay and LEAN integration
│   ├── market/ · paper/                market observations and virtual trading
│   ├── execution/ · broker/            execution journals and sandbox adapter
│   ├── risk/ · portfolio/              risk veto and portfolio accounting
│   └── governance/ · reporting/ · config/ · cli/ · security/
├── frontend/
│   ├── src/                            React/Vite pages, charts and IPO intelligence
│   ├── tests/                          Node regression/safety tests
│   └── public/                         source-attributed read-only snapshots
├── lean-adapter/                        LEAN C# integration
├── scripts/                             paper engine, certification and IPO tooling
├── database/migrations/                 Alembic migrations
├── tests/{unit,integration,reproducibility}/
├── .github/workflows/                   Python/Postgres, UI, IPO and paper checks
├── docs/                                architecture, evidence, decisions and roadmap
├── .ai/                                  internal work logs / handoffs (review before sharing)
└── strategies/ · backtests/ · reports/ · backend/
                                         reserved top-level placeholder directories
```

**Do not confuse empty top-level folders with an absence of implementations.** Real research, risk, backtest, execution and paper modules currently live in `src/atlas/`, `frontend/`, `scripts/` and `lean-adapter/`. Conversely, the existence of these modules does not mean that the complete trading-strategy set is certified or operationally accepted.

---

## Contributing (human or AI)

Read **[CLAUDE.md](CLAUDE.md)** before making any change. In short: every change must be reconcilable with the [principles](docs/principles.md); significant decisions get an [ADR](docs/adr/0001-record-architecture-decisions.md); safety constraints may be *strengthened* freely but *weakened* only through a ratified ADR the operator approves. Atlas is a 10-year, capital-bearing system — it is built deliberately, evidence-first, survival-first.

> **Atlas does not try to be right about the market. It tries to stay in the game long enough, and lose small enough when wrong, that being right on average compounds.**
