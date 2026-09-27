# ADR-0021: Cross-Engine Golden Test Boundary

Status: Proposed  
Date: 2026-09-03

## Context
Atlas now sends a canonical decision envelope to a C# LEAN adapter. A real LEAN backtest was executed against local SPY data with one target weight.

The first run proved that LEAN can consume the envelope-derived decision and submit/fill a market order in its BacktestingBrokerage. It also exposed an intentional modeling difference: Atlas's reference engine currently models continuous target weights, while LEAN models discrete shares, a portfolio-value buffer, and explicit fill/fee mechanics.

Observed LEAN fixture:
- decision date: 2013-10-07
- effective date: 2013-10-08
- target: USA:SPY = 0.625
- filled quantity: 435 shares
- fill price: 143.372382812
- fee: $2.175
- end equity: $101,284.13

A temporary Atlas calculation using the observed fill price, next close, and a fee-equivalent cost produced approximately $101,286.84. The difference is not evidence of an integration failure; it is evidence that the two engines do not yet share the same discrete execution model.

## Decision
Cross-engine golden tests will be staged:

1. Contract parity: identical serialized envelope and deterministic hash.
2. Decision parity: identical instruments, target weights, dates, and execution convention.
3. Order-intent parity: identical target-to-order calculation rules, including cash buffer, integer quantity, fees, and leverage.
4. Fill parity: identical deterministic price/fill assumptions.
5. Portfolio/equity parity: compare resulting cash, holdings, fees, turnover, and equity within an explicitly documented tolerance.

Until stages 3-5 are implemented in Atlas, a numerical P&L equality assertion is prohibited. The golden test may assert envelope and order-intent parity only.

## Safety
The LEAN fixture remains backtesting-only. No live brokerage credentials, live data feeds, or live order authority are introduced by this ADR.

LEAN source is not modified to force agreement with Atlas. Differences must be resolved by explicit execution-model design in Atlas and matched fixture assumptions.

## Consequence
The next implementation step is to add a discrete-share execution model to Atlas's reference backtester (or an isolated execution simulator) with explicit cash buffer, quantity rounding, fees, and fill price conventions. Only after that model is independently tested should exact cross-engine equity golden tests be enabled.
