import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {archiveHistoryPilot,readHistoryPilot,validateHistoricalCandles} from '../src/upstox-history-pilot.js';

const schema=readFileSync(new URL('../history-pilot.sql',import.meta.url),'utf8');
const valid={status:'success',data:{candles:[
 ['2026-10-29T09:16:00+05:30',100,102,99,101,5000,0],
 ['2026-10-29T09:15:00+05:30',99,100,98,100,4000,0],
]}};
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(schema);
 const db={prepare(query){return {bind(...params){return {
  async first(){return sql.prepare(query).get(...params)||null},
  async run(){const x=sql.prepare(query).run(...params);return {meta:{changes:x.changes}}},
 }}}}};
 return {sql,env:{HISTORY_DB:db,UPSTOX_ANALYTICS_TOKEN:'T'.repeat(120)}};
}

test('dated historical pilot accepts valid OHLCV and rejects future or duplicate minutes',()=>{
 assert.deepEqual(validateHistoricalCandles(valid),{candle_count:2,first_minute:'2026-10-29T09:15:00+05:30',last_minute:'2026-10-29T09:16:00+05:30'});
 const duplicate=structuredClone(valid);duplicate.data.candles[1][0]=duplicate.data.candles[0][0];
 assert.throws(()=>validateHistoricalCandles(duplicate),/duplicate/);
 const future=structuredClone(valid);future.data.candles[0][0]='2026-10-30T09:16:00+05:30';
 assert.throws(()=>validateHistoricalCandles(future),/invalid dated/);
});

test('pilot stores one authenticated retrospective receipt and verifies immutable replay',async()=>{
 const f=fixture();let calls=0;
 const fetcher=async(url,options)=>{
  calls++;
  assert.match(url,/historical-candle\/NSE_EQ%7CINE848E01016\/minutes\/1\/2026-10-29\/2026-10-29/);
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'manual');
  assert.equal(options.headers.Authorization,'Bearer '+'T'.repeat(120));
  return new Response(JSON.stringify(valid),{status:200,headers:{'content-type':'application/json'}});
 };
 const first=await archiveHistoryPilot(f.env,fetcher,()=>Date.parse('2026-10-30T03:00:00Z'));
 assert.equal(first.status,'CAPTURED');assert.equal(first.candle_count,2);assert.equal(calls,1);
 assert.equal(first.evidence_class,'HISTORICAL_PROVIDER_RETRIEVAL_AFTER_SESSION_NOT_LIVE_0940');
 assert.equal((await readHistoryPilot(f.env)).status,'CAPTURED');
 const second=await archiveHistoryPilot(f.env,async()=>{throw Error('must not refetch')});
 assert.equal(second.status,'VERIFIED_EXISTING');
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM history_samples').get().n,1);
 f.sql.prepare("UPDATE history_samples SET response_body='tampered'").run();
 await assert.rejects(archiveHistoryPilot(f.env,async()=>{throw Error('must not refetch')}),/integrity mismatch/);
});

test('pilot fails closed when credential, content type or source success is absent',async()=>{
 const f=fixture();
 await assert.rejects(archiveHistoryPilot({...f.env,UPSTOX_ANALYTICS_TOKEN:''},async()=>{throw Error('request must not be sent')}),/unavailable/);
 await assert.rejects(archiveHistoryPilot(f.env,async()=>new Response('{}',{status:200,headers:{'content-type':'text/html'}})),/content type/);
 await assert.rejects(archiveHistoryPilot(f.env,async()=>new Response(JSON.stringify({status:'error',data:{candles:[]},padding:'x'.repeat(60)}),{status:200,headers:{'content-type':'application/json'}})),/provider response shape/);
});
