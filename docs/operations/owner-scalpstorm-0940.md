# Owner ScalpStorm X paper desk

The active Atlas desk has one owner strategy. The five comparison strategies and their journals are retained as archived research; they are not mounted by the active application. The old public demo fixture is in the test fixtures directory.

## Fixed protocol

- At 09:30 IST, retain a genuine Nifty 50 observation and previous-session close. Cross-check the provider reference against the private daily source history.
- A change above +0.2% selects bullish BUY; the inclusive range −0.2% to +0.2% selects moderate BUY; below −0.2% selects bearish paper SELL.
- Rank eligible regular-lot NSE cash equities by cumulative share volume from a complete source observation during 09:39, completed before 09:40. This is a current eligible universe, not a fixed Nifty 50 constituent list.
- Decide at 09:40; enter only on subsequent fresh trades with acceptable visible bid/ask liquidity in that minute.
- One ₹100,000 virtual account; ten allocations of at most ₹10,000 including modeled entry costs, whole shares, no leverage. Partial slot allocations and residual cash are explicit.
- Target exits start at 15:15. Missing quotes or insufficient modeled liquidity leave positions unresolved. No invented liquidation or reset is permitted. Unresolved positions block new entries.
- Paper shorts reserve a full cash slot and lock sale proceeds until cover.
- Costs are illustrative: 0.10% fees and 0.05% slippage per side. They are not a verified broker/tax schedule.
- The second SGX/GIFT Nifty strategy is deferred.

## Runtime and privacy

The read-only collector has only market-data GET authority. The separate paper worker consumes private files and has no token or network/order authority. The SQLite journal uses integer paise accounting, immutable event hashes, causal timestamps and independent cash/fee replay verification.

The source, paper, history and IPO workers are native owner-Mac services. The owner desk is http://127.0.0.1:4310/#nse-paper. Its report routes require loopback origin and fixed private files. Public previews expose the strategy protocol and IPO research, without the private account, source candles or credentials.

The paper worker retains source receipts before processing open-market observations. Ranking snapshots are stored once by content hash; receipts retain the exact input hash, quotes and ranking reference. This retention begins with the updated worker: it does not reconstruct missing source books from an earlier session.

Do not edit the frozen engine or recreate its account after initialization. An engine migration must preserve and audit the old account and events. Presentation-only aggregation lives in a separate module so journal identity is unchanged.

## Historical interpretation

Daily Nifty source history supports 1M, 1Y, 5Y and 10Y price views. Those views are separate from strategy performance.

The October research replay uses actual source candles but the current stock universe. Each day ranks only stocks with actual pre-entry candles; unknown stocks and absent minutes are disclosed. This is neither a point-in-time market-wide backtest nor a qualified strategy.

The replay excludes the 09:39 candle from ranking, decides at 09:40, models the next 09:41 open, and starts exit attempts at the 15:15 open. Capacity is 1% of the previous completed minute's volume. No historical order book is invented. Unresolved positions can carry into subsequent research days and prevent new entries.

Month/year account changes include every recorded day, including incomplete-session marks and all costs. They are not realized-only or full-calendar returns. Missing longer-period intraday/universe evidence produces unavailable results, not extrapolated numbers.

## IPO updates and release

The IPO source refreshes in the background. The browser checks automatically and retains the previous dated feed, counts and selected issuer when a request fails. Mainboard and SME source coverage, unofficial GMP and published outcomes retain separate provenance.

Atlas expected returns and numerical confidence are unavailable without a calibrated model and a forecast locked before listing. Published GMP-implied premiums are not Atlas forecasts.

The IPO-only publisher defaults to no retired comparison checkpoints and requires an exact verified application commit before installation. The data branch has bounded public artifacts and disables Vercel builds.

Production remains gated on actual required hosted CI at the exact release commit. Local tests and preview checks do not substitute for those checks. Do not upgrade billing, weaken protection or forge CI status to pass the gate.
