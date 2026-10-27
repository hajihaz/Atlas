# Atlas free-cloud paper scheduler (Cloudflare Workers + D1)

**PAPER ONLY. NEVER routes capital orders to a broker.**

## Why this is the free implementation

Cloudflare Workers Free supports Cron Triggers, and D1 Free includes 5 GB storage, up to 5,000,000 rows read/day and 100,000 rows written/day. The serverless Worker and D1 run without an always-on Mac or phone. Unlike free sleeping hosts, D1 data persists independently of a web container restart. Free cron is **minute-resolution, best effort**, not an exchange execution guarantee.

Official provider references: [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 free pricing](https://developers.cloudflare.com/d1/platform/pricing/), [cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

The 09:40 signal, any stop-loss, and 15:15 exit attempt can be delayed or skipped when a scheduled trigger is delayed or a quote is missing/stale. A 2% threshold is a **trigger threshold**, not a guarantee that exit losses will be limited to 2%.

## Safe deployment (requires owner's authorized Cloudflare account)

1. Open a free Cloudflare account, complete `npx wrangler login`, and verify `npx wrangler whoami`. This account was **not** connected when this implementation was prepared.
2. From `deployments/cloudflare-paper`, run `npx wrangler d1 create atlas-free-cloud-paper` on the free tier. Inspect any displayed pricing **before provisioning**. Do not purchase upgrades.
3. Add a `[[d1_databases]]` block in `wrangler.toml` using the returned UUID, with `binding = "DB"` and `database_name = "atlas-free-cloud-paper"`.
4. Run `npx wrangler d1 execute atlas-free-cloud-paper --remote --file schema.sql` to install the D1 schema.
5. Provision two different randomly generated >=32-character secrets with `npx wrangler secret put OWNER_TOKEN` and `npx wrangler secret put FEED_TOKEN`. Add `npx wrangler secret put FEED_SOURCE_ID` only for the exact validated, licensed NSE feed adapter. **Never** store these in Git, frontend bundles, chat, or screenshots.
6. Run `npx wrangler deploy`, then read `/healthz`. Confirm `/api/cloud-paper/state` without authorization returns 401. Cloudflare runs the `* * * * *` cron server-side. Inspect usage limits and pause if daily capacity would be exceeded.
7. In Atlas Vercel project's **server-side environment variables**, set `ATLAS_PAPER_BACKEND_URL=https://<deployed-worker>.workers.dev` for the preview branch. Redeploy the preview. The existing same-origin Vercel API gateway forwards owner-authorized calls and the browser does not save its credential.
8. Before arming strategies, attach a permitted, timestamped source of the **complete eligible NSE stock universe + Nifty change**, with exchange-open/holiday attestation and a 9:40 AM volume ranking snapshot. No such feed has been connected in this PR. Do not use unauthorized exchange scrapes or invented candles.

## Free quota controls

A full-universe snapshot (500–4000 symbols) is accepted only in the 09:39–09:40 IST window, once per session. Ordinary quote updates are limited to 30 symbols per batch and at most one database change per symbol per 12 seconds, reducing daily D1 writes. The collector must send just the watched/held stocks outside the opening universe. Total D1 writes and Worker CPU still require monitoring: no free plan promises infinite operations or uptime.

## Security/accuracy contract

- Only the owner bearer token can view or schedule/cancel/arm orders. Only a distinct feed token can submit quotes. An additional exact feed-source identifier must be provisioned before quote ingestion can succeed.
- Idempotent schedule keys; serialized D1 batch for fills; integer paise; no margin borrowing by manual orders; an internal paper-only short ledger for the directional strategy; 10 bps assumed fee and adverse 5 bps slippage. No funding account and no live broker endpoint exist.
- ₹1,00,000 simulated cash. Paper orders can miss a due minute when Cloudflare Cron is late; the job skips orders >90 seconds old. The 09:40 opening strategy only runs within that IST minute on a complete fresh eligible universe. It will not manufacture trades or backfill.
- If the exit has no fresh quote or the short-covering cash requirement cannot be met, the virtual position can remain open. The audit displays `PARTIAL` / unresolved risk; paper stop-loss/close are not assured.
- A private API token grants direct account access; do not share it. D1 free backups/time-travel are subject to Cloudflare's feature limits.
- The Cloudflare deployment is an **alternative** to the original standalone Python SQLite worker, not a replacement for its existing source of truth. Do not run both against the same virtual portfolio.

## Verification already performed (local only)

- `node --test test/safety.test.mjs`: 3/3 tests passed.
- `wrangler d1 execute --local --file schema.sql`: schema created.
- Wrangler `--local --test-scheduled` seeded **synthetic local fixtures**, invoked the scheduler, confirmed one virtual BUY fill with fee and an exact cash debit, confirmed two concurrent scheduled invocations created exactly one additional virtual fill, and verified stale scheduled orders transition to `SKIPPED` with `SCHEDULE_MISSED_NO_BACKFILL`.
- The local fixture is not a genuine NSE market observation, not cloud-hosted, not a verified simulated performance result, and not a production trade.

## Gate / next action

Cloudflare OAuth sign-in was opened on the owner's Mac, but `wrangler whoami` still reported no authorization when last checked. A verified complete NSE feed and full-session end-to-end verification remain outstanding. Production Atlas remains unchanged, and live-money orders remain disabled.
