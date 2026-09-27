# ADR-0035 — Broker Paper/Sandbox Provider Evaluation

**Status:** Accepted for paper integration · 2026-09-03

## Decision

Atlas will evaluate **Upstox Sandbox** as the first concrete external paper/sandbox transport because its official developer documentation explicitly provides a sandbox environment, sandbox tokens, and sandbox-enabled order lifecycle APIs. This is a **paper-integration choice, not a production broker selection**.

DhanHQ remains a production candidate and will not receive credentials or live integration in this step. Production selection remains governed by ADR-0032 and requires comparative operational, pricing, compliance, reliability, and paper evidence.

## Evidence reviewed

| Criterion | Upstox | DhanHQ | Atlas decision |
|---|---|---|---|
| Dedicated sandbox | Documented sandbox environment and sandbox tokens | No equivalent dedicated sandbox was established in the evidence reviewed for this step | Upstox preferred for first paper adapter |
| Order placement | Place Order + Place Order V3 | V2 order placement | Both technically suitable |
| Order lifecycle | Place/modify/cancel documented as sandbox-enabled; order history/trades available in API surface | Order placement/modification/cancellation and order/trade APIs documented | Both suitable; Upstox has stronger paper boundary |
| Instrument identity | `instrument_token` | `securityId` | Adapter must normalize both to Atlas `instrument_id` |
| Client correlation | Order `tag`; multi-order uses `correlation_id` | `correlationId` | Atlas idempotency key remains authoritative |
| Live-safety isolation | Sandbox token is explicitly restricted to sandbox orders | Live order APIs require production configuration | Upstox sandbox provides the clearest initial isolation |
| Production constraints | Live API/auth remains separately governed | Static IP whitelisting documented for order placement/modification/cancellation | Must be evaluated before live selection |

## Hard safety boundary

- No live endpoint is implemented by this ADR.
- No broker credentials are stored in Atlas source, tests, fixtures, or ledger data.
- Sandbox credentials, when later supplied by the user, must be injected only through the runtime secret boundary and never persisted in application artifacts.
- Atlas `ApprovedOrder.approval_id` and `idempotency_key` remain mandatory.
- The provider adapter may translate an approved Atlas order into provider transport fields, but it may not create strategy decisions, change quantity, change side, bypass risk, or authorize capital.
- Any provider response that cannot be mapped deterministically becomes `UNKNOWN` and is reconciled before further capital-increasing action.

## Scope of the next implementation

Step 31 may implement a **sandbox-only Upstox adapter** behind the existing `BrokerAdapter` protocol. It must use an explicit sandbox configuration/endpoint, reject non-sandbox configuration, keep credentials outside source control, preserve Atlas approval/idempotency provenance, and support deterministic response mapping plus reconciliation fixtures.

This ADR does not authorize live trading, production credentials, or a production broker selection.
