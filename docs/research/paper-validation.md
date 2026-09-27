# Paper Validation Runbook

1. Start with `PaperConfig(enabled=True)` only in the paper environment.
2. Provide a point-in-time market snapshot and explicit valuation/fill prices.
3. Run strategy targets through the independent risk gate.
4. Convert only approved targets into discrete order intents.
5. Submit only to the deterministic paper broker or the separately isolated Upstox sandbox transport.
6. Reconcile observed fills into the authoritative portfolio account exactly once.
7. Verify the hash-chained execution ledger.
8. Persist the session checkpoint.
9. Repeat across sessions and record runtime errors and reconciliation failures.
10. Promotion requires the pre-declared research evidence gates plus the required paper sample; it never implies live authorization.
