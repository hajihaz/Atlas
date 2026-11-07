// Real SQLite trigger + actual Worker fill SQL, no mocked cash/position math.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { testing } from '../src/index.js';

const now=Date.parse('2026-10-27T11:14:00+05:30');
const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(schema);
 let reads=0;
 const d1={
   prepare(sql){reads++;return {bind(...args){return {
     async first(){return sqlite.prepare(sql).get(...args)??null;},
     async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes}};},
     async all(){return {results:sqlite.prepare(sql).all(...args)};},
   };}};},
 };
 function quote(symbol,price){sqlite.prepare(`INSERT INTO quotes
  (symbol,price_paise,cumulative_volume,observed_ms,source,exchange_open)
  VALUES(?,?,?,?,?,1)`).run(symbol,price,123456,now,'SYNTHETIC_REGRESSION');}
 function order(id,symbol,side,qty,kind='MANUAL'){
   sqlite.prepare(`INSERT INTO orders(id,client_key,kind,symbol,side,qty,due_ms,created_ms)
    VALUES(?,?,?,?,?,?,?,?)`).run(id,'fixture_'+id,kind,symbol,side,qty,now,now);
   return sqlite.prepare('SELECT * FROM orders WHERE id=?').get(id);
 }
 function value(sql){return Object.values(sqlite.prepare(sql).get())[0];}
 return {sqlite,d1,quote,order,value,get queries(){return reads;}};
}

test('paper short-sale proceeds are not free collateral for unrelated BUYs',async()=>{
 const f=fixture();f.quote('SHORTX',20000);f.quote('LONGX',1000);
 assert.equal(await testing.fill(f.d1,f.order('open','SHORTX','SELL',450,'ENTRY'),now),true);
 assert.equal(f.value('SELECT qty FROM positions WHERE symbol=\'SHORTX\''),-450);
 const available=f.value('SELECT cash_paise FROM account')-450*19990;
 const buyCost=10000*(1000+1)+Math.ceil(10000*(1000+1)/1000);
 assert.ok(available<buyCost,'BUY would consume short reserved proceeds');
 assert.ok(f.value('SELECT cash_paise FROM account')>buyCost,'naive cash-only check would allow it');
 const before=f.value('SELECT cash_paise FROM account');
 assert.equal(await testing.fill(f.d1,f.order('overspend','LONGX','BUY',10000),now),false);
 assert.equal(f.value("SELECT status FROM orders WHERE id='overspend'"),'SKIPPED');
 assert.equal(f.value("SELECT COUNT(*) FROM positions WHERE symbol='LONGX'"),0);
 assert.equal(f.value('SELECT cash_paise FROM account'),before);
 assert.equal(f.value("SELECT COUNT(*) FROM events WHERE type='PAPER_FILL'"),1);
});

test('covering own existing paper short is still allowed',async()=>{
 const f=fixture();f.quote('SHORTX',20000);
 assert.equal(await testing.fill(f.d1,f.order('open','SHORTX','SELL',450,'ENTRY'),now),true);
 assert.equal(await testing.fill(f.d1,f.order('cover','SHORTX','BUY',450,'EXIT'),now),true);
 assert.equal(f.value("SELECT qty FROM positions WHERE symbol='SHORTX'"),0);
 assert.equal(f.value("SELECT intraday FROM positions WHERE symbol='SHORTX'"),0);
 assert.equal(f.value("SELECT COUNT(*) FROM events WHERE type='PAPER_FILL'"),2);
});

test('manual BUY may not flip short into a long in one fill',async()=>{
 const f=fixture();f.quote('SHORTX',20000);
 assert.equal(await testing.fill(f.d1,f.order('open','SHORTX','SELL',1,'ENTRY'),now),true);
 assert.equal(await testing.fill(f.d1,f.order('reverse','SHORTX','BUY',2),now),false);
 assert.equal(f.value("SELECT qty FROM positions WHERE symbol='SHORTX'"),-1);
 assert.equal(f.value("SELECT reason FROM orders WHERE id='reverse'"),'SHORT_REVERSAL_NOT_ALLOWED');
});

test('regular BUY without any short reserve still succeeds',async()=>{
 const f=fixture();f.quote('LONGX',10000);
 assert.equal(await testing.fill(f.d1,f.order('buy','LONGX','BUY',2),now),true);
 assert.equal(f.value("SELECT qty FROM positions WHERE symbol='LONGX'"),2);
 assert.equal(f.value("SELECT COUNT(*) FROM events WHERE type='PAPER_FILL'"),1);
 assert.ok(f.queries<10,'one simulated fill remains in the free D1 query budget');
});

test('09:40 ten-stock long strategy settles within 50 D1 queries in real SQLite',async()=>{
 const f=fixture();
 const start=Date.parse('2026-10-27T09:40:02+05:30');
 const at=start-1000;
 const put=f.sqlite.prepare(`INSERT INTO quotes(symbol,price_paise,cumulative_volume,observed_ms,source,exchange_open)
 VALUES(?,?,?,?,?,1)`);
 f.sqlite.exec('BEGIN');
 for(let i=0;i<500;i++)put.run(`SY${String(i).padStart(4,'0')}`,10000+i,1000000+i,at,'SYNTHETIC_REGRESSION');
 f.sqlite.exec('COMMIT');
 f.sqlite.prepare(`INSERT INTO coverage(session,eligible_count,observed_ms,nifty_change_bps,source)
 VALUES(?,?,?,?,?)`).run('2026-10-27',500,at,35,'SYNTHETIC_REGRESSION');
 f.sqlite.prepare("UPDATE settings SET value='1' WHERE key='strategy_enabled'").run();
 const outcome=await testing.tick({DB:f.d1},start);
 assert.equal(outcome.realOrdersEnabled,false);
 assert.equal(f.value("SELECT COUNT(*) FROM orders WHERE kind='ENTRY' AND status='FILLED'"),10);
 assert.equal(f.value("SELECT COUNT(*) FROM events WHERE type='PAPER_FILL'"),10);
 assert.equal(f.value("SELECT status FROM runs WHERE phase='ENTRY'"),'EXECUTED');
 assert.ok(f.queries<=50,`Cron uses ${f.queries} D1 queries (> 50 Free limit)`);
 const firstCash=f.value('SELECT cash_paise FROM account');
 await testing.tick({DB:f.d1},start+1000);
 assert.equal(f.value('SELECT cash_paise FROM account'),firstCash,'second Cron must not refill orders');
 assert.equal(f.value("SELECT COUNT(*) FROM orders WHERE kind='ENTRY'"),10);
});

test('short-direction 09:40 entry and 15:15 cover stay within D1 Free query budget',async()=>{
 const f=fixture(),open=Date.parse('2026-10-27T09:40:01+05:30');
 const put=f.sqlite.prepare(`INSERT INTO quotes(symbol,price_paise,cumulative_volume,observed_ms,source,exchange_open)
 VALUES(?,?,?,?,?,1)`);
 f.sqlite.exec('BEGIN');
 for(let i=0;i<500;i++)put.run(`SX${String(i).padStart(4,'0')}`,10000,100000+i,open-1000,'SYNTHETIC_REGRESSION');
 f.sqlite.exec('COMMIT');
 f.sqlite.prepare('INSERT INTO coverage(session,eligible_count,observed_ms,nifty_change_bps,source) VALUES(?,?,?,?,?)')
   .run('2026-10-27',500,open-1000,-45,'SYNTHETIC_REGRESSION');
 f.sqlite.prepare("UPDATE settings SET value='1' WHERE key='strategy_enabled'").run();
 await testing.tick({DB:f.d1},open);
 assert.equal(f.value("SELECT COUNT(*) FROM positions WHERE qty<0 AND intraday=1"),10);
 assert.equal(f.value("SELECT COUNT(*) FROM orders WHERE kind='ENTRY' AND status='FILLED'"),10);
 assert.ok(f.queries<=50,`09:40 short tick exceeds Workers Free: ${f.queries} queries`);
 const before=f.queries;
 const close=Date.parse('2026-10-27T15:15:00+05:30');
 f.sqlite.prepare('UPDATE quotes SET observed_ms=? WHERE symbol LIKE ?').run(close-1000,'SX%');
 await testing.tick({DB:f.d1},close);
 assert.equal(f.value("SELECT COUNT(*) FROM positions WHERE qty!=0 AND intraday=1"),0);
 assert.equal(f.value("SELECT COUNT(*) FROM orders WHERE kind='EXIT' AND status='FILLED'"),10);
 assert.equal(f.value("SELECT status FROM runs WHERE phase='EXIT'"),'EXECUTED');
 assert.ok(f.queries-before<=50,`15:15 cover tick exceeds Workers Free: ${f.queries-before} queries`);
});


test('unknown short entry price fails closed instead of releasing collateral',async()=>{
 const f=fixture();f.quote('LONGX',10000);
 f.sqlite.prepare('INSERT INTO positions(symbol,qty,entry_paise,intraday) VALUES(?,?,NULL,1)')
  .run('UNKNOWN',-5);
 assert.equal(await testing.fill(f.d1,f.order('nullreserve','LONGX','BUY',2),now),false);
 assert.equal(f.value("SELECT status FROM orders WHERE id='nullreserve'"),'SKIPPED');
 assert.equal(f.value("SELECT COUNT(*) FROM positions WHERE symbol='LONGX'"),0);
});
