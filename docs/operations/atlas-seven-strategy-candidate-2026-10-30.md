# Atlas seven-strategy cloud candidate — 30 October 2026

## Scope and status

Paper-only, cash-only, zero broker order routes. This is an isolated candidate in
`.ai/worktrees/atlas-cloud-reference-20261029`. Worker version 7af8e392-a1b2-48a0-bf42-57ae6b3e79b0 now serves the owner-only research routes, seven-account status view and new daily archive Cron; seven-rule automatic paper execution remains unarmed. The private daily-history table was created
in the separate cloud HISTORY_DB and verified in Cloudflare Studio (Executed 1/1).
Cloudflare Billing showed Workers Free active and no payment method on file.
No GitHub release, paid Cloudflare upgrade, or real trade was made.

The user confirmed that the five existing rules are SMA 9/21, EMA 12/26,
RSI 14, 20-bar breakout, and SPS swing pullback. A search of available Atlas
state and recent strategy chats did not recover previously agreed weekly or
monthly entry/exit rules. The two period rules below are new, explicitly
versioned research hypotheses chosen for this candidate.

| ID | Rule | Data | Current implementation |
|---|---|---|---|
| sma_9_21 | SMA9/SMA21 cross | completed 1-minute NSE bars | exact-receipt, one-symbol retrospective replay |
| ema_12_26 | EMA12/EMA26 cross | completed 1-minute NSE bars | same |
| rsi_14 | RSI14 recovers above 30; exit at 60 | completed 1-minute NSE bars | same |
| breakout_20 | 20-close breakout; exit below prior 10-close low | completed 1-minute NSE bars | same |
| sps_pullback | rising SMA20, price recovers SMA5; exit below SMA20 | completed 1-minute NSE bars | same |
| weekly_5d_momentum_v1 | top three positive 5-session returns above SMA10 | 11 completed daily bars per eligible equity | source-qualified fixed-ten ranking signal |
| monthly_20d_trend_v1 | top three positive 20-session returns above SMA60 | 61 completed daily bars per eligible equity | source-qualified fixed-ten ranking signal |

The five intraday models use the next minute open, whole shares, ₹10,000
per-symbol comparison capital, 10 bps illustrative fee and 5 bps adverse
slippage per side. Positions are closed at modeled 15:16 open. Results are
retrospective and do not prove that an order could have filled at that price.
Weekly/monthly rank on the first session of the new period using the prior
completed daily candles. Their 2%/5% stated stop and next-period rebalance
are **specification only**; no period paper ledger or automatic fills exist.

## Added cloud candidate components

- `src/seven-strategy-replay.js`: seven definitions, intraday replay,
  weekly/monthly research rank, fail-closed daily/identity/time checks.
- `src/strategy-replay-reader.js`: owner-only, one dated symbol and one
  intraday rule, verifying the immutable Upstox body SHA before replay.
- `src/upstox-daily-cohort.js`: one symbol per 17:30–17:39 IST Cloud Cron
  slot; private exact-body daily receipt and precomputed period features.
- `src/fast-period-rank.js`: one bounded ten-row D1 read for a period
  signal. It labels the signal unarmed and fixed-cohort only.
- `daily-history.sql`: separate private HISTORY_DB table.
- `seven-paper-ledger.js` and `seven-paper-store.js`: seven independent
  ₹100,000 virtual accounts, later-quote fill guard and D1 revision CAS.
  The production D1 has seven empty accounts, ₹700,000 total virtual cash,
  zero fills and zero revisions. No scheduler calls the ledger yet.
- Owner-token routes: `/api/cloud-paper/seven-strategies`,
  `/api/cloud-paper/strategy-replay`, `/api/cloud-paper/daily-cohort`,
  `/api/cloud-paper/period-rank`, `/api/cloud-paper/seven-accounts`.

The Cron expression remains one trigger (the hour-12 slots are added to the
existing historical cohort trigger), within Cloudflare Free. Each daily
capture performs one source GET. Official Cloudflare documentation currently
states a 10 ms CPU limit per Free Worker invocation; local Node timings are
not proof of cloud CPU compliance. Source ranking uses the fixed ten symbols,
not the full NSE universe.

## Evidence and next gates

- 78/78 cloud Worker unit tests pass locally; `node --check src/index.js`
  and module import pass; `daily-history.sql` parses in SQLite. Production
  `/healthz` remains PAPER_ONLY and configured, and the anonymous seven-rule
  route returns 401. The new private daily table has zero rows before its
  first scheduled capture on the next open session.
- The research routes and daily archive schedule are deployed. Seven unarmed cloud virtual accounts are verified, with zero fills; no live seven-rule
  scheduled paper execution has been verified. The original 09:40 full-universe cloud
  paper rule remains the only armed rule. The first five are replay candidates;
  the two period rules are unarmed signals.
- The private `daily-history.sql` table is applied. The exact candidate bundled
  in pinned Wrangler 4.156.0 and was deployed with its three free-plan Cron
  triggers. Worker startup was 3 ms; actual daily Cron CPU is unmeasured.
  The account shows Workers Free active, with no payment method. Check a production daily receipt,
  10/10 row coverage, CPU telemetry, and source time before enabling the
  period signal schedule.
- Build separate virtual accounts and idempotent fills for all seven,
  prove full live minute coverage for intraday rules, then forward-test each
  rule. Until then, never report them as autonomous or profitable.
- History retrieved after a session may support retrospective modeling, not
  a claim that a prior 09:40 signal was known then. Corporate actions and
  full-universe eligibility also require qualification before performance
  comparisons.
