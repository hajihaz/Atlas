# Atlas × Day Trader Skill — NSE offline research pilot

**Status:** Isolated research branch only. Not deployed, and not connected to a real broker or market feed. Every session price and simulated P/L shown by this module is fabricated.

## Scope and provenance

Reference: https://github.com/Jakeschincariol/day-trader-skill
MIT-licensed upstream pinned at 3d0f4ef6986f4984b7c6bd46f7ff4f87744c3abd.

The original pinned lab passed 315 tests and completed 10,000 TSLA historical-fixture replays. This Atlas branch **independently implements** selected research concepts, without copying the upstream broker or live-feed code. The TSLA fixture is not used by this Atlas adapter.

- src/atlas/research/daytrader_nse.py — pure-Python NSE cash session and 5-minute candle validation, long-only opening-range research, Decimal position sizing, conservative stop/target handling and reproducible Monte Carlo.
- src/atlas/research/daytrader_nse_synthetic.py — explicitly invented candles.
- scripts/daytrader_nse_pilot.py — produces JSON and standalone HTML local research reports.
- frontend/src/components/DayTraderNSEPanel.tsx and validator — synthetic research card displayed inside Atlas ScalpStorm research; no live execution.
- tests/unit/test_daytrader_nse_pilot.py and frontend/tests/daytrader-nse-demo.test.mjs — positive and adversarial QA.

No production API, broker, payment logic, trading credentials, live financial data, deployment workflow or existing production strategy is modified.

## NSE cash timing and synthetic model

The official NSE normal equity trading session is 09:15–15:30 IST:
https://www.nseindia.com/static/market-data/market-timings

The pilot demands 75 consecutive five-minute candles from 09:15 to 15:25, with a known-complete explicit calendar and timezone-aware observation timestamps. Its 20-session demonstration uses an intentionally synthetic calendar for 18 September–16 October 2026. This is **not** proof of 20 authentic NSE sessions, specials, full stock coverage or legal historical data rights.

- Opening range: three fully closed candles, 09:15, 09:20, 09:25.
- Breakout decision: 09:30–09:35 closed candle, observed before entry.
- Earliest hypothetical fill: 09:40 bar OPEN, not the decision bar.
- One invented stock / one long-only trade per qualifying day; not the requested real top-10 NSE scan.
- Illustrative capital limit, fractional risk budget, cost basis points, stop and reward multiple. These are not broker-certified rates, STT or legal charges.
- If both stop and target are crossed in the same 5-minute candle, the model assumes the stop occurred first; uncertainty is not hidden.
- The simulated position closes before or at session end. No real/paper broker interface is imported or invoked.

Monte Carlo resamples 20 fabricated outcomes 10,000 times with a fixed seed. These are invented empirical outcomes and **not calibrated probabilities of future NSE gains**.

## Files / reproducibility

Owner-local generated artifacts (not real-market returns):
- artifacts/daytrader-nse-pilot/report.json
- artifacts/daytrader-nse-pilot/dashboard.html

Packaged synthetic demo snapshot for Atlas frontend:
- frontend/public/daytrader-nse-demo.json

The UI validates synthetic origin, zero orders, session count, rupee totals and integrity fields before presenting anything. The UI contains no order or live-trade action. It is visible only in the ScalpStorm/Research branch, not yet published to production.

Commands from this Atlas checkout:
- PYTHONPATH=src PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.unit.test_daytrader_nse_pilot -v
- PYTHONPATH=src PYTHONDONTWRITEBYTECODE=1 python3 scripts/daytrader_nse_pilot.py
- node --test frontend/tests/daytrader-nse-demo.test.mjs frontend/tests/scalpstorm-allocation-ui.test.mjs

No new Python dependencies or network calls are required.

## Verified and unverified

Locally verified on 26 October 2026: **16/16** Day Trader Python tests using Python 3.11, **206/206** frontend Node tests, TypeScript checking, and the Vite production build. Two unrelated IPO tests previously failed because their expectations depended on the wall-clock date; the suite now injects a historical evaluation instant into a backward-compatible `recommendation(..., now)` argument. Production behavior still defaults to the real clock and retains the existing stale-source and closed-offer checks. GitHub hosted CI remains red without available job-step logs, and therefore the PR is not release-certified.

Not verified: authentic NSE 1-minute/5-minute data or rights; official 2026 special sessions; point-in-time full stock universe; real exchange fees/taxes/lot sizes/corporate actions; real portfolio P/L or win probabilities; Atlas paper engine integration; release testing for trading; merge, preview or production deployment.

**Never use this module's synthetic P/L as a claim of actual NSE performance or investment advice.**
