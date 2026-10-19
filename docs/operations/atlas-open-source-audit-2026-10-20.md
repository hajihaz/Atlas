# Atlas — 10 upstream trading-framework intake audit

**Date:** 2026-10-20  
**Objective:** Inspect ten previously shortlisted upstream repositories for Atlas reuse, licensing, costs, architecture, security and capital safety; publish an auditable decision; block unreviewed direct dependency adoption.  
**Scope boundary:** This is a source/manifest intake audit, **not** a completed penetration test, dependency CVE scan, production benchmark or license opinion. No upstream package was installed, vendored, deployed or used for trades. Review with legal counsel before distributing copyleft or commercially restricted third-party code.  
**Related:** [Decision manifest](atlas-open-source-audit.json) · [Six-role roadmap](atlas-six-agent-paper-roadmap-2026-10-20.md) · [Trading charter](../automated-trading-charter.md)

## Existing Atlas first, upstream second

Live Atlas already has CoinDCX public INR observations, read-only selected history, five historical strategy models, browser-local virtual strategies, a separately deployed six-role *deterministic research* council, and a Vercel dashboard. No audited machine-readable NSE intraday feed or broker execution rights. The open [cloud paper PR #8](https://github.com/hajihaz/Atlas/pull/8) previously failed on a test import path and **must not** be called deployed or accepted until fixed and tested. The six-role council does not place even virtual orders. Avoid replacing existing validated Atlas components with expensive generic bots.

## Upstream findings

| # | Repo (pinned source in JSON) | License from repository | Relevant code inspected | Atlas decision |
|---|---|---|---|---|
| 1 | [TradingAgents](https://github.com/TauricResearch/TradingAgents) | Apache-2.0 | `tradingagents/graph/trading_graph.py`, project config/deps | **Reference pattern**: separated analyst duties, decision traces and checkpoints; *no automatic LLM dependency*. |
| 2 | [FinRL-X / FinRL-Trading](https://github.com/AI4Finance-Foundation/FinRL-Trading) | Apache-2.0 | `src/strategies/base_strategy.py`, dependencies | **Isolated evaluation**: output portfolio weights, compare independent deterministic portfolio strategies. |
| 3 | [NautilusTrader](https://github.com/nautechsystems/nautilus_trader) | LGPL-3.0 | `python/nautilus_trader/backtest/__init__.pyi`, Rust/Python design | **Isolated evaluation**: event-driven order/fill simulation; review LGPL integration obligations. |
| 4 | [Freqtrade](https://github.com/freqtrade/freqtrade) | GPL-3.0 | `freqtrade/optimize/backtesting.py`, `pyproject.toml` | **Legal hold** for code reuse; independently implement general research concepts, don't vendor GPL into Atlas blindly. |
| 5 | [Microsoft Qlib](https://github.com/microsoft/qlib) | MIT | `qlib/backtest/backtest.py`, `pyproject.toml` | **Isolated evaluation**: walk-forward ML feature research and verified point-in-time data. Pin after Oct 2026 security hardening and block untrusted serialized artifacts. |
| 6 | [FinRobot](https://github.com/AI4Finance-Foundation/FinRobot) | Apache-2.0 | `finrobot_equity/README.md`, runtime requirements | **Reference pattern**: deterministic numbers separated from optional LLM summaries. Its full web app lists OpenAI/FMP API keys; zero-cost execution unproven. |
| 7 | [QuantConnect LEAN](https://github.com/QuantConnect/Lean) | Apache-2.0 | `Engine/Engine.cs`, `QuantConnect.Lean.sln` | **Isolated evaluation**: independently compare trade fill assumptions and historical backtests; requires .NET and lawful data. |
| 8 | [Hummingbot](https://github.com/hummingbot/hummingbot) | Apache-2.0 | `hummingbot/strategy/strategy_base.pyx`, README | **Reference pattern**: paper-exchange interface/order lifecycle; *do not install real exchange connectors into production Atlas*. |
| 9 | [VectorBT](https://github.com/polakowo/vectorbt) | Commons Clause + underlying terms | `vectorbt/portfolio/base.py`, `LICENSE.md` | **Legal hold**: Commons Clause restricts selling functionality; only learn generic parameter-grid testing ideas without copying protected code. |
| 10 | [ProsusAI FinBERT](https://github.com/ProsusAI/finBERT) | Apache-2.0 applies to code **only** | `scripts/predict.py`, clarified README | **Legal/model-data hold**: do not download/deploy model weights or Financial PhraseBank dataset without checking their *separate* licenses. |

Each upstream repository was verified public, not archived, and its last default-branch commit recorded with full 40-character SHA in the JSON. Dates and revisions are **snapshots**, not a future freshness guarantee.

## Risk, cost and maintenance decisions

- **Stock exchange and redistribution rights:** repo open source does not grant Indian real-time NSE/BSE data redistribution or algorithmic reuse. ScalpStorm X remains blocked from pretending stock fills until lawful data is verified.
- **Model-provider expenses:** TradingAgents and FinRobot involve complex model-provider stacks and optional keys. A ChatGPT subscription does *not* automatically authorize arbitrary programmatic paid model calls. Run without external LLM spending.
- **Compute/storage:** full NautilusTrader/Rust, LEAN/.NET, Qlib ML and FinRL-X ML stacks are much heavier than Atlas's current lightweight UI/data boundary. Evaluate on isolated free local compute only, never claim guaranteed permanent free hosted capacity.
- **Security:** Qlib's 2026-10-08 commits specifically addressed config code execution and serialization. Every candidate needs version pinning, vulnerability/advisory checks, supply-chain review and hostile-data tests *before any package installation*. Those full scans were not performed in this connector-only audit.
- **Permissive != risk-free:** Apache/MIT source reuse requires notice, dependency review and provenance checks; applying a license to source does not resolve broker/financial data or model-weight licenses.
- **Copyleft and Commons Clause:** LGPL/GPL/Commons-Clause situations must be distinguished; they do not all mean automatic prohibition. This audit intentionally blocks **unreviewed direct integration**, not discussion, research or legally permitted independent benchmarking.
- **Market provenance:** no simulated gains may be shown as earned money. Source event timestamps, exchange sessions, closed bars and simulated fee/slippage assumptions must accompany any report.

## Finite implementation map

| Next slice | Preferred input | Acceptance evidence | Status |
|---|---|---|---|
| Existing six-role advisory design | TradingAgents + FinRobot *architectural patterns* | Source-gated WAIT/SKIP panels with risk veto and no order rights | Already delivered separately in Atlas |
| Reproducible weights-based comparison | FinRL-X equal-weight contract concept, independent Atlas-only implementation | `scripts/prototypes/scalpstorm_equal_weight.mjs`: 10 distinct NSE symbols -> 10 × ₹10,000, zero orders and no invented prices; tested in CI | **Isolated no-order proof of concept**, not connected to NSE signals or the UI |
| Independent simulation cross-check | LEAN / NautilusTrader | Same timestamped fixture leads to reconciled fills, costs, balances; cold restart and gap cases | **Candidate**, no engine installed |
| ML strategy research | Qlib | Verified no look-ahead, source freshness and artifact load isolation | **Defer** until security and data trials |
| Crypto dry-run comparison | Freqtrade / Hummingbot | No private-source license leakage, no broker credential route, same market bars | **Hold/research** |
| Sentiment inference | FinBERT | Weight/dataset license verified, event attribution, offline/free compute and nonfabricated outputs | **Hold** |
| Persistent scheduled paper | Existing Atlas PR #8 | Fix import-path regression, rerun full CI, verify an actual scheduled snapshot before calling it autonomous | Separate pending delivery |

## Decision and owner gates

**Approved now:** repo read-only inspections; produce documented references and static safety gates; execute zero-cost isolated testing where runtime permits; no installed or vendored upstream packages.  
**Deferred:** third-party dependency import, paid data/model/hosting, broker authorization, use of protected weights/data, genuine high-risk migrations and real capital. These require clear risk/cost/license evidence and owner gates where necessary.  
**HHC note:** local scoped Mac tunnel unavailable during this audit; GitHub can run the static checks/CI and Vercel can verify deployment independently. No source repository was modified outside Atlas.

## Verification checklist

- [x] 10/10 repository identities and non-archive states verified.
- [x] 10/10 explicit license files retrieved and classified.
- [x] 10/10 source entrypoints inspected and full upstream commit SHAs recorded.
- [x] Maintenance snapshot and selected install requirements reviewed.
- [x] Cost/legal/data-rights risks recorded, including FinBERT weight and VectorBT Commons Clause.
- [ ] Third-party full CVE/penetration, signed-artifact provenance, resource benchmarking, sandbox E2E and license counsel clearance — **not represented as completed**.
- [x] Zero-dependency isolated equal-weight research contract implemented and test added; **no external library imported**.
- [ ] Actual import and integration tests of any external upstream library — **not yet authorized/needed for this audit**.

## Phase-1 acceptance

Accept the *intake-audit deliverable* when this report, 10-item manifest, automated reject-on-unsafe-dependency guard, and GitHub CI pass on a review branch, then merge safely. This is **not** full Atlas trading-system acceptance and never qualifies as 100% end-to-end paper-trading readiness.
