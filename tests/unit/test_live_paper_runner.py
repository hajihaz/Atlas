from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from atlas.paper.live_runner import add_strategy, connect, decode_tickers, failure, ingest, status


def q(ts: int, bid: int = 100, ask: int = 101, symbol: str = "BTCINR") -> dict:
    return {"symbol": symbol, "timestamp": ts, "bid": str(bid), "ask": str(ask)}


def quotes(ts: int, btc_bid: int = 100, eth_bid: int = 200) -> list[dict]:
    return [q(ts, btc_bid, btc_bid + 1), q(ts, eth_bid, eth_bid + 1, "ETHINR")]


def test_market_feed_rejects_stale_future_crossed_duplicate_and_nan() -> None:
    now = 2000000000
    good = [
        {
            "market": "BTCINR",
            "timestamp": now - 10,
            "bid": "100",
            "ask": "101",
            "last_price": "100",
        },
        {
            "market": "ETHINR",
            "timestamp": now - 10,
            "bid": "200",
            "ask": "201",
            "last_price": "200",
        },
    ]
    assert len(decode_tickers(good, now)) == 2
    for invalid in [
        {"timestamp": now - 500},
        {"timestamp": now + 30},
        {"bid": "102"},
        {"ask": "NaN"},
        {"bid": "0"},
    ]:
        rows = [dict(g) for g in good]
        rows[0].update(invalid)
        with pytest.raises(ValueError):
            decode_tickers(rows, now)
    with pytest.raises(ValueError):
        decode_tickers([good[0], good[0], good[1]], now)


def test_isolated_strategies_real_quote_next_observation_and_idempotency(tmp_path: Path) -> None:
    db = connect(tmp_path / "paper.db")
    t0 = 2000000000
    add_strategy(
        db,
        id="sma-btc",
        symbol="BTCINR",
        kind="sma",
        fast=2,
        slow=3,
        allocation_bps=1000,
        capital=100000,
        now=t0,
    )
    add_strategy(
        db,
        id="momentum-eth",
        symbol="ETHINR",
        kind="momentum",
        fast=2,
        slow=3,
        allocation_bps=500,
        capital=100000,
        now=t0,
    )
    # Signals derived from market observations, no synthetic fills before warmup.
    for n, btc in enumerate([100, 110, 120, 130, 140]):
        moment = t0 + 20 * (n + 1)
        summary = ingest(db, quotes(moment, btc, 200 + n * 8), moment + 1)
        if n < 3:
            assert summary["strategies"][0]["paperFills"] == 0
    snap = status(db, t0 + 101)
    by_id = {x["id"]: x for x in snap["strategies"]}
    assert by_id["sma-btc"]["paperFills"] == 1
    assert by_id["momentum-eth"]["paperFills"] == 1
    assert Decimal(by_id["sma-btc"]["cashINR"]) < Decimal("100000")
    assert Decimal(by_id["sma-btc"]["equityINR"]) > Decimal("0")
    assert snap["realOrdersEnabled"] is False
    assert snap["independentStrategyAccounts"] is True
    before = db.execute("SELECT COUNT(*) FROM fills").fetchone()[0]
    ingest(db, quotes(t0 + 100, 140, 232), t0 + 101)
    assert db.execute("SELECT COUNT(*) FROM fills").fetchone()[0] == before
    db.close()
    # Durable SQLite state survives restart, without duplicate fills.
    reopened = connect(tmp_path / "paper.db")
    assert status(reopened, t0 + 101)["strategies"] == snap["strategies"]


def test_unavailable_quote_and_disconnection_do_not_create_trades(tmp_path: Path) -> None:
    db = connect(tmp_path / "paper.db")
    t0 = 2000000000
    add_strategy(db, id="slow-btc", symbol="BTCINR", kind="sma", fast=2, slow=4, now=t0)
    with pytest.raises(ValueError):
        ingest(db, quotes(t0 + 15), t0 + 200)
    assert db.execute("SELECT COUNT(*) FROM quotes").fetchone()[0] == 0
    failure(db, "Provider blocked", t0 + 200)
    state = status(db, t0 + 200)
    assert state["feedStatus"] == "DISCONNECTED"
    assert state["strategies"][0]["paperFills"] == 0
    assert state["quotes"]["BTCINR"]["bidINR"] is None


def test_missing_pending_after_disconnect_and_pause(tmp_path: Path) -> None:
    db = connect(tmp_path / "paper.db")
    t0 = 2000000000
    add_strategy(db, id="btc-test", symbol="BTCINR", kind="sma", fast=2, slow=3, now=t0)
    for step, price in enumerate([100, 110, 120]):
        ingest(db, quotes(t0 + 20 * (step + 1), price), t0 + 20 * (step + 1) + 1)
    assert db.execute("SELECT pending FROM strategies WHERE id='btc-test'").fetchone()[0] == "BUY"
    ingest(db, quotes(t0 + 250, 140), t0 + 251)
    assert db.execute("SELECT COUNT(*) FROM fills").fetchone()[0] == 0


def test_strategy_validation(tmp_path: Path) -> None:
    db = connect(tmp_path / "paper.db")
    for params in [
        dict(id="BAD", symbol="BTCINR", kind="sma", fast=2, slow=4),
        dict(id="bad", symbol="NSE_NIFTY", kind="sma", fast=2, slow=4),
        dict(id="bad", symbol="BTCINR", kind="sma", fast=8, slow=4),
        dict(id="bad", symbol="BTCINR", kind="sma", fast=2, slow=4, allocation_bps=20000),
    ]:
        with pytest.raises(ValueError):
            add_strategy(db, now=2000000000, **params)


def test_atomic_ingest_rolls_back_after_strategy_exception(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import atlas.paper.live_runner as runner

    db = connect(tmp_path / "paper.db")
    t0 = 2000000000
    add_strategy(db, id="rollback-btc", symbol="BTCINR", kind="sma", fast=2, slow=3, now=t0)

    def crash(*_args: object) -> str:
        raise RuntimeError("simulated worker crash")

    monkeypatch.setattr(runner, "_signal", crash)
    with pytest.raises(RuntimeError, match="simulated worker crash"):
        ingest(db, quotes(t0 + 20), t0 + 21)
    assert db.execute("SELECT COUNT(*) FROM quotes").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM fills").fetchone()[0] == 0
    assert db.execute("SELECT seen_ts FROM strategies WHERE id='rollback-btc'").fetchone()[0] == 0
