# Atlas — Success Criteria

> **Status:** Ratified · Phase 1 (Foundation & Architecture)
> **Last updated:** 2026-07-05
> **Owner:** Atlas Division (operating within Jarvis)
> **Related:** [mission.md](mission.md) · [failure-criteria.md](failure-criteria.md) · [principles.md](principles.md) · [roadmap.md](roadmap.md)

---

## The core reframing

Atlas does **not** define success as "made money this year." Markets make some correct processes lose for a while and reward some reckless ones for a while. Judging Atlas by a single period's return would corrupt its incentives and push it toward exactly the overfitting and over-aggression it is built to resist.

**Atlas defines success as: a healthy process producing risk-controlled outcomes, sustained across a full market cycle, with capital and integrity intact.** Returns are an *output* of the process; the process is what is managed and measured.

Success is therefore measured across five dimensions, in priority order: **Survival → Integrity → Process Health → Risk Discipline → Risk-Adjusted Outcome.** The ordering is **lexicographic within tolerance bands**: a lower-priority dimension may be traded off *only while every higher one stays inside its declared safe band*. (A strict "never compensate for anything" reading would forbid every diversifying trade that adds *any* tail risk and paralyze the book; the point is that a higher dimension in *breach* — outside its band — can never be bought back by a lower one.)

Each criterion below is stated as a *target class* with an *illustrative threshold*. Two things are separated deliberately: the **decision rule** (which statistic, over which window — *binding now*) and the **constant** (the number — *ratified per phase* in the [roadmap](roadmap.md)).

**Limit-setting methodology (binding now).** Thresholds are derived, not guessed: survival/drawdown limits from the operator's **risk capacity** (what loss is survivable given their whole financial picture), validated by **historical + synthetic-worse-than-historical stress backtests** showing the *system as a whole* survives named crises (2008, 2020, a 1987-style gap); the drawdown trigger's own **whipsaw cost** is analyzed (graduated de-risking, not a single cliff — [F-C8](failure-criteria.md#category-c--process--discipline-failures)); and the *ensemble* of limits is tested for interaction (which binds first), not each in isolation.

---

## Dimension 1 — Survival (non-negotiable)

Survival criteria are **binary and absolute**. Failing any one is a failure of Atlas regardless of every other metric.

| # | Criterion | Illustrative target |
|---|-----------|--------------------|
| S1 | Capital base never suffers a terminal drawdown (a loss deep enough to make recovery implausible) | Peak-to-trough drawdown never breaches the hard system limit (e.g. 20–25%) that triggers full de-risking |
| S2 | No single strategy, position, or day can cause catastrophic loss | Enforced max loss per strategy / position / day, independently checked |
| S3 | The kill switch works, every time it is tested | 100% of scheduled kill-switch drills succeed; flatten/hold completes within target time |
| S4 | Atlas remains solvent and operational through at least one full market cycle | Survives a bear market and a volatility shock with capital and system intact |

## Dimension 2 — Integrity & honesty (non-negotiable)

If Atlas is deceiving itself, every downstream metric is meaningless. These are also binary.

| # | Criterion | Illustrative target |
|---|-----------|--------------------|
| I1 | Every backtest is reproducible bit-for-bit from recorded provenance | 100% of promotion-relevant backtests reproduce exactly |
| I2 | No look-ahead / survivorship / restatement leakage in any promotion-grade result | Zero known point-in-time violations; automated leakage checks pass |
| I3 | Every live trade is traceable end-to-end (fill → … → data snapshot) | 100% trace completeness |
| I4 | Every capital decision has a recorded, human-readable rationale | 100% of automated actions carry an explanation |
| I5 | The audit trail is complete and tamper-evident | No gaps; append-only integrity verified |

## Dimension 3 — Process health (the strategy factory works)

Success means the *pipeline* functions: ideas flow in, evidence decides, strategies are deployed and retired honestly.

| # | Criterion | Illustrative target |
|---|-----------|--------------------|
| P1 | A steady inflow of researched, documented hypotheses | The research funnel is never empty |
| P2 | Every deployed strategy passed all pre-declared evidence gates | 100%; zero "exception" promotions without a logged override |
| P3 | Degrading strategies are detected and retired promptly, on evidence | Median time-to-detect-degradation within target; retirements have post-mortems |
| P4 | The book stays genuinely diversified — low **stressed/tail** correlation and bounded **common-factor** exposure (not just average pairwise) | Tail-correlation and net factor exposure held under limits |
| P5 | The system learns: retired strategies produce lessons that improve the funnel | Every retirement and incident yields a recorded post-mortem |
| P6 | Strategies are validated across **multiple market regimes** (or explicitly flagged as unproven outside a regime) before full allocation | Regime-coverage recorded on every promoted strategy |

## Dimension 4 — Risk discipline (limits hold)

| # | Criterion | Illustrative target |
|---|-----------|--------------------|
| R1 | Risk limits are never breached without a logged, authorized override | Zero silent breaches |
| R2 | Realized risk stays within pre-declared bounds | Realized volatility / exposure within mandate |
| R3 | Drawdowns trigger the pre-defined de-risking response automatically | 100% of drawdown triggers act as specified |
| R4 | Position sizing stays conservative (fractional-Kelly with haircut; bounded leverage) | Never exceeds the sizing ceiling |
| R5 | Tail risk is bounded and monitored (VaR/CVaR/stress within limits) | Stress-test losses within survivable range |

## Dimension 5 — Risk-adjusted outcome (only judged after 1–4 hold)

Return criteria are **last**, and always expressed *per unit of risk, net of all costs, out-of-sample, versus a fair benchmark.* A great raw return that violated Dimensions 1–4 is a failure, not a success.

| # | Criterion | Illustrative target |
|---|-----------|--------------------|
| O1 | Positive expectancy net of all costs, out-of-sample | Live results consistent with **selection/multiple-testing-adjusted** validated expectancy (survivor-inflation haircut applied), within confidence bounds |
| O2 | Sound risk-adjusted return over a full cycle | Sharpe / Sortino / Calmar meet the per-phase target |
| O3 | Live performance tracks its validated **performance envelope** | Decision rule (bind now): e.g. rolling information ratio of (live − backtest) returns flags a breach at −Xσ; a persistent live-vs-model *cost* gap triggers **mandatory cost-model recalibration** |
| O4 | Returns not dependent on a single strategy, regime, or lucky period | Attribution shows diversified, repeatable contribution |
| O5 | Costs are controlled (execution quality, turnover, fees within budget) | Realized costs within modeled assumptions |

---

## System & operational success (the platform is trustworthy)

Because Atlas is a long-lived system, "success" also means the platform itself is reliable and maintainable.

- **Monitoring uptime:** the observation and risk-monitoring path meets its availability target during market hours (higher than the trading path — see [NFRs](architecture/non-functional-requirements.md)).
- **Data freshness & quality:** data feeding decisions is fresh and passes quality gates; stale/bad data halts trading rather than being used.
- **Alert latency:** risk and anomaly alerts reach the operator (via Jarvis) within target time.
- **Recoverability:** state can be reconstructed from the immutable record within the recovery-time objective.
- **Maintainability:** a competent engineer can understand any component from its documentation; ADRs explain every major decision.

---

## How success is reviewed

- **Continuously:** Dimensions 1, 2, and 4 (survival, integrity, risk) are monitored in real time; any breach is an incident.
- **Per cycle / quarter:** Dimensions 3 and 5 (process health, outcome) are reviewed over meaningful windows, never on single-day noise.
- **Per phase:** the [roadmap](roadmap.md) defines phase-exit success criteria; a phase is not "done" until its criteria are met and reviewed.

## The one-line test

> Atlas is succeeding if, at any moment, the operator can be shown — with evidence — that **capital is intact, the process is honest, risk is within limits, and every dollar at work is there for a documented, defensible reason.**

If that sentence is true, Atlas is succeeding even in a down month. If it is false, Atlas is failing even in an up month.
