import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUpstoxV3} from '../src/upstox-adapter.js';
import {testing} from '../src/index.js';
const now=Date.parse('2026-10-27T09:39:52+05:30');
function fixture(){
 const universe=Array.from({length:500},(_,i)=>({
  symbol:`UNIT${String(i).padStart(4,'0')}`,instrument_token:`NSE_EQ|FICTION${String(i).padStart(5,'0')}`}));
 const payload={status:'success',data:{}};
 for(const [i,u] of universe.entries())payload.data[`NSE_EQ:${u.symbol}`]={
  symbol:u.symbol,instrument_token:u.instrument_token,last_price:50+i/100,
  volume:100000+i,timestamp:new Date(now-1500).toISOString(),last_trade_time:String(now-2000)};
 const index={status:'success',data:{'NSE_INDEX:Nifty 50':{
  instrument_token:'NSE_INDEX|Nifty 50',timestamp:new Date(now-1500).toISOString(),
  last_trade_time:String(now-1500),last_price:25150,prev_close_price:25000}}};
 return {payload,universe,receivedAt:now,index,sourceId:'SYNTHETIC_TEST_ONLY',authorized:true};
}
test('exact 500 symbol authorized Upstox V3 mapping and Nifty +60 bps',()=>{
 const result=normalizeUpstoxV3(fixture());
 assert.equal(result.quotes.length,500);assert.equal(result.coverage.eligible_count,500);
 assert.equal(result.coverage.nifty_change_bps,60);
 assert.equal(result.quotes[0].observed_at,new Date(now).toISOString());
 assert.equal(result.quotes[0].price_paise,5000);
 assert.ok(result.quotes.every(q=>!('_last_trade_ms' in q)));
});
test('a partial response cannot be disguised as a complete universe',()=>{
 const input=fixture();delete input.payload.data['NSE_EQ:UNIT0000'];
 assert.throws(()=>normalizeUpstoxV3(input),/missing or mismatched/);
});
test('reject wrong instrument keys, duplicated universe and absent entitlement',()=>{
 const key=fixture();key.payload.data['NSE_EQ:UNIT0000'].instrument_token='NSE_EQ|INVALID';
 assert.throws(()=>normalizeUpstoxV3(key),/mismatched/);
 const duplicate=fixture();duplicate.universe[1]=duplicate.universe[0];
 assert.throws(()=>normalizeUpstoxV3(duplicate),/duplicate instrument/);
 const noAccess=fixture();noAccess.authorized=false;
 assert.throws(()=>normalizeUpstoxV3(noAccess),/account and license/);
});
test('stale top-ten ticks reject potential fabricated intraday execution',()=>{
 const input=fixture();input.payload.data['NSE_EQ:UNIT0499'].last_trade_time=String(now-30000);
 assert.throws(()=>normalizeUpstoxV3(input),/stale trade price/);
});
test('invalid benchmark rejects direction rather than inventing Nifty signal',()=>{
 const input=fixture();input.index.data['NSE_INDEX:Nifty 50'].prev_close_price=0;
 assert.throws(()=>normalizeUpstoxV3(input),/benchmark price invalid/);
});

test('index without prev_close_price derives prior close from signed Upstox net_change',()=>{
 const rising=fixture();delete rising.index.data['NSE_INDEX:Nifty 50'].prev_close_price;
 rising.index.data['NSE_INDEX:Nifty 50'].net_change=150;
 assert.equal(normalizeUpstoxV3(rising).coverage.nifty_change_bps,60);
 const falling=fixture();const q=falling.index.data['NSE_INDEX:Nifty 50'];
 delete q.prev_close_price;q.last_price=24900;q.net_change=-100;
 assert.equal(normalizeUpstoxV3(falling).coverage.nifty_change_bps,-40);
});
test('benchmark rejects absent or contradictory previous-close evidence',()=>{
 const missing=fixture();const q=missing.index.data['NSE_INDEX:Nifty 50'];
 delete q.prev_close_price;q.ohlc={close:25150};
 assert.throws(()=>normalizeUpstoxV3(missing),/benchmark price invalid/);
 const conflicting=fixture();conflicting.index.data['NSE_INDEX:Nifty 50'].net_change=100;
 assert.throws(()=>normalizeUpstoxV3(conflicting),/benchmark fields disagree/);
});

test('Upstox normalized full snapshot passes Atlas fail-closed D1 ingestion contract',async()=>{
 const input=fixture();const normalized=normalizeUpstoxV3(input);let statementCount=0;
 const d1={prepare(){return {bind(){return {first:async()=>null,run:async()=>({meta:{changes:0}})}}}},
  async batch(statements){statementCount=statements.length;}};
 const outcome=await testing.ingest(d1,normalized,now,'SYNTHETIC_TEST_ONLY');
 assert.equal(outcome.accepted,500);assert.equal(statementCount,3);
});
