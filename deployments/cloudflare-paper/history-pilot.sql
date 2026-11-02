-- Separate Free D1 database: pilot source receipt only. No paper ledger tables.
CREATE TABLE IF NOT EXISTS history_samples(
 instrument_key TEXT NOT NULL,
 source_date TEXT NOT NULL,
 source_url TEXT NOT NULL,
 known_at_utc TEXT NOT NULL,
 body_sha256 TEXT NOT NULL CHECK(length(body_sha256)=64),
 body_bytes INTEGER NOT NULL CHECK(body_bytes BETWEEN 50 AND 500000),
 candle_count INTEGER NOT NULL CHECK(candle_count BETWEEN 1 AND 390),
 first_minute TEXT NOT NULL,
 last_minute TEXT NOT NULL,
 response_body TEXT NOT NULL,
 evidence_class TEXT NOT NULL,
 PRIMARY KEY(instrument_key,source_date)
);
