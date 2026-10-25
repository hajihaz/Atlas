#!/usr/bin/env python3
"""Generate owner-only synthetic NSE cash research report, never trading authority.

Run from an Atlas checkout with PYTHONPATH=src:
    python scripts/daytrader_nse_pilot.py

Writes only artifacts/daytrader-nse-pilot/ beneath THIS checkout.
Does NOT connect to the Internet, fetch market data, or submit orders.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
from collections import Counter
from dataclasses import asdict
from decimal import Decimal
from pathlib import Path

from atlas.data.calendars.nse_calendar import TradingCalendar
from atlas.research.daytrader_nse import UPSTREAM, ResearchRules, bootstrap_monte_carlo, replay_session
from atlas.research.daytrader_nse_synthetic import synthetic_session

START = dt.date(2026, 9, 18)
END = dt.date(2026, 10, 16)
# Only an explicit DEMO calendar. Oct 2 is a known NSE holiday, but this calendar
# must NOT be used to certify real 2026 sessions, special sessions or actual data.
DEMO_CALENDAR = TradingCalendar("NSE-CM-SYNTHETIC-DEMO", frozenset({dt.date(2026, 10, 2)}),
                                covered_from=START, covered_to=END)
CASES = ("target", "stop", "no_breakout", "both", "flat")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/daytrader-nse-pilot"


def serialize(obj: object) -> str:
    return json.dumps(obj, default=lambda v: str(v) if isinstance(v, Decimal) else repr(v),
                      sort_keys=True, indent=2, ensure_ascii=False)


def build_report() -> dict[str, object]:
    days = DEMO_CALENDAR.sessions_in_range(START, END)
    if len(days) != 20:
        raise RuntimeError("synthetic research calendar was unexpectedly modified")
    rules = ResearchRules()
    results = [
        replay_session(synthetic_session(day, scenario=CASES[i % len(CASES)]),
                       calendar=DEMO_CALENDAR, rules=rules)
        for i, day in enumerate(days)
    ]
    if any(r.orders_submitted or r.data_class != "synthetic_fixture" for r in results):
        raise RuntimeError("unsafe non-synthetic research evidence")
    summary = bootstrap_monte_carlo(tuple(results), trials=10_000, seed=19)
    net = sum((r.net_pnl for r in results), Decimal(0))
    return {
        "report_type": "atlas_daytrader_nse_research_only",
        "dataset": {
            "kind": "synthetic_fixture",
            "session_count": 20,
            "source": "locally constructed 75-bar sessions, NOT NSE exchange history",
            "calendar_status": "synthetic demonstration; NOT exchange-certified for 2026",
            "timezone": "Asia/Kolkata",
            "session_regular_hours": "09:15–15:30 IST; cash equity only",
            "sessions": [x.isoformat() for x in days],
            "market_reference": "https://www.nseindia.com/static/market-data/market-timings",
        },
        "source_attribution": UPSTREAM,
        "rules": {k: str(v) for k, v in asdict(rules).items()},
        "safety": {
            "broker_orders_submitted": 0, "network_requests": 0,
            "real_market_certified": False, "paper_trading_connected": False,
            "production_enabled": False, "live_NSE_data_used": False,
            "simulation_risks": "fictitious price paths, no market regime modelling; no investment guidance",
            "lookahead_control": "09:30–09:35 close observed before 09:40 hypothetical fill",
            "bar_conflict": "simultaneous stop and target is a conservative stop",
        },
        "overview": {
            "sessions": len(results),
            "total_net_pnl_inr_demo_only": str(net),
            "reason_counts": dict(sorted(Counter(x.reason for x in results).items())),
        },
        "bootstrap": summary,
        "sessions": [{**asdict(x), "net_pnl": str(x.net_pnl),
                      "entry": str(x.entry) if x.entry is not None else None,
                      "exit": str(x.exit) if x.exit is not None else None,
                      "stop": str(x.stop) if x.stop is not None else None,
                      "target": str(x.target) if x.target is not None else None}
                     for x in results],
    }


def render_html(data: dict[str, object]) -> str:
    overview = data["overview"]
    bootstrap = data["bootstrap"]
    rows = []
    for item in data["sessions"]:
        rows.append("<tr>" + "".join(
            f"<td>{html.escape(str(item.get(field) or '—'))}</td>"
            for field in ("session", "reason", "shares", "entry", "exit", "net_pnl")
        ) + "</tr>")
    metrics = [
        ("Synthetic sessions", overview["sessions"]),
        ("Seeded bootstrap trials", bootstrap["trials"]),
        ("Synthetic net P/L", f"₹{overview['total_net_pnl_inr_demo_only']}"),
        ("Simulated p05 P/L", f"₹{bootstrap['p05_net_pnl_inr']}"),
        ("Simulated median P/L", f"₹{bootstrap['median_net_pnl_inr']}"),
        ("Simulated p95 P/L", f"₹{bootstrap['p95_net_pnl_inr']}"),
    ]
    cards = "".join(
        f"<article class='metric'><span>{html.escape(str(k))}</span>"
        f"<strong>{html.escape(str(value))}</strong></article>" for k, value in metrics
    )
    css = """*{box-sizing:border-box}body{margin:0;background:#0b1424;color:#e7ebf2;font:15px/1.55 system-ui,-apple-system,sans-serif}
main{max-width:1160px;margin:auto;padding:35px 22px 70px}h1{font-size:clamp(1.7rem,4vw,2.8rem);letter-spacing:-.04em}
p,small{color:#aab8ca}.flag{display:inline-block;border:1px solid #ad7549;background:#342719;
padding:7px 12px;border-radius:9px;color:#ffdcad;font-weight:750;font-size:.76rem;letter-spacing:.06em}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:24px 0}
.metric{padding:17px;background:#17233a;border:1px solid #31445e;border-radius:13px}
.metric span{display:block;color:#b6c5d8;font-size:.81rem}.metric strong{display:block;font-size:1.45rem;margin-top:7px}
.warning{background:#222b3b;border-left:4px solid #e5a34e;padding:13px 17px;border-radius:5px}
table{width:100%;border-collapse:collapse;background:#142038;border-radius:10px;overflow:hidden}
th,td{padding:11px;text-align:left;border-bottom:1px solid #2c3f5b;white-space:nowrap}
th{background:#243450} .scroll{overflow:auto}.source{font-size:.85rem;margin-top:25px}
@media(max-width:550px){main{padding:24px 12px}.metric{padding:13px}th,td{padding:9px}}"""
    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<meta http-equiv='Content-Security-Policy' "
        "content=\"default-src 'none';style-src 'unsafe-inline';base-uri 'none';form-action 'none'\">"
        "<title>Atlas — Day Trader NSE Research Pilot</title>"
        f"<style>{css}</style></head><body><main>"
        "<span class='flag'>SYNTHETIC RESEARCH · NO REAL TRADES</span>"
        "<h1>Atlas / Day Trader Time Machine</h1>"
        "<p>20 invented NSE-style five-minute sessions · 10,000 empirical resamples · "
        "local research branch only, not the production Atlas dashboard.</p>"
        f"<div class='metrics'>{cards}</div>"
        "<p class='warning'><b>These are invented outcomes, not NSE backtest results.</b> "
        "The Monte Carlo values reflect repeated sampling of a fabricated dataset and must never "
        "be treated as probabilities of investment returns. No real market data, account balance, "
        "brokerage connection or order execution was used.</p>"
        "<h2>Session-level synthetic outcomes</h2><div class='scroll'>"
        "<table><thead><tr><th>Session</th><th>Exit reason</th><th>Shares</th>"
        "<th>Entry</th><th>Exit</th><th>Net P/L (₹)</th></tr></thead>"
        f"<tbody>{''.join(rows)}</tbody></table></div>"
        "<p class='source'>NSE cash regular hours 09:15–15:30 IST. "
        "Signal based on closed candle; theoretical fill at 09:40 or later. "
        "Both target and stop hit in the same candle => stop-first. "
        f"Research inspiration: {html.escape(UPSTREAM)} (MIT); "
        "isolated offline fixture generated by Atlas.</p></main></body></html>"
    )


def main() -> None:
    data = build_report()
    OUT.mkdir(parents=True, exist_ok=True)
    report = OUT / "report.json"
    report.write_text(serialize(data) + "\n", encoding="utf-8")
    dashboard = OUT / "dashboard.html"
    dashboard.write_text(render_html(data), encoding="utf-8")
    payload_hash = hashlib.sha256(report.read_bytes()).hexdigest()
    print(json.dumps({
        "status": "verified_synthetic_only",
        "report": str(report.relative_to(ROOT)),
        "dashboard": str(dashboard.relative_to(ROOT)),
        "session_count": data["overview"]["sessions"],
        "mc_trials": data["bootstrap"]["trials"],
        "real_market_certified": False,
        "orders_submitted": 0,
        "report_sha256": payload_hash,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
