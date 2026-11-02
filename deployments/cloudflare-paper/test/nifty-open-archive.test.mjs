import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {archiveNiftyOpen,readNiftyOpen,verifyNiftyHistoricalSource,verifyNiftyOhlcSource} from '../src/nifty-open-archive.js';

const day='2026-11-03',at=Date.parse(day+'T04:01:10Z');
function fixture(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../nifty-open.sql',import.meta.url),'utf8'));
 const db={prepare(query){return {bind(...args){return {
  async first(){return sql.prepare(query).get(...args)||null},
  async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:r.changes}}},
 }}}}};
 return {sql,env:{HISTORY_DB:db,UPSTOX_ANALYTICS_TOKEN:'T'.repeat(120)}};
}
function candles(n=16){return {status:'success',data:{candles:Array.from({length:n},(_,i)=>{
 const minute=555+i,time=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
 return [day+'T'+time+':00+05:30',25000,25010,24990,25001,0,0];
})}}}
test('predecision cloud receipt saves exact Nifty opening bytes once',async()=>{
 const f=fixture();let calls=0;
 const fetcher=async(url,request)=>{calls++;assert.match(url,/intraday\/NSE_INDEX%7CNifty%2050\/minutes\/1$/);
  assert.equal(request.method,'GET');assert.equal(request.headers.Authorization,'Bearer '+'T'.repeat(120));
  return new Response(JSON.stringify(candles()),{headers:{'content-type':'application/json'}})};
 const first=await archiveNiftyOpen(f.env,at,fetcher,()=>at+1000);
 assert.equal(first.status,'CAPTURED');assert.equal(first.bars.length,15);
 assert.equal(first.bars[0].time,Date.parse(day+'T03:45:00Z'));
 const second=await archiveNiftyOpen(f.env,at+60000,async()=>{throw Error('refetch')},()=>at+60000);
 assert.equal(second.status,'VERIFIED_EXISTING');assert.equal(calls,1);
 const read=await readNiftyOpen(f.env,day);
 assert.equal(read.schema,'atlas.nifty-open.v1');assert.equal(read.bars.length,15);
 assert.equal(read.realOrdersEnabled,false);
 f.sql.prepare("UPDATE nifty_open_receipts SET response_body='changed'").run();
 await assert.rejects(readNiftyOpen(f.env,day),/hash or timing mismatch/);
});
test('missing candles, late response and wrong credential fail without a receipt',async()=>{
 const f=fixture(),reply=body=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
 await assert.rejects(archiveNiftyOpen(f.env,at,async()=>reply(candles(14)),()=>at+1000),/opening fifteen minute window incomplete/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM nifty_open_receipts').get().n,0);
 await assert.rejects(archiveNiftyOpen(f.env,at,async()=>reply(candles()),()=>Date.parse(day+'T04:10:00Z')), /response arrived after 0940/);
 await assert.rejects(archiveNiftyOpen({...f.env,UPSTOX_ANALYTICS_TOKEN:''},at,async()=>{throw Error('provider called')}),/capture unavailable/);
 await assert.rejects(readNiftyOpen(f.env,'2026-02-31'),/invalid date/);
});
test('dated source probe returns only bounded candle metadata',async()=>{
 const f=fixture(),prior='2026-11-02';
 const priorBars=candles();priorBars.data.candles=priorBars.data.candles.map(x=>[prior+x[0].slice(10),...x.slice(1)]);
 const result=await verifyNiftyHistoricalSource(f.env,prior,async(url,options)=>{
  assert.match(url,/NSE_INDEX%7CNifty%2050\/minutes\/1\/2026-11-02\/2026-11-02$/);
  assert.equal(options.method,'GET');
  return new Response(JSON.stringify(priorBars),{headers:{'content-type':'application/json'}});
 },()=>at);
 assert.equal(result.candleCount,16);
 assert.equal(result.valid,true);
 assert.equal(result.realOrdersEnabled,false);
 assert.equal(JSON.stringify(result).includes('25000'),false);
});
test('Nifty OHLC probe reveals only previous minute shape and timestamp',async()=>{
 const f=fixture();
 const value=await verifyNiftyOhlcSource(f.env,async(url,options)=>{
  assert.match(url,/market-quote\/ohlc\?instrument_key=NSE_INDEX%7CNifty%2050&interval=I1$/);
  assert.equal(options.method,'GET');
  return new Response(JSON.stringify({status:'success',data:{'NSE_INDEX:Nifty 50':{
   instrument_token:'NSE_INDEX|Nifty 50',prev_ohlc:{open:25000,high:25001,low:24999,close:25000,volume:0,ts:at}}}}),
   {headers:{'content-type':'application/json'}});
 });
 assert.equal(value.instrumentMatched,true);assert.equal(value.previousMinuteShape,true);
 assert.equal(JSON.stringify(value).includes('25000'),false);
});
