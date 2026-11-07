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
from .three_way import ThreeWayChallenge, instant_ist, preflight_case


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


def run_threeway_casefile(
    data: dict[str, Any], *, state: Path, model: Any = None
) -> dict[str, Any]:
    """Resume a bounded three-book challenge from an auditable local SQLite database.

    The execution receipt and any future exit are never supplied to the LLM.
    Duplicate cases are loaded from the journal without re-billing an LLM.
    """
    if not isinstance(data, dict) or not isinstance(data.get("cases"), list):
        raise ValueError("expected cases array")
    if len(data["cases"]) > 200:
        raise ValueError("bounded to 200 cases per import")
    holidays = data.get("holidays", [])
    if not isinstance(holidays, list) or any(not isinstance(x, str) for x in holidays):
        raise ValueError("holidays must be a list of explicit date strings")
    sessions = data.get("close_sessions", [])
    if not isinstance(sessions, list) or any(not isinstance(x, str) for x in sessions):
        raise ValueError("close_sessions must be an array of dates")
    with ThreeWayChallenge(state, holidays=frozenset(holidays)) as challenge:
        closed_in_batch: set[str] = set()
        cases = data["cases"]
        for index, entry in enumerate(cases):
            if not isinstance(entry, dict):
                raise ValueError("malformed case")
            candidate, execution = entry["candidate"], entry["execution"]
            if challenge.get_existing(candidate, execution) is None:
                preflight_case(candidate, execution, holidays=challenge.holidays)
                review = evaluate_candidate(candidate, model)
                challenge.process(candidate, review, execution)
            current_date = instant_ist(candidate["decision_at"]).date().isoformat()
            next_date = (
                instant_ist(cases[index + 1]["candidate"]["decision_at"]).date().isoformat()
                if index + 1 < len(cases)
                else None
            )
            if current_date in sessions and next_date != current_date:
                challenge.end_session(current_date)
                closed_in_batch.add(current_date)
        for date in sessions:
            if date not in closed_in_batch:
                challenge.end_session(date)
        return challenge.report()


def main() -> None:
    parser = argparse.ArgumentParser(description="Atlas Debate X research-only command")
    parser.add_argument("--input", required=True, help="point-in-time evidence JSON; no secrets")
    parser.add_argument("--output", required=True, help="report JSON destination")
    parser.add_argument(
        "--three-way",
        action="store_true",
        help="15-session, three-book comparison with externally dated entry/exit receipts",
    )
    parser.add_argument(
        "--state",
        help="local private SQLite path; required for resumable --three-way",
    )
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
    if args.three_way:
        if not args.state:
            parser.error("--three-way requires an explicit local --state path")
        private_state = Path(args.state).resolve()
        if private_state in {source, destination}:
            parser.error("state must not overwrite input/output")
        report = run_threeway_casefile(data, state=private_state, model=model)
    else:
        if args.state:
            parser.error("--state is for --three-way only")
        report = run_casefile(data, model=model)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        f"Debate X {report['status']}: {report['trade_count']} closed paper-only cases; "
        f"model_connected={report['connected_model']}, output={destination}"
    )


if __name__ == "__main__":
    main()
