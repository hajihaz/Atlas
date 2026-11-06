"""Run opt-in Debate X shadow research on evidence packets without touching broker APIs.

Example:
  PYTHONPATH=src python -m atlas.debate_x.cli \
    --input /path/to/packets.json --output /tmp/debate-x-report.json
Input shape: {"cases":[{"candidate":{...},"closed":{...}}, ...]}
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .engine import evaluate_candidate
from .providers import APIModel
from .shadow import PairedPaperReplay


def run_casefile(data: dict[str, Any], *, model: Any = None) -> dict[str, Any]:
    if not isinstance(data, dict) or not isinstance(data.get("cases"), list):
        raise ValueError("expected cases array")
    if len(data["cases"]) > 200:
        raise ValueError("bounded to 200 cases per run")
    replay = PairedPaperReplay()
    evaluations: list[dict[str, Any]] = []
    for item in data["cases"]:
        if not isinstance(item, dict):
            raise ValueError("invalid case")
        candidate = item["candidate"]
        review = evaluate_candidate(candidate, model)
        evaluations.append(review)
        # Closed outcomes are never passed to the model and never included in a prompt.
        if "closed" in item:
            replay.settle(candidate, review, item["closed"])
    report = replay.report()
    report["evaluations"] = evaluations
    report["connected_model"] = model is not None
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Atlas Debate X research-only command")
    parser.add_argument("--input", required=True, help="point-in-time evidence JSON; no secrets")
    parser.add_argument("--output", required=True, help="report JSON destination")
    parser.add_argument(
        "--enable-llm",
        action="store_true",
        help="explicit opt-in; API usage may incur provider charges",
    )
    args = parser.parse_args()
    # Intentional: never start outbound LLM calls by default.
    model = APIModel.from_environment() if args.enable_llm else None
    source = Path(args.input).resolve(strict=True)
    destination = Path(args.output).resolve()
    if source == destination:
        parser.error("output cannot overwrite the input evidence file")
    data = json.loads(source.read_text(encoding="utf-8"))
    report = run_casefile(data, model=model)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        f"Debate X {report['status']}: {report['trade_count']} closed paper-only cases; "
        f"model_connected={report['connected_model']}, output={destination}"
    )


if __name__ == "__main__":
    main()
