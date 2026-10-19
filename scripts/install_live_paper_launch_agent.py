"""Install persistent macOS user LaunchAgent for Atlas PAPER ONLY.

This never creates broker credentials or exposes a network listener.
Requires the owner's Mac to be powered on, connected and awake.
"""

from __future__ import annotations

import os
import plistlib
import subprocess
import sys
import time
from pathlib import Path

LABEL = "com.hajihaz.atlas.paper"
REPO = Path(__file__).resolve().parents[1]
PYTHON = "/opt/homebrew/opt/python@3.11/bin/python3.11"
PLIST = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"


def main() -> int:
    if not Path(PYTHON).is_file() or not (REPO / "src/atlas/paper/live_runner.py").is_file():
        raise RuntimeError("Atlas Python 3.11 or paper runner missing")
    state = Path.home() / ".atlas"
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    state.chmod(0o700)
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "Label": LABEL,
        "ProgramArguments": [PYTHON, "-m", "atlas.paper.live_runner", "run"],
        "WorkingDirectory": str(REPO),
        "EnvironmentVariables": {"PYTHONPATH": str(REPO / "src"), "PYTHONUNBUFFERED": "1"},
        "RunAtLoad": True,
        "KeepAlive": True,
        "ThrottleInterval": 30,
        "StandardOutPath": str(state / "paper-runner.out.log"),
        "StandardErrorPath": str(state / "paper-runner.err.log"),
    }
    data = plistlib.dumps(payload)
    PLIST.write_bytes(data)
    PLIST.chmod(0o600)
    domain = f"gui/{os.getuid()}"
    subprocess.run(  # noqa: S603 - fixed owner-agent label
        ["/bin/launchctl", "bootout", f"{domain}/{LABEL}"], capture_output=True, check=False
    )
    # launchd may need a short grace period after bootout to relinquish a label.
    bootstrap = None
    for attempt in range(4):
        bootstrap = subprocess.run(  # noqa: S603 - trusted owner-local plist
            ["/bin/launchctl", "bootstrap", domain, str(PLIST)],
            capture_output=True,
            text=True,
            check=False,
        )
        if bootstrap.returncode == 0:
            break
        time.sleep(1 + attempt)
    if bootstrap is None or bootstrap.returncode:
        print(bootstrap.stderr if bootstrap else "bootstrap unavailable", file=sys.stderr)
        return bootstrap.returncode if bootstrap else 1
    subprocess.run(  # noqa: S603 - fixed owner-agent label
        ["/bin/launchctl", "kickstart", "-k", f"{domain}/{LABEL}"],
        capture_output=True,
        check=False,
    )
    print(f"Installed {LABEL}. Local SQLite only, real money disabled.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
