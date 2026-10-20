# Atlas bounded checkpoint evidence — actual future runs only

**Operational HAOR, 20 October 2026.**

## Why this exists

Before this change, `cloud-paper.json` contained only the latest run
count and market-source status. A successful GitHub Actions job could have
saved a DEGRADED market observation; its green check mark did not prove
that the market source was valid or that simulated trades happened.
Reconstructing earlier attempts from the counter would fabricate evidence.

## New non-backfilled evidence window

Only **future actual runner executions** may append to
`recentCheckpoints` in the same versioned public report.
An older report with `runCount:2` and no history starts its audit trail
with **run 3**, not invented data for runs 1 or 2.

The bounded list retains only the newest **24 real attempts**. Each
record contains exactly:

- Incrementing run identifier and actual UTC checkpoint timestamp
- Model-only runner status and explicit source classification/code
- Last publicly observed completed candle and its true age
- Accepted/rejected public-source indication
- Number of **newly** modeled fills (not cumulative trades)
- Currently halted virtual accounts and skipped market intervals
- Literal `realOrdersEnabled:false` and `actualCapitalINR:0`

No article summaries, private account data, provider API keys, order
credentials, or simulated profits are stored in this evidence list.
The list is evidence of **runner activity** only, not financial
performance or guaranteed absence of all other problems.

## Fail-closed controls

The whole record is written together with the existing virtual account
ledger through the same GitHub commit, after calculating the new
checkpoint and running existing account/fill protections.
Checkpoint-history integrity rejects:

- Deleting an earlier captured run or altering its source result
- Duplicating or skipping an identifier within captured history
- Running the evidence clock backward
- Faking a model fill count or calling an invalid source successful
- Appending more than one future entry per genuine run
- Replacing all earlier evidence when the 24-entry buffer rolls
- Turning real capital or broker-order execution on

The oldest item falls out naturally when more than 24 new runs occur;
no unlimited log growth or paid database is required.

## User interface and acceptance

Atlas's cloud-paper panel shows counts of recorded attempts,
source-accepted/source-rejected results and new hypothetical fills.
The latest five recorded checks show local IST time, source reason and
new fill count; older GitHub runs not represented in the 24-window
are *not reconstructed*.

GitHub CI runs synthetic tests for bounded retention, first activation,
replays, history edits, forged source metadata, false orders, and a
source-accepted run that produced **zero** fills. Test fixtures do not
represent actual forward market trades.

The owner still needs real scheduled-run evidence and a complete
production deployment before unattended operation is certified.
Vercel free-tier quota may block deployment; do not upgrade or charge.
The separate Astra quantitative branch remains untouched.

**₹0 additional spending; no real orders; no broker/API activation.**
