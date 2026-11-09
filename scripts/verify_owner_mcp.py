"""End-to-end official MCP stdio verification against an isolated artificial ledger."""

from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from atlas.paper.live_runner import add_strategy, connect

ROOT = Path(__file__).resolve().parents[1]


async def run() -> None:
    with tempfile.TemporaryDirectory(prefix="atlas-mcp-test-") as temp:
        path = Path(temp) / "fixture.sqlite3"
        db = connect(path)
        add_strategy(db, id="fixture-paper", symbol="BTCINR", kind="sma", fast=2, slow=3)
        db.close()
        params = StdioServerParameters(
            command=sys.executable,
            args=["-m", "atlas.runtime.mcp_server"],
            env={
                "PYTHONPATH": str(ROOT / "src"),
                "ATLAS_PAPER_DB_PATH": str(path),
                "ATLAS_ALLOW_PAPER_CONTROL": "1",
                "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            },
        )
        async with stdio_client(params) as (reader, writer):
            async with ClientSession(reader, writer) as client:
                await client.initialize()
                tools = await client.list_tools()
                names = {tool.name for tool in tools.tools}
                assert names == {
                    "atlas_paper_status",
                    "atlas_paper_daily_report",
                    "atlas_paper_set_active",
                }
                status = await client.call_tool("atlas_paper_status", {})
                assert not status.isError
                from datetime import datetime
                from zoneinfo import ZoneInfo

                day = await client.call_tool(
                    "atlas_paper_daily_report",
                    {
                        "strategy_id": "fixture-paper",
                        "date": datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat(),
                        "offset": 0,
                    },
                )
                assert not day.isError
                pause = await client.call_tool(
                    "atlas_paper_set_active",
                    {
                        "strategy_id": "fixture-paper",
                        "active": False,
                        "request_id": "fixture-request-123456",
                    },
                )
                assert not pause.isError
                repeat = await client.call_tool(
                    "atlas_paper_set_active",
                    {
                        "strategy_id": "fixture-paper",
                        "active": False,
                        "request_id": "fixture-request-123456",
                    },
                )
                assert not repeat.isError
                conflict = await client.call_tool(
                    "atlas_paper_set_active",
                    {
                        "strategy_id": "fixture-paper",
                        "active": True,
                        "request_id": "fixture-request-123456",
                    },
                )
                assert conflict.isError
                unknown = await client.call_tool(
                    "atlas_paper_daily_report", {"strategy_id": "../../etc/passwd"}
                )
                assert unknown.isError
        db = connect(path)
        assert db.execute("SELECT active FROM strategies").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM fills").fetchone()[0] == 0
        db.close()
        print(
            json.dumps(
                {
                    "passed": True,
                    "transport": "official MCP stdio",
                    "tools": sorted(names),
                    "fixture": "artificial account, no market observations",
                    "realOrders": 0,
                    "checks": [
                        "initialize",
                        "list tools",
                        "status",
                        "verified day query",
                        "pause",
                        "replay",
                        "conflict",
                        "path rejection",
                    ],
                }
            )
        )


if __name__ == "__main__":
    asyncio.run(run())
