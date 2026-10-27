#!/usr/bin/env python3
"""Install the verified owner-local paper desk, preserving all retired journals."""

from __future__ import annotations

import json
import os
import plistlib
import shutil
import subprocess
from pathlib import Path

from atlas.integrations.nse_observer import private_directory, save_snapshot
from atlas.paper.scalpstorm_owner import OwnerStore

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    raw = ROOT / ".ai/raw/owner-primary-strategy-20261027"
    checks = json.loads((raw / "checks-37.json").read_text())
    repaired = json.loads((raw / "environment-39.json").read_text())
    if any(checks[name].get("code") != 0 for name in ("lint", "frontend", "build")) or any(
        repaired[name].get("code") != 0 for name in ("changedSourceTypecheck", "changedTests")
    ):
        raise ValueError("verified build, accounting, type and API checks required")
    capacity = json.loads((raw / "capacity-final-28.json").read_text())
    if capacity.get("complete") is not True or capacity.get("elapsedSeconds", 1000) >= 60:
        raise ValueError("complete timely broad source capture required")
    state = ROOT / ".atlas-runtime"
    private_directory(state)
    backup = state / "retired-services-20261027"
    private_directory(backup)
    agents = Path.home() / "Library/LaunchAgents"
    domain = "gui/" + str(os.getuid())
    log = []

    def launch(*args: str) -> int:
        result = subprocess.run(  # noqa: S603 - fixed owner labels and paths from this installer
            ["/bin/launchctl", *args], capture_output=True, timeout=10, check=False
        )
        log.append({"action": list(args), "code": result.returncode})
        return result.returncode

    for label in (
        "com.hajihaz.atlas.nse-observer",
        "com.hajihaz.atlas.nse-paper",
        "com.hajihaz.atlas.paper",
        "com.hajihaz.atlas.owner-ui",
        "com.hajihaz.atlas.report-publisher",
    ):
        original = agents / (label + ".plist")
        if original.exists() and not (backup / original.name).exists():
            shutil.copy2(original, backup / original.name)
            (backup / original.name).chmod(0o600)
        launch("bootout", domain + "/" + label)
        launch("disable", domain + "/" + label)
    history = state / "scalpstorm-history.json"
    if not history.exists():
        shutil.copyfile(raw / "capture/scalpstorm-history.json", history)
        history.chmod(0o600)
    # Open/verify existing state if present. Never reset this one account.
    import time

    store = OwnerStore(state / "scalpstorm-owner.sqlite3", round(time.time() * 1000))
    store.close()
    python = str(ROOT / ".venv/bin/python")
    env = {
        "PATH": "/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin",
        "HOME": str(Path.home()),
        "PYTHONPATH": str(ROOT / "src"),
    }
    jobs = [
        (
            "com.hajihaz.atlas.scalpstorm-source",
            [
                python,
                str(ROOT / "scripts/run_scalpstorm_source.py"),
                "--upstox-credential-file",
                str(Path.home() / ".config/atlas/credentials/upstox-analytics.env"),
                "--state-dir",
                str(state),
            ],
            True,
        ),
        (
            "com.hajihaz.atlas.scalpstorm-paper",
            [python, str(ROOT / "scripts/run_scalpstorm_owner.py"), "--state-dir", str(state)],
            True,
        ),
        (
            "com.hajihaz.atlas.scalpstorm-audit",
            [python, str(ROOT / "scripts/audit_scalpstorm_session.py"), "--state-dir", str(state)],
            False,
        ),
        (
            "com.hajihaz.atlas.ipo-source",
            [python, str(ROOT / "scripts/update_permitted_ipo.py")],
            False,
        ),
        (
            "com.hajihaz.atlas.nse-owner-ui",
            ["/opt/homebrew/opt/node@24/bin/node", str(ROOT / "frontend/server.js")],
            True,
        ),
    ]
    jobs.append(
        (
            "com.hajihaz.atlas.scalpstorm-history",
            [
                python,
                str(ROOT / "scripts/scalpstorm_owner_history.py"),
                "--upstox-credential-file",
                str(Path.home() / ".config/atlas/credentials/upstox-analytics.env"),
                "--state-dir",
                str(state),
            ],
            False,
        )
    )
    for label, argv, keep in jobs:
        path = agents / (label + ".plist")
        if path.is_symlink():
            raise ValueError("unsafe owner service file")
        if path.exists():
            launch("bootout", domain + "/" + label)
        job = {
            "Label": label,
            "ProgramArguments": argv,
            "WorkingDirectory": str(ROOT),
            "EnvironmentVariables": {
                **env,
                **(
                    {"ATLAS_OWNER_READ_ONLY": "1", "ATLAS_OWNER_PORT": "4310"}
                    if label.endswith("nse-owner-ui")
                    else {}
                ),
            },
            "RunAtLoad": True,
            "ThrottleInterval": 30,
            "StandardOutPath": str(state / (label + ".out.log")),
            "StandardErrorPath": str(state / (label + ".err.log")),
        }
        if label.endswith("scalpstorm-history"):
            job["StartCalendarInterval"] = {"Hour": 8, "Minute": 30}
        else:
            job.update(
                {"KeepAlive": True}
                if keep
                else {"StartInterval": 60 if label.endswith("scalpstorm-audit") else 300}
            )
        path.write_bytes(plistlib.dumps(job))
        path.chmod(0o600)
        launch("enable", domain + "/" + label)
        if launch("bootstrap", domain, str(path)) != 0:
            raise RuntimeError("owner service bootstrap failed")
    save_snapshot(
        state / "scalpstorm-installation.json",
        {
            "schema": "atlas.owner-install.v1",
            "realOrdersEnabled": False,
            "actualCapitalINR": 0,
            "actions": log,
            "retiredJournalsPreserved": True,
            "ownerURL": "http://127.0.0.1:4310/#nse-paper",
        },
    )
    print(json.dumps({"installed": [j[0] for j in jobs], "realOrdersEnabled": False}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
