# Ten-repository comparison and isolated findings

The [source evidence](upstream-evidence.json) pins all ten current revisions,
commit dates, raw license hashes, inspected source/manifests, dependency
indicators and public repository-advisory responses. Retrieval was anonymous.
No package or model weight was installed; no external code was vendored.

Repository-level empty advisory lists do not establish dependency safety.
Transitive CVE audits, runtime/lockfile certification and hosted deployment
costs were not assessed because the full frameworks were not installed.

| Candidate | License finding | Decision | Fit and deployment/dependency boundary |
| --- | --- | --- | --- |
| TradingAgents | Apache-2.0 | Adapt architectural concepts | Source-attributed roles/checkpoints. LangGraph/LangChain and model-provider SDK stack; paid models are not necessary for our deterministic roles and were not connected. |
| FinRL-X / FinRL-Trading | Apache-2.0 | Isolated benchmark | Weight output contract. Full pandas/numpy/ML/Alpaca stack is unnecessary for this release; four method-level contract checks ran with a tiny DataFrame shim. |
| NautilusTrader | LGPL-3.0 | Defer installation | Strong event-driven execution research; Rust/Python stack and linking/distribution obligations need clearance before adoption. |
| Freqtrade | GPL-3.0 | Reject direct embedding | Crypto dry-run/look-ahead ideas can inform independent code. No GPL code enters Atlas and no exchange connector is activated. |
| Qlib | MIT | Defer full ML stack | Useful rolling evaluation concepts. Large ML/data dependencies and serialized-artifact/config execution exposure need isolation and a pinned dependency audit. |
| FinRobot | Apache-2.0 | Adapt architectural concepts | Separate deterministic numbers from optional prose. Provider keys/data/LLM calls in its full stack are not proven ₹0 and were not invoked. |
| QuantConnect LEAN | Apache-2.0 | Isolated benchmark | Existing local binaries passed two backtest execution fixtures plus a compression check. No cloud product, broker, package restore or build was used. |
| Hummingbot | Apache-2.0 | Adapt architectural concepts | Paper-exchange/lifecycle separation. Cython/data/exchange dependencies and continuous worker hosting remain outside this mission. |
| VectorBT | Commons Clause plus underlying terms; GitHub reports NOASSERTION | Reject direct embedding | Direct license text contains Commons Clause restrictions. Parameter-grid concepts were implemented independently, without importing the package. |
| FinBERT | Apache-2.0 for code only | Defer weights and dataset | README explicitly separates pretrained weights and Financial PhraseBank licensing. Neither was downloaded. Original small-lexicon sentiment is transparently heuristic, with no accuracy claim. |

**Adopt now:** Atlas's own dependency-free contracts, walk-forward selection,
cost sensitivity, risk veto, provenance and reproducibility code. No upstream
runtime package is adopted. Source license permissiveness alone does not
make market data, cloud compute, weights or model API usage free.

## Revisions and maintenance

The JSON stores full commit SHAs and dates, archive/disabled flags and exact
file URLs. NautilusTrader and Freqtrade moved since the prior Atlas audit;
the newer sources were inspected without altering that existing audit.
Recent commits show observed activity, not a guarantee of project health.
The current Qlib pin includes the previously documented October security-era
revision; untrusted pickle/joblib/config artifacts remain excluded.

## Actual isolated checks

### FinRL-Trading

[Method check](isolated-finrl-contract.json), pinned revision
4409abe925c904e570be78ebfb5e77ac3491dff8:

- Ten artificial tickers produce ten 0.1 weights, or ₹10,000 each for ₹100,000.
- Duplicate tickers are deduplicated.
- Empty input raises ZeroDivisionError; Atlas rejects empty universes before simulation.
- An unknown strategy type is rejected.

This executes the pinned upstream weight method using a deliberately minimal
DataFrame shim. It is **not a full FinRL/pandas execution or return benchmark**.
The shim and exact source hash are disclosed. No market prices or strategies'
profits were measured.

~~~sh
node research/advanced/upstream-audit.mjs
env -i PATH=/usr/bin:/bin /opt/homebrew/bin/python3.11 -I \
  research/advanced/isolated-upstream-check.py
~~~

The optional refresh downloads public text for inspection only; it never
automatically executes source. The isolated method check requires the pinned
Apache source hash and refuses unreviewed imports.

### LEAN

[Backtest fixture evidence](isolated-lean-fills.json):

- An oversized cash-equity order is invalid and leaves initial cash intact.
- A deterministic 12-share scenario produces submitted, partial 4, partial 4,
  final 4; the checked sample's fee is $1.
- Both finish in backtesting mode with macOS sandbox network denial.

[Compression runtime check](isolated-lean-runtime.json): existing LEAN
Compression round-trips a ZIP payload byte-for-byte.

These reuse the owner's existing local LEAN revision
f24fc0d3df03d6bdbe0e6fc7b8522445f1d900d2 and built assemblies. That checkout
already contains unrelated modifications; this mission did not rebuild or
change it. Assembly hashes bind the tested binaries. They are distinct from
the current upstream source pin in the ten-repository review.

The fill fixtures use existing bundled sample data and pre-existing test
algorithms. Their account statistics are test expectations, not an investment
performance claim. The new Atlas next-open simulator has its own hand-calculated
benchmark and conservation/timing tests; no claim of identical full-engine
semantics is made.

~~~sh
env -i PATH=/usr/bin:/bin /opt/homebrew/bin/python3.11 -I \
  research/advanced/lean-isolated-check.py \
  --existing-atlas-root /Users/hajihaz/projects/Atlas
~~~

All other framework evaluations were static source/manifest evaluations. No
full TradingAgents, Nautilus, Freqtrade, Qlib, FinRobot, Hummingbot, VectorBT
or FinBERT runtime benchmark was performed. Their recorded cost/license/
dependency barriers are not represented as passing certifications.
