#!/usr/bin/env python3
"""Verify patched LEAN Compression without loading the Python.NET test host."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOTNET = ROOT / ".tooling/dotnet/dotnet"
PROJECT = ROOT / "scripts/lean-smoke/LeanCompressionSmoke.csproj"
SUCCESS_MARKER = "LEAN INDEPENDENT COMPRESSION: PASS (ZIP payload bytes round-trip)"


def certified_compression_result(output: str, exit_code: int) -> bool:
    return exit_code == 0 and SUCCESS_MARKER in output.splitlines()


def main() -> int:
    if not DOTNET.is_file() or not PROJECT.is_file():
        raise RuntimeError("independent LEAN smoke project or SDK is missing")
    allowed = ("PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ")
    env = {key: os.environ[key] for key in allowed if key in os.environ}
    env["DOTNET_ROOT"] = str(DOTNET.parent)
    completed = subprocess.run(  # noqa: S603 - local pinned .NET executable
        [
            str(DOTNET),
            "run",
            "--project",
            str(PROJECT),
            "-c",
            "Release",
            "--no-restore",
        ],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=75,
    )
    output = completed.stdout + "\n" + completed.stderr
    if not certified_compression_result(completed.stdout, completed.returncode):
        raise RuntimeError("independent LEAN compression failed; runtime output: " + output[-1800:])
    print(SUCCESS_MARKER)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
