# ADR 0019 — Reference Backtest Execution Timing

> **Status:** Ratified
> **Date:** 2026-09-03
> **Phase:** 3

## Context

The Atlas reference engine uses daily close-to-close returns and a leak-proof `DataView`
that exposes only event dates strictly before the decision date. Applying a decision made
at `D` to the return ending at `D` would implicitly assume the position existed before the
decision. That is a hidden execution assumption and can overstate strategy performance.

## Decision

The reference engine uses an explicit **one-session decision lag**:

- At session `D`, strategy code sees only data with event date `< D`.
- The target portfolio decided at `D` earns the next session return `D → D+1`.
- Rebalance cost is charged when the target is decided.
- The final decision in an evaluation window is not scored because no subsequent return exists.
- Any future open/intraday execution model must be an explicit, separately tested convention.

## Consequences

This makes the reference path conservative and structurally honest with its available data.
It may differ from a production engine that models open/intraday fills; those differences must
be attributable to explicit execution conventions in cross-engine golden tests.
