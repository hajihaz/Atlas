# Atlas advanced research engine

An offline, dependency-free Node.js research layer for reproducible strategy
and ScalpStorm simulation. It leaves the cloud paper runtime, production
ledgers, UI, schedules and Vercel configuration unchanged.

It has no broker, order, payment or model-provider adapter. Source candles,
observed quotes, synthetic fixtures and hypothetical fills have separate types.
Passing engineering tests does not certify profitability.

Run from the repository root with Node.js 24 or newer:

~~~sh
node --test tests/research/*.test.mjs
node research/advanced/certify.mjs
node research/advanced/cli.mjs calendar
node research/advanced/cli.mjs --help
~~~

Certification intentionally uses artificial fixtures. No command silently
creates fixture prices when market data is absent.

| Module | Responsibility |
| --- | --- |
| core.mjs | Strict times, deterministic SHA-256 evidence, immutable values, paise rounding |
| data.mjs, pipeline.mjs | Raw-byte imports, availability, gaps, duplicates, actions, membership |
| strategies.mjs | Five versioned strategy contracts with parameter validation |
| execution.mjs, simulation.mjs | Next-open fills, costs, lots, liquidity, stops, exposure/drawdown halts |
| evaluation.mjs | Walk-forward, holdout, sensitivity, benchmarks, uncertainty, leakage checks |
| calendar.mjs, scalpstorm.mjs | Requested calendar, opening-volume ranking, daily/campaign reports |
| council.mjs | Six deterministic roles, evidence screening and independent risk veto |
| contracts.mjs, cli.mjs | Replay-verified read-only dashboard envelopes and offline imports |

See [integration](integration.md), [methodology](methodology.md),
[data sources](data-sources.md), [upstream comparison](upstream-comparison.md)
and [acceptance](acceptance.md).

Scope is the owner's A–F advanced engineering mission. Branch:
astra/atlas-advanced-research-engine. Base:
c3c0dd287c68ae6faf4471edda1321b0a7c05df3.
No new packages, vendored source, model weights or paid services.
Production deployment, merging and real capital are outside this mission.
Authentic NSE performance remains unavailable; the tested engine and its
explicit missing-data gate are delivered.
