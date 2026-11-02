import test from 'node:test';
import assert from 'node:assert/strict';
import {dailySpec,validateDailyCandles,archiveDailyCohort,scheduledDailyCohortStep} from '../src/upstox-daily-cohort.js';
const DAY='2026-10-30',SYMBOL='RELIANCE',SPEC=dailySpec(DAY,SYMBOL);
function payload(){
 const days=[];for(let t=Date.parse(SPEC.from+'T00:00:00Z');t<=Date.parse(DAY+'T00:00:00Z');t+=86400000){
  const d=new Date(t),weekday=d.getUTCDay();if(weekday===0||weekday===6)continue;
  const day=d.toISOString().slice(0,10),price=100+days.length;
  days.push([day+'T00:00:00+05:30',price,price+2,price-2,price+1,10000,0]);
 }
 return {status:'success',data:{candles:days.reverse()}};
}
function fakeDb(){
 let row=null;
 return {prepare(sql){return {bind(...values){return {
  first:async()=>row,run:async()=>{if(!sql.startsWith('INSERT'))return;row={
   instrument_key:values[0],source_date:values[1],source_url:values[2],known_at_utc:values[3],
   body_sha256:values[4],body_bytes:values[5],candle_count:values[6],first_day:values[7],
   last_day:values[8],response_body:values[9],weekly_return_bps:values[10],monthly_return_bps:values[11],weekly_eligible:values[12],monthly_eligible:values[13]};}}}}},get saved(){return row}};
}
test('daily archive captures dated source once and verifies exact immutable bytes',async()=>{
 const db=fakeDb(),body=JSON.stringify(payload()),env={HISTORY_DB:db,UPSTOX_ANALYTICS_TOKEN:'x'.repeat(100)};
 const fetcher=async(url,opts)=>{assert.equal(url,SPEC.url);assert.equal(opts.method,'GET');return {status:200,headers:new Headers({'content-type':'application/json'}),text:async()=>body}};
 const clock=()=>Date.parse(DAY+'T12:00:00Z');
 const captured=await archiveDailyCohort(env,{source_date:DAY,symbol:SYMBOL},fetcher,clock);
 assert.equal(captured.status,'CAPTURED');
 assert.equal(captured.last_day,DAY);
 const existing=await archiveDailyCohort(env,{source_date:DAY,symbol:SYMBOL},()=>{throw Error('duplicate fetch')},clock);
 assert.equal(existing.body_sha256,captured.body_sha256);
 db.saved.response_body+=' ';
 await assert.rejects(archiveDailyCohort(env,{source_date:DAY,symbol:SYMBOL},fetcher,clock),/stored receipt hash/);
});
test('future, missing, malformed or partial daily bars fail closed',async()=>{
 assert.throws(()=>validateDailyCandles({status:'success',data:{candles:[]}},SPEC),/incomplete daily history/);
 const bad=payload();bad.data.candles[0][4]=0;
 assert.throws(()=>validateDailyCandles(bad,SPEC),/daily identity or OHLCV/);
 await assert.rejects(archiveDailyCohort({HISTORY_DB:fakeDb()}, {source_date:DAY,symbol:SYMBOL},()=>{},()=>Date.parse(DAY+'T12:00:00Z')), /read only source unavailable/);
 await assert.rejects(archiveDailyCohort({HISTORY_DB:fakeDb(),UPSTOX_ANALYTICS_TOKEN:'x'.repeat(100)}, {source_date:DAY,symbol:SYMBOL},()=>{},()=>Date.parse(DAY+'T09:00:00Z')), /session not complete/);
});
test('after-close cloud slot chooses one dated cohort identity',async()=>{
 const db=fakeDb(),body=JSON.stringify(payload()),env={HISTORY_DB:db,UPSTOX_ANALYTICS_TOKEN:'x'.repeat(100)};
 const result=await scheduledDailyCohortStep(env,Date.parse(DAY+'T12:07:00Z'),async()=>({status:200,headers:new Headers({'content-type':'application/json'}),text:async()=>body}),()=>Date.parse(DAY+'T12:07:30Z'));
 assert.equal(result.symbol,'RELIANCE');
 await assert.rejects(scheduledDailyCohortStep(env,Date.parse(DAY+'T11:07:00Z')),/invalid daily slot/);
});


test('same-day daily archive combines exact historical and intraday provider receipts',async()=>{
 const db=fakeDb(),historical=payload(),today=historical.data.candles.find(c=>c[0].slice(0,10)===DAY);
 historical.data.candles=historical.data.candles.filter(c=>c[0].slice(0,10)!==DAY);
 const historicalBody=JSON.stringify(historical),intradayBody=JSON.stringify({status:'success',data:{candles:[today]}});
 const env={HISTORY_DB:db,UPSTOX_ANALYTICS_TOKEN:'x'.repeat(100)},seen=[];
 const fetcher=async(url,opts)=>{
  seen.push(url);assert.equal(opts.method,'GET');
  const body=url===SPEC.url?historicalBody:url===SPEC.intradayUrl?intradayBody:null;
  assert.ok(body,'only two official daily sources are requested');
  return {status:200,headers:new Headers({'content-type':'application/json'}),text:async()=>body};
 };
 const clock=()=>Date.parse(DAY+'T12:00:00Z');
 const result=await archiveDailyCohort(env,{source_date:DAY,symbol:SYMBOL},fetcher,clock);
 assert.deepEqual(seen,[SPEC.url,SPEC.intradayUrl]);
 assert.equal(result.status,'CAPTURED');assert.equal(result.last_day,DAY);
 assert.equal(result.source_receipts.length,2);
 assert.equal(result.source_receipts[0].kind,'historical');
 assert.equal(result.source_receipts[1].kind,'intraday');
 assert.ok(result.source_receipts.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
 assert.ok(!JSON.stringify(result).includes(historicalBody),'raw provider body stays private');
 const verified=await archiveDailyCohort(env,{source_date:DAY,symbol:SYMBOL},()=>{throw Error('unexpected refetch')},clock);
 assert.equal(verified.status,'VERIFIED_EXISTING');
});
