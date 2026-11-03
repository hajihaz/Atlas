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
 const full={quotes:Array.from({length:1357},(_,i)=>({symbol:`MIS${String(i).padStart(4,'0')}`,
 price_paise:15000+i,cumulative_volume:100000+i,observed_at:new Date(now-1000).toISOString(),
 source:env.FEED_SOURCE_ID,exchange_open:true,instrument_key:`NSE_EQ|INE${String(i).padStart(9,'0')}`})),coverage:{complete:true,eligible_count:1357,nifty_change_bps:35}};
 return {sql,db,env,full,get queries(){return queries}};
}

test('free Cron ingests authenticated read-only MIS fixture, then paper-fills only on enabled strategy',async()=>{
 const f=fixture();f.sql.prepare("UPDATE settings SET value='1' WHERE key='strategy_enabled'").run();
 let sourced=0;
 const status=await testing.sourceTick(f.env,now,async()=>{sourced++;return f.full},undefined,()=>now);
 assert.equal(status.kind,'FULL_MIS');assert.equal(status.quotes,1357);assert.equal(sourced,1);
 const output=await testing.tick(f.env,now);
 assert.equal(output.realOrdersEnabled,false);
 assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM orders WHERE status='FILLED'").get().n,10);
 assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM events WHERE type='PAPER_FILL'").get().n,10);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM coverage').get().n,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM entry_snapshots').get().n,1357);
 assert.equal(f.sql.prepare("SELECT instrument_key FROM entry_snapshots WHERE symbol='MIS1356'").get().instrument_key,'NSE_EQ|INE000001356');
 assert.equal(f.sql.prepare("SELECT symbol FROM entry_snapshots ORDER BY cumulative_volume DESC,symbol ASC LIMIT 1").get().symbol,'MIS1356');
 assert.ok(f.queries<=50,`combined collector+simulation D1 queries ${f.queries}>50`);
 const report=await testing.daybook(f.db,'2026-10-27',now);
 assert.equal(report.entry_snapshot_count,1357);
 assert.equal(report.complete_0940_snapshot,true);
 assert.equal(report.top_volume[0].symbol,'MIS1356');
 assert.equal(report.top_volume.length,10);
 assert.equal(report.phases.find(x=>x.phase==='ENTRY').status,'EXECUTED');
 assert.equal(report.current_virtual_ledger.positions.length,10);
 await assert.rejects(testing.daybook(f.db,'2026-02-31',now),/invalid session date/);
 const again=await testing.sourceTick(f.env,now+500,async()=>{throw Error('second run must not call provider')},undefined,()=>now+500);
 assert.equal(again.kind,'ALREADY_SNAPSHOTTED');
 await testing.tick(f.env,now+500);
 assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM orders WHERE status='FILLED'").get().n,10);
});

test('strategy disabled still archives the full MIS roster without an entry',async()=>{
 const f=fixture();let sourced=0;
 const status=await testing.sourceTick(f.env,now,async()=>{sourced++;return f.full},
  async()=>({quotes:[]}),()=>now);
 assert.equal(sourced,1);assert.equal(status.kind,'FULL_MIS');
 await testing.tick(f.env,now);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
});

test('daybook refuses a counted but keyless 09:40 snapshot',async()=>{
 const f=fixture();
 await testing.sourceTick(f.env,now,async()=>f.full,undefined,()=>now);
 f.sql.prepare("UPDATE entry_snapshots SET instrument_key=NULL WHERE symbol='MIS1356'").run();
 const report=await testing.daybook(f.db,'2026-10-27',now);
 assert.equal(report.entry_snapshot_count,1357);
 assert.equal(report.keyed_snapshot_count,1356);
 assert.equal(report.complete_0940_snapshot,false);
});

test('next-minute cloud audit detects a persisted key loss',async()=>{
 const f=fixture();
 await testing.sourceTick(f.env,now,async()=>f.full,undefined,()=>now);
 f.sql.prepare("UPDATE entry_snapshots SET instrument_key=NULL WHERE symbol='MIS1356'").run();
 const after=now+60_000;
 await assert.rejects(testing.sourceTick(f.env,after,async()=>{throw Error('full source must not repeat')},undefined,()=>after),
  /persisted instrument identity mismatch/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM entry_snapshots').get().n,1357);
});


test('feed diagnostics expose only internal, bounded reason codes',()=>{
 const known=new Error('UPSTOX_COLLECTOR_BLOCKED: official provider HTTP 401');
 known.atlasDiagnostic='official provider HTTP 401';
 const d=testing.safeDiagnostic(known);
 assert.deepEqual(d,{type:'Error',message:'official provider HTTP 401'});
 const raw=new Error('UPSTOX_COLLECTOR_BLOCKED: Bearer abc123 access_token=xyz https://api.upstox.com');
 assert.deepEqual(testing.safeDiagnostic(raw),{type:'Error',message:'[unclassified]'});
});

test('feed diagnostics reject unknown or long details',()=>{
 assert.equal(testing.safeDiagnostic({name:'TypeError'}).message,'[unclassified]');
 assert.equal(testing.safeDiagnostic({name:'Error',atlasDiagnostic:'x'.repeat(1000)}).message,'[unclassified]');
 assert.equal(testing.safeDiagnostic({name:'Error',atlasDiagnostic:'access_token=secret'}).message,'[unclassified]');
});
