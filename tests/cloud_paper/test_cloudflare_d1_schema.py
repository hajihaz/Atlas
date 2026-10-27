"""D1 SQLite trigger correctness tests. Fixture prices are not NSE observations."""
from __future__ import annotations

import sqlite3
import unittest
from pathlib import Path

SCHEMA = Path(__file__).resolve().parents[2] / 'deployments/cloudflare-paper/schema.sql'

class D1SettlementTriggerTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript(SCHEMA.read_text())
        self.db.execute("INSERT INTO quotes(symbol,price_paise,cumulative_volume,observed_ms,source,exchange_open) VALUES('TESTNSE',10000,5000,1000000,'UNIT_TEST_ONLY',1)")

    def tearDown(self):
        self.db.close()

    def order(self, order_id, side, qty, kind='MANUAL', symbol='TESTNSE'):
        self.db.execute('''INSERT INTO orders(id,client_key,kind,symbol,side,qty,due_ms,created_ms)
             VALUES(?,?,?,?,?,?,1000000,1000000)''',(order_id,'fixture_'+order_id,kind,symbol,side,qty))

    def fill(self, order_id, px, fee, execution):
        return self.db.execute('''UPDATE orders SET status='FILLED',fill_paise=?,fee_paise=?,
               completed_ms=1000001,execution_id=? WHERE id=? AND status='QUEUED' ''',
               (px,fee,execution,order_id)).rowcount

    def cash(self):
        return self.db.execute('SELECT cash_paise FROM account WHERE id=1').fetchone()[0]

    def position(self):
        return self.db.execute("SELECT qty,entry_paise,intraday FROM positions WHERE symbol='TESTNSE'").fetchone()

    def audits(self):
        return self.db.execute("SELECT count(*) FROM events WHERE type='PAPER_FILL'").fetchone()[0]

    def test_one_fill_is_atomic_and_replay_does_not_duplicate(self):
        self.order('ONE','BUY',3)
        self.assertEqual(self.fill('ONE',10005,31,'unique-exec-01'),1)
        self.assertEqual(self.cash(),10000000-30015-31)
        self.assertEqual(self.position(),(3,10005,0))
        self.assertEqual(self.audits(),1)
        self.assertEqual(self.fill('ONE',10005,31,'unique-exec-02'),0)
        self.assertEqual(self.cash(),10000000-30015-31)
        self.assertEqual(self.audits(),1)

    def test_long_buy_then_sell_flattens_position(self):
        self.order('BUY','BUY',5)
        self.fill('BUY',10005,51,'e-buy')
        self.order('SELL','SELL',5)
        self.fill('SELL',10020,51,'e-sell')
        self.assertEqual(self.position(),(0,None,0))
        self.assertEqual(self.audits(),2)
        self.assertEqual(self.cash(),10000000 - 5*10005-51 + 5*10020-51)

    def test_directional_paper_short_sell_and_cover(self):
        self.order('SHORT','SELL',5,kind='ENTRY')
        self.fill('SHORT',10000,50,'e-short')
        self.assertEqual(self.position(),(-5,10000,1))
        self.order('COVER','BUY',5,kind='EXIT')
        self.fill('COVER',9900,50,'e-cover')
        self.assertEqual(self.position(),(0,None,0))
        self.assertEqual(self.audits(),2)
        self.assertEqual(self.cash(),10000000 + 5*10000-50 - 5*9900-50)

    def test_insufficient_cash_aborts_fill_and_leaves_queued(self):
        self.order('TOO-BIG','BUY',500000)
        with self.assertRaises(sqlite3.IntegrityError):
            self.fill('TOO-BIG',10000,100,'e-overbudget')
        self.assertEqual(self.db.execute("SELECT status FROM orders WHERE id='TOO-BIG'").fetchone()[0],'QUEUED')
        self.assertEqual(self.cash(),10000000)
        self.assertEqual(self.audits(),0)

    def test_cancellation_never_settles(self):
        self.order('CANCEL','BUY',2)
        self.db.execute("UPDATE orders SET status='CANCELLED' WHERE id='CANCEL'")
        self.assertEqual(self.cash(),10000000)
        self.assertEqual(self.position(),None)
        self.assertEqual(self.audits(),0)

if __name__=='__main__':
    unittest.main()
