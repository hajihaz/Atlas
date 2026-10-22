# Methodology and limits

## Timing, fills and risk

Candle time is its start. A candle becomes eligible only after its interval
ends and its declared availableAt time passes. Strategies receive an immutable
closed prefix. A delayed prefix cannot fill at an elapsed open.

Signals execute at the next eligible bar open. Stops use existing stop levels
and conservative gap handling. Stop timestamps identify the containing minute,
not an observed tick. Unfilled stops remain pending. Terminal positions stay
marked; no retrospective final sale is invented.

Prices use adverse tick-rounded slippage. Money movements use integer paise;
quantities use integer lots. All same-bar fills share a capacity based on the
previous completed, available bar's volume. Future fill-bar volume is excluded.
This model does not prove executable liquidity.

Default fees are illustrative 10 bps per side and slippage is 5 bps. Fixed/
minimum fees and separate sell fees are configurable. These are not broker
invoices or complete tax schedules. Generic strategies are long-only, without
borrowing.

Default stop is 2%, allocation/exposure limit is 1x and drawdown halt is 10%.
A close-observed drawdown or exposure breach latches a halt and requests exit
at the next eligible open. Gaps and scarce liquidity can exceed thresholds.
Drawdown is measured on the close-marked series.

## Strategy definitions

Defaults agree with existing frontend/lib/research-engine.js after its warmup:

| ID | Rule |
| --- | --- |
| sma_9_21 | SMA9 crosses SMA21; reverse crossing exits |
| ema_12_26 | SMA-seeded EMA12 crosses EMA26; reverse crossing exits |
| rsi_14 | Rolling RSI recovers above 30; exit at RSI at least 60 |
| breakout_20 | Close above prior 20 closes; exit below prior 10 closes |
| sps_pullback | Rising SMA20 and recovery over SMA5; exit under SMA20 |

RSI retains Atlas v1's simple rolling gains/losses, not Wilder smoothing.
Advanced strategies have individual warmups; the existing engine has a shared
initial hold. Parity is checked after both have warmed up.

## Evaluation and uncertainty

Walk-forward fitting uses a rolling training window and at least one embargo
bar. Only training return minus drawdown selects parameters. Test outcomes do
not affect selection. Already available embargo prices may warm up indicators.
Test windows are disjoint. Each fold resets cash: mean test return is not a
continuously compounded portfolio.

All parameter/cost trials remain inspectable; selection bias is disclosed.
Buy-and-hold buys once and disables strategy stops/drawdown liquidation.
Equal-weight portfolios allocate once across the complete as-of universe and
retain rounding remainder. Today's surviving stocks cannot establish historical
membership. Then-listed instruments that later delisted remain eligible as-of.

Win-rate uncertainty uses a 95% Wilson interval. A seeded circular moving-block
bootstrap describes mean bar returns while allowing local serial dependence.
Neither proves stationarity or predictive performance. Zero trades give null
win rate; small samples and multiple testing remain limitations.

Restart evaluation deterministically replays immutable input. It is not an
incremental production ledger or order-resubmission system. Hashes bind bytes
and detect changes; they do not authenticate provider truth or licenses.

## ScalpStorm

- ₹100,000 virtual capital, ten nominal ₹10,000 slots.
- Complete eligible universe known before 09:15.
- At 09:30, rank cumulative available share volume of 09:15–09:29 candles.
- Stable-ID tie breaking; no future full-day volume.
- Every candidate needs the opening window, including unselected stocks.
- Selected stocks need contiguous minute coverage through 15:00.
- Predeclared entry at 09:40 open and remaining exit at 15:00 open.
- Preserve the existing Atlas research assumption: NIFTY opening move greater
  than +0.15% gives a long scenario, less than −0.15% gives a short scenario,
  otherwise no trade. This is not validated alpha or a Groww-exact rule.
- Short scenarios require explicit enablement and eligibility declarations.
  They use hypothetical full collateral, not broker margin approval.
- Whole shares, fees, liquidity, unused cash, partial stops, P/L, drawdown and
  recurring-stock counts are reported.
- Unliquidated positions make day P/L null. Cumulative P/L stays null from the
  first incomplete day; later complete days cannot hide that gap.
- Capital resets daily and does not compound profits.

There are 20 scheduled cash sessions in the requested window; 2 October is
excluded. Calendar verification is distinct from backtest/data verification.

Raw equity histories require corporate-action review through the last close.
Actions inside a raw-history window are rejected pending a separately audited
adjustment; prices are not rewritten with future-known factors. Expected times
bound declared coverage. Same-day NSE gaps and all crypto gaps are rejected.
Missing whole sessions outside the declared grid still need an authoritative
calendar/data audit. Caller-supplied provenance is not independent verification.
