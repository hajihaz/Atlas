# ADR 0031 — Steps 22–28 Capital, Paper and Promotion Boundary

**Status:** Implemented · 2026-09-03

## Decision

Atlas implements Steps 22–28 as explicit, testable boundaries. None of these steps authorizes live trading.

### Step 22 — Portfolio accounting

`PortfolioAccount` is the authoritative deterministic accounting consumer for discrete fills. It records immutable transitions for cash, position and equity changes, rejects short positions and negative cash, and has no broker authority.

### Step 23 — Risk integration

`RiskGate` is independent of strategy, broker and execution. It may approve an unchanged target, deterministically reduce weights to configured gross/single-name limits, or veto on stale data, kill switch, equity floor, negative/non-finite weights. It cannot increase requested exposure.

### Step 24 — Market-data boundary

`MarketDataBoundary` admits only identified, timezone-aware snapshots whose latest observation is not in the future and is within the configured freshness window. Backtests and paper runtime can require this admission explicitly.

### Step 25 — Cross-engine reconciliation

Atlas exposes deterministic order-intent, fill and equity comparison helpers. LEAN's golden SPY fixture remains the reference for discrete fill/fee/equity parity, with explicit tolerances rather than unsafe exact floating-point equality.

### Step 26 — Paper runtime

`PaperRuntime` is disabled by default and uses only the discrete simulator. It persists account state and a hash-chained execution ledger in-process across sessions. Risk and kill-switch checks are terminal; no network or broker implementation exists.

### Step 27 — Paper persistence/recovery boundary

Each paper session exposes a `PaperSnapshot` containing session identity, result identity, ledger checkpoint, cash, positions and equity. The ledger checkpoint provides a deterministic audit anchor. Durable database storage and restart recovery remain future work before production use.

### Step 28 — Research-to-paper promotion

`evaluate_paper_promotion` requires a passing research evidence verdict, minimum paper observations, result/ledger identities, successful reconciliation and zero runtime errors. Promotion remains a paper-stage decision and cannot enable live execution.

## Verification

The Atlas unit suite, including the Steps 22–28 hardening suite, must remain green. Source compilation must succeed. A source scan must find no direct order-submission/network primitives in the Atlas core.

## Explicit non-goals

This ADR does not select a broker, store credentials, submit orders, deploy production infrastructure, certify regulatory compliance, or grant live capital authority. Those remain separate future approvals and governance gates.
