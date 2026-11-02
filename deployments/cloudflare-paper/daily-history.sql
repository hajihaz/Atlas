-- Private daily provider receipts for weekly/monthly paper research.
-- Stored in the separate history D1; no real-order capability.
CREATE TABLE IF NOT EXISTS daily_history_samples(
 instrument_key TEXT NOT NULL,
 source_date TEXT NOT NULL,
 source_url TEXT NOT NULL,
 known_at_utc TEXT NOT NULL,
 body_sha256 TEXT NOT NULL CHECK(length(body_sha256)=64),
 body_bytes INTEGER NOT NULL CHECK(body_bytes BETWEEN 100 AND 120000),
 candle_count INTEGER NOT NULL CHECK(candle_count BETWEEN 61 AND 123),
 first_day TEXT NOT NULL,
 last_day TEXT NOT NULL,
 response_body TEXT NOT NULL,
 weekly_return_bps INTEGER NOT NULL,
 monthly_return_bps INTEGER NOT NULL,
 weekly_eligible INTEGER NOT NULL CHECK(weekly_eligible IN (0,1)),
 monthly_eligible INTEGER NOT NULL CHECK(monthly_eligible IN (0,1)),
 PRIMARY KEY(instrument_key,source_date)
);
