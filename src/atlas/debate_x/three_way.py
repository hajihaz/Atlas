"""Three-way, 15-session, resumable and strictly shadow-only Atlas research challenge.

Execution receipts are externally supplied and independently timestamped; no
broker tokens, network fetch, live order method, or market-data rights are implied.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import sqlite3
from dataclasses import asdict, dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from atlas.risk.gate import RiskGate

from .costs import IndiaCostModel, paisa
from .evidence import Candidate, EvidenceError, positive_money, timestamp

IST = ZoneInfo("Asia/Kolkata")
START = Decimal("100000")
MAX_TRADE = Decimal("10000")
MAX_SESSIONS = 15
MAX_CASES = 1500
CUTOFF = dt.time(14, 45)
OPEN = dt.time(9, 15)
CLOSE = dt.time(15, 30)
QUOTE_AGE_SEC = 90
ENTRY_LATENCY_SEC = 180


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def content_hash(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def instant_ist(value: str) -> dt.datetime:
    return timestamp(value).astimezone(IST)


@dataclass(frozen=True)
class ExecutionQuote:
    source: str
    observed_at: str
    received_at: str
    price_inr: Decimal
    bar_volume: Decimal

    @classmethod
    def parse(
        cls, raw: dict[str, Any], *, earliest: dt.datetime, latest: dt.datetime
    ) -> ExecutionQuote:
        if not isinstance(raw, dict) or raw.get("market") != "NSE":
            raise EvidenceError("execution quote requires explicitly attributed NSE market")
        source = raw.get("source")
        if not isinstance(source, str) or not source.strip() or len(source) > 300:
            raise EvidenceError("attributed execution source required")
        observed = timestamp(raw.get("observed_at", ""))
        received = timestamp(raw.get("received_at", ""))
        if not earliest <= observed <= received <= latest:
            raise EvidenceError("execution quote occurs outside permitted as-of window")
        if (received - observed).total_seconds() > QUOTE_AGE_SEC:
            raise EvidenceError("stale exchange observation cannot execute")
        if instant_ist(raw["received_at"]).time() > CLOSE:
            raise EvidenceError("no intraday execution after exchange close")
        return cls(
            source=source,
            observed_at=raw["observed_at"],
            received_at=raw["received_at"],
            price_inr=positive_money(raw.get("price_inr"), "execution price"),
            bar_volume=positive_money(raw.get("bar_volume"), "execution bar volume"),
        )


def rule_decision(packet: dict[str, Any], candidate: Candidate) -> tuple[bool, str]:
    """A deliberately simple independent rules benchmark, never labeled an AI agent."""
    values = packet.get("indicators")
    if not isinstance(values, dict):
        return False, "NO_INDICATORS"
    try:
        observed = timestamp(values.get("as_of", ""))
        received = timestamp(values.get("received_at", ""))
        decision = timestamp(candidate.decision_at)
        if (
            not observed <= received <= decision
            or (decision - received).total_seconds() > QUOTE_AGE_SEC
            or (received - observed).total_seconds() > QUOTE_AGE_SEC
        ):
            return False, "STALE_INDICATORS"
        if not isinstance(values.get("source"), str) or not values["source"].strip():
            return False, "UNATTRIBUTED_INDICATORS"
        # These thresholds define this comparator, NOT any existing Atlas strategy.
        sma9 = positive_money(values.get("sma9"), "sma9")
        sma21 = positive_money(values.get("sma21"), "sma21")
        vwap = positive_money(values.get("vwap"), "vwap")
        rsi = positive_money(values.get("rsi14"), "rsi14")
        vol = positive_money(values.get("volume_ratio"), "volume_ratio")
        momentum = Decimal(str(values.get("momentum_30m_pct")))
        if not momentum.is_finite() or not Decimal("-100") <= momentum <= Decimal("100"):
            raise EvidenceError("unbounded momentum")
        if not Decimal("0") <= rsi <= Decimal("100"):
            raise EvidenceError("RSI out of range")
        valid = (
            sma9 > sma21
            and Decimal("52") <= rsi <= Decimal("68")
            and candidate.entry_price_inr > vwap
            and momentum > Decimal("0.15")
            and vol >= Decimal("1.2")
        )
        return valid, "RULES_PASS" if valid else "RULES_REJECT"
    except (EvidenceError, ArithmeticError, ValueError, TypeError):
        return False, "INVALID_INDICATORS"


def reviewed_approval(review: dict[str, Any], candidate: Candidate) -> bool:
    """Fail-closed validation of LLM response binding before treating it as a filter."""
    if (
        not isinstance(review, dict)
        or review.get("schema") != 1
        or review.get("mode") != "SHADOW_PAPER_ONLY"
        or review.get("candidate_id") != candidate.id
        or review.get("live_orders_enabled") is not False
        or review.get("real_orders_placed") != 0
    ):
        raise EvidenceError("invalid shadow review boundary")
    if review.get("status") != "REVIEWED":
        return False
    if (
        review.get("snapshot_id") != candidate.snapshot_id
        or review.get("decision_time") != candidate.decision_at
        or review.get("strategy_id") != candidate.strategy_id
        or review.get("symbol") != candidate.symbol
    ):
        raise EvidenceError("review does not match source candidate")
    agents = review.get("agents")
    if not isinstance(agents, list) or len(agents) != 3:
        raise EvidenceError("review requires three independently recorded roles")
    valid = {entry.id for entry in candidate.evidence}
    for agent, role in zip(agents, ("bull", "bear", "judge"), strict=True):
        if not isinstance(agent, dict) or agent.get("role") != role:
            raise EvidenceError("invalid agent role or order")
        refs = agent.get("evidence_ids")
        if (
            not isinstance(refs, list)
            or not refs
            or not all(isinstance(ref, str) and ref in valid for ref in refs)
        ):
            raise EvidenceError("uncited or fabricated agent evidence")
    if review.get("judge_stance") != agents[2].get("stance"):
        raise EvidenceError("judge stance mismatch")
    if review.get("decision") == "APPROVE":
        if (
            review["judge_stance"] != "APPROVE"
            or review.get("risk_approved") is not True
            or review.get("shadow_action") != "PAPER_CANDIDATE"
        ):
            raise EvidenceError("invalid AI approval")
        return True
    if review.get("decision") != "SKIP":
        raise EvidenceError("invalid AI decision")
    return False


def preflight_case(
    packet: dict[str, Any],
    execution: dict[str, Any],
    *,
    holidays: frozenset[str] = frozenset(),
) -> tuple[Candidate, dt.date, ExecutionQuote, ExecutionQuote]:
    """Reject invalid or stale prices BEFORE launching a potentially paid LLM call."""
    candidate = Candidate.parse(packet)
    signal = timestamp(candidate.decision_at)
    session_day = instant_ist(candidate.decision_at).date()
    day_str = session_day.isoformat()
    if session_day.weekday() >= 5 or day_str in holidays:
        raise EvidenceError("not an eligible NSE trading day")
    if not OPEN <= instant_ist(candidate.decision_at).time() <= CUTOFF:
        raise EvidenceError("new entry beyond allowed NSE intraday window")
    if not isinstance(execution, dict):
        raise EvidenceError("execution must provide dated price observations")
    completed = timestamp(execution.get("decision_completed_at", ""))
    if not signal <= completed <= signal + dt.timedelta(seconds=ENTRY_LATENCY_SEC):
        raise EvidenceError("unbounded or before-signal model decision latency")
    upper = signal + dt.timedelta(seconds=ENTRY_LATENCY_SEC)
    entry = ExecutionQuote.parse(execution.get("entry_quote", {}), earliest=completed, latest=upper)
    exit_quote = ExecutionQuote.parse(
        execution.get("exit_quote", {}),
        earliest=timestamp(entry.received_at) + dt.timedelta(microseconds=1),
        latest=timestamp(day_str + "T15:30:00+05:30"),
    )
    if instant_ist(exit_quote.received_at).date() != session_day:
        raise EvidenceError("intraday exit must be same NSE session")
    if exit_quote.source != entry.source:
        raise EvidenceError("execution price provenance changed")
    return candidate, session_day, entry, exit_quote


class ThreeWayChallenge:
    """Local SQLite, atomic resume, SHA-256 chained rows. No broker connectivity."""

    def __init__(
        self,
        state: Path,
        *,
        charges: IndiaCostModel | None = None,
        holidays: frozenset[str] = frozenset(),
    ):
        self.charges = charges or IndiaCostModel()
        self.holidays = holidays
        self.path = Path(state)
        if self.path.suffix != ".sqlite3":
            raise ValueError("state path must end .sqlite3")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        self.db.execute("PRAGMA busy_timeout=10000")
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
        )
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS trades ("
            "idx INTEGER PRIMARY KEY AUTOINCREMENT, candidate_id TEXT UNIQUE NOT NULL,"
            "case_hash TEXT NOT NULL, body TEXT NOT NULL, chain_hash TEXT NOT NULL)"
        )
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS sessions ("
            "session_date TEXT PRIMARY KEY, closed_at TEXT NOT NULL)"
        )
        config_digest = content_hash(
            {
                "schema": 2,
                "capital": str(START),
                "max_trade": str(MAX_TRADE),
                "max_sessions": MAX_SESSIONS,
                "charges": {k: str(v) for k, v in asdict(self.charges).items()},
                "holidays": sorted(self.holidays),
            }
        )
        stored = self.db.execute("SELECT value FROM meta WHERE key='config'").fetchone()
        if stored is None:
            self.db.execute("INSERT INTO meta(key,value) VALUES('config',?)", (config_digest,))
        elif stored[0] != config_digest:
            raise EvidenceError("resumed challenge configuration mismatch")
        self._rows()  # Verify chain on every open; never silently accept altered journal.

    def close(self) -> None:
        self.db.close()

    def __enter__(self) -> ThreeWayChallenge:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _rows(self) -> list[dict[str, Any]]:
        chain = "0" * 64
        rows: list[dict[str, Any]] = []
        for case_hash, body, saved in self.db.execute(
            "SELECT case_hash,body,chain_hash FROM trades ORDER BY idx"
        ):
            row: dict[str, Any] = json.loads(body)
            without_hash = dict(row)
            without_hash.pop("chain_hash", None)
            chain = hashlib.sha256(
                (chain + case_hash + canonical(without_hash)).encode("utf-8")
            ).hexdigest()
            if chain != saved or row.get("chain_hash") != saved:
                raise EvidenceError("paper journal chain mismatch")
            rows.append(row)
        return rows

    def sessions(self) -> list[str]:
        return [
            r[0]
            for r in self.db.execute(
                "SELECT session_date FROM sessions ORDER BY session_date"
            ).fetchall()
        ]

    def get_existing(
        self, packet: dict[str, Any], execution: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Skip duplicate paid LLM calls when an identical case has already settled."""
        candidate_id = packet.get("id") if isinstance(packet, dict) else None
        if not isinstance(candidate_id, str):
            raise EvidenceError("candidate id missing")
        result = self.db.execute(
            "SELECT body FROM trades WHERE candidate_id=?", (candidate_id,)
        ).fetchone()
        if result is None:
            return None
        existing: dict[str, Any] = json.loads(result[0])
        if existing.get("input_hash") != content_hash(
            {
                "candidate": packet,
                "execution": execution,
            }
        ):
            raise EvidenceError("resumed candidate/quotes changed")
        return existing

    def _book(self, rows: list[dict[str, Any]], key: str) -> Decimal:
        return START + sum(Decimal(row[key + "_pnl_inr"]) for row in rows)

    def process(
        self, packet: dict[str, Any], review: dict[str, Any], execution: dict[str, Any]
    ) -> dict[str, Any]:
        """One completed serial case. Source/quote failures never modify the journal."""
        candidate, session_day, entry, exit_quote = preflight_case(
            packet, execution, holidays=self.holidays
        )
        allowed_ai = reviewed_approval(review, candidate)
        day_str = session_day.isoformat()
        case_hash = content_hash({"candidate": packet, "review": review, "execution": execution})
        self.db.execute("BEGIN IMMEDIATE")
        try:
            found = self.db.execute(
                "SELECT case_hash,body FROM trades WHERE candidate_id=?", (candidate.id,)
            ).fetchone()
            if found is not None:
                if found[0] != case_hash:
                    raise EvidenceError("resumed candidate data or verdict changed")
                self.db.execute("COMMIT")
                cached: dict[str, Any] = json.loads(found[1])
                return cached
            if day_str in self.sessions():
                raise EvidenceError("session already closed")
            rows = self._rows()
            if len(rows) >= MAX_CASES:
                raise EvidenceError("three-way journal case limit reached")
            closed = self.sessions()
            if len(closed) >= MAX_SESSIONS:
                raise EvidenceError("15-session challenge already complete")
            if rows:
                prev = rows[-1]
                if timestamp(candidate.decision_at) <= timestamp(prev["decision_at"]):
                    raise EvidenceError("signals must increase chronologically")
                if timestamp(candidate.decision_at) < timestamp(prev["exit_at"]):
                    raise EvidenceError("overlapping serial paper trades unsupported")
            if closed and day_str <= closed[-1]:
                raise EvidenceError("cannot add data to an earlier finished session")
            if (
                day_str not in {r["session_date"] for r in rows}
                and len({r["session_date"] for r in rows}) >= MAX_SESSIONS
            ):
                raise EvidenceError("15 distinct observed sessions already recorded")
            rule_ok, rule_reason = rule_decision(packet, candidate)
            gate = RiskGate()
            books: dict[str, dict[str, str | int]] = {}
            vals = {
                "baseline": self._book(rows, "baseline"),
                "rules": self._book(rows, "rules"),
                "filtered": self._book(rows, "filtered"),
            }
            for name, selected in (
                ("baseline", True),
                ("rules", rule_ok),
                ("filtered", allowed_ai),
            ):
                book = vals[name]
                # A 3% session loss halt (also in Breaking Money's Balanced concept).
                prior = [r for r in rows if r["session_date"] == day_str]
                session_start = book - sum(Decimal(r[name + "_pnl_inr"]) for r in prior)
                loss_halt = book < session_start * Decimal("0.97")
                veto = not gate.evaluate(
                    {candidate.symbol: Decimal("0.10")},
                    equity=book,
                    data_fresh=True,
                    kill_switch=loss_halt,
                ).approved
                books[name] = (
                    self.charges.simulate(
                        min(MAX_TRADE, book),
                        entry.price_inr,
                        exit_quote.price_inr,
                        entry.bar_volume,
                        exit_quote.bar_volume,
                    )
                    if selected and not veto
                    else {
                        "shares": 0,
                        "pnl_inr": "0.00",
                        "charges_inr": "0.00",
                        "entry_fill_inr": "0",
                        "exit_fill_inr": "0",
                    }
                )
            row: dict[str, Any] = {
                "candidate_id": candidate.id,
                "strategy_id": candidate.strategy_id,
                "symbol": candidate.symbol,
                "session_date": day_str,
                "decision_at": candidate.decision_at,
                "exit_at": exit_quote.received_at,
                "execution_source": entry.source,
                "snapshot_id": candidate.snapshot_id,
                "entry_quote_inr": str(entry.price_inr),
                "exit_quote_inr": str(exit_quote.price_inr),
                "entry_observed_at": entry.observed_at,
                "entry_received_at": entry.received_at,
                "exit_observed_at": exit_quote.observed_at,
                "review_status": review.get("status"),
                "ai_decision": "APPROVE" if allowed_ai else "SKIP",
                "rules_decision": "APPROVE" if rule_ok else "SKIP",
                "rules_reason": rule_reason,
                "baseline_pnl_inr": books["baseline"]["pnl_inr"],
                "rules_pnl_inr": books["rules"]["pnl_inr"],
                "filtered_pnl_inr": books["filtered"]["pnl_inr"],
                "baseline_charges_inr": books["baseline"]["charges_inr"],
                "rules_charges_inr": books["rules"]["charges_inr"],
                "filtered_charges_inr": books["filtered"]["charges_inr"],
                "baseline_shares": books["baseline"]["shares"],
                "rules_shares": books["rules"]["shares"],
                "filtered_shares": books["filtered"]["shares"],
                "baseline_equity_inr": str(
                    paisa(vals["baseline"] + Decimal(str(books["baseline"]["pnl_inr"])))
                ),
                "rules_equity_inr": str(
                    paisa(vals["rules"] + Decimal(str(books["rules"]["pnl_inr"])))
                ),
                "filtered_equity_inr": str(
                    paisa(vals["filtered"] + Decimal(str(books["filtered"]["pnl_inr"])))
                ),
                "missed_profitable_trade": not allowed_ai
                and Decimal(str(books["baseline"]["pnl_inr"])) > 0,
                "real_orders_placed": 0,
                "input_hash": content_hash({"candidate": packet, "execution": execution}),
                "review": review,
            }
            prev_hash = rows[-1]["chain_hash"] if rows else "0" * 64
            chain_hash = hashlib.sha256(
                (prev_hash + case_hash + canonical(row)).encode("utf-8")
            ).hexdigest()
            row["chain_hash"] = chain_hash
            self.db.execute(
                "INSERT INTO trades(candidate_id,case_hash,body,chain_hash) VALUES(?,?,?,?)",
                (candidate.id, case_hash, canonical(row), chain_hash),
            )
            self.db.execute("COMMIT")
            return row
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def end_session(self, session_date: str) -> None:
        """Explicitly finish a real NSE trading day. No automatic day counting."""
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", session_date):
            raise EvidenceError("invalid session date")
        try:
            day = dt.date.fromisoformat(session_date)
        except ValueError as exc:
            raise EvidenceError("invalid session date") from exc
        if day.weekday() >= 5 or session_date in self.holidays:
            raise EvidenceError("not a trading session")
        self.db.execute("BEGIN IMMEDIATE")
        try:
            finished = self.sessions()
            if session_date in finished:
                self.db.execute("COMMIT")
                return
            if len(finished) >= MAX_SESSIONS:
                raise EvidenceError("15-session challenge complete")
            if finished and session_date <= finished[-1]:
                raise EvidenceError("session completion out of order")
            days = {r["session_date"] for r in self._rows()}
            if session_date not in days:
                raise EvidenceError("cannot close a session without any accepted observations")
            if any(day_key > session_date for day_key in days):
                raise EvidenceError("cannot close session after processing later days")
            self.db.execute(
                "INSERT INTO sessions(session_date,closed_at) VALUES(?,?)",
                (session_date, "EXPLICITLY_FINALIZED"),
            )
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def report(self) -> dict[str, Any]:
        rows = self._rows()
        sessions = self.sessions()
        seen = set(r["session_date"] for r in rows)
        books = ("baseline", "rules", "filtered")
        curves: list[dict[str, int | str]] = [
            {
                "step": 0,
                "baseline_inr": str(START),
                "rules_inr": str(START),
                "filtered_inr": str(START),
            }
        ]
        for i, row in enumerate(rows, 1):
            curves.append(
                {
                    "step": i,
                    **{name + "_inr": row[name + "_equity_inr"] for name in books},
                }
            )

        def drawdown(name: str) -> Decimal:
            peak = START
            result = Decimal("0")
            for row in rows:
                current = Decimal(row[name + "_equity_inr"])
                peak = max(peak, current)
                result = max(result, (peak - current) / peak)
            return paisa(result * 100)

        coverage = bool(rows) and all(r["review_status"] == "REVIEWED" for r in rows)
        complete = len(sessions) == MAX_SESSIONS
        stats: dict[str, dict[str, str | int | None]] = {}
        for name in books:
            executed = [r for r in rows if r[name + "_shares"] > 0]
            wins = sum(Decimal(r[name + "_pnl_inr"]) > 0 for r in executed)
            stats[name] = {
                "trades": len(executed),
                "wins": wins,
                "win_rate_pct": str(paisa(Decimal(100) * wins / len(executed)))
                if executed
                else None,
                "net_pnl_inr": str(paisa(self._book(rows, name) - START)),
                "max_drawdown_pct": str(drawdown(name)),
                "charges_inr": str(
                    paisa(sum((Decimal(r[name + "_charges_inr"]) for r in rows), Decimal("0")))
                ),
            }
        return {
            "schema": 2,
            "mode": "THREE_WAY_PAPER_CHALLENGE",
            "status": ("COMPLETE" if complete else "IN_PROGRESS" if rows else "NOT_STARTED"),
            "comparison_valid": coverage and complete,
            "ai_coverage_complete": coverage,
            "certified_forward": False,
            "connected_model": coverage,
            "live_orders_enabled": False,
            "real_orders_placed": 0,
            "initial_capital_inr": str(START),
            "max_trade_inr": str(MAX_TRADE),
            "trade_count": len(rows),
            "sessions_completed": len(sessions),
            "challenge_sessions": MAX_SESSIONS,
            "session_dates": sessions,
            "observed_dates": sorted(seen),
            "baseline_equity_inr": str(self._book(rows, "baseline")),
            "rules_equity_inr": str(self._book(rows, "rules")),
            "filtered_equity_inr": str(self._book(rows, "filtered")),
            "baseline_max_drawdown_pct": str(drawdown("baseline")),
            "rules_max_drawdown_pct": str(drawdown("rules")),
            "filtered_max_drawdown_pct": str(drawdown("filtered")),
            "missed_profitable_count": sum(r["missed_profitable_trade"] for r in rows),
            "approved_count": sum(r["filtered_shares"] > 0 for r in rows),
            "charges_inr": {
                name: str(
                    paisa(sum((Decimal(r[name + "_charges_inr"]) for r in rows), Decimal("0")))
                )
                for name in books
            },
            "portfolio_stats": stats,
            "equity_curve": curves,
            "rows": rows,
            "evaluations": [r["review"] for r in rows],
            "ledger_chain_head": rows[-1]["chain_hash"] if rows else "0" * 64,
            "disclaimer": (
                "Fifteen explicitly closed Indian trading sessions with serial, long-only "
                "hypothetical fills. External quotes are supplied, not independently "
                "certified; no genuine NSE forward performance or broker fill claimed."
            ),
        }
