import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cohortSpec} from '../src/upstox-history-cohort.js';
import {readIntradayStrategyReplay,readMarketReplay} from '../src/strategy-replay-reader.js';

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
function env(row){return {DB:{prepare:()=>({bind:()=>({first:async()=>null})})},HISTORY_DB:{prepare:()=>({bind:()=>({first:async()=>row})})}};}
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
test('private market playback returns only validated dated candles',async()=>{
 const replay=await readMarketReplay(env(fixture()),{day:DAY,symbol:SYMBOL});
 assert.equal(replay.coverage,'FIXED_TEN_STOCK_SAMPLE_NOT_FULL_MARKET');
 assert.equal(replay.bars.length,375);
 assert.equal(replay.bars[0].open,100);
 assert.equal(replay.bars.at(-1).volume,1000);
 assert.equal(replay.realOrdersEnabled,false);
 const altered=fixture();altered.response_body=altered.response_body.replace('1000','1001');
 await assert.rejects(readMarketReplay(env(altered),{day:DAY,symbol:SYMBOL}),/source hash mismatch/);
});
test('complete top-volume, Nifty and minute receipts yield an honest retrospective signal',async()=>{
 const observed=Date.parse(DAY+'T04:10:05Z'),stock=fixture(),key='NSE_EQ|INE002A01018';
 const top=[{symbol:'RELIANCE',instrument_key:key,cumulative_volume:50000,observed_ms:observed,source:'UPSTOX_ANALYTICS_READONLY_V3',captured:500},
  ...Array.from({length:9},(_,i)=>({symbol:'TEST'+i,instrument_key:`NSE_EQ|INE${String(i).padStart(9,'0')}`,
   cumulative_volume:40000-i,observed_ms:observed,source:'UPSTOX_ANALYTICS_READONLY_V3',captured:500}))];
 const nifty=[['09:15',DAY+'T03:46:10Z',Date.parse(DAY+'T03:45:00Z'),100],
  ['09:29',DAY+'T04:00:10Z',Date.parse(DAY+'T03:59:00Z'),100.3]].map(([target,known,time,price])=>{
   const body=JSON.stringify({status:'success',data:{'NSE_INDEX:Nifty 50':{instrument_token:'NSE_INDEX|Nifty 50',
    prev_ohlc:{ts:time,open:price,high:price+1,low:price-1,close:price,volume:0}}}});
   return {source_date:DAY,target_minute:target,source_url:'https://api.upstox.com/v3/market-quote/ohlc?instrument_key=NSE_INDEX%7CNifty%2050&interval=I1',
    known_at_utc:known,body_sha256:createHash('sha256').update(body).digest('hex'),body_bytes:Buffer.byteLength(body),response_body:body};
  });
 const source={DB:{prepare:sql=>({bind:()=>({first:async()=>sql.startsWith('SELECT eligible_count')?{eligible_count:500,observed_ms:observed,source:'UPSTOX_ANALYTICS_READONLY_V3'}:null,
   all:async()=>({results:top})})})},HISTORY_DB:{prepare:sql=>({bind:()=>({first:async()=>stock,all:async()=>({results:nifty})})})}};
 const result=await readIntradayStrategyReplay(source,{day:DAY,symbol:SYMBOL,strategyId:'scalpstorm_x'});
 assert.match(result.status,/^RETROSPECTIVE_/);assert.equal(result.result.fills.length,0);
 assert.equal(result.result.realizedPaise,null);assert.equal(result.realOrdersEnabled,false);
 assert.equal(result.niftySourceSha256.length,2);
});
