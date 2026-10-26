#!/usr/bin/env python3
"""Atlas chat/HHC command: truthful, read-only NSE research and local paper analysis.

Credentials via environment variables only. No live brokerage order import/path.
Archive research is historical/hypothetical, never a verified NSE backtest.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import sys
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from atlas.integrations.archive_export import export_parquet_with_manifest, verify_parquet_export
from atlas.integrations.backtrader_bridge import run_backtrader_sma
from atlas.integrations.historical_backfill import backfill
from atlas.integrations.history_quality import audit_history
from atlas.integrations.history_store import CandleArchive
from atlas.integrations.nse_sources import (
    IST,
    Candle,
    HistoricalBatch,
    fyers_history,
    upstox_history,
)
from atlas.integrations.openalgo_sandbox import observe_analyzer
from atlas.integrations.point_in_time import VolumeObservation, certify_volume_rank
from atlas.integrations.source_comparison import compare_history_sources
from atlas.integrations.upstox_quote import upstox_ltp


def _batch_from_archive(
    archive: CandleArchive, provider: str, instrument: str, interval: str
) -> HistoricalBatch:
    rows = archive.rows(provider, instrument, interval)
    if not rows:
        raise ValueError("archive has no candles for exact provider/instrument/interval")
    candles = tuple(Candle(x[0].astimezone(dt.UTC), x[1], x[2], x[3], x[4], x[5]) for x in rows)
    # Mixed chunk provenance is preserved in archive rows; use a composite digest
    # for offline replay without pretending it is one original vendor response.
    canonical = [[x[0].isoformat(), *[str(y) for y in x[1:]]] for x in rows]
    digest = hashlib.sha256(json.dumps(canonical, separators=(",", ":")).encode()).hexdigest()
    return HistoricalBatch(
        provider,
        instrument,
        interval,
        candles[0].timestamp.astimezone(IST).date(),
        candles[-1].timestamp.astimezone(IST).date(),
        candles,
        digest,
    )


def _comparison(batch: HistoricalBatch) -> dict[str, object]:
    replay = run_backtrader_sma(batch)
    return {
        "mode": replay.status,
        "provider": replay.provider,
        "instrument": replay.symbol,
        "candles": replay.bars,
        "initial_cash_inr": str(replay.initial_cash_inr),
        "ending_equity_inr": str(replay.ending_equity_inr),
        "hypothetical_pnl_inr": str(replay.ending_equity_inr - replay.initial_cash_inr),
        "completed_orders": replay.completed_orders,
        "data_snapshot_sha256": replay.source_hash,
        "universe_verified": False,
        "live_capital_enabled": False,
    }


def _pit_file(path: Path) -> dict[str, object]:
    # Never trust the source just because a file exists. This checks temporal
    # consistency only; authentic vendor rights and full universe require audit.
    data = json.loads(path.read_text(encoding="utf-8"))
    as_of = dt.datetime.fromisoformat(data["as_of"])
    members = data["listed_members"]
    observations = [
        VolumeObservation(
            row["symbol"],
            int(row["cumulative_volume"]),
            dt.datetime.fromisoformat(row["observed_at"]),
            dt.datetime.fromisoformat(row["known_at"]),
        )
        for row in data["observations"]
    ]
    rank = certify_volume_rank(as_of=as_of, listed_members=members, observations=observations)
    return {
        "status": rank.status,
        "as_of": rank.as_of.isoformat(),
        "covered_symbols": len(rank.members),
        "top_ten": rank.top_ten,
        "ranking_sha256": rank.digest,
        "authentic_source_verified": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "action",
        choices=(
            "status",
            "ingest",
            "compare",
            "export",
            "pit-rank",
            "analyzer-status",
            "quote",
            "backfill",
            "audit-history",
            "provenance",
            "verify-export",
            "compare-sources",
        ),
    )
    parser.add_argument("--provider", choices=("upstox", "fyers", "upstox_v3", "fyers_v3"))
    parser.add_argument("--instrument")
    parser.add_argument("--other-provider", choices=("upstox", "fyers", "upstox_v3", "fyers_v3"))
    parser.add_argument("--other-instrument")
    parser.add_argument("--interval", default="1m")
    parser.add_argument("--from-date")
    parser.add_argument("--to-date")
    parser.add_argument("--archive", default="data/local/nse_history.duckdb")
    parser.add_argument("--output")
    parser.add_argument("--input-file")
    parser.add_argument("--compare", action="store_true")
    args = parser.parse_args()
    archive = CandleArchive(Path(args.archive))
    if args.action == "status":
        result = {
            "mode": "DATA_AND_PAPER_ONLY",
            "live_money_enabled": False,
            "upstox_token_configured": bool(os.environ.get("UPSTOX_ANALYTICS_TOKEN")),
            "fyers_credentials_configured": bool(
                os.environ.get("FYERS_APP_ID") and os.environ.get("FYERS_ACCESS_TOKEN")
            ),
            "openalgo_key_configured": bool(os.environ.get("OPENALGO_API_KEY")),
            "archive_present": Path(args.archive).is_file(),
            "certified_nse_sessions": None,
            "notice": "Token presence does not verify provider access or NSE PIT history.",
        }
    elif args.action == "quote":
        if not args.instrument:
            parser.error("quote requires --instrument")
        quote = upstox_ltp(
            args.instrument,
            token=os.environ.get("UPSTOX_ANALYTICS_TOKEN", ""),
            received_at=dt.datetime.now(dt.UTC),
        )
        result = {
            "instrument_key": quote.instrument_key,
            "source": quote.source,
            "last_price_inr": str(quote.last_price),
            "volume": quote.volume,
            "observed_received_at": quote.received_at.isoformat(),
            "exchange_market_timestamp": None,
            "execution_freshness_verified": False,
            "paper_order_enabled": False,
            "warning": "LTP lacks exchange time; cannot trigger paper or live orders.",
        }
    elif args.action == "analyzer-status":
        result = observe_analyzer(
            os.environ.get("OPENALGO_LOCAL_URL", "http://127.0.0.1:5000"),
            os.environ.get("OPENALGO_API_KEY", ""),
        )
    elif args.action == "pit-rank":
        if not args.input_file:
            parser.error("pit-rank requires --input-file")
        result = _pit_file(Path(args.input_file))
    elif args.action == "verify-export":
        if not args.output:
            parser.error("verify-export requires --output path to a Parquet file")
        result = verify_parquet_export(Path(args.output))
    elif args.action == "export":
        if not args.output or not Path(args.archive).is_file():
            raise ValueError("Parquet export requires an existing archive and --output")
        exported = export_parquet_with_manifest(archive, Path(args.output))
        result = {
            **exported,
            "status": "LOCAL_ARCHIVE_EXPORT",
            "integrity_status": exported["status"],
            "live_orders": False,
        }
    elif args.action == "compare-sources":
        if not all((args.provider, args.instrument, args.other_provider, args.other_instrument)):
            parser.error("compare-sources needs both provider/instrument pairs")
        aliases = {"upstox": "upstox_v3", "fyers": "fyers_v3"}
        result = asdict(
            compare_history_sources(
                archive,
                primary_provider=aliases.get(args.provider, args.provider),
                primary_instrument=args.instrument,
                secondary_provider=aliases.get(args.other_provider, args.other_provider),
                secondary_instrument=args.other_instrument,
                interval=args.interval,
            )
        )
    elif args.action == "provenance":
        if not args.provider or not args.instrument:
            parser.error("provenance requires --provider and --instrument")
        provider = {"upstox": "upstox_v3", "fyers": "fyers_v3"}.get(args.provider, args.provider)
        result = asdict(archive.provenance(provider, args.instrument, args.interval))
    elif args.action == "audit-history":
        if not args.provider or not args.instrument:
            parser.error("audit-history requires --provider and --instrument")
        provider = {"upstox": "upstox_v3", "fyers": "fyers_v3"}.get(args.provider, args.provider)
        result = asdict(
            audit_history(
                archive,
                provider=provider,
                instrument=args.instrument,
                interval=args.interval,
            )
        )
    elif args.action == "backfill":
        if not all((args.provider, args.instrument, args.from_date, args.to_date)):
            parser.error("backfill requires provider, instrument and date range")
        if args.provider not in ("upstox", "fyers"):
            raise ValueError("unsupported backfill provider")
        start = dt.date.fromisoformat(args.from_date)
        end = dt.date.fromisoformat(args.to_date)
        summary = backfill(
            archive,
            provider=args.provider,
            instrument=args.instrument,
            start=start,
            end=end,
            token=(
                os.environ.get("UPSTOX_ANALYTICS_TOKEN", "")
                if args.provider == "upstox"
                else os.environ.get("FYERS_ACCESS_TOKEN", "")
            ),
            app_id=os.environ.get("FYERS_APP_ID", ""),
        )
        result = {
            "status": summary.status,
            "provider": summary.provider,
            "instrument": summary.instrument,
            "requests": summary.requests,
            "bars_received": summary.bars_received,
            "bars_added": summary.bars_added,
            "from_date": summary.first_date,
            "to_date": summary.last_date,
            "rankings_verified": False,
            "live_capital_enabled": False,
        }
    elif args.action == "ingest":
        if not all((args.provider, args.instrument, args.from_date, args.to_date)):
            parser.error("ingest requires --provider, --instrument, --from-date, --to-date")
        start, end = (dt.date.fromisoformat(s) for s in (args.from_date, args.to_date))
        if args.provider == "upstox":
            batch = upstox_history(
                args.instrument, start, end, token=os.environ.get("UPSTOX_ANALYTICS_TOKEN", "")
            )
        elif args.provider == "fyers":
            batch = fyers_history(
                args.instrument,
                start,
                end,
                app_id=os.environ.get("FYERS_APP_ID", ""),
                token=os.environ.get("FYERS_ACCESS_TOKEN", ""),
            )
        else:
            raise ValueError("ingest only accepts upstox or fyers")
        inserted = archive.add(batch)
        result = {
            "mode": "UNCERTIFIED_HISTORICAL_DATA",
            "live_orders": False,
            "provider": batch.provider,
            "instrument": batch.instrument,
            "bars": len(batch.candles),
            "new_bars": inserted,
            "payload_sha256": batch.payload_sha256,
            "ranking_verified": False,
        }
        if args.compare:
            result["backtrader_sma"] = _comparison(batch)
    else:
        if not args.provider or not args.instrument:
            parser.error("compare requires --provider and --instrument")
        provider = {"upstox": "upstox_v3", "fyers": "fyers_v3"}.get(args.provider, args.provider)
        batch = _batch_from_archive(archive, provider, args.instrument, args.interval)
        result = _comparison(batch)
    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, OSError, KeyError, TypeError) as error:
        print(json.dumps({"status": "BLOCKED_OR_INVALID", "reason": str(error)[:180]}))
        raise SystemExit(2) from None
