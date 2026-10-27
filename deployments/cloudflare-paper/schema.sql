-- Atlas Cloudflare D1: owner-only paper journal. All prices and balances use integer paise.
CREATE TABLE IF NOT EXISTS account(id INTEGER PRIMARY KEY CHECK(id=1),cash_paise INTEGER NOT NULL CHECK(cash_paise>=0));
INSERT OR IGNORE INTO account(id,cash_paise) VALUES(1,10000000);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO settings(key,value) VALUES('strategy_enabled','0');
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,client_key TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,symbol TEXT NOT NULL,side TEXT NOT NULL,qty INTEGER NOT NULL CHECK(qty>0),due_ms INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'QUEUED',fill_paise INTEGER,fee_paise INTEGER,completed_ms INTEGER,reason TEXT,created_ms INTEGER NOT NULL,execution_id TEXT UNIQUE);
CREATE INDEX IF NOT EXISTS idx_pending ON orders(status,due_ms);
CREATE TABLE IF NOT EXISTS quotes(symbol TEXT PRIMARY KEY,price_paise INTEGER NOT NULL,cumulative_volume INTEGER NOT NULL,observed_ms INTEGER NOT NULL,source TEXT NOT NULL,exchange_open INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS positions(symbol TEXT PRIMARY KEY,qty INTEGER NOT NULL,entry_paise INTEGER,intraday INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS coverage(session TEXT PRIMARY KEY,eligible_count INTEGER NOT NULL,observed_ms INTEGER NOT NULL,nifty_change_bps INTEGER NOT NULL,source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs(session TEXT NOT NULL,phase TEXT NOT NULL,status TEXT NOT NULL,reason TEXT,completed_ms INTEGER NOT NULL,PRIMARY KEY(session,phase));
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,observed_ms INTEGER NOT NULL,type TEXT NOT NULL,message TEXT NOT NULL);
