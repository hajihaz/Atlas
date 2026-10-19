# Atlas — source-backed daily paper-trading report

## Goal (HAOR slice)
Supply understandable, date-clickable virtual trading breakdown and a JSON export suitable for ChatGPT without inventing data or enabling real-money orders.

## One source of truth
GitHub's committed `frontend/public/cloud-paper.json` is the *only* capital/trade source. The frontend Vite build runs `scripts/build_cloud_paper_daybook.mjs` and generates `/cloud-paper-daybook.json` from that same exact revision. The Atlas UI runs the **same** pure `buildCloudPaperSummary` function against its selected source report. Neither report makes exchange trades or queries additional providers.

- No new npm/runtime packages, paid APIs, database, market subscriptions or secrets.
- Status `AWAITING_FIRST_RUN` remains an empty daybook; `AWAITING_VALID_SOURCE` remains empty.
- Status `RUNNING` requires previously initialized strategies; five distinct virtual research accounts are **independent**, each starting with ₹1 lakh. Do not present their combined capital as one deployable account.
- Real capital is always 0, real orders disabled, modeled trades marked hypothetical.
- Equity, realized exit P/L, fees and modeled event count are read from committed data; the first run should display 0 modeled trades and 0 profit.

## IST daily accounting
- Day keys use `Asia/Kolkata` in `YYYY-MM-DD` format, based on the **market quote observation** for a virtual fill or persisted equity snapshot.
- A date has *checkpoints* (available equity marks), modeled buys, modeled sells, retained event fees and modeled realized P/L on hypothetical exits.
- A daily equity change is reported only when a comparable closing mark is available from the **immediately previous IST calendar day**, or on the explicit initialization day relative to the verified ₹1 lakh seed.
- Missing adjacent daily observation, missing mark, or discontinuous retained history ⇒ `dayChangeINR: null`, displayed as “No comparable day”. Never silently extrapolate or backfill.
- Daily `realizedExitPnlINR` is read from SELL events and already accounts for both sides' modeled transaction costs when constructed by the underlying paper engine. Do not subtract `modeledFeesINR` again.
- This is **not** audited market execution; no certified daily exchange-trading P/L is claimed.

## Output and use
- Atlas dashboard → Orders & Activity → Cloud Paper Monitor → choose strategy → click an IST date.
- Read-only common feed: `https://atlas-control-center-pi.vercel.app/cloud-paper-daybook.json`.
- Original source report: `https://atlas-control-center-pi.vercel.app/cloud-paper.json`.
- When asked in ChatGPT for performance, use `/cloud-paper-daybook.json` from the **current deployed revision**, check source/last attempt/status, and report actual retained figures. Never fill absent days, pretend virtual returns are cash, or imply second-by-second NSE trading.

## Release acceptance
1. Unit tests for exact source equality, source validation, IST boundaries, cross-day comparisons, source gaps, modeled event costs and empty-seed response.
2. GitHub TypeScript/frontend build and Python safety tests pass without weakening risk gates.
3. Vercel preview serves both JSON files and the React dashboard, each HTTP 200 and matching the same committed paper ledger.
4. Production deployment is READY; compare the same fields to the GitHub state after merge.
5. Scheduled repeat trade processing, live NSE data, social sentiment, broker placement and open-source framework integrations are **not** delivered by this slice.
