import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {testing} from '../src/index.js';
const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
const now=Date.parse('2026-10-27T09:40:05+05:30');
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(schema);
 let queries=0;
 const db={prepare(query){queries++;return {bind(...params){return {
  async first(){return sql.prepare(query).get(...params)||null;},
  async all(){return {results:sql.prepare(query).all(...params)};},
  async run(){const result=sql.prepare(query).run(...params);return {meta:{changes:result.changes}}},
 }}}},
 async batch(stmts){sql.exec('BEGIN');try{let res=[];for(const stmt of stmts){
  if(typeof stmt.run==='function')res.push(await stmt.run());else throw Error('bad batch statement');
 }sql.exec('COMMIT');return res}catch(e){sql.exec('ROLLBACK');throw e}},
 };
 const env={DB:db,UPSTOX_FEED_ENABLED:'true',UPSTOX_ANALYTICS_TOKEN:'T'.repeat(120),FEED_SOURCE_ID:'UPSTOX_ANALYTICS_READONLY_V3'};
 const full={quotes:Array.from({length:500},(_,i)=>({symbol:`MIS${String(i).padStart(4,'0')}`,
 price_paise:15000+i,cumulative_volume:100000+i,observed_at:new Date(now-1000).toISOString(),
 source:env.FEED_SOURCE_ID,exchange_open:true})),coverage:{complete:true,eligible_count:500,nifty_change_bps:35}};
 return {sql,db,env,full,get queries(){return queries}};
}

test('free Cron ingests authenticated read-only MIS fixture, then paper-fills only on enabled strategy',async()=>{
 const f=fixture();f.sql.prepare("UPDATE settings SET value='1' WHERE key='strategy_enabled'").run();
 let sourced=0;
 const status=await testing.sourceTick(f.env,now,async()=>{sourced++;return f.full},undefined,()=>now);
 assert.equal(status.kind,'FULL_MIS');assert.equal(status.quotes,500);assert.equal(sourced,1);
 const output=await testing.tick(f.env,now);
 assert.equal(output.realOrdersEnabled,false);
 assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM orders WHERE status='FILLED'").get().n,10);
 assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM events WHERE type='PAPER_FILL'").get().n,10);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM coverage').get().n,1);
 assert.ok(f.queries<=50,`combined collector+simulation D1 queries ${f.queries}>50`);
 const again=await testing.sourceTick(f.env,now+500,async()=>{throw Error('second run must not call provider')},undefined,()=>now+500);
 assert.equal(again.kind,'ALREADY_SNAPSHOTTED');
 await testing.tick(f.env,now+500);
 assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM orders WHERE status='FILLED'").get().n,10);
});

test('strategy disabled means no full MIS fetch and no fabricated entry',async()=>{
 const f=fixture();let sourced=0;
 const status=await testing.sourceTick(f.env,now,async()=>{sourced++;return f.full},
  async()=>({quotes:[]}),()=>now);
 assert.equal(sourced,0);assert.equal(status.kind,'IDLE');
 await testing.tick(f.env,now);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
});
