"""Reuse existing LEAN binaries for two isolated, network-denied fixture checks.

No build, restore, package install, credentials, broker or production data writes.
Only the new worktree's .ai directory and a dedicated temporary directory are writable.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

REVIEWED_LEAN_COMMIT = (
    "f24fc0d3df03d6bdbe0e6fc7b8522445f1d900d2"  # pragma: allowlist secret
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--existing-atlas-root", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    existing = args.existing_atlas_root.resolve()
    lean = existing / "Lean"
    dotnet = existing / ".tooling/dotnet/dotnet"
    launcher = lean / "Launcher/bin/Release/QuantConnect.Lean.Launcher.dll"
    algorithm = lean / "Algorithm.CSharp/bin/Release/QuantConnect.Algorithm.CSharp.dll"
    if not all(path.is_file() for path in (dotnet, launcher, algorithm)):
        raise RuntimeError("Existing reviewed LEAN assemblies unavailable; no install attempted")
    revision = subprocess.run(  # noqa: S603 - fixed Git executable, read-only revision query
        ["/usr/bin/git", "-C", str(lean), "rev-parse", "HEAD"],
        env={"PATH": "/usr/bin:/bin"},
        capture_output=True,
        text=True,
        timeout=10,
        check=True,
    ).stdout.strip()
    if revision != REVIEWED_LEAN_COMMIT:
        raise RuntimeError("Existing LEAN revision changed; review required before evaluation")
    target = root / ".ai/lean-isolated"
    target.mkdir(parents=True, exist_ok=True)
    cases = []
    with tempfile.TemporaryDirectory(prefix="atlas-astra-lean-") as temporary:
        for name in ("AtlasCashLimitFixtureAlgorithm", "AtlasPartialFillFixtureAlgorithm"):
            output = target / name
            output.mkdir(exist_ok=True)
            config = {
                "environment": "backtesting",
                "live-mode": False,
                "algorithm-type-name": name,
                "algorithm-language": "CSharp",
                "algorithm-location": str(algorithm),
                "data-folder": str(lean / "Data"),
                "results-destination-folder": str(output),
                "log-file": str(output / "engine.log"),
                "log-handler": "QuantConnect.Logging.CompositeLogHandler",
                "messaging-handler": "QuantConnect.Messaging.Messaging",
                "job-queue-handler": "QuantConnect.Queues.JobQueue",
                "api-handler": "QuantConnect.Api.Api",
                "map-file-provider": "LocalDiskMapFileProvider",
                "factor-file-provider": "LocalDiskFactorFileProvider",
                "data-provider": "DefaultDataProvider",
                "data-channel-provider": "DataChannelProvider",
                "history-provider": ["SubscriptionDataReaderHistoryProvider"],
                "object-store": "LocalObjectStore",
                "object-store-root": str(output / "store"),
                "storage-root": str(output / "store"),
                "setup-handler": "QuantConnect.Lean.Engine.Setup.BacktestingSetupHandler",
                "result-handler": "QuantConnect.Lean.Engine.Results.BacktestingResultHandler",
                "data-feed-handler": "QuantConnect.Lean.Engine.DataFeeds.FileSystemDataFeed",
                "real-time-handler": "QuantConnect.Lean.Engine.RealTime.BacktestingRealTimeHandler",
                "transaction-handler": (
                    "QuantConnect.Lean.Engine.TransactionHandlers.BacktestingTransactionHandler"
                ),
                "job-user-id": 0,
                "job-project-id": 0,
                "api-access-token": "",
            }
            config_path = output / "config.json"
            config_path.write_text(json.dumps(config))
            profile = (
                '(version 1)(allow default)(deny network*)(deny file-write*)'
                '(allow file-write* (subpath ' + json.dumps(str(target)) + '))'
                '(allow file-write* (subpath ' + json.dumps(temporary) + '))'
            )
            environment = {
                "PATH": "/usr/bin:/bin",
                "DOTNET_ROOT": str(dotnet.parent),
                "LANG": "en_US.UTF-8",
                "TZ": "UTC",
                "TMPDIR": temporary,
            }
            completed = subprocess.run(  # noqa: S603 - fixed binaries, no secrets, OS sandbox
                ["/usr/bin/sandbox-exec", "-p", profile, str(dotnet), str(launcher),
                 "--config", str(config_path)],
                cwd=output,
                env=environment,
                input="\n",
                text=True,
                capture_output=True,
                timeout=45,
                check=False,
            )
            log = completed.stdout + "\n" + completed.stderr
            (output / "stdout.log").write_text(log)
            if completed.returncode:
                raise RuntimeError(name + " failed in isolated runtime: " + log[-3500:])
            summary = json.loads((output / (name + "-summary.json")).read_text())
            events = json.loads((output / (name + "-order-events.json")).read_text())
            if summary["state"]["Status"] != "Completed":
                raise RuntimeError("LEAN fixture did not complete")
            statuses = [row.get("status") for row in events]
            quantities = [row.get("fillQuantity") for row in events]
            if name == "AtlasCashLimitFixtureAlgorithm":
                assert statuses == ["invalid"] and quantities == [0.0]
                assert summary["statistics"]["End Equity"] == "1000"
            else:
                assert statuses == ["submitted", "partiallyFilled", "partiallyFilled", "filled"]
                assert quantities == [0.0, 4.0, 4.0, 4.0]
                assert summary["statistics"]["Total Fees"] == "$1.00"
            cases.append({"fixture": name, "status": "PASS", "orderStatuses": statuses,
                          "fillQuantities": quantities, "statistics": summary["statistics"]})
    report = {
        "schema": "atlas.isolated-lean-fill-check.v1",
        "localLeanCommit": REVIEWED_LEAN_COMMIT,
        "existingCheckoutHadChanges": True,
        "existingCheckoutModifiedByThisMission": False,
        "launcherSha256": hashlib.sha256(launcher.read_bytes()).hexdigest(),
        "algorithmAssemblySha256": hashlib.sha256(algorithm.read_bytes()).hexdigest(),
        "scope": (
            "Existing LEAN cash-rejection and capped partial-fill fixtures "
            "on local bundled sample data"
        ),
        "casesPassed": len(cases),
        "networkDeniedByMacOSSandbox": True,
        "newPackagesInstalled": 0,
        "liveMode": False,
        "realOrdersEnabled": False,
        "marketStrategyProfitabilityCertified": False,
        "cases": cases,
    }
    (root / "docs/research/advanced/isolated-lean-fills.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print(json.dumps({"casesPassed": len(cases), "liveMode": False, "networkDenied": True}))


if __name__ == "__main__":
    main()
