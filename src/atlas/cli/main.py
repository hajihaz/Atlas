"""Atlas CLI entrypoint.

Phase-2 commands operate on the pure core (calendar, trial ledger, a demo ingestion) and
require no database, so the data foundation is usable and demonstrable from a shell. DB-
backed commands (migrate, load) are thin wrappers over the persistence layer.
"""

from __future__ import annotations

import datetime as _dt

import typer

from atlas import __version__
from atlas.common.errors import DataQualityHalt
from atlas.data.calendars import NSE
from atlas.data.ingestion import FetchRequest, ingest
from atlas.data.ingestion.adapters import MockCsvAdapter
from atlas.data.quality import default_suite
from atlas.trials import JsonlLedgerStore, TrialLedger

app = typer.Typer(help="Atlas — trustworthy market-data foundation (Phase 2).", no_args_is_help=True)
calendar_app = typer.Typer(help="Trading-calendar queries.")
trial_app = typer.Typer(help="Trial-ledger queries.")
app.add_typer(calendar_app, name="calendar")
app.add_typer(trial_app, name="trial")


@app.command()
def version() -> None:
    """Print the Atlas version."""
    typer.echo(f"atlas {__version__}")


@calendar_app.command("sessions")
def calendar_sessions(start: str, end: str) -> None:
    """List NSE session dates in [start, end] (YYYY-MM-DD). Uses the dev-seed holiday set."""
    s, e = _dt.date.fromisoformat(start), _dt.date.fromisoformat(end)
    sessions = NSE.sessions_in_range(s, e)
    typer.echo(f"{len(sessions)} sessions")
    for d in sessions:
        typer.echo(d.isoformat())


@trial_app.command("summary")
def trial_summary(path: str) -> None:
    """Verify integrity and summarize a JSONL trial ledger."""
    ledger = TrialLedger(JsonlLedgerStore(path))
    ledger.verify_integrity()
    typer.echo("ledger integrity: OK")
    for k, v in ledger.summary().items():
        typer.echo(f"{k}: {v}")


@app.command("ingest-demo")
def ingest_demo() -> None:
    """Run a mock ingestion end-to-end and print the quality report (no DB writes)."""
    adapter = MockCsvAdapter(
        {"INFY": ["2024-03-14,100,110,90,105,1000", "2024-03-15,105,112,101,108,1200"]},
        {"INFY": "inst_infy"},
    )
    req = FetchRequest(("INFY",), _dt.date(2024, 3, 14), _dt.date(2024, 3, 15))
    kt = _dt.datetime(2024, 3, 18, 10, 0, tzinfo=_dt.timezone.utc)
    try:
        result = ingest(adapter, req, knowledge_time=kt, suite=default_suite())
    except DataQualityHalt as halt:
        # Fail-safe: a halted ingestion must surface as a non-zero exit, not a green run.
        typer.echo(f"HALTED by data-quality gate: {halt}", err=True)
        raise typer.Exit(code=1) from halt
    typer.echo(f"run: {result.run_id}")
    typer.echo(f"loaded: {len(result.load_set)} versions · findings: {len(result.report.findings)}")


if __name__ == "__main__":  # pragma: no cover
    app()
