# Atlas Advanced Research — owner-local inspectable dashboard adapter

Date: 2026-10-23. Scope: Research Lab only; zero upload and zero live-order permissions.

## Real functional workflow

1. Use the merged offline Astra engine with legal, complete, timestamped input:
   `node research/advanced/cli.mjs replay --manifest /private/authorized/manifest.json --candles /private/authorized/candles.json --output /private/authorized/new-research-output.json`.
2. In Atlas → Research Lab → Advanced Quant Research, choose this JSON output
   from the owner's own device. No file is uploaded or persisted in the app.
3. Inspect all declared strategy IDs, versions, virtual balances, hypothetical
   modeled P/L, risk events, equity series and individual model trades. This
   is a separate research readout, not the forward BTC/INR GitHub ledger.
4. Clear the file or reload to discard the local preview. Do not share
   private/licensed datasets without verifying source redistribution rights.

## Safety / accuracy

- The browser parses an allowlisted 8MB maximum
  `atlas.advanced-research.v1` envelope and never sends it to backend APIs.
- Only owner-only INR source-classified reports with explicitly disabled real
  orders and disabled paper-ledger writes can be displayed.
- The test fixture from `docs/research/advanced/fixture-dashboard-envelope.json`
  remains visibly marked ARTIFICIAL and must never be promoted to genuine market
  results. No numerical fixture output is advertised as trading profit.
- Genuine-looking user-supplied files remain **independently unverified**: the
  browser cannot authenticate original raw candles, exchange license, archival
  vintages, issuer universe, or mathematically rerun the source-bound simulator.
  The CLI's independent replay/source-hash checks are still required upstream.
- Reports with impossible entries, nonfinite numbers, duplicate strategy IDs,
  forged risk exits, unsafe execution flags or mismatched fixture kind are
  rejected. Valid risk-halt/stop model exits may lack signal timestamps as
  defined by the actual engine.
- This feature does not read or mutate crypto price streaming, cloud-paper JSON,
  actual account funds, NSE live API, IPO records, user credentials or broker.

## Acceptance

New pure tests cover authentic fixture semantics, negative/faked financial
fields, legitimate risk-driven stop events and no network/storage behavior.
Also require frontend TypeScript/build, all Node tests, Python CI, exact Vercel
preview and production SHA, and manual browser file-picker smoke test.

Historical ScalpStorm results remain blocked until the missing authentic
point-in-time NSE stock dataset is independently accepted.
