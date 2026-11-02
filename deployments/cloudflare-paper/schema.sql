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
CREATE TABLE IF NOT EXISTS entry_snapshots(session TEXT NOT NULL,symbol TEXT NOT NULL,price_paise INTEGER NOT NULL,cumulative_volume INTEGER NOT NULL,observed_ms INTEGER NOT NULL,source TEXT NOT NULL,PRIMARY KEY(session,symbol));
CREATE TABLE IF NOT EXISTS runs(session TEXT NOT NULL,phase TEXT NOT NULL,status TEXT NOT NULL,reason TEXT,completed_ms INTEGER NOT NULL,PRIMARY KEY(session,phase));
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,observed_ms INTEGER NOT NULL,type TEXT NOT NULL,message TEXT NOT NULL);

-- D1 Free: one guarded order UPDATE settles cash/position/audit atomically.
CREATE TRIGGER IF NOT EXISTS atlas_settle_paper_fill
AFTER UPDATE OF status ON orders
WHEN OLD.status='QUEUED' AND NEW.status='FILLED' AND NEW.execution_id IS NOT NULL
BEGIN
  UPDATE account SET cash_paise=cash_paise+
    CASE NEW.side
      WHEN 'BUY' THEN -(NEW.qty*NEW.fill_paise+NEW.fee_paise)
      ELSE NEW.qty*NEW.fill_paise-NEW.fee_paise
    END
  WHERE id=1;
  INSERT INTO positions(symbol,qty,entry_paise,intraday)
  VALUES (
    NEW.symbol,
    COALESCE((SELECT qty FROM positions WHERE symbol=NEW.symbol),0)+
      CASE NEW.side WHEN 'BUY' THEN NEW.qty ELSE -NEW.qty END,
    CASE
      WHEN COALESCE((SELECT qty FROM positions WHERE symbol=NEW.symbol),0)+
        CASE NEW.side WHEN 'BUY' THEN NEW.qty ELSE -NEW.qty END=0 THEN NULL
      WHEN NEW.kind='ENTRY' THEN NEW.fill_paise
      WHEN (SELECT qty FROM positions WHERE symbol=NEW.symbol) IS NULL THEN NEW.fill_paise
      WHEN (SELECT qty FROM positions WHERE symbol=NEW.symbol)=0 THEN NEW.fill_paise
      ELSE COALESCE((SELECT entry_paise FROM positions WHERE symbol=NEW.symbol),NEW.fill_paise)
    END,
    CASE
      WHEN COALESCE((SELECT qty FROM positions WHERE symbol=NEW.symbol),0)+
        CASE NEW.side WHEN 'BUY' THEN NEW.qty ELSE -NEW.qty END=0 THEN 0
      WHEN NEW.kind='ENTRY' THEN 1
      ELSE COALESCE((SELECT intraday FROM positions WHERE symbol=NEW.symbol),0)
    END
  ) ON CONFLICT(symbol) DO UPDATE SET
    qty=excluded.qty,entry_paise=excluded.entry_paise,intraday=excluded.intraday;
  INSERT INTO events(observed_ms,type,message)
  VALUES(NEW.completed_ms,'PAPER_FILL',NEW.side||' '||NEW.qty||' '||NEW.symbol||' source='||
    COALESCE((SELECT source FROM quotes WHERE symbol=NEW.symbol),'UNAVAILABLE'));
END;

-- Exactly one SKIP audit entry for each QUEUED -> SKIPPED transition,
-- even when multiple cron invocations concurrently inspect the same order.
CREATE TRIGGER IF NOT EXISTS atlas_record_paper_skip
AFTER UPDATE OF status ON orders
WHEN OLD.status='QUEUED' AND NEW.status='SKIPPED'
BEGIN
  INSERT INTO events(observed_ms,type,message)
  VALUES(NEW.completed_ms,'SKIP',NEW.id||' '||COALESCE(NEW.reason,'UNSPECIFIED'));
END;
