import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {testing} from '../src/index.js';

const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
function fixture(symbol,qty,price,observed){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);
 sqlite.prepare('INSERT INTO positions(symbol,qty,entry_paise,intraday) VALUES(?,?,?,1)').run(symbol,qty,price);
 sqlite.prepare('INSERT INTO quotes(symbol,price_paise,cumulative_volume,observed_ms,source,exchange_open) VALUES(?,?,?,?,?,1)')
  .run(symbol,price,100000,observed,'SYNTHETIC_REGRESSION');
 let queries=0;
 const db={prepare(sql){queries++;return {bind(...args){return {
  async first(){return sqlite.prepare(sql).get(...args)??null;},
  async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes}};},
  async all(){return {results:sqlite.prepare(sql).all(...args)};},
 };}};}};
 const value=sql=>Object.values(sqlite.prepare(sql).get())[0];
 return {sqlite,db,value,get queries(){return queries;}};
}

test('stale 15:15 paper exit retries with fresh quote, visibly marked late',async()=>{
 const at=Date.parse('2026-11-02T15:15:00+05:30'),f=fixture('LATE',5,1000,at-60000);
 await testing.tick({DB:f.db},at);
 assert.equal(f.value("SELECT status FROM orders WHERE kind='EXIT'"),'SKIPPED');
 assert.equal(f.value("SELECT status FROM runs WHERE phase='EXIT'"),'PARTIAL');
 assert.equal(f.value("SELECT qty FROM positions WHERE symbol='LATE'"),5);
 f.sqlite.prepare("UPDATE quotes SET observed_ms=? WHERE symbol='LATE'").run(at+59000);
 const before=f.queries;
 const outcome=await testing.tick({DB:f.db},at+60000);
 assert.equal(outcome.realOrdersEnabled,false);
 assert.equal(f.value("SELECT status FROM orders WHERE kind='EXIT'"),'FILLED');
 assert.equal(f.value("SELECT COUNT(*) FROM orders WHERE kind='EXIT'"),1);
 assert.equal(f.value("SELECT qty FROM positions WHERE symbol='LATE'"),0);
 assert.equal(f.value("SELECT status FROM runs WHERE phase='EXIT'"),'LATE_EXECUTED');
 assert.equal(f.value("SELECT reason FROM runs WHERE phase='EXIT'"),'LATE_AFTER_STALE_QUOTE');
 assert.ok(f.queries-before<=50,`late retry used ${f.queries-before} D1 queries`);
});

test('next-session paper carryover uses fresh quote and skips new 09:40 entry',async()=>{
 const at=Date.parse('2026-11-03T09:15:00+05:30'),f=fixture('CARRY',5,1000,at-60000);
 await testing.tick({DB:f.db},at);
 assert.equal(f.value("SELECT status FROM orders WHERE kind='RECOVERY'"),'SKIPPED');
 assert.equal(f.value("SELECT reason FROM runs WHERE phase='ENTRY'"),'CARRYOVER_RECOVERY');
 assert.equal(f.value("SELECT qty FROM positions WHERE symbol='CARRY'"),5);
 f.sqlite.prepare("UPDATE quotes SET observed_ms=? WHERE symbol='CARRY'").run(at+59000);
 const before=f.queries;
 await testing.tick({DB:f.db},at+60000);
 assert.equal(f.value("SELECT status FROM orders WHERE kind='RECOVERY'"),'FILLED');
 assert.equal(f.value("SELECT COUNT(*) FROM orders WHERE kind='RECOVERY'"),1);
 assert.equal(f.value("SELECT qty FROM positions WHERE symbol='CARRY'"),0);
 assert.ok(f.queries-before<=50,`recovery used ${f.queries-before} D1 queries`);
 await testing.tick({DB:f.db},Date.parse('2026-11-03T09:40:00+05:30'));
 assert.equal(f.value("SELECT COUNT(*) FROM orders WHERE kind='ENTRY'"),0);
 assert.equal(f.value("SELECT status FROM runs WHERE phase='ENTRY'"),'SKIPPED');
});
