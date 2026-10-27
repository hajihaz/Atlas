# Atlas free-cloud paper scheduler (Cloudflare Workers + D1)

**PAPER ONLY. NEVER routes capital orders to a broker.**

## Why this is the free implementation

Cloudflare Workers Free supports Cron Triggers, and D1 Free includes 5 GB storage, up to 5,000,000 rows read/day and 100,000 rows written/day. The serverless Worker and D1 run without an always-on Mac or phone. Unlike free sleeping hosts, D1 data persists independently of a web container restart. Free cron is **minute-resolution, best effort**, not an exchange execution guarantee.

Official provider references: [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 free pricing](https://developers.cloudflare.com/d1/platform/pricing/), [cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

The 09:40 signal, any stop-loss, and 15:15 exit attempt can be delayed or skipped when a scheduled trigger is delayed or a quote is missing/stale. A 2% threshold is a **trigger threshold**, not a guarantee that exit losses will be limited to 2%.

## Safe deployment (requires owner's authorized Cloudflare account)

1. Open a free Cloudflare account, complete `npx wrangler login`, and verify `npx wrangler whoami`. This account was **not** connected when this implementation was prepared.
2. From `deployments/cloudflare-paper`, run `npx wrangler d1 create atlas-free-cloud-paper` on the free tier. Inspect any displayed pricing **before provisioning**. Do not purchase upgrades.
3. The remote D1 binding now exists in `wrangler.toml` (`binding = "DB"`, APAC database); keep the stable UUID in source control, not credentials.
4. The remote D1 schema has been installed and verified, using `npx wrangler d1 execute atlas-free-cloud-paper --remote --file schema.sql`.
5. Provision two different randomly generated >=32-character secrets with `npx wrangler secret put OWNER_TOKEN` and `npx wrangler secret put FEED_TOKEN`. Add `npx wrangler secret put FEED_SOURCE_ID` only for the exact validated, licensed NSE feed adapter. **Never** store these in Git, frontend bundles, chat, or screenshots.
6. `npx wrangler deploy` has published the Worker and `* * * * *` Cron. Confirm `/healthz` and `/api/cloud-paper/state` externally after network propagation, then inspect free-tier usage. Do not arm until a licensed source is present.
7. In Atlas Vercel project's **server-side environment variables**, set `ATLAS_PAPER_BACKEND_URL=https://<deployed-worker>.workers.dev` for the preview branch. Redeploy the preview. The existing same-origin Vercel API gateway forwards owner-authorized calls and the browser does not save its credential.
8. Before arming strategies, attach a permitted, timestamped source of the **complete eligible NSE stock universe + Nifty change**, with exchange-open/holiday attestation and a 9:40 AM volume ranking snapshot. No such feed has been connected in this PR. Do not use unauthorized exchange scrapes or invented candles.

## Free-tier query-budget patch (2026-10-27)

Official Cloudflare Workers Free limits currently include **50 D1 queries per invocation**, 10 ms CPU per invocation, and 100,000 Worker requests per day. The first prototype would have exceeded that D1 ceiling with 500-4000 separate quote inserts and up to 10 individual four-statement settlement batches. The implementation now:

- Writes the full authenticated eligible-stock snapshot with **one parameterized SQLite `json_each` statement**, plus one coverage record statement. A local D1 statement test inserted 600 synthetic stock rows successfully.
- Settles one eligible paper fill with **one guarded `UPDATE ... RETURNING`** and the `atlas_settle_paper_fill` SQLite trigger, which atomically updates cash, positions, and the audit event. No double execution when the same order is claimed concurrently.
- Screens 2% paper stops with one joined D1 query, and caps pending manual-order processing per Cron invocation to protect the query budget. Large backlogs may be missed/skipped rather than misrepresented as fills.
- Labels 9:40 entry runs `PARTIAL` whenever fewer than ten modeled positions actually fill. Neither fills nor stop-loss executions are guaranteed.

**Local integration evidence:** trigger applied to D1; a fresh manual test order yielded one `FILLED` record and matching cash/position/audit rows. A paper `ENTRY` short (SELL, 2 shares) and a later paper `EXIT` buy (2 shares) yielded a zero-position ledger, with explicit modeled slippage and fees. No external NSE data or real orders were involved. These tests do not establish Cloudflare hosted CPU compliance; production free-tier telemetry and a complete-market-session validation remain necessary.

## Free quota controls

A full-universe snapshot (500–4000 symbols) is accepted only in the 09:39–09:40 IST window, once per session. The validated snapshot is persisted in one SQLite `json_each()` insert plus one coverage statement inside a single D1 transactional `batch()`: two SQL statements instead of 500+ individual D1 API calls. This reduces invocation overhead but still counts each inserted row against the daily 100,000-row write quota. Ordinary quote updates are limited to 30 symbols per batch and at most one database change per symbol per 12 seconds, reducing daily D1 writes. The collector must send just the watched/held stocks outside the opening universe. Total D1 writes and Worker CPU (10 ms per invocation on Workers Free) still require monitoring: no free plan promises infinite operations or uptime.

## Security/accuracy contract

- Only the owner bearer token can view or schedule/cancel/arm orders. Only a distinct feed token can submit quotes. An additional exact feed-source identifier must be provisioned before quote ingestion can succeed.
- Idempotent schedule keys; serialized D1 batch for fills; integer paise; no margin borrowing by manual orders; an internal paper-only short ledger for the directional strategy; 10 bps assumed fee and adverse 5 bps slippage. No funding account and no live broker endpoint exist.
- Short proceeds are **reserved simulated collateral**, not free capital for unrelated BUY orders; BUYs that only cover an existing short may draw on that short’s cash ledger. Buying more than the short quantity is rejected instead of silently reversing into a new long. Both checks execute inside the guarded D1 settlement statement.
- ₹1,00,000 simulated cash. Paper orders can miss a due minute when Cloudflare Cron is late; the job skips orders >90 seconds old. The 09:40 opening strategy only runs within that IST minute on a complete fresh eligible universe. It will not manufacture trades or backfill.
- If the exit has no fresh quote or the short-covering cash requirement cannot be met, the virtual position can remain open. The audit displays `PARTIAL` / unresolved risk; paper stop-loss/close are not assured.
- A private API token grants direct account access; do not share it. D1 free backups/time-travel are subject to Cloudflare's feature limits.
- The Cloudflare deployment is an **alternative** to the original standalone Python SQLite worker, not a replacement for its existing source of truth. Do not run both against the same virtual portfolio.

## Verification already performed (local only)

- `node --test test/*.test.mjs`: 10/10 tests passed (timezones, auth, full-universe packing, source/coverage gates and freshness).
- `wrangler d1 execute --local --file schema.sql`: schema created.
- Wrangler `--local --test-scheduled` seeded **synthetic local fixtures**, invoked the scheduler, confirmed one virtual BUY fill with fee and an exact cash debit, confirmed two concurrent scheduled invocations created exactly one additional virtual fill, and verified stale scheduled orders transition to `SKIPPED` with `SCHEDULE_MISSED_NO_BACKFILL`.
- The local fixture is not a genuine NSE market observation, not cloud-hosted, not a verified simulated performance result, and not a production trade.

## Gate / next action

Cloudflare Wrangler OAuth was authorized on 2026-10-27. The D1 database was created in APAC, migrated, and the free Worker deployed to `https://atlas-free-cloud-paper.kuddosahib.workers.dev` with minute Cron. The protected API still needs separately provisioned owner/feed secrets and an authorized, timestamped NSE/Nifty source; the Upstox app page currently requires owner OTP login. Hosted authenticated endpoint and full NSE-market-session checks remain pending. Atlas production remains unchanged; live-money orders are never enabled.

### Ledger trigger verification

`schema.sql` installs an `AFTER UPDATE OF status` trigger that settles the virtual ledger **only** for `QUEUED -> FILLED` order transitions with a unique execution ID. This trigger is the only writer of settled cash/positions/fill audit; the Worker must not separately debit cash after setting `FILLED`.

A local Wrangler D1 replay using test-only quotes confirmed 3 simulated BUY shares at ₹155.08 plus ₹0.47 modeled fee debit ₹465.71 exactly once, one virtual position, one fill event, and no change on a second Cron call. `tests/cloud_paper/test_cloudflare_d1_trigger.py` additionally checks duplicate-fill replay, paper short/cover, and atomic rollback on insufficient virtual cash.

The cloud host, authentic NSE feed, and free-tier CPU/row quota certification remain outstanding.

## Optional Upstox V3 quote normalization (no live connection)

`src/upstox-adapter.js` is a tested pure transformation of one already-authorized Upstox V3 `GET /v3/market-quote/quotes` response of exactly **500** eligible NSE equities plus a separately sourced Nifty 50 quote. It verifies exact instrument-token matches, source timestamps, complete universe, fresh top-10 last trades, prices/volume, and benchmark direction before emitting the existing Atlas D1 feed schema. No bearer token, API calls, actual quote data, licensed rights, or feed credentials have been added.

The upstream API returns at most 500 instruments per request. Consequently this first adapter only supports a *declared 500-stock eligible universe*, **not all listed NSE stocks**; it must never be presented as an exchange-wide ranking. `observed_at` is the authenticated collector's common receipt time for that one snapshot, not the exchange's last-trade timestamp, and recent last-trade times are validated separately for ranked candidates. An authorized collector must verify NSE market status/holidays and contractual permission to use market data for this independent paper system.

Official API: https://upstox.com/developer/api-documentation/get-full-market-quote-v3/ . Run `node --test test/*.test.mjs`. More comprehensive market coverage would require rights-approved multi-batch aggregation and audited timestamp-skew gating before enabling automated entries.

## Official Upstox Analytics Token (owner-only; no daily OAuth renewal)

Upstox confirms the **Analytics Token** is free, read-only, lasts one year, supports Market Quote/Websocket without a static IP, and cannot place/modify/cancel broker orders. In the owner's authenticated Upstox Apps > Analytics screen, the token was generated on 25 Oct 2026 and shows expiry 25 Oct 2027. Official docs: https://upstox.com/developer/api-documentation/analytics-token/ and https://upstox.com/developer/api-documentation/get-full-market-quote-v3/.

**No Upstox token was copied into Git or chat.** The remote Worker has not been provided that private credential yet. To install it securely, from your own Mac Terminal (not a chat):

```sh
cd /Users/hajihaz/projects/atlas-cloud-paper-20261027/deployments/cloudflare-paper
./setup-secure-readonly.zsh
```

This opens Wrangler's private token prompt. Click the **copy** icon beside your existing Upstox Analytics Token in your signed-in Upstox page, paste directly into the prompt, and submit. The helper also creates a separate Atlas paper-desk token stored in your macOS Keychain and encrypted Worker secret storage. Neither value is printed by the helper or committed. Read the key locally from your Keychain only when connecting the private Atlas preview desk. The feed will remain inert until a verified token is installed, and the strategy itself is disabled until deliberately armed.

The cloud Worker uses Upstox's official daily [NSE MIS JSON BOD catalog](https://assets.upstox.com/market-quote/instruments/exchange/NSE_MIS.json.gz) as its intraday-eligible NSE EQ universe: around 1,369 listings on 27 Oct 2026 (with one identical duplicate). Catalog date and keys are validated every fetch. Complete 09:40 IST quotes are fetched in batches of at most 500 instruments and one Nifty 50 index quote, ranked by cumulative volume across **all** MIS candidates, not 500 arbitrary equities. Snapshots with missing instruments, inaccurate timestamps, a collection interval over eight seconds, or stale global top-ten last trades are rejected. During other minutes only held and imminently queued positions (max 30) are refreshed. No trading or quotes are fabricated when the feed is unavailable. Upstox MIS eligibility is not necessarily every NSE listing, and cannot guarantee real-world short-sale borrowability, order fills, or a 2% exit.

The owner's same-origin Vercel preview offers **Verify Upstox read-only feed** after private desk sign-in. This performs one authenticated GET on `NSE_INDEX|Nifty 50`, returning only authorization/provenance/freshness metadata; it never places an order or persists a quote. After-market quotes may be authenticated yet not current. Full paper-session certification remains a separate gate. Live capital integration remains prohibited.
