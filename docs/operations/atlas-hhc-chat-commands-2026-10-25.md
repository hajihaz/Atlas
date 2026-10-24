# Atlas commands through the existing HHC connection — 25 October 2026

Atlas paper status, reports and controls can run from this ChatGPT conversation
through the existing owner-authenticated HajiHaz Commander connection. A separate
public remote MCP connector is optional for this workflow.

This uses `atlas.runtime.command`, a fixed command interface on the Mac. It adds
no HTTP listener, tunnel, broker access, new credential or subscription. The
existing stdio MCP server remains available to compatible local clients.

## Owner requests

| Request in chat | Allowed operation |
| --- | --- |
| “Atlas status” | Reconcile the recorded paper accounts, source time, balances, fees, fills and risk state. |
| “Show atlas-btc-sma results” | Return that existing account’s daily/monthly recorded results. |
| “Show atlas-btc-sma trades for 2026-10-25” | Page the recorded fills for that IST date. |
| “Pause atlas-btc-sma” | Pause that existing paper account with a stable request ID. |
| “Resume atlas-btc-sma” | Resume only with owner authorization and no risk latch. A risk-halted account remains denied. |

These operations never create a strategy, place a real order, reset a risk latch,
move money, add capital, log into a broker or fabricate a trade. The two current
comparison accounts remain risk halted. New live-paper experimentation still
requires a justified strategy and appropriate data.

## Operator invocation

Use the authorized Atlas worktree:
`/Users/hajihaz/projects/atlas-runtime-completion-20261024`.
Read operations use the isolated Python with `PYTHONPATH=src`:

```sh
env PYTHONPATH=src .venv-runtime/bin/python -m atlas.runtime.command status
env PYTHONPATH=src .venv-runtime/bin/python -m atlas.runtime.command report --strategy atlas-btc-sma
env PYTHONPATH=src .venv-runtime/bin/python -m atlas.runtime.command report --strategy atlas-btc-sma --date 2026-10-25 --offset 0
```

HHC must use that exact approved working directory. A chat request cannot select
a database or an arbitrary path. The database path is trusted process
configuration; the default is the existing owner paper ledger.

Only for an explicitly owner-authorized paper state change, set
`ATLAS_ALLOW_PAPER_CONTROL=1` for that single invocation and provide a stable
16–80 character alphanumeric/hyphen request ID. Reuse the same ID when reconciling
an uncertain tool outcome; do not blindly replay with a new ID. Changed commands
with the same ID fail. Read operations need no control enablement.

Every result uses the `atlas.owner-command.v1` JSON envelope with
`realOrdersEnabled:false`. Invalid commands and private-state failures return
sanitized errors without echoing arbitrary arguments or paths. Interpret failure
as unavailable evidence, never as zero P/L or successful execution.

## Verified boundary

[Acceptance receipt](atlas-hhc-chat-commands-2026-10-25.json): 602 Python tests and 41 subtests passed, with one missing LEAN-data test skipped; 137 modules passed strict typing. No frontend source changed.

The command tests use disposable artificial ledgers, then exercise the real
subprocess interface. They cover status/day reporting, disabled controls,
idempotent pause, conflicting IDs, risk-halted resume rejection, unsupported
order/path arguments and absent databases. The live HHC readback reconciles the
actual owner ledger without changing its fills or account state.

The source had recovered to recent native INR REST observations during this
continuation. This does not establish reliable one-second browser streaming or
uninterrupted uptime. The worker can report fresh and stale observations
independently of verified accounting. Historical stock certification remains
0/20, and no strategy is certified profitable.

GitHub hosted CI remains a separate release requirement. The earlier account
restriction was retried once during this continuation; that job again completed
without steps. Do not merge main or deploy production unless exact-head hosted
checks pass. Source access, rights, device push delivery and dependable strategy
evidence retain their own acceptance gates.
