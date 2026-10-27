"""Private source receipts preserve the exact pre-mutation paper input."""

import importlib.util
import json
from pathlib import Path

from atlas.paper.scalpstorm_owner import digest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/run_scalpstorm_owner.py"
spec = importlib.util.spec_from_file_location("owner_worker_under_test", SCRIPT)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def test_source_receipt_reconstructs_exact_input_and_keeps_ranking_once(tmp_path):
    tmp_path.chmod(0o700)
    inp = {
        "observedAt": "2026-10-27T04:10:03+00:00",
        "market": {"marketOpen": True},
        "ranking": {"rows": [{"symbol": "TEST", "volume": 123}]},
        "quotes": [{"symbol": "TEST", "depth": {"buy": {"quantity": 50}}}],
        "realOrdersEnabled": False,
    }
    saved = set()
    worker.archive_input(tmp_path, inp, saved)
    folder = tmp_path / "scalpstorm-observations/2026-10-27"
    receipt = json.loads(next(f for f in folder.glob("*.json") if f.stem.isdigit()).read_text())
    rank = json.loads((folder / ("ranking-" + receipt["rankingSHA256"] + ".json")).read_text())
    reconstructed = {**receipt["input"], "ranking": rank}
    assert reconstructed == inp
    assert digest(reconstructed) == receipt["inputSHA256"]
    inp["observedAt"] = "2026-10-27T04:10:05+00:00"
    worker.archive_input(tmp_path, inp, saved)
    assert len(list(folder.glob("ranking-*.json"))) == 1
    assert len(list(folder.glob("*.json"))) == 3
    assert all(f.stat().st_mode & 0o077 == 0 for f in folder.glob("*.json"))


def test_closed_market_does_not_manufacture_source_receipts(tmp_path):
    worker.archive_input(tmp_path, {"market": {"marketOpen": False}}, set())
    assert not list(tmp_path.iterdir())
