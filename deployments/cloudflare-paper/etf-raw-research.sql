-- Immutable retrospective research from unadjusted ETF bars. No forward fills.
CREATE TABLE IF NOT EXISTS etf_raw_research_runs(
 source_day TEXT PRIMARY KEY,
 completed_ms INTEGER NOT NULL,
 nifty_sha256 TEXT NOT NULL CHECK(length(nifty_sha256)=64),
 gold_sha256 TEXT NOT NULL CHECK(length(gold_sha256)=64),
 result_json TEXT NOT NULL
);
