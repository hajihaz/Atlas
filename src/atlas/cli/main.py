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

app = typer.Typer(
    help="Atlas — trustworthy market-data foundation (Phase 2).", no_args_is_help=True
)
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


@app.command("backtest-demo")
def backtest_demo(drift: float = 0.0) -> None:
    """Run a demo research experiment on synthetic data and print the verdict.

    ``--drift 0`` mines SMA configs on pure noise (rejected); ``--drift 0.001`` embeds a real
    trend (survives). Demonstrates the full funnel: backtest → trial ledger → overfitting
    defenses → evidence gates.
    """
    from atlas.research.dataview import InMemoryBarSource
    from atlas.research.experiment import run_experiment
    from atlas.research.synthetic import random_walk, sessions, unbounded_calendar
    from atlas.strategy.library import SmaCrossover
    from atlas.trials import TrialLedger

    cal = unbounded_calendar()
    dates = sessions(cal, _dt.date(2020, 1, 1), _dt.date(2023, 6, 30))
    source = InMemoryBarSource({"X": random_walk("X", dates, seed=7, drift=drift, vol=0.012)})
    grid = [{"fast": f, "slow": s} for f in (5, 10, 20) for s in (30, 50, 100) if f < s]
    report = run_experiment(
        strategy_factory=lambda p: SmaCrossover(p["fast"], p["slow"]),
        param_grid=grid,
        source=source,
        start=dates[60],
        end=dates[-1],
        calendar=cal,
        ledger=TrialLedger(),
        as_of=_dt.datetime(2023, 7, 1, 12, 0, tzinfo=_dt.UTC),
        seed=1,
        pbo_splits=10,
    )
    for k, v in report.summary().items():
        typer.echo(f"{k}: {v}")


@app.command("ingest-demo")
def ingest_demo() -> None:
    """Run a mock ingestion end-to-end and print the quality report (no DB writes)."""
    adapter = MockCsvAdapter(
        {"INFY": ["2024-03-14,100,110,90,105,1000", "2024-03-15,105,112,101,108,1200"]},
        {"INFY": "inst_infy"},
    )
    req = FetchRequest(("INFY",), _dt.date(2024, 3, 14), _dt.date(2024, 3, 15))
    kt = _dt.datetime(2024, 3, 18, 10, 0, tzinfo=_dt.UTC)
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
