"""Explicit Upstox sandbox smoke harness.

Default mode is dry-run. Use --execute only after reviewing the printed order preview.
This script can reach only the Upstox sandbox endpoint through Atlas' isolated transport.
"""

from __future__ import annotations

import argparse
from decimal import Decimal

from atlas.broker import ApprovedOrder, OrderSide
from atlas.broker.sandbox_runtime import SandboxRuntimeConfig, load_sandbox_adapter


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--instrument", required=True)
    parser.add_argument("--instrument-token", required=True)
    parser.add_argument("--quantity", required=True, type=int)
    parser.add_argument("--side", choices=["BUY", "SELL"], required=True)
    parser.add_argument("--approval-id", required=True)
    parser.add_argument("--idempotency-key", required=True)
    parser.add_argument("--limit-price", type=Decimal)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    order = ApprovedOrder(
        args.instrument,
        args.quantity,
        args.limit_price,
        args.approval_id,
        args.idempotency_key,
        OrderSide(args.side),
    )
    order.validate()
    print(f"SANDBOX ORDER PREVIEW: {args.side} {args.quantity} {args.instrument}")
    print(f"approval_id={args.approval_id} idempotency_key={args.idempotency_key}")
    if not args.execute:
        print("DRY RUN: no network request made")
        return 0
    adapter = load_sandbox_adapter(SandboxRuntimeConfig({args.instrument: args.instrument_token}))
    receipt = adapter.submit(order)
    print(f"sandbox_status={receipt.status.value} broker_order_id={receipt.broker_order_id}")
    return 0 if receipt.status.value != "unknown" else 2


if __name__ == "__main__":
    raise SystemExit(main())
