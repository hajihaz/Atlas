# ADR 0018 — Open-Source Quant Stack Integration Boundary

> **Status:** Proposed
> **Date:** 2026-09-03
> **Deciders:** Atlas Division
> **Phase:** 3→4 integration preparation

---

## Context

Atlas now contains a deterministic, point-in-time research/evidence core. The local Atlas workspace also contains source checkouts of four candidate open-source systems:

- `Lean/` — QuantConnect LEAN
- `FinRL/` — classic FinRL
- `FinRL-Trading/` — FinRL-X / FinRL-Trading
- `Freqtrade/` — Freqtrade

The repositories were inspected at source level rather than selected from README claims. Their responsibilities overlap, but their safety, market-domain, licensing, and maturity characteristics differ. Atlas must therefore integrate capabilities without surrendering its evidence and capital-control authority.

## Decision

**Atlas remains the system of record and governance brain. Open-source engines are subordinate capability providers. No research model or external strategy framework may directly control capital.**

The invariant is:

> **AI/strategy proposes → Atlas evidence proves → Atlas risk authorizes → execution engine executes → reconciliation verifies.**

### Integration matrix

| System | Source-level finding | Atlas treatment |
|---|---|---|
| LEAN | Event-driven engine with algorithm lifecycle, securities, portfolio construction, risk management, execution models, brokerage abstraction, fill/fee/slippage models, optimizer, and extensive tests. India-specific Zerodha brokerage/fee *models* exist, but no complete live Zerodha connector was found in the core checkout. | **CORE SIMULATION/EXECUTION INFRASTRUCTURE.** Integrate behind Atlas adapters; do not replace Atlas evidence/governance. |
| FinRL classic | RL research framework with A2C/DDPG/PPO/TD3/SAC, Gym-style trading environments and training/backtest utilities. Accounting/execution model is simpler than a production execution engine. | **RESEARCH LAB ONLY.** Use algorithms/environments as research inputs; normalize outputs into Atlas strategy contracts. |
| FinRL-Trading | Newer modular strategy stack covering selection, allocation, timing, risk, rolling training, ML strategies, adaptive rotation, backtesting, and Alpaca execution. It is materially closer to production architecture but remains young and broker-specific. | **SELECTIVE ADAPTATION.** Reuse useful strategy abstractions and research ideas through an Atlas boundary. Do not make its execution path the capital authority. |
| Freqtrade | Mature crypto bot with exchange abstraction, order lifecycle, protections, dry-run/live, hyperopt, FreqAI, persistence, and lookahead/recursive analysis. It is crypto-first. | **REFERENCE / ISOLATED CRYPTO ADAPTER.** Do not copy GPL code into proprietary Atlas core without an explicit licensing decision. |

## What stays authoritative inside Atlas

1. Point-in-time/bitemporal data access and provenance.
2. Strategy identity/version/configuration.
3. Trial counting and hash-chained research ledger.
4. Backtest evidence and reproducibility identity.
5. Overfitting and robustness gates.
6. Strategy lifecycle and promotion state.
7. Risk/capital authorization once that layer is built.
8. Execution intents, audit records, reconciliation, kill-switch state, and operator approvals once live execution is built.

## Canonical boundaries

### 1. Strategy contract

Open-source research systems may produce a candidate strategy, signal, forecast, or target portfolio. Atlas converts it into its own versioned `StrategySpec` and a canonical target-weight representation.

A research model must not receive a broker client or an order-placement capability.

### 2. Evidence contract

Every candidate must carry provenance sufficient to reproduce it:

- strategy family/version/config id
- code version
- data snapshot id
- knowledge/as-of boundary
- random seed where applicable
- universe definition
- cost/slippage assumptions
- backtest result hash
- OOS/walk-forward/Monte-Carlo/sensitivity evidence
- overfitting statistics
- trial multiplicity

### 3. Simulation boundary

LEAN is the preferred realistic market-simulation engine because its source contains first-class portfolio, transaction, fill, fee, slippage, and brokerage abstractions. Atlas's pure-Python engine remains the deterministic reference/evidence path. Any LEAN-backed result must be traceable back to the same Atlas strategy/data/provenance identity.

### 4. Execution boundary

The broker connector receives only an **Atlas-approved execution intent**, never an unconstrained model output. The execution layer must return durable order-state events. Broker acknowledgements, partial fills, cancellations, rejects, disconnects, and reconciliations become part of the audit trail.

### 5. AI boundary

AI may generate hypotheses, rank candidates, explain evidence, or flag degradation. AI output is advisory. It cannot bypass evidence gates, risk controls, human approvals, or the kill switch.

## Source-level integration notes

### LEAN

The relevant extension points identified in the checkout are:

- `QuantConnect.Interfaces.IAlgorithm`
- `IPortfolioConstructionModel`
- `IRiskManagementModel`
- `IExecutionModel`
- `QuantConnect.Brokerages.Brokerage`
- `IFeeModel`
- `ISlippageModel`
- `VolumeShareSlippageModel`
- `MarketImpactSlippageModel`
- `ZerodhaBrokerageModel`
- `ZerodhaFeeModel`
- `AlgorithmManager`

These are strong extension points for a later adapter. The live broker connector for India remains an Atlas-owned implementation concern unless a separately validated LEAN brokerage integration is added.

### FinRL / FinRL-Trading

The useful boundary is strategy generation, not capital execution. FinRL-Trading's `BaseStrategy.generate_weights(...)` is conceptually close to Atlas's `Strategy.target_weights(DataView)`, but Atlas must retain its stricter point-in-time and evidence semantics. Its Alpaca-oriented `TradeExecutor` must not become Atlas's production execution authority.

### Freqtrade

Its exchange/order/protection lifecycle is a valuable reference for failure handling and crypto-specific operation. Its GPL-3.0 license and crypto-first assumptions make direct source incorporation into the proprietary Atlas core an explicit non-default choice.

## Non-goals

- Rewriting Atlas around any single external repository.
- Giving an ML/RL model direct broker credentials.
- Treating a profitable backtest as proof of deployability.
- Treating generic optimizer output as independent evidence.
- Mixing research dependencies into the trusted capital path.
- Using broker-specific execution code as the source of truth for research evidence.

## Consequences

### Positive

- Atlas gets mature infrastructure without outsourcing governance.
- LEAN can provide realistic fills/costs while the pure engine preserves reproducibility.
- RL/ML research can expand without weakening the capital boundary.
- Crypto-specific machinery can remain isolated from the NSE/equity core.

### Negative / costs

- Multiple engines increase integration and testing burden.
- Results from different engines cannot be assumed numerically identical; cross-engine equivalence tests are required.
- The India live connector remains bespoke work.

## Required verification before integration is accepted

1. Build and execute LEAN locally/CI with a pinned toolchain.
2. Implement a minimal Atlas↔LEAN strategy adapter.
3. Prove that an identical deterministic strategy cannot see future data through the adapter.
4. Compare pure Atlas reference results with LEAN results on controlled fixtures; differences must be attributable to explicit fill/cost conventions.
5. Add cross-engine golden tests.
6. Keep research and execution credentials physically/logically separate.
7. Do not enable live capital until the Phase-7 paper-execution gates are met.
