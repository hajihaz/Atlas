# Atlas scheduled zero-cost forward paper service (2-hour conservative checkpoint)

## Product purpose

Continue **virtual** INR crypto strategy research when the Atlas browser and the owner's Mac are closed, while avoiding paid hosting and unlicensed NSE data. All five strategies receive their own hypothetical ₹1,00,000 starting balance. There are **no real trades, no brokerage keys, no deposits, no real-money P/L**.

## Architecture

- Runner: GitHub Actions on the Atlas *private repo*, `workflow_dispatch` plus `schedule` at minute 17 of every second UTC hour (`17 */2 * * *`). Every run receives a fresh, short-lived `GITHUB_TOKEN` with `contents: write` to publish only the bounded report. It never gets a broker token.
- Source: CoinDCX public INR spot candles (`1h`) + timestamped public market ticker. Completeness and price-age validation are fail-closed. Two adjacent, contiguous fully closed source hourly bars are aggregated into one completed `2h` signal bar. No 1-second or exchange-quality execution claim.
- Output: `frontend/public/cloud-paper.json` committed through GitHub Actions. Vercel Git redeploy is expected to publish the updated static report if triggered by bot commits, **must be checked in a live run**. If that Git-to-Vercel integration does not deploy bot commits, the UI report will remain stale; the UI explicitly detects stale checkpoints.
- Ledger: five named strategies (SMA crossover, EMA crossover, RSI reversal, 20-bar breakout, SPS pullback). Signals are computed only from historically completed candles; hypothetical fills use the current fresh exchange-reported public ticker *after* the bar closed, with modeled 0.10% fee + 0.05% slippage per side. Virtual cash, position, fees, modeled P/L, drawdown, recent event journal and limited equity curve persisted across runs.
- First accepted runner execution **seeds five accounts without any retroactive trade**. Later runs may generate modeled trades if valid signals arrive. Missed scheduled intervals are skipped without reconstructing unknown fill prices. Source outages leave old ledger unchanged and mark a degraded checkpoint. 5% virtual loss halts the relevant strategy.
- UI: Paper-trading workspace shows a **Cloud paper monitor** including last verified run, quote/source status, each strategy, selection-driven virtual ledger, equity curve and pending gaps; it is clearly separated from the existing local/browser paper experiment. Cloud report is static public research data, never an owner's broker account.
- Security: `actualCapitalINR:0`, `realOrdersEnabled:false`; `GET` read-only report. No cloud login, no paid DB, no order endpoints, no Vercel cron, no destructive modifications, no owner secrets. The repo is private but the static **synthetic paper report is public** via Vercel.

## Operational limitations

1. GitHub scheduled workflows are *best effort* and may be delayed, skipped or disabled after inactivity. This is **not** continuous trading or guaranteed 24/7 coverage. No cloud provider can guarantee forever uptime and ₹0 unconditionally.
2. GitHub Actions uses a finite, plan-wide monthly included-minutes pool across private repositories. This 2-hour cadence is deliberately conservative (~360 scheduled runner starts per 30-day month, each subject to a 4-minute timeout) but **does not guarantee that the owner's entire account incurs no cost** if unrelated workflows exhaust allowances. Owner should enforce $0 spending limit in GitHub billing and review Actions usage; no plan upgrade authorized.
3. Vercel Hobby has deployment and usage caps; scheduled publishing can consume builds. Production deployment must be verified after actual scheduled write; the application detects stale reports.
4. This research engine cannot do real NSE stock trading, second-by-second execution or assured fill-quality evaluation. All profit numbers are hypothetical and include approximated fees/slippage.
5. Source history and timestamp integrity have priority. If prices are stale, if 55 adjacent source bars are missing, or if the schedule misses a checkpoint, **no fabricated fill** is created.

## Owner verification

- [ ] Both CI pipelines on exact commit PASS.
- [ ] Vercel production serves `/cloud-paper.json` and Cloud Paper Monitor code.
- [ ] Github Actions scheduled workflow is enabled after merge (workflow_dispatch also available).
- [ ] First real scheduled/manual runner logs source eligibility and commits real source-backed seed.
- [ ] Vercel publishes first post-run update and report is current.
- [ ] At least two valid separate 2-hour checkpoints are observed before claiming continuously tested trading.
- [ ] GitHub billing limits remain strictly within included usage.

Never assert these last-stage acceptance items without actual results.
