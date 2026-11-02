CREATE TABLE IF NOT EXISTS nse_reference_receipts(
 source_date TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('eod','master')),
 source_url TEXT NOT NULL,
 source_last_modified TEXT NOT NULL,
 received_at_utc TEXT NOT NULL,
 body_sha256 TEXT NOT NULL,
 body_bytes INTEGER NOT NULL,
 kv_key TEXT NOT NULL,
 PRIMARY KEY(source_date,kind)
);
