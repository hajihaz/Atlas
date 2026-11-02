-- Additive, unarmed virtual comparison accounts. No broker order routes.
CREATE TABLE IF NOT EXISTS seven_paper_accounts(
 strategy_id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL CHECK(revision>=0),
 state_json TEXT NOT NULL CHECK(length(state_json) BETWEEN 100 AND 1000000),
 updated_ms INTEGER NOT NULL CHECK(updated_ms>0)
);
