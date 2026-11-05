CREATE TABLE IF NOT EXISTS strategy_context_receipts (
 source_date TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('gift','news')),
 slot_ms INTEGER NOT NULL,
 known_ms INTEGER NOT NULL,
 source_url TEXT NOT NULL,
 body_sha256 TEXT NOT NULL,
 body_json TEXT NOT NULL,
 metadata_json TEXT NOT NULL,
 PRIMARY KEY(source_date,kind,slot_ms)
);
