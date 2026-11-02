-- Private, immutable, predecision Nifty opening evidence. No paper ledger writes.
CREATE TABLE IF NOT EXISTS nifty_open_receipts(
 source_date TEXT PRIMARY KEY,
 source_url TEXT NOT NULL,
 known_at_utc TEXT NOT NULL,
 body_sha256 TEXT NOT NULL CHECK(length(body_sha256)=64),
 body_bytes INTEGER NOT NULL CHECK(body_bytes BETWEEN 50 AND 500000),
 candle_count INTEGER NOT NULL CHECK(candle_count BETWEEN 15 AND 100),
 response_body TEXT NOT NULL,
 evidence_class TEXT NOT NULL
);
