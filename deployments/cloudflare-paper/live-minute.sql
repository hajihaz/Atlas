-- Private, immutable completed minute bars for the actual 09:40 top ten.
-- This is market evidence, never a paper execution or backtest fill.
CREATE TABLE IF NOT EXISTS live_top_roster (
 source_date TEXT PRIMARY KEY,
 known_at_ms INTEGER NOT NULL,
 roster_sha256 TEXT NOT NULL CHECK(length(roster_sha256) = 64),
 roster_json TEXT NOT NULL CHECK(length(roster_json) BETWEEN 100 AND 3000)
);
CREATE TABLE IF NOT EXISTS live_minute_receipts (
  source_date TEXT NOT NULL,
  bar_ms INTEGER NOT NULL,
  known_at_ms INTEGER NOT NULL,
  source_url TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  bars_json TEXT NOT NULL,
  PRIMARY KEY (source_date, bar_ms),
  CHECK (length(body_sha256) = 64),
  CHECK (length(bars_json) BETWEEN 100 AND 10000)
);
CREATE TABLE IF NOT EXISTS live_opening_seed (
 source_date TEXT NOT NULL,
 instrument_key TEXT NOT NULL,
 symbol TEXT NOT NULL,
 known_at_ms INTEGER NOT NULL,
 source_url TEXT NOT NULL,
 body_sha256 TEXT NOT NULL CHECK(length(body_sha256) = 64),
 body_bytes INTEGER NOT NULL CHECK(body_bytes BETWEEN 100 AND 500000),
 response_body TEXT NOT NULL,
 bars_json TEXT NOT NULL,
 PRIMARY KEY (source_date, instrument_key)
);
CREATE TABLE IF NOT EXISTS live_x_runs (
 source_date TEXT NOT NULL,
 window_end_ms INTEGER NOT NULL,
 completed_ms INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('EVALUATED','SKIPPED')),
 reason TEXT NOT NULL,
 PRIMARY KEY (source_date, window_end_ms)
);
CREATE TABLE IF NOT EXISTS live_x_decisions (
 source_date TEXT NOT NULL,
 window_end_ms INTEGER NOT NULL,
 symbol TEXT NOT NULL,
 instrument_key TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('SIGNAL','NO_TRADE')),
 side TEXT,
 reason TEXT NOT NULL,
 decision_json TEXT NOT NULL,
 PRIMARY KEY (source_date, window_end_ms, symbol)
);
