# Atlas private cloud paper worker

This is a *separate persistent worker*; the public Vercel frontend remains read-only unless an authenticated API is configured.

## Required deployment gates
- Deploy an always-on container from the repository root with `docker build -f deployments/cloud-paper/Dockerfile .` (not Vercel serverless). Mount a persistent writable directory such as `/data`, owned by UID 65532. Minimum one volume per service; start with **one instance only**. Backup the SQLite volume and protect it as private financial research data.
- Set distinct >=32-character private `ATLAS_PAPER_OWNER_TOKEN`, `ATLAS_PAPER_FEED_TOKEN`, `ATLAS_PAPER_DB_PATH=/data/atlas-paper.sqlite`, and `ATLAS_PAPER_ALLOWED_ORIGIN=https://<your exact Atlas web origin>`. Use HTTPS termination at the host. Never put token values in Git, frontend builds, URLs, or browser storage.
- Connect a legitimately permitted NSE intraday stock data provider in a *private* collector that POSTs `quotes` to `/api/cloud-paper/quotes` with the feed token and trustworthy exchange timestamps. Do **not** use static snapshots, synthetic prices, stale quotes, or unauthenticated public samples. No provider is wired by this change.
- Set the Atlas Vercel server-side environment variable `ATLAS_PAPER_BACKEND_URL=https://<private-worker-https-origin>`; the deployed same-origin `/api/cloud-paper/*` gateway forwards owner-authorized calls, with no frontend access token persisted or Vercel CSP changes. For local direct development only, `VITE_ATLAS_PAPER_API_URL=http://127.0.0.1:8787` is supported. Never embed tokens in frontend env or Git.
- The current engine models one single-owner cash account with a single SQLite writer. Do not scale horizontally without moving to a transactional Postgres backend and distributed leases.

## Limits
- **PAPER ONLY**: no broker integration, API order routing or real-money execution.
- Default virtual cash ₹1,00,000; all DB amounts use integer paise, and fills include assumed 10 bps fees and adverse 5 bps slippage (not real brokerage rates). No P&L is shown without fresh source quotes.
- Exact order times require scheduler health + fresh quotes. Missed orders are SKIPPED, not backfilled.
- Recurring day strategy: 09:40 IST top 10 ranked by *supplied eligible quote universe* cumulative volume, budget capped at ₹10,000 per symbol; verified Nifty direction (>+0.2% long, <-0.2% short, otherwise no trade); 2% modeled stop; 15:15 IST exit. The feed `coverage` object requires full eligible universe snapshot, its count, and integer `nifty_change_bps`. The collector must provide a complete, point-in-time eligible NSE universe (this cannot be inferred by the worker). No automatic orders until that validated feed and hosting are connected.
- NSE holiday calendar is not integrated in this first worker. A provider's `exchange_open=true` attestation must be reliable on holidays; a weekday alone is insufficient proof of an open exchange.
- API requires owner bearer token in browser memory per session. This is owner-use only; a production multiuser identity/RBAC system is out of scope.
