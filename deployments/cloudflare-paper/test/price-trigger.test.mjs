import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {testing} from '../src/index.js';

const base=Date.parse('2026-11-03T10:01:00+05:30');
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 const d1={prepare(sql){return {bind(...args){return {
  async first(){return sqlite.prepare(sql).get(...args)??null;},
  async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes}};},
  async all(){return {results:sqlite.prepare(sql).all(...args)};}
 };}};}};
 const status=id=>sqlite.prepare('SELECT status FROM orders WHERE id=?').get(id)?.status;
 const putQuote=(price,at=base)=>sqlite.prepare(`INSERT INTO quotes(symbol,price_paise,cumulative_volume,observed_ms,source,exchange_open)
 VALUES('INFY',?,1000,?,'SYNTHETIC',1) ON CONFLICT(symbol) DO UPDATE SET price_paise=excluded.price_paise,observed_ms=excluded.observed_ms`).run(price,at);
 const input=(key,price=10100)=>({symbol:'INFY',side:'BUY',quantity:1,scheduled_at:new Date(base-60000).toISOString(),
  expires_at:new Date(base+3600000).toISOString(),trigger:{condition:'AT_OR_ABOVE',price_paise:price},idempotency_key:key});
 return {sqlite,d1,status,putQuote,input};
}
test('price order waits below threshold, fills once at fresh threshold, and idempotent retry matches',async()=>{
 const f=fixture(),key='threshold_order_1234',order=await testing.schedule(f.d1,f.input(key),base-120000);
 assert.deepEqual(await testing.schedule(f.d1,f.input(key),base-120000),order);
 f.putQuote(10000);
 assert.equal((await testing.tick({DB:f.d1},base)).processed,0);
 assert.equal(f.status(order.id),'QUEUED');
 f.putQuote(10100,base+1000);
 assert.equal((await testing.tick({DB:f.d1},base+1000)).processed,1);
 assert.equal(f.status(order.id),'FILLED');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM events WHERE type='PAPER_FILL'").get().n,1);
 await testing.tick({DB:f.d1},base+2000);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM events WHERE type='PAPER_FILL'").get().n,1);
});
test('stale quote cannot trigger, and expiry skips without a fill',async()=>{
 const f=fixture(),order=await testing.schedule(f.d1,f.input('stale_order_123456'),base-120000);
 f.putQuote(12000,base-60000);
 await testing.tick({DB:f.d1},base);
 assert.equal(f.status(order.id),'QUEUED');
 await testing.tick({DB:f.d1},base+3600001);
 assert.equal(f.status(order.id),'SKIPPED');
 assert.equal(f.sqlite.prepare('SELECT reason FROM orders WHERE id=?').get(order.id).reason,'TRIGGER_EXPIRED');
});
test('price order cannot collide with a different idempotency payload',async()=>{
 const f=fixture(),key='conflict_order_1234';
 await testing.schedule(f.d1,f.input(key),base-120000);
 await assert.rejects(testing.schedule(f.d1,f.input(key,10200),base-120000),/idempotency conflict/);
});
