# Atlas read-only daybook / ChatGPT checkpoint parity

Atlas's cloud-paper-daybook.json is built deterministically from the
same checked-in cloud-paper.json during each Vite deployment.
It is financial research, not a broker statement or an order route.

After real scheduled checkpoints begin recording their retained history,
the daily daybook exposes checkpointEvidence with:

- The number of actual runner attempts in the retained 24-entry window
- Accepted-source running checks and safely rejected/degraded checks
- The number of NEW hypothetical fills, not cumulative wins
- Uncaptured earlier run count, explicitly not reconstructed
- The most recent five source checks, reason codes and timestamps

This lets ChatGPT and Atlas consume one read-only source for both
virtual strategy results and runner reliability. A successful GitHub
job does not mean market-source acceptance or that a trade occurred.

DO NOT BACKFILL LEGACY CHECKPOINTS. An earlier report with runCount 2
and no recentCheckpoints correctly produces zero evidence records
and two older uncaptured attempts, NOT imaginary successes or P/L.

Evidence is validated for bounded window, safe source identifiers,
monotonic IDs, actual zero capital and latest-run chronology.
Malformed inputs fail closed.

CI verifies deterministic JSON, refusal of forged evidence, no
historic backfill and intact date-wise virtual P/L reporting.

The new daybook requires a future FREE Vercel build. GitHub main and
production can differ while daily quotas are exhausted. Do not claim
production release acceptance without exact deployed SHA checks.

No Astra research edits, paid data, broker calls or real-money orders.
