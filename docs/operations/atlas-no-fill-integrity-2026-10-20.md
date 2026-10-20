# Atlas research ledger: no-fill integrity acceptance

A read-only public cloud paper report may not add or change cash,
open quantity, position cost, modeled fees, realized P/L, closed
trades, win count or lastFillAt unless an independently approved
modeled fill is appended to the next consecutively completed 2-hour
source bar.

When provider status is DEGRADED, the runner's failureState is
observational only. Its five sessions must remain **byte-for-byte
equivalent as structured JSON** to their prior published snapshots:
no invented equity mark, trade, historic observation or win is permitted.

When status is RUNNING or GAP_SKIPPED, the runner may mark existing
virtual positions at a newly source-validated public quote (without
recording a trade), but realized gains, cash and owned token quantity
still cannot change without a modeled fill. The source-quote gate
remains outside this persistence checker; it is independently verified
in the scheduled runner.

Tests inject forged cash, quantity, fees, realized gains, win counts,
trade timestamps, equity marks and simulated history entries.
These are deliberately artificial negative fixtures, **not profit
results or forward paper transactions**.

Scope: pure ledger guard, tests, docs. No paid services, real orders,
broker authentication, Vercel plan upgrade or Astra research changes.
