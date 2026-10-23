# NSE data and ScalpStorm certification

**Authentic sessions certified: 0/20. Historical financial results: null.**

This isolated research package covers 18 September–16 October 2026. It adds
source receipts, local ingestion, a certification gate, an independent opening
volume ranking, and a gated bridge to Atlas's existing offline replay. It has no
broker authentication, orders, scheduler, cloud-paper writes, UI or deployment.

The strongest dataset finding is an immutable public archive listing containing
stock ZIP names for five requested sessions: 18, 21, 22, 23 and 24 September.
Archive names establish candidate availability only. Those market files were
not downloaded or used: upstream permission, minute contents, historical
eligibility, timezone/interval conventions and publication timing remain
unverified. The other fifteen requested stock archive names are absent from
that pinned listing. See [sources.md](sources.md) and
[source-findings-pinned.json](source-findings-pinned.json).

Hosted GitHub CI is blocked before runner startup by an account billing/limit
condition. Local verification passed; see `ci-startup-evidence.json`. No spending
or account settings were changed.

The acceptance exports are inspectable:

- [results/report.json](results/report.json): all twenty dates, blockers and null financial fields.
- [results/daily.csv](results/daily.csv): daily realized/unrealized P&L, fees, returns and drawdown columns.
- [results/monthly.csv](results/monthly.csv): September's nine and October's eleven sessions.
- [results/trades.csv](results/trades.csv): explicit `UNVERIFIED` rows; no invented trades.
- [acceptance.md](acceptance.md): verification, boundaries and smallest remaining access requirements.

## Run offline

Node 24+ and Python 3.11+; no additional packages, purchases or network are
required for the new tests or empty-evidence report. Run from the repository root:

```bash
node --test tests/nse-certification/*.test.mjs
python3 -m unittest discover -s tests/nse-certification -p 'test_*.py' -v
node --test tests/research/*.test.mjs
node research/nse-certification/cli.mjs replay \
  --root . \
  --manifest docs/research/nse-certification/empty-bundle.json \
  --out /tmp/atlas-nse-new-output
```

The final command intentionally exits **3**, meaning unverified evidence. It
still writes the four null-preserving exports. Exit **2** means invalid input;
exit **0** requires the requested certification/replay to pass. Output directories
must be new. Missing inputs never generate fixtures or financial results.

## Supply an authorized private bundle

Use [contracts.md](contracts.md) and [contracts.schema.json](contracts.schema.json).
The manifest hashes every exact source file. Supported candle inputs are Upstox
V3 JSON, FYERS V3 JSON, the existing Atlas minute CSV, and explicitly typed
normalized JSON. Every full candidate stock needs 375 actual minute rows for
each session; the NIFTY direction input needs the fifteen opening rows.
Missing intervals remain gaps, including for illiquid instruments. An omitted
row never becomes an invented zero-volume candle.

```bash
node research/nse-certification/cli.mjs audit \
  --root /private/authorized/nse \
  --manifest manifest.json \
  --review /private/authorized/independent-review.json \
  --review-sha256 REPLACE_WITH_INDEPENDENTLY_CHECKED_SHA256 \
  --out /private/authorized/new-audit
```

An independent review must cover the exact manifest, all sources and each
claimed session. The reviewer must verify source authenticity, dated full
membership, original prices/share volumes, actions, recorded availability and
the applicable permissions. A file hash proves bytes; it does not prove a legal
grant, a historical timestamp or a complete exchange universe. The external
review hash is an explicit trust boundary, not an automated legal opinion or
cryptographic proof of the reviewer's identity. Caller booleans cannot replace it.
The source issuer/collector is the bundle producer; review is independent of
that producer. No separate owner approval ceremony is added by this tooling.

`replay` uses the same arguments. It performs no financial simulation until
all twenty source sessions pass. Any incomplete execution model keeps affected
daily and aggregate financial results null. Synthetic fixtures always certify
zero real sessions, even when their engineering checks pass.

## Research capture and archive inspection

`research/nse-certification/capture.py` performs bounded public GETs to an
allowlist, with no cookies or credentials, no retries to bypass a block, a size
limit and one-second pacing. Plans contain documents/reference metadata, not
broker price endpoints. HTTP 401/403/404 are retained as evidence; HTTP 429 stops
the batch. Original snapshots and capture journals remain private outside Git;
NSE website APIs and market-price archive downloads are explicitly blocked.
only receipts, hashes and findings are included here. Initial and follow-up
capture failures are documented in the acceptance report.

Re-fetching a mutable document may produce different bytes. The retained
snapshots permit byte verification; the public receipts identify exactly what
was inspected. To reproduce the source findings from those private snapshots:

```bash
python3 research/nse-certification/audit_sources.py \
  --private-dir .ai/raw/nse-certification/snapshots \
  --receipts docs/research/nse-certification/source-receipts.json \
  --receipts docs/research/nse-certification/followup-receipts.json \
  --receipts docs/research/nse-certification/pinned-receipts.json \
  --output /tmp/atlas-nse-new-source-findings.json
```

For an already-authorized local OLO-format archive, `inspect_archive.py
--archive FILE --output NEW_FILE` checks exact ZIP/member hashes, CRC, safe
members, expansion limits, schema, dates and numeric OHLCV. It preserves `:59`
timestamps and leaves timezone/interval semantics unverified. It never extracts,
adjusts, interpolates or certifies the file automatically.

Future-provider planning is documented in [future-data.md](future-data.md).
