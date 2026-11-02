import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {archiveNiftyLiveOhlc,readNiftyOpening} from '../src/nifty-live-ohlc.js';

const day='2026-11-03',first=Date.parse(day+'T03:46:10Z'),last=Date.parse(day+'T04:00:10Z');
function fixture(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../nifty-opening-ohlc.sql',import.meta.url),'utf8'));
 const db={prepare(query){return {bind(...args){return {
  async first(){return sql.prepare(query).get(...args)||null},
  async all(){return {results:sql.prepare(query).all(...args)}},
  async run(){const result=sql.prepare(query).run(...args);return {meta:{changes:result.changes}}},
 }}}}};
 return {sql,env:{HISTORY_DB:db,UPSTOX_ANALYTICS_TOKEN:'T'.repeat(120)}};
}
function response(time,price){return new Response(JSON.stringify({status:'success',data:{'NSE_INDEX:Nifty 50':{
 instrument_token:'NSE_INDEX|Nifty 50',prev_ohlc:{ts:time,open:price,high:price+1,low:price-1,close:price+.5,volume:0}}}}),{headers:{'content-type':'application/json'}})}
test('cloud captures only two completed Nifty opening minutes and verifies immutable source',async()=>{
 const f=fixture();let calls=0;
 const a=await archiveNiftyLiveOhlc(f.env,first,async(url,request)=>{calls++;assert.match(url,/interval=I1$/);assert.equal(request.method,'GET');
  return response(Date.parse(day+'T03:45:00Z'),25000)},()=>first+500);
 assert.equal(a.status,'CAPTURED');assert.equal(a.targetMinute,'09:15');
 const b=await archiveNiftyLiveOhlc(f.env,last,async()=>{calls++;return response(Date.parse(day+'T03:59:00Z'),25020)},()=>last+500);
 assert.equal(b.targetMinute,'09:29');assert.equal(calls,2);
 const opened=await readNiftyOpening(f.env,day);
 assert.equal(opened.bars.length,2);assert.equal(opened.bars[0].time,Date.parse(day+'T03:45:00Z'));
 assert.equal(opened.bars[1].time,Date.parse(day+'T03:59:00Z'));
 assert.equal(opened.realOrdersEnabled,false);
 const replay=await archiveNiftyLiveOhlc(f.env,first,async()=>{throw Error('refetch')},()=>first+1000);
 assert.equal(replay.status,'VERIFIED_EXISTING');
 f.sql.prepare("UPDATE nifty_open_ohlc_receipts SET response_body='altered' WHERE target_minute='09:15'").run();
 await assert.rejects(readNiftyOpening(f.env,day),/hash or timing mismatch/);
});
test('wrong minute, late receipt and partial opening never become valid',async()=>{
 const f=fixture();
 await assert.rejects(archiveNiftyLiveOhlc(f.env,first,async()=>response(Date.parse(day+'T03:44:00Z'),25000),()=>first+500),/candle missing/);
 await assert.rejects(archiveNiftyLiveOhlc(f.env,first,async()=>response(Date.parse(day+'T03:45:00Z'),25000),()=>first+60000),/outside source minute/);
 await assert.rejects(readNiftyOpening(f.env,day),/both completed opening candles required/);
 await assert.rejects(archiveNiftyLiveOhlc({...f.env,UPSTOX_ANALYTICS_TOKEN:''},first,async()=>{throw Error('provider called')}),/source unavailable/);
});
