-- Immutable qualified decisions and bounded incremental indicator snapshots.
CREATE TABLE IF NOT EXISTS forward_strategy_windows (
 source_date TEXT NOT NULL,
 strategy_id TEXT NOT NULL,
 window_end_ms INTEGER NOT NULL,
 completed_ms INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('EVALUATED','SKIPPED')),
 payload_json TEXT NOT NULL,
 payload_sha256 TEXT NOT NULL,
 PRIMARY KEY(source_date,strategy_id,window_end_ms)
);
