import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCompletedBars,captureLiveMinute,captureOpeningSeed} from '../src/live-minute-capture.js';

const day='2026-11-04',now=Date.parse(day+'T04:11:10Z'); // 09:41:10 IST
const barMs=Date.parse(day+'T04:10:00Z');
const top=Array.from({length:10},(_,i)=>({symbol:`S${i}`,instrument_key:`NSE_EQ|INE0000000${i}`,
 cumulative_volume:1000-i,observed_ms:Date.parse(day+'T04:10:00Z'),source:'UPSTOX_ANALYTICS_READONLY_V3',
 captured:10,keyed:10,distinct_keys:10}));
const payload=()=>({status:'success',data:Object.fromEntries(top.map(x=>[x.symbol,{instrument_token:x.instrument_key,
 prev_ohlc:{open:100,high:101,low:99,close:100.5,volume:500,ts:barMs}}]))});

test('completed ten-stock batch validates exact roster and minute',()=>{
 const result=normalizeCompletedBars(payload(),top,now);
 assert.equal(result.barMs,barMs);assert.equal(result.bars.length,10);
 const stale=payload();stale.data.S0.prev_ohlc.ts-=60000;
 assert.throws(()=>normalizeCompletedBars(stale,top,now),/stale or invalid completed bar/);
 const missing=payload();delete missing.data.S0;
 assert.throws(()=>normalizeCompletedBars(missing,top,now),/incomplete source response/);
});

test('cloud capture stores one immutable receipt and verifies rerun without fetching',async()=>{
 let saved=null,roster=null,gets=0;
 const history={prepare(sql){return {bind(...args){return {
  async first(){return sql.includes('live_top_roster')?roster:saved},
  async run(){if(sql.includes('live_top_roster'))roster??={known_at_ms:args[1],roster_sha256:args[2],roster_json:args[3]};
   else saved??={bar_ms:args[1],known_at_ms:args[2],source_url:args[3],body_sha256:args[4],bars_json:args[5]};
   return {meta:{changes:1}}}
 }}}}};
 const live={prepare(sql){return {bind(){return {
  async first(){return {eligible_count:10,observed_ms:Date.parse(day+'T04:10:00Z'),source:'UPSTOX_ANALYTICS_READONLY_V3'}},
  async all(){return {results:top}}
 }}}}};
 const env={DB:live,HISTORY_DB:history,UPSTOX_ANALYTICS_TOKEN:'x'.repeat(101)};
 const fetcher=async(url,options)=>{gets++;assert.match(url,/interval=I1/);assert.equal(options.method,'GET');return new Response(JSON.stringify(payload()),{status:200})};
 // topVolumeRoster requires a complete production-sized coverage receipt.
 top.forEach(x=>{x.captured=500;x.keyed=500;x.distinct_keys=500});
 live.prepare=sql=>({bind(){return {
  async first(){return {eligible_count:500,observed_ms:Date.parse(day+'T04:10:00Z'),source:'UPSTOX_ANALYTICS_READONLY_V3'}},
  async all(){return {results:top}}
 }}});
 const a=await captureLiveMinute(env,now,fetcher,()=>now);
 assert.equal(a.status,'CAPTURED');assert.equal(a.stocks,10);
 const b=await captureLiveMinute(env,now,fetcher,()=>now);
 assert.equal(b.status,'VERIFIED_EXISTING');assert.equal(gets,1);
 assert.equal(saved.body_sha256,a.sha256);
});

test('separate opening seed archives only the completed 09:15–09:39 bars',async()=>{
 const slot=Date.parse(day+'T04:12:00Z');let seed=null,gets=0;
 const compact=top.map(x=>({symbol:x.symbol,instrument_key:x.instrument_key,volume:x.cumulative_volume,eligibleCount:x.captured}));
 const json=JSON.stringify(compact);
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const roster={known_at_ms:Date.parse(day+'T04:10:00Z'),roster_sha256:sha,roster_json:json};
 const db={prepare(sql){return {bind(...args){return {
  async first(){return sql.includes('live_top_roster')?roster:seed},
  async run(){seed={instrument_key:args[1],symbol:args[2],known_at_ms:args[3],source_url:args[4],body_sha256:args[5],body_bytes:args[6],response_body:args[7],bars_json:args[8]};return {meta:{changes:1}}}
 }}}}};
 const candles=Array.from({length:25},(_,i)=>{
  const local=new Date(Date.parse(day+'T03:45:00Z')+19800000+i*60000).toISOString().slice(0,19)+'+05:30';
  return [local,100,101,99,100.5,500];
 });
 const fetcher=async()=>{gets++;return new Response(JSON.stringify({status:'success',data:{candles}}),{status:200})};
 const env={DB:{},HISTORY_DB:db,UPSTOX_ANALYTICS_TOKEN:'x'.repeat(101)};
 const result=await captureOpeningSeed(env,slot,fetcher,()=>slot+1000);
 assert.equal(result.status,'CAPTURED');assert.equal(result.bars,25);assert.equal(result.symbol,'S0');
 assert.equal(JSON.parse(seed.bars_json).length,25);
 const again=await captureOpeningSeed(env,slot,fetcher,()=>slot+1000);
 assert.equal(again.status,'VERIFIED_EXISTING');assert.equal(gets,1);
});
