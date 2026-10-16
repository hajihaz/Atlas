#!/usr/bin/env python3
"""Build and run real LEAN Atlas golden fixtures, then verify frozen outputs."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOTNET = ROOT / ".tooling/dotnet/dotnet"
LEAN = Path(os.environ.get("ATLAS_LEAN_CANDIDATE_PATH", str(ROOT / "Lean"))).resolve()
DATA = Path(os.environ.get("ATLAS_LEAN_GOLDEN_DATA_PATH", str(LEAN / "Data"))).resolve()

FIXTURES = {
    "AtlasGoldenFixtureAlgorithm": {
        "Total Orders": "1",
        "End Equity": "101284.13",
        "Total Fees": "$2.18",
        "Portfolio Turnover": "20.81%",
    },
    "AtlasGoldenMatrixAlgorithm": {
        "Total Orders": "5",
        "End Equity": "100865.94",
        "Total Fees": "$35.16",
        "Portfolio Turnover": "24.89%",
    },
    "AtlasCashLimitFixtureAlgorithm": {
        "Total Orders": "1",
        "End Equity": "1000",
        "Total Fees": "$0.00",
        "Portfolio Turnover": "0%",
    },
    "AtlasLimitCancelFixtureAlgorithm": {
        "Total Orders": "1",
        "End Equity": "100000",
        "Total Fees": "$0.00",
        "Portfolio Turnover": "0%",
    },
    "AtlasPartialFillFixtureAlgorithm": {
        "Total Orders": "1",
        "End Equity": "100087.61",
        "Total Fees": "$1.00",
        "Portfolio Turnover": "0.16%",
    },
}


def _run_fixture(name: str, expected: dict[str, str], *, env: dict[str, str], dll: Path) -> None:
    launcher = LEAN / "Launcher/bin/Release"
    with tempfile.TemporaryDirectory(prefix=f"atlas-lean-{name}-") as tmp:
        cmd = [
            str(DOTNET),
            "QuantConnect.Lean.Launcher.dll",
            "--algorithm-type-name",
            name,
            "--algorithm-language",
            "CSharp",
            "--algorithm-location",
            str(dll),
            "--data-folder",
            str(DATA),
            "--results-destination-folder",
            tmp,
        ]
        result = subprocess.run(  # noqa: S603 - fixed local LEAN launcher
            cmd, cwd=launcher, env=env, text=True, capture_output=True, timeout=60, input="\n"
        )
        if result.returncode:
            sys.stderr.write(result.stdout + result.stderr)
            raise RuntimeError(f"LEAN fixture failed: {name}")
        summary = json.loads((Path(tmp) / f"{name}-summary.json").read_text())
        stats = summary["statistics"]
        mismatches = {k: (stats.get(k), v) for k, v in expected.items() if stats.get(k) != v}
        if summary["state"]["Status"] != "Completed":
            mismatches["Status"] = (summary["state"]["Status"], "Completed")
        if name == "AtlasCashLimitFixtureAlgorithm":
            order_events = json.loads((Path(tmp) / f"{name}-order-events.json").read_text())
            if len(order_events) != 1 or order_events[0].get("status") != "invalid":
                mismatches["cash_limit_status"] = (order_events, "one invalid order")
        if name == "AtlasLimitCancelFixtureAlgorithm":
            order_events = json.loads((Path(tmp) / f"{name}-order-events.json").read_text())
            status_chain = tuple(event.get("status") for event in order_events)
            order_ids = {event.get("orderId") for event in order_events}
            quantities = tuple(event.get("fillQuantity") for event in order_events)
            limit_prices = tuple(event.get("limitPrice") for event in order_events)
            if (
                status_chain != ("submitted", "cancelPending", "canceled")
                or order_ids != {1}
                or quantities != (0.0, 0.0, 0.0)
                or limit_prices != (0.01, 0.01, 0.01)
            ):
                mismatches["cancelled_limit_order_lifecycle"] = (
                    {
                        "statuses": status_chain,
                        "order_ids": order_ids,
                        "filled_quantities": quantities,
                        "limit_prices": limit_prices,
                    },
                    "submitted -> cancelPending -> canceled, zero fills",
                )
        if name == "AtlasPartialFillFixtureAlgorithm":
            events = json.loads((Path(tmp) / f"{name}-order-events.json").read_text())
            statuses = [item.get("status") for item in events]
            quantities = [item.get("fillQuantity") for item in events]
            ids = {item.get("orderId") for item in events}
            if (
                statuses != ["submitted", "partiallyFilled", "partiallyFilled", "filled"]
                or quantities != [0.0, 4.0, 4.0, 4.0]
                or ids != {1}
            ):
                mismatches["partial_fill_lifecycle"] = (
                    {"statuses": statuses, "quantities": quantities, "ids": sorted(ids)},
                    "one order, partial 4 + partial 4 + final 4",
                )
        if mismatches:
            raise RuntimeError(f"LEAN golden fixture diverged ({name}): {mismatches}")
        print(f"  PASS {name}: " + ", ".join(f"{k}={v}" for k, v in expected.items()))


def _lean_environment(source: dict[str, str]) -> dict[str, str]:
    """Do not let the external LEAN process inherit broker, cloud or user secrets."""
    allowed = ("PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ")
    clean = {name: source[name] for name in allowed if name in source}
    clean["DOTNET_ROOT"] = str(DOTNET.parent)
    return clean


def run() -> int:
    if not DOTNET.is_file():
        raise RuntimeError("Atlas local .NET SDK is missing")
    env = _lean_environment(dict(os.environ))
    fixture_dir = ROOT / "scripts/lean-fixtures"
    algorithm_dir = LEAN / "Algorithm.CSharp"
    for name in FIXTURES:
        fixture = fixture_dir / f"{name}.cs"
        if not fixture.is_file():
            raise RuntimeError(f"required LEAN golden fixture missing: {fixture.name}")
        shutil.copy2(fixture, algorithm_dir / fixture.name)
    subprocess.run(  # noqa: S603 - fixed local dotnet executable and arguments
        [
            str(DOTNET),
            "build",
            "Algorithm.CSharp/QuantConnect.Algorithm.CSharp.csproj",
            "-c",
            "Release",
            "--no-restore",
        ],
        cwd=LEAN,
        env=env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    dll = LEAN / "Algorithm.CSharp/bin/Release/QuantConnect.Algorithm.CSharp.dll"
    shutil.copy2(dll, LEAN / "Launcher/bin/Release" / dll.name)
    for name, expected in FIXTURES.items():
        _run_fixture(name, expected, env=env, dll=dll)
    print(f"LEAN GOLDEN CERTIFICATION: PASS ({len(FIXTURES)} fixtures)")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
