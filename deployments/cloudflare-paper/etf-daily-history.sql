-- Private raw ETF source receipts. No adjusted-return or paper-fill claim.
CREATE TABLE IF NOT EXISTS etf_daily_receipts(
 source_day TEXT NOT NULL,
 symbol TEXT NOT NULL CHECK(symbol IN ('NIFTYBEES','GOLDBEES')),
 instrument_key TEXT NOT NULL,
 historical_url TEXT NOT NULL,
 historical_sha256 TEXT NOT NULL CHECK(length(historical_sha256)=64),
 historical_body TEXT NOT NULL,
 intraday_url TEXT,
 intraday_sha256 TEXT,
 intraday_body TEXT,
 actions_url TEXT NOT NULL,
 actions_sha256 TEXT NOT NULL CHECK(length(actions_sha256)=64),
 actions_body TEXT NOT NULL,
 received_ms INTEGER NOT NULL,
 candle_count INTEGER NOT NULL CHECK(candle_count>=201),
 first_day TEXT NOT NULL,
 last_day TEXT NOT NULL,
 adjustment_status TEXT NOT NULL,
 PRIMARY KEY(source_day,symbol)
);
