# Atlas experiment reporting and capture repair — 4 November 2026

Approved continuation: take useful experiment/reporting patterns from Breaking Money, finish safe currently executable Atlas work, preserve $0 and paper-only constraints. This implementation is original Atlas code; it does not run Claude, subscribe to an API, replace the market-data source or copy upstream execution assumptions.

## Delivered
- Each existing seven-account read response now carries a derived forward experiment report: active deterministic decision engine, read-only current risk settings, recorded policy versions, fees, closed trades, win/loss/breakeven counts, profit factor and closed-P/L drawdown.
- Entry and exit fills are paired by stock, opposite side and exact quantity. Both long and short trades are supported. Missing, truncated or unreconciled history suppresses aggregate statistics; older incomplete fill detail cannot take down basic account balances.
- Equity and unrealized P/L remain null with any unpriced open position. No benchmark, total-equity drawdown, Sharpe ratio or profit curve is invented. Current cost assumptions remain explicitly modeled 10-bps fees and 5-bps adverse price adjustment, not a broker/tax bill; closed P/L is not charged again by the report.
- The Paper Trading page shows open holdings, daily IST fill/fee/realized totals, closed-trade journal, JSON audit download and CSV export. Export is unavailable with no matched closed trades. Recorded policy changes are visible and explicitly prevent describing mixed-policy results as a fixed-policy challenge.
- Mobile owner report/navigation layout is constrained to the viewport.
- Completed-minute capture runs before legacy feed/ledger work and uses its actual request time. Timed paper risk exits retain priority. Future capture failures write a bounded safe diagnostic to existing D1 events, in addition to console logging. Missing past live observations are never reconstructed.

## Verification
- Worker: 141/141 tests passed, including four new reporting tests for open valuation, costs, long/short pairing, drawdown and incomplete history.
- Frontend: 206/206 tests passed; fixed a stale IPO navigation assertion to include the already-existing Home page. TypeScript/Vite production build passed.
- Isolated real-browser app QA used actual saved account records behind a test-only mocked read gateway: the two holdings and ₹15.80 fees displayed, JSON audit retained null equity and zero closed trades, CSV remained disabled, no runtime errors, and 390px layout passed. No test route was deployed.
- No ledger mutation, D1 migration, broker order or paid AI invocation is introduced.

## Acceptance still external
Actual recovery of EQUITASBNK 102 and IDEA 812 requires genuine later provider books during an open market session. Last observed cash ₹84,189.70 and realized P/L ₹0 remain unchanged by this reporting release. Live gaps at 14:41 and 15:14 on 4 Nov remain historical failures, despite complete after-close history.

Detailed Cloudflare observability access and Free CPU headroom remain unverified; new safe capture events improve future diagnosis without increasing credential scope. X2, X3 and Xtreme lack required GIFT/news/RVOL-sector context; ETF rules lack adjustment certification; VWAP has retrospective signals but no qualified prospective driver. They remain unarmed. Formal end-to-end certification remains 0/100 until the existing complete-market-session acceptance passes.
