import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cohortSpec} from '../src/upstox-history-cohort.js';
import {readIntradayStrategyReplay} from '../src/strategy-replay-reader.js';

const DAY='2026-10-30',SYMBOL='RELIANCE',spec=cohortSpec({source_date:DAY,symbol:SYMBOL});
function fixture(){
 const candles=Array.from({length:375},(_,i)=>{
  const minute=555+i,clock=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
  const price=100+i*.03;
  return [DAY+'T'+clock+':00+05:30',price,price+1,price-1,price+.02,1000,0];
 });
 const body=JSON.stringify({status:'success',data:{candles}});
 return {instrument_key:spec.key,source_date:DAY,source_url:spec.intradayUrl,known_at_utc:DAY+'T10:31:00Z',
   body_sha256:createHash('sha256').update(body).digest('hex'),body_bytes:Buffer.byteLength(body),
   candle_count:375,first_minute:DAY+'T09:15:00+05:30',last_minute:DAY+'T15:29:00+05:30',response_body:body};
}
function env(row){return {HISTORY_DB:{prepare:()=>({bind:()=>({first:async()=>row})})}};}
test('owner replay checks exact source receipt and reports missing rule context',async()=>{
 const value=await readIntradayStrategyReplay(env(fixture()),{day:DAY,symbol:SYMBOL,strategyId:'scalpstorm_x'});
 assert.equal(value.status,'WAITING_REQUIRED_CONTEXT');
 assert.equal(value.result,null);
 assert.equal(value.minuteBars,375);
 assert.equal(value.realOrdersEnabled,false);
 assert.equal(value.sourceSha256,fixture().body_sha256);
});
test('missing or changed receipts and unsupported strategy fail closed',async()=>{
 await assert.rejects(readIntradayStrategyReplay(env(null),{day:DAY,symbol:SYMBOL,strategyId:'scalpstorm_x'}),/dated source missing/);
 const broken=fixture();broken.response_body+=' ';
 await assert.rejects(readIntradayStrategyReplay(env(broken),{day:DAY,symbol:SYMBOL,strategyId:'scalpstorm_x'}),/source hash mismatch/);
 await assert.rejects(readIntradayStrategyReplay(env(fixture()),{day:DAY,symbol:SYMBOL,strategyId:'dual_momentum_rotation'}),/invalid intraday strategy/);
});
