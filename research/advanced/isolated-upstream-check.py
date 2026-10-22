"""Execute one pinned Apache-2.0 FinRL weight method with a tiny DataFrame test shim.

This is a limited contract check, NOT a full FinRL/pandas/backtest execution.
No packages are installed and no upstream source is copied into the repository.
Run after the optional read-only upstream audit populated the private source cache.
"""
from __future__ import annotations

import ast
import hashlib
import json
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVIEWED_FINRL_COMMIT = (
    "4409abe925c904e570be78ebfb5e77ac3491dff8"  # pragma: allowlist secret
)
REVIEWED_SOURCE_SHA256 = (
    "9eef583bf44256391f3c4097e986a0e82da411c22de03fa594bfe8605803e314"  # pragma: allowlist secret
)


class Column:
    def __init__(self, values):
        self.values = values

    def unique(self):
        return list(dict.fromkeys(self.values))


class Frame:
    def __init__(self, data):
        self.data = data

    def __getitem__(self, key):
        return Column(self.data[key])


def main() -> None:
    evidence = json.loads((ROOT / "docs/research/advanced/upstream-evidence.json").read_text())
    candidate = next(row for row in evidence["repositories"] if row["id"] == "finrlx")
    if candidate["repositoryLicenseSPDX"] != "Apache-2.0":
        raise RuntimeError("License changed; isolated execution withheld")
    if candidate["pinnedCommit"] != REVIEWED_FINRL_COMMIT:
        raise RuntimeError("Unreviewed revision; isolated execution withheld")
    path = ROOT / ".ai/astra-upstream-source/finrlx-src_strategies_base_strategy.py"
    source = path.read_text()
    observed_hash = hashlib.sha256(source.encode()).hexdigest()
    expected = next(
        row for row in candidate["files"] if row["path"] == "src/strategies/base_strategy.py"
    )
    if observed_hash != expected["sha256"]:
        raise RuntimeError("Pinned source hash mismatch")
    if observed_hash != REVIEWED_SOURCE_SHA256:
        raise RuntimeError("Source differs from the independently reviewed method")
    tree = ast.parse(source)
    allowed_imports = {"__future__", "dataclasses", "typing", "pandas"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(alias.name not in allowed_imports for alias in node.names):
                raise RuntimeError("Unreviewed import")
        elif isinstance(node, ast.ImportFrom) and node.module not in allowed_imports:
            raise RuntimeError("Unreviewed import")
    pandas = types.ModuleType("pandas")
    pandas.DataFrame = Frame
    sys.modules["pandas"] = pandas
    module = types.ModuleType("atlas_isolated_finrl_method")
    sys.modules[module.__name__] = module
    # Exact Apache source hash and its short module/imports were inspected before this test.
    exec(compile(tree, str(path), "exec"), module.__dict__)  # noqa: S102
    strategy = module.create_strategy("equal_weight", module.StrategyConfig(name="FixtureOnly"))
    tickers = ["FIXTURE_" + str(i) for i in range(10)]
    weights = strategy.generate_weights({"fundamentals": Frame({"gvkey": tickers})}).weights.data
    assert weights["gvkey"] == tickers
    assert all(abs(weight - 0.1) < 1e-12 for weight in weights["weight"])
    duplicate = strategy.generate_weights(
        {"fundamentals": Frame({"gvkey": tickers + tickers})}
    ).weights.data
    assert len(duplicate["weight"]) == 10
    try:
        strategy.generate_weights({"fundamentals": Frame({"gvkey": []})})
    except ZeroDivisionError:
        empty_behavior = "ZERO_DIVISION_ERROR_ATLAS_MUST_REJECT_EMPTY_UNIVERSE"
    else:
        raise AssertionError("Upstream empty-universe behavior changed")
    try:
        module.create_strategy("unregistered", module.StrategyConfig())
    except ValueError:
        unknown_behavior = "REJECTED"
    else:
        raise AssertionError("Unknown factory type accepted")
    report = {
        "schema": "atlas.isolated-upstream-check.v1",
        "repository": candidate["repository"],
        "revision": candidate["pinnedCommit"],
        "sourceSha256": observed_hash,
        "method": "ISOLATED_UPSTREAM_EQUAL_WEIGHT_METHOD_WITH_MINIMAL_DATAFRAME_SHIM",
        "fullFrameworkExecuted": False,
        "pandasInstalled": False,
        "casesPassed": 4,
        "normalTenStockWeights": weights["weight"],
        "allocationFor100000INR": [100000 * weight for weight in weights["weight"]],
        "duplicateTickers": "DEDUPLICATED",
        "emptyUniverse": empty_behavior,
        "unknownStrategy": unknown_behavior,
        "marketPerformanceMeasured": False,
        "packagesInstalled": 0,
        "realOrdersEnabled": False,
    }
    (ROOT / "docs/research/advanced/isolated-finrl-contract.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print(json.dumps(report))


if __name__ == "__main__":
    main()
