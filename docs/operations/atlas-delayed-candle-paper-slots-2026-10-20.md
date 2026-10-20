# Atlas simulated BTC/INR: delayed public-candle research policy

**Date:** 2026-10-20. **Virtual-only, ₹0 new spend.**

## Evidence and rationale
A genuine GitHub read-only source probe at 2026-10-20 05:17:25 UTC
found 167 closed 1-hour INR candles, 83 valid 2-hour candles, the most
recent public provider bar completed **04:00 UTC**, and a fresh,
timestamped CoinDCX ticker at 05:17:25 UTC.
This is an authentic 77-minute public-candle delay, not proof of missing
trades. The old 45-minute bar gate rejected the observation while
the ticker itself passed its 90-second freshness gate.

## Explicit model-only policy
The bot may evaluate source-validated forward **hypothetical** signals
against the latest completed public 2-hour candle up to **90 minutes old**,
**only using an independent current public quote** for the hypothetical
execution model. This is NOT live tick trading or a claim to have
entered near the historic candle close.

- Public quote must still be no more than **90 seconds old** (and no
  more than 5 seconds in the future), strictly after the completed bar.
- Last **55 consecutive** authenticated-by-source public completed
  2-hour candles remain mandatory; never synthesize a missing candle.
- There must be exactly **one** newly consecutive 2-hour source bar
  since the prior saved checkpoint for a trade to be allowed.
  Same-bar repeat or a gap can NEVER create a backfilled entry.
- Current-code fee/slippage models and 5% virtual loss veto remain.
  Independent synthetic fill-order/cash/P&L audits are still mandatory.
- The quote/candle delay, actual run timestamp, failure code and
  `DELAYED_PAPER_ONLY` class must be visible in the public ledger/UI.
- Existing previous ledger states, real capital block and source
  histories cannot be overwritten by a feature branch.

The 90-minute mode **does not fit second-by-second trading**,
intraday scalp execution or high-frequency performance certification.
Outcomes must be interpreted as *delayed-source virtual research*.

## Scheduler windows
The old GitHub Actions schedule `17 */2 * * *` (UTC) meant 17
minutes after even-hour close. Actual provider history was sometimes
too delayed at that time. The new intended best-effort cron:

`5,17 1-23/2 * * *`

This makes **two attempts after each even-hour close**, around
65 and 77 minutes later, which are both inside the model-only 90-minute
window **if** the provider has already published the completed bar.
For IST it corresponds to even local clock hours at :35 and :47.

GitHub can postpone or omit runs; no guaranteed completion time,
tick-by-tick engine or monthly runtime guarantee is claimed.
The second attempt on the same bar may record another no-trade
checkpoint but cannot execute the same modeled signal twice.
No retroactive fills if the provider remains too late.

## Acceptance gate
Require GitHub source-only probe + all JS/Python CI green; ensure
preview or production deploy only through available free capacity.
**Do not claim first genuine delayed-policy trades occurred** before
a real scheduled run, accepted observation and persisted fill exist.

Historical simulation fixtures testing the 77/91-minute boundaries
must be explicitly labeled as synthetic tests, not market returns.
