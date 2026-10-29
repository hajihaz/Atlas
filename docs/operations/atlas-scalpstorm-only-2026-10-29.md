# Atlas: ScalpStorm X only — owner instruction, 29 October 2026

**Active catalog:** exactly one strategy, `scalpstorm_x_0940` (ScalpStorm X). Its 09:40 entry, 15:15 owner paper exit, ten ₹10,000 virtual allocations and ₹1,00,000 total capital are explicitly paper-only. No fabricated NSE P/L.

**Deactivated:** SMA 9/21, EMA 12/26, RSI 14, 20-Bar Breakout, SPS Swing Pullback, and Day Trader ORB. There is no selectable legacy comparison in Strategy/Research/ScalpStorm pages. Orders no longer expose Start 5 forward paper trials. A previously persisted local browser trial cannot resume: its React scheduler is disabled. The owner ScalpStorm paper engine is unaffected.

**Retired external output:** `/api/strategy-lab` exposes only ScalpStorm; `/api/cloud-paper` returns HTTP 410; build artifacts omit the old five-portfolio raw JSON, its daybook and a synthetic DayTrader file. Vite dev and preview deny the same three static JSON routes.

**Preserved:** historical research source code, tests, report validators and old source snapshots remain in Git solely as an immutable audit trail; they are not live selectable strategies. No data or owner ledger was erased, no real broker orders or permissions were added, and no NSE history was invented. The manual-only archival workflow does not run on a schedule.

Deployment acceptance requires the live `/api/strategy-lab` return exactly one strategy and all retired public endpoints/assets return retired/unavailable, with healthy frontend navigation and no legacy trial interface.

**Scheduled execution:** `.github/workflows/atlas-paper-scheduled.yml` is retired to a manual no-op: no cron and no five-strategy paper runner invocation. Archived source calculations are kept for reproducible audit, not operational trading.
