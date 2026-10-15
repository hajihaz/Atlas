"""Offline historical LEAN sample-data replay, NEVER evidence of live market paper trading."""

from __future__ import annotations

import datetime as dt
import hashlib
import tempfile
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zipfile import BadZipFile, ZipFile

from atlas.common.hashing import content_hash
from atlas.operations import StateStore
from atlas.paper.evidence import PaperEvidenceEnvelope, seal_paper_evidence
from atlas.paper.runtime import PaperConfig, PaperRuntime
from atlas.paper.session import PaperSessionRunner
from atlas.paper.validation import MultiSessionEvidence, run_sessions

PRICE_SCALE = Decimal("10000")


@dataclass(frozen=True)
class HistoricalBar:
    day: dt.date
    open: Decimal
    close: Decimal


@dataclass(frozen=True)
class HistoricalReplayReport:
    source_kind: str
    sessions: int
    dates: tuple[str, ...]
    source_hashes: dict[str, str]
    snapshot_hash: str
    equity_path: tuple[Decimal, ...]
    evidence: MultiSessionEvidence
    envelope: PaperEvidenceEnvelope


def load_lean_daily(path: Path, *, symbol: str) -> tuple[tuple[HistoricalBar, ...], str]:
    """Validate raw ZIP bytes, chronological rows and positive OHLC prices."""
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    try:
        import io

        with ZipFile(io.BytesIO(raw)) as archive:
            if archive.namelist() != [f"{symbol.lower()}.csv"]:
                raise ValueError("unexpected LEAN daily archive members")
            info = archive.getinfo(f"{symbol.lower()}.csv")
            if info.file_size > 10_000_000:
                raise ValueError("historical source exceeds fixture size limit")
            data = archive.read(info).decode("utf-8")
    except (BadZipFile, UnicodeError) as exc:
        raise ValueError("unreadable LEAN historical sample archive") from exc
    bars: list[HistoricalBar] = []
    previous: dt.date | None = None
    for line in data.splitlines():
        pieces = line.split(",")
        if len(pieces) != 6:
            raise ValueError("invalid LEAN daily OHLCV row")
        try:
            observed = dt.datetime.strptime(pieces[0], "%Y%m%d %H:%M").replace(tzinfo=dt.UTC).date()
            open_px, high, low, close = (Decimal(x) / PRICE_SCALE for x in pieces[1:5])
            volume = int(pieces[5])
        except (ValueError, InvalidOperation) as exc:
            raise ValueError("invalid LEAN daily row value") from exc
        if (
            (previous is not None and observed <= previous)
            or any(not x.is_finite() or x <= 0 for x in (open_px, high, low, close))
            or high < max(open_px, low, close)
            or low > min(open_px, close)
            or volume < 0
        ):
            raise ValueError("unordered or inconsistent LEAN OHLCV data")
        bars.append(HistoricalBar(observed, open_px, close))
        previous = observed
    if len(bars) < 2:
        raise ValueError("historical sample must contain at least two sessions")
    return tuple(bars), digest


def replay_lean_history(
    source_directory: Path,
    *,
    start: dt.date = dt.date(2013, 10, 7),
    sessions: int = 30,
    initial_cash: Decimal = Decimal("100000"),
) -> HistoricalReplayReport:
    """Decision D close, fill D+1 open, mark D+1 close; no broker/network calls."""
    if not 2 <= sessions <= 250 or initial_cash <= 0 or not initial_cash.is_finite():
        raise ValueError("historical replay requires finite starting cash and 2-250 sessions")
    sources = {}
    hashes = {}
    for symbol in ("spy", "aapl"):
        sources[symbol], hashes[symbol] = load_lean_daily(
            source_directory / f"{symbol}.zip", symbol=symbol
        )
    by_symbol = {symbol: {bar.day: bar for bar in bars} for symbol, bars in sources.items()}
    common_days = sorted(set(by_symbol["spy"]) & set(by_symbol["aapl"]))
    common_days = [d for d in common_days if d >= start]
    if len(common_days) < sessions + 1:
        raise ValueError("insufficient aligned historical sessions for next-open fills")
    dates = common_days[: sessions + 1]
    raw_sessions = []
    targets = {"SPY": Decimal("0.2"), "AAPL": Decimal("0.2")}
    for i in range(sessions):
        decision_day, fill_day = dates[i], dates[i + 1]
        raw_sessions.append(
            {
                "session_id": f"historical-{decision_day.isoformat()}",
                "cash": initial_cash,
                "prices": {s.upper(): by_symbol[s][decision_day].close for s in sources},
                "targets": targets,
                "fill_prices": {s.upper(): by_symbol[s][fill_day].open for s in sources},
                "valuation_prices": {s.upper(): by_symbol[s][fill_day].close for s in sources},
                "event_time": dt.datetime.combine(fill_day, dt.time(), tzinfo=dt.UTC).isoformat(),
            }
        )
    snapshot_hash = content_hash(
        {"kind": "historical_lean_fixture", "source_hashes": hashes, "dates": dates}
    )
    config = PaperConfig(enabled=True)
    with tempfile.TemporaryDirectory(prefix="atlas-historical-replay-") as tmp:
        runtime = PaperRuntime(config)
        runner = PaperSessionRunner(runtime, StateStore(Path(tmp) / "state.json"))
        evidence = run_sessions(runner, raw_sessions)
        runtime.ledger.verify_integrity()
        if (
            evidence.runtime_errors
            or not evidence.clean_reconciliations
            or evidence.sessions_completed != sessions
        ):
            raise RuntimeError("historical replay incomplete or unreconciled")
    envelope = seal_paper_evidence(
        evidence,
        strategy_version=(
            "atlas-historical-equalweight-v1+sha256:"
            + hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        ),
        data_snapshot_hash=snapshot_hash,
        configuration={
            "paper_config": asdict(config),
            "targets": targets,
            "timing": "D-close/D+1-open",
        },
    )
    return HistoricalReplayReport(
        "historical_lean_fixture_not_live_paper",
        sessions,
        tuple(day.isoformat() for day in dates),
        hashes,
        snapshot_hash,
        tuple(observation.equity for observation in evidence.observations),
        evidence,
        envelope,
    )
