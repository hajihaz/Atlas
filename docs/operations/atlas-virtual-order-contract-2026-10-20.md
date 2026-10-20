# Atlas virtual-order lifecycle — isolated operational contract

Date: 20 October 2026. **No broker connection, no actual market execution.**

The pure module `scripts/virtual_order_lifecycle.mjs` builds an explicitly labeled
paper-only *order intent*. No scheduled runner, live API or UI route calls this
module yet. A paper intent **is not a position, trading signal, fill or P/L**.

## Implemented tested transitions

- `CREATED → PENDING` on explicit submit.
- `PENDING → PARTIALLY_FILLED → FILLED` on verified, independently
  supplied source observations, including modeled price, quantity and fee.
- `PENDING → REJECTED` if no modeled fill occurred.
- `PENDING/PARTIALLY_FILLED → CANCELLED/EXPIRED` with retained modeled
  partial fills, but no further fills afterward.
- Identical `fillId` with exact evidence is idempotent; altered evidence
  with the same ID raises an error, and terminal orders cannot add fills.
- The BUY path refuses spending above explicitly supplied **virtual** available
  cash including fees. SELL is bounded by explicitly supplied virtual holdings.
- Any missing, future, stale, pre-bar, negative or excessive observation
  rejects a fill. Source observations may NOT be recreated by interpolation.
- Snapshot explicitly asserts `realOrdersEnabled:false` and
  `actualCapitalINR:0`; it contains no broker secret or order endpoint.

## Integration contract for the scheduled-paper runner

1. Keep the existing `SCHEDULED_VIRTUAL_PAPER` ledger as the sole currently
   deployed cloud report. Treat this module as a separately audited order
   lifecycle until compatibility and accounting consistency are proven.
2. Future integration may create intents only from a verified completed source
   candle and an authorized paper strategy signal, never from article sentiment
   or historic hindsight.
3. Use source timestamps and actual modeled quotes to advance intent states.
   Never synthesize a profitable fill merely to populate the dashboard.
4. Source `fillId` must be persisted deterministically and protected from
   concurrent/cold-restart replays. Cancelled or rejected intents must stay
   terminal. A partial fill must update virtual cash, exposure and remaining
   inventory exactly once.
5. Equities require whole-share constraints; this module currently accepts only
   the existing public INR crypto symbols. NSE instrument data and approved
   market feeds remain an external owner gate.
6. Cross-check virtual balances, exact modeled fees and all order transitions
   against the established `assertNextCloudSnapshot` guard before turning this
   contract on inside the scheduled runner.

## Scope boundary and accept/reject evidence

Unit tests use **explicitly synthetic inputs** and demonstrate states only;
they do NOT claim any historical or forward simulated trades have occurred.
Do not count paper intent tests as real strategy wins or completed forward
paper execution. No new package installs, charges or market authentication.
Astra owns advanced signals and price research in a separate PR.
