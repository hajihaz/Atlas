"""Restricted Atlas paper commands over the existing authenticated owner HHC connection."""

from __future__ import annotations

import argparse
import json
import os
from collections.abc import Sequence
from pathlib import Path
from typing import Any, NoReturn

from atlas.runtime.controls import set_active
from atlas.runtime.local_ledger import report, trade_day

COMMANDS = ("status", "report", "pause", "resume")


def execute(
    path: Path,
    command: str,
    *,
    strategy_id: str | None = None,
    date_value: str | None = None,
    offset: int = 0,
    request_id: str | None = None,
    authorized: bool = False,
) -> dict[str, Any]:
    """No real-order, broker, credential, arbitrary-file or risk-reset operations."""
    if command not in COMMANDS or type(offset) is not int or offset < 0:
        raise ValueError("Invalid paper command")
    if command == "status":
        if strategy_id is not None or date_value is not None or offset or request_id is not None:
            raise ValueError("Status does not accept account mutations or filters")
        data = report(path)
    elif command == "report":
        if not strategy_id or request_id is not None or (offset and date_value is None):
            raise ValueError("An existing account and consistent report filters are required")
        if date_value is not None:
            data = trade_day(path, strategy_id, date_value, offset)
        else:
            state = report(path)
            account = next((a for a in state["accounts"] if a["id"] == strategy_id), None)
            if account is None:
                raise ValueError("Unknown paper account")
            data = {
                "asOf": state["asOf"],
                "account": account,
                "limitations": state["limitations"],
                "realOrdersEnabled": False,
            }
    else:
        if not strategy_id or not request_id or date_value is not None or offset:
            raise ValueError("Paper changes require an account and stable request ID")
        data = set_active(path, strategy_id, command == "resume", request_id, authorized=authorized)
    return {
        "schema": "atlas.owner-command.v1",
        "command": command,
        "mode": "PAPER_ONLY",
        "realOrdersEnabled": False,
        "result": data,
    }


class _Parser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        # Do not echo arbitrary caller arguments or private paths into tool output.
        raise ValueError("Invalid paper command arguments")


def main(argv: Sequence[str] | None = None) -> int:
    parser = _Parser(description=__doc__, allow_abbrev=False)
    parser.add_argument("command", choices=COMMANDS)
    parser.add_argument("--strategy")
    parser.add_argument("--date")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--request-id")
    try:
        args = parser.parse_args(argv)
        # The path is trusted process configuration, never a chat-command argument.
        path = Path(
            os.environ.get("ATLAS_PAPER_DB_PATH", str(Path.home() / ".atlas/live-paper.sqlite3"))
        )
        response = execute(
            path,
            args.command,
            strategy_id=args.strategy,
            date_value=args.date,
            offset=args.offset,
            request_id=args.request_id,
            authorized=os.environ.get("ATLAS_ALLOW_PAPER_CONTROL") == "1",
        )
    except PermissionError:
        response = {
            "schema": "atlas.owner-command.v1",
            "error": "paper_control_denied",
            "message": "Paper control is disabled or the account is risk halted.",
            "realOrdersEnabled": False,
        }
        code = 2
    except (ValueError, TypeError):
        response = {
            "schema": "atlas.owner-command.v1",
            "error": "invalid_or_unverified_request",
            "message": "The command or recorded paper state could not be verified.",
            "realOrdersEnabled": False,
        }
        code = 2
    except Exception:
        response = {
            "schema": "atlas.owner-command.v1",
            "error": "paper_state_unavailable",
            "message": "Recorded paper state is unavailable.",
            "realOrdersEnabled": False,
        }
        code = 3
    else:
        code = 0
    print(json.dumps(response, separators=(",", ":")))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
