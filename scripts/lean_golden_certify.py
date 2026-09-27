#!/usr/bin/env python3
"""Build and run the real LEAN Atlas golden fixture, then verify known outputs."""

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
LEAN = ROOT / "Lean"


def run() -> int:
    if not DOTNET.is_file():
        raise RuntimeError("Atlas local .NET SDK is missing")
    env = os.environ.copy()
    env["DOTNET_ROOT"] = str(DOTNET.parent)
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
    launcher = LEAN / "Launcher/bin/Release"
    shutil.copy2(dll, launcher / dll.name)
    with tempfile.TemporaryDirectory(prefix="atlas-lean-") as tmp:
        cmd = [
            str(DOTNET),
            "QuantConnect.Lean.Launcher.dll",
            "--algorithm-type-name",
            "AtlasGoldenFixtureAlgorithm",
            "--algorithm-language",
            "CSharp",
            "--algorithm-location",
            str(dll),
            "--data-folder",
            str(LEAN / "Data"),
            "--results-destination-folder",
            tmp,
        ]
        result = subprocess.run(  # noqa: S603 - fixed local LEAN launcher
            cmd,
            cwd=launcher,
            env=env,
            text=True,
            capture_output=True,
            timeout=60,
            input="\n",
        )
        if result.returncode:
            sys.stderr.write(result.stdout + result.stderr)
            return result.returncode
        summary = json.loads((Path(tmp) / "AtlasGoldenFixtureAlgorithm-summary.json").read_text())
        stats = summary["statistics"]
        expected = {
            "Total Orders": "1",
            "End Equity": "101284.13",
            "Total Fees": "$2.18",
            "Portfolio Turnover": "20.81%",
        }
        mismatches = {k: (stats.get(k), v) for k, v in expected.items() if stats.get(k) != v}
        if summary["state"]["Status"] != "Completed":
            mismatches["Status"] = (summary["state"]["Status"], "Completed")
        if mismatches:
            raise RuntimeError(f"LEAN golden fixture diverged: {mismatches}")
        print("LEAN GOLDEN CERTIFICATION: PASS")
        for key, value in expected.items():
            print(f"  {key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
