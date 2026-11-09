"""Owner OS-authenticated stdio MCP. No HTTP listener, credentials or order tools."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

from atlas.runtime.controls import set_active
from atlas.runtime.local_ledger import report, trade_day

mcp = FastMCP(
    "Atlas owner paper research",
    instructions=(
        "Read recorded paper evidence and control only existing simulated strategies. "
        "No real orders, money movement, broker login or retrospective fill creation."
    ),
)


def ledger() -> Path:
    return Path(
        os.environ.get("ATLAS_PAPER_DB_PATH", str(Path.home() / ".atlas/live-paper.sqlite3"))
    )


@mcp.tool()
def atlas_paper_status() -> dict[str, Any]:
    """Read reconciled paper accounts, source freshness and recorded fills."""
    return report(ledger())


@mcp.tool()
def atlas_paper_daily_report(
    strategy_id: str, date: str | None = None, offset: int = 0
) -> dict[str, Any]:
    """Read per-day costs/realized P&L and recent modeled trades for one existing account."""
    if date is not None:
        return trade_day(ledger(), strategy_id, date, offset)
    state = report(ledger())
    for account in state["accounts"]:
        if account["id"] == strategy_id:
            return {
                "schema": state["schema"],
                "asOf": state["asOf"],
                "account": account,
                "limitations": state["limitations"],
                "realOrdersEnabled": False,
            }
    raise ValueError("Unknown paper strategy")


@mcp.tool()
def atlas_paper_set_active(strategy_id: str, active: bool, request_id: str) -> dict[str, Any]:
    """Pause/resume an existing paper strategy using a stable idempotency request ID.
    Requires owner-local ATLAS_ALLOW_PAPER_CONTROL=1; never creates a trade.
    """
    return set_active(
        ledger(),
        strategy_id,
        active,
        request_id,
        authorized=os.environ.get("ATLAS_ALLOW_PAPER_CONTROL") == "1",
    )


if __name__ == "__main__":
    mcp.run(transport="stdio")
