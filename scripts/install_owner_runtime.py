"""Install two local-only owner services after verification. No broker runner changes."""

from __future__ import annotations

import argparse
import json
import os
import plistlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".atlas-runtime"
JOBS = {
    "com.hajihaz.atlas.owner-ui": [
        "/opt/homebrew/opt/node@24/bin/node",
        str(ROOT / "scripts/run_owner_runtime.mjs"),
    ],
    "com.hajihaz.atlas.owner-observer": [
        str(ROOT / ".venv-runtime/bin/python"),
        "-m",
        "atlas.runtime.observer",
        "run",
    ],
}


def payloads() -> dict[str, dict]:
    return {
        label: {
            "Label": label,
            "ProgramArguments": args,
            "WorkingDirectory": str(ROOT),
            "EnvironmentVariables": {
                "PYTHONPATH": str(ROOT / "src"),
                "PATH": "/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin",
                "PYTHONUNBUFFERED": "1",
                "ATLAS_PAPER_RISK_GUARD": "1",
            },
            "RunAtLoad": True,
            "KeepAlive": True,
            "ThrottleInterval": 30,
            "StandardOutPath": str(STATE / (label + ".out.log")),
            "StandardErrorPath": str(STATE / (label + ".err.log")),
        }
        for label, args in JOBS.items()
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--install", action="store_true")
    args = parser.parse_args()
    jobs = payloads()
    if not args.install:
        print(json.dumps(jobs, indent=2))
        return 0
    if sys.platform != "darwin":
        raise RuntimeError("macOS user LaunchAgents required")
    if not (ROOT / "frontend/dist/index.html").is_file():
        raise RuntimeError("Verified production build required")
    for _label, argv in JOBS.items():
        if not Path(argv[0]).is_file():
            raise RuntimeError("Pinned runtime missing")
    STATE.mkdir(mode=0o700, exist_ok=True)
    if STATE.is_symlink():
        raise RuntimeError("Unsafe owner state directory")
    domain = f"gui/{os.getuid()}"
    folder = Path.home() / "Library/LaunchAgents"
    folder.mkdir(parents=True, exist_ok=True)
    for label, value in jobs.items():
        dest = folder / (label + ".plist")
        if dest.exists():
            old = plistlib.loads(dest.read_bytes())
            if old.get("WorkingDirectory") != str(ROOT):
                raise RuntimeError("Existing owner service points to another checkout")
            subprocess.run(  # noqa: S603 - fixed user LaunchAgent label
                ["/bin/launchctl", "bootout", domain + "/" + label],
                capture_output=True,
                check=False,
            )
        temp = STATE / (label + ".plist.tmp")
        temp.write_bytes(plistlib.dumps(value))
        temp.chmod(0o600)
        # This is an owner-authorized user agent, not a privileged system daemon.
        dest.write_bytes(temp.read_bytes())
        dest.chmod(0o600)
        temp.unlink()
        process = subprocess.run(  # noqa: S603 - fixed user LaunchAgent plist
            ["/bin/launchctl", "bootstrap", domain, str(dest)],
            capture_output=True,
            text=True,
            check=False,
        )
        if process.returncode:
            raise RuntimeError("Owner service bootstrap failed")
    print(
        json.dumps(
            {"installed": list(jobs), "url": "http://127.0.0.1:4300", "realOrdersEnabled": False}
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
