# ADR-0022 — Discrete Execution Boundary in the Atlas Backtest Engine

**Status:** Proposed  
**Date:** 2026-09-03

## Decision

Atlas will expose discrete execution in the backtest engine as an **explicit opt-in execution mode**. The existing continuous-weight reference engine remains the default and is not silently replaced.

The discrete path uses this timing contract:

**decision at D → size from information available before D / D close → fill at D+1 open → mark at D+1 close**

The strategy still receives the leak-proof `DataView` at D and cannot access D or future bars. The execution simulator receives separate sizing, fill, and valuation prices so future execution/valuation prices cannot influence order sizing.

## Consequences

- `execution_mode="reference"` preserves the existing research behavior and `CostModel`.
- `execution_mode="discrete"` models integer-share execution through `DiscreteExecutionSimulator`.
- No broker API, credentials, order placement, or live-trading capability is introduced.
- Missing required bars are a hard error; they are never converted to zero prices or zero returns.
- Discrete execution is currently long-only and uses the simulator's explicit execution configuration.
- Result provenance records the execution mode and initial cash, and these inputs participate in the reproducibility hash.

## Validation

The focused Atlas suite validates:

1. legacy reference-mode behavior remains green;
2. discrete execution is explicitly selected;
3. sizing/fill/valuation remain temporally separated;
4. discrete results reproduce deterministically;
5. the existing LEAN SPY golden fixture still reconciles at order intent, fill, fee, and ending equity.

This ADR does **not** authorize live execution. Live trading remains gated by the financial-governance and broker-boundary ADRs.
