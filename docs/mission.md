# Atlas — Mission

> **Status:** Ratified · Phase 1 (Foundation & Architecture)
> **Last updated:** 2026-07-05
> **Owner:** Atlas Division (operating within Jarvis)
> **Related:** [vision.md](vision.md) · [principles.md](principles.md) · [success-criteria.md](success-criteria.md) · [architecture/overview.md](architecture/overview.md)

---

## Mission statement

**Atlas exists to grow and protect capital over the long term by operating a disciplined, evidence-driven pipeline that continuously discovers, validates, deploys, monitors, and retires quantitative trading strategies — preserving capital first, and never risking the survival of the whole for the gain of a part.**

Where the [vision](vision.md) describes *where Atlas is going*, this mission describes *what Atlas does, for whom, and by what standard it is judged.*

---

## The ten defining questions

This section answers, deliberately and unambiguously, the ten questions every stakeholder should be able to ask of Atlas.

### 1. What Atlas is
Atlas is the quantitative trading and investment division inside Jarvis: a long-lived software system and operating discipline that manufactures, validates, and manages trading strategies and the capital allocated to them. It is a **strategy lifecycle engine** wrapped in **risk control** and **governance**.

### 2. Why Atlas exists
Because durable success in markets comes from a *repeatable process*, not a lucky pick; because strategies decay and must be continuously replaced; and because disciplined risk control — not prediction — is what keeps capital alive across regimes. Atlas encodes that process and that discipline so they survive human emotion, fatigue, and bias. See [vision.md §3](vision.md).

### 3. What Atlas does
Across its lifetime, Atlas performs ten core functions:

1. **Collects** market and reference data with point-in-time integrity.
2. **Researches** hypotheses and candidate signals from data, literature, and AI assistance.
3. **Backtests** strategies against history with realistic costs, slippage, and liquidity.
4. **Validates** strategies with out-of-sample, walk-forward, and statistical-significance testing, actively hunting for overfitting.
5. **Ranks** opportunities and strategies by *risk-adjusted, cost-aware, out-of-sample* expectancy.
6. **Manages risk** at position, strategy, portfolio, and system level, with independent veto authority.
7. **Constructs and monitors portfolios**, allocating capital across low-correlation validated strategies.
8. **Generates intelligence reports** — cited, plain-language, decision-grade — surfaced through Jarvis.
9. **Executes approved trades** through brokers under hard limits, human governance, and a kill switch.
10. **Retires** degrading strategies on evidence, with a recorded post-mortem, and recycles capital.

These functions map directly to the ten architectural layers in [architecture/overview.md](architecture/overview.md).

### 4. What Atlas does not do
Atlas is **not** a guaranteed money machine, a market-prediction engine, a magic AI stock picker, or a high-frequency trading platform. It does not deploy capital without evidence, does not act on strategies it cannot explain, does not chase win-rate at the expense of expectancy, and does not take any single risk large enough to threaten survival. The full, binding list of exclusions lives in [architecture/system-boundaries.md](architecture/system-boundaries.md).

### 5. Who Atlas serves
Atlas serves **one primary principal: the operator** — the individual owner of the capital, who interacts with Atlas primarily through Jarvis. Atlas serves the operator's *long-term financial survival and growth*, in that order. Its secondary "user" is **Jarvis itself**, to which Atlas exposes intelligence, status, risk alerts, and approval requests. Atlas is a fiduciary-minded system: when the operator's short-term wish ("make it more aggressive") conflicts with the operator's long-term interest (survival), Atlas surfaces the conflict explicitly rather than silently complying.

### 6. What success looks like
Success is a **healthy process and a surviving book**, not a headline return. Concretely: reproducible research, strategies promoted and retired on evidence, drawdowns held within pre-declared limits, every trade traceable, the kill switch proven, and capital preserved across a full market cycle while compounding at a sane risk-adjusted rate. The complete, measurable definition is in [success-criteria.md](success-criteria.md).

### 7. What failure looks like
Failure is **not** a losing month; losing periods are expected and survivable. Failure is a *breakdown of process or a breach of survival*: an overfit strategy reaching live capital, a look-ahead bug making backtests lie, a risk limit silently breached, a trade no one can explain, an AI output moving capital without validation, or — the terminal failure — a drawdown deep enough to end the game. The full catalogue of failure conditions and their leading indicators is in [failure-criteria.md](failure-criteria.md).

### 8. What makes Atlas different
Three things:
- **Process over prediction.** Most retail systems seek a winning strategy; Atlas builds the factory that keeps producing them and honestly kills the losers.
- **Survival-first risk culture.** Risk is an independent authority with veto power, not an afterthought bolted onto a return-seeking engine. Capital preservation precedes capital growth as a hard ordering, not a slogan.
- **Radical auditability and honesty.** Every datum, signal, decision, and trade is traceable and explainable. Atlas is engineered to make self-deception structurally difficult — point-in-time data, reproducible backtests, overfitting tests, and immutable audit trails exist to stop Atlas from lying to itself.

See [principles.md](principles.md) for the full philosophy.

### 9. How Atlas integrates into Jarvis
Atlas is a **bounded, loosely coupled division** within Jarvis. Jarvis is the AI operating system — the operator's console, identity provider, notifier, scheduler, secret-keeper, and natural-language interface. Atlas is the specialist quant division that Jarvis delegates investment matters to. The operator commands and queries Atlas *through* Jarvis; Atlas routes approval requests, alerts, and intelligence *up to* Jarvis. The contract between them runs through a single anti-corruption boundary so each can evolve independently. Full detail in [architecture/jarvis-integration.md](architecture/jarvis-integration.md).

### 10. Long-term vision
To become a durable, self-monitoring quantitative operating system that survives a decade and at least one full regime change with capital intact, running a diversified book of continuously recycled strategies under always-live human governance. See [vision.md](vision.md).

---

## The mission hierarchy (in priority order)

When objectives conflict, Atlas resolves them in this fixed order. This ordering is a governing rule, referenced throughout the architecture:

1. **Survive.** Do not permit ruin. Preserve the capital base and the system's own operational integrity.
2. **Stay honest.** Never let the system deceive itself or the operator. Integrity of data, evidence, and audit trail is non-negotiable.
3. **Preserve capital.** Protect existing capital before seeking new gains.
4. **Compound.** Grow capital at a sound, risk-adjusted rate net of all costs.
5. **Improve.** Continuously research, validate, and recycle strategies to replace decaying edges.
6. **Explain.** Make everything Atlas does transparent and understandable to the operator through Jarvis.

Growth (4) is never pursued by sacrificing survival (1), honesty (2), or preservation (3). This is the operational heart of *"capital preservation before capital growth."*

---

## Scope of this mission

This mission governs Atlas as a **personal** quantitative operating system for a single principal's capital. It is deliberately designed, however, to be **institution-grade in discipline** — auditability, risk separation, and governance are built as if Atlas managed external money and faced a regulator, because that discipline is exactly what protects a solo operator who has no compliance department to catch mistakes. If Atlas's mandate ever broadens, the governance foundation is already in place; nothing about "personal scale" is used as an excuse to cut corners on survival, honesty, or auditability.
