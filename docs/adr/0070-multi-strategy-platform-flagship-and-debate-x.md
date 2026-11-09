# ADR-0070: Multi-strategy paper platform, ScalpStorm X flagship, Debate X review layer

Status: Accepted (owner decision, 2026-11-09). Supersedes the scope of PR #54 ("ScalpStorm X as sole active strategy"). Live capital remains BLOCKED.

Related: [ADR-0003](0003-risk-as-independent-veto.md), [ADR-0004](0004-human-in-the-loop-for-capital.md), [ADR-0008](0008-fail-safe-defaults-and-kill-switch.md), [Debate X](../debate-x/README.md).

## Context

Two proposals conflicted. PR #54 retired five strategies so ScalpStorm X was the only one. PR #56 added Debate X and a three-way 15-session challenge that needs the original Atlas strategies as a comparison book. They could not both land.

## Decision

1. **Atlas is a multi-strategy, paper-only platform.** ScalpStorm X is the **flagship**, not the only strategy. The five approved intraday strategies stay first-class: SMA 9/21 Crossover, EMA 12/26 Momentum, RSI 14 Mean Reversion, 20-Bar Breakout and SPS Swing Pullback (IDs in `frontend/lib/research-engine.js`).
2. **Debate X supports strategies; it never replaces them.** Good Cloud (bullish/supporting), Bad Cloud (bearish/challenging) and the Judge (independent evaluation) review candidates from any approved strategy. The Good/Bad Cloud agents never see each other's output. All three are advisory.
3. **The deterministic RiskGate keeps sole approval authority** (ADR-0003). A Judge APPROVE cannot override a risk veto, and an AI output never authorizes capital (golden rule 8).
4. **Existing working functionality and trading history are preserved.** Removing a strategy, the paper-trials page or archived ledgers requires a new ADR. The five-strategy forward-paper checkpoint runner stays; its cron trigger is currently disabled and re-enabling it is an owner operations decision. `frontend/tests/multi-strategy-policy.test.mjs` fails if they are removed by accident.
5. **PAPER_ONLY stays.** No path to real orders is added.
6. **No simulated result substitutes for market evidence.** Replays are labelled hypothetical; certification stays 0/20 until genuine forward sessions on rights-cleared NSE data exist.

## Consequences

- PR #54's strategy-removal changes are not applied; the PR is revised to record this decision and add the guard test.
- Debate X comparisons use the original Atlas book as one of three virtual books.
- Reversal needs a superseding ADR approved by the operator.
