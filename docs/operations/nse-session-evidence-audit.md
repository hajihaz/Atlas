# NSE paper-session evidence audit (read-only)

**Scope:** Interpret *existing* cloud-paper reporting evidence for a particular calendar day. This tool does not fetch credentials, call any API, create virtual orders, reconcile the ledger, backfill snapshots, or count completed forward sessions.

The authoritative market calendar must be verified separately from the exchange's official holiday publication: https://www.nseindia.com/resources/exchange-communication-holidays. The existing `frontend/api/market-inr.js` calendar lists **2026-11-10** as a full-day NSE holiday (Diwali–Balipratipada), and **2026-11-08** is a *special Muhurat* trading day requiring separate timing/evidence certification.

## Offline use

Obtain authorized **read-only** JSON responses for three existing endpoints, then pass only their relevant data to the audit function without disclosing tokens. The CLI consumes a JSON object on **stdin**, never accesses the network, and prints a small derived summary rather than the source payload.

```bash
node scripts/audit_nse_session.mjs 2026-11-10 < /path/to/local-authorized-evidence.json
```

Input object shape (substitute actual authorized values; examples are synthetic):

```json
{
  "cohort": {"source_date":"2026-11-10","status":"INCOMPLETE","expected":10,"archived":0},
  "daybook": {"session":"2026-11-10","entry_snapshot_count":0,
    "keyed_snapshot_count":0,"complete_0940_snapshot":false,"strategy_orders":[]},
  "accounts": {"paperOnly":true,"realOrdersEnabled":false,
    "accounts":[{"positionCount":0,"pendingCount":0}]}
}
```

The explicit `day` argument must equal both evidence dates. The output classifies holidays, weekends, non-authoritative calendar years, or ordinary days. A complete 10/10 *daily archive* does not imply an adequate 09:40 snapshot, licensed data, verified market fills, a certified strategy, or a completed 15-session trial. `forwardSessionCredited` is therefore **always false**. Any date after the calendar's verified coverage must remain unverified, never silently counted.

**Operational cautions:** A raw `INCOMPLETE` cohort on a documented full-day holiday should not be called a failed normal session. A scheduled `EXIT` maintenance phase on a holiday does not establish that an actual market order occurred. Conversely, a nonregular-day strategy-order record, or any open/pending virtual exposure, is flagged for human review. **Do not** automatically backfill a holiday, arm a strategy, or mutate a ledger in response to this report.

## Verification

```bash
node --test scripts/tests/nse-session-evidence.test.mjs
node --test frontend/tests/market-inr.test.mjs
```

Both commands are offline, require only Node, and are included in the Atlas public-UI CI. The tests include November 9 normal-day archive completeness, November 10 holiday exclusion, November 8 special-session hold, zero-keyed coverage, malformed receipts, exposure alarms and strict paper-only protections.
