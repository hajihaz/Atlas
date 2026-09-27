# Next Action

Next objectively executable autonomous work:
1. Expand LEAN golden fixtures beyond the current SPY buy fixture (sell/rebalance/multi-asset/cash-limit cases).
2. Continue deterministic chaos tests around crash windows between portfolio mutation, ledger persistence, and applied-event persistence.
3. Design transactional persistence that atomically couples broker observation, portfolio transition, ledger append, and idempotency record.
4. Continue production deployment implementation behind local-only interfaces.

Owner/external gates are intentionally not executable autonomously: real Upstox sandbox credential smoke, sustained external paper history, production provider selection/credentials, compliance review, and live-capital authorization.
