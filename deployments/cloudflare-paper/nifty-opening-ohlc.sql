-- Exact source responses for the completed 09:15 and 09:29 Nifty minutes.
CREATE TABLE IF NOT EXISTS nifty_open_ohlc_receipts(
 source_date TEXT NOT NULL,
 target_minute TEXT NOT NULL CHECK(target_minute IN ('09:15','09:29')),
 source_url TEXT NOT NULL,
 known_at_utc TEXT NOT NULL,
 body_sha256 TEXT NOT NULL CHECK(length(body_sha256)=64),
 body_bytes INTEGER NOT NULL CHECK(body_bytes BETWEEN 50 AND 100000),
 response_body TEXT NOT NULL,
 PRIMARY KEY(source_date,target_minute)
);
