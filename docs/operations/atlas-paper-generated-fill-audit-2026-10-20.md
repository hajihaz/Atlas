# Atlas operational HAOR — automated virtual-fill accounting veto

## Scope
- New fail-closed **independent audit of model-generated virtual fills** in the
  existing GitHub Actions BTC/INR scheduled runner. No broker, API key, real
  capital, paid service, exchange order or fabricated forward event.
- New modeled BUY/SELL events are reconstructed as virtual
  `CREATED → PENDING → FILLED` intents, using the actual validated
  quote timestamp, completed candle and persisted event fields.
- The separately tested source-constrained accounting bridge calculates
  expected virtual cash, token quantity, cost basis, fees, realized P/L,
  equity, drawdown and trade counts.
- If the independently calculated amounts diverge from the scheduled engine,
  the entire checkpoint is classified as `SIMULATION_VALIDATION_FAILED`
  and no modeled fill may be committed.
- The resulting read-only ledger still passes
  `assertNextCloudSnapshot` before a GitHub commit; same-bar replays,
  missed candles and corrupted history cannot create model trades.
- Order IDs derived from source candle and strategy are simulated trace
  identifiers. They are not exchange/broker order IDs.

## Financial arithmetic
- BUY uses the same publicly recorded two-decimal modeled price and modeled
  fee that it writes to the virtual cash ledger. Quantity is floored to 8
  decimal token units, with an extra unit reduction if fee rounding would
  otherwise overdraw virtual capital.
- SELL uses the same two-decimal modeled price and fee for cash proceeds and
  realized P/L calculations.
- No new signal or entry frequency is introduced. The established
  SMA/EMA/RSI/breakout/SPS signal engine, 5% virtual risk stop and
  sourceEligible 55-bar/quote-age/45-minute gate are unchanged.
- Existing saved events and investments are neither modified nor replayed.
  Any change to calculation rules applies only to **future hypothetical
  observations**, if eligible source data arrives.

## Verification before a merge
- CI runs the independent ledger/accounting audit and existing virtual
  restart, stale source, persistence, rejection and market-feed tests.
- Synthetic fixtures show BUY, SELL, fee reconciliation, cash
  over/understatement, tampering, same-bar replay and provider failure.
  Synthetic test trades are **not reported as real forward runs**.
- Keep Astra research work entirely in its own protected modules.
- No modifications to `frontend/public/cloud-paper.json` in this PR.
- Vercel production deployment may be blocked by the free daily 100-build
  API limit. Report it rather than bypassing quota or upgrading.

## Current external readiness gate
Do not certify always-on trading until enough **genuine scheduled runs**
have published PASS source metadata, a forward virtual trade occurs under
actual observed quotes, and multiple retries/restarts demonstrate no lost
or duplicated synthetic fills.
