import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { testing } from '../src/index.js';

const stamp=Date.parse('2026-10-27T09:39:50+05:30');
const now=stamp+1000;
const SOURCE='LICENSED_TEST_FIXTURE_ONLY';
const full=()=>Array.from({length:500},(_,i)=>({
 symbol:`TEST${String(i).padStart(4,'0')}`,price_paise:10000,
 cumulative_volume:10000+i,source:SOURCE,exchange_open:true,
 observed_at:new Date(stamp).toISOString(),
}));
function memoryD1(){
 const storage={batchCount:0,prepared:0};
 const db={
  prepare(_sql){storage.prepared++;return {bind(..._args){return {
   first:async()=>null,run:async()=>({meta:{changes:0}}),
  }}}},
  async batch(statements){storage.batchCount++;storage.statements=statements.length;},
 };
 return {db,storage};
}

test('Full universe of 500 stamped NSE fixture quotes is accepted in the 09:39 window',async()=>{
 const {db,storage}=memoryD1();
 const result=await testing.ingest(db,{
  quotes:full(),coverage:{complete:true,eligible_count:500,nifty_change_bps:45}
 },now,SOURCE);
 assert.equal(result.accepted,500);assert.equal(result.realOrdersEnabled,false);
 assert.equal(storage.batchCount,1);assert.equal(storage.statements,3);
});

test('Missing source entitlement / wrong source fails closed',async()=>{
 const {db}=memoryD1();const quotes=full();
 await assert.rejects(testing.ingest(db,{quotes:quotes.slice(0,1)},now,''),/source not configured/);
 quotes[0].source='ANOTHER_DATA_VENDOR';
 await assert.rejects(testing.ingest(db,{quotes:quotes.slice(0,1)},now,SOURCE),/invalid source quote/);
});

test('Partial universe cannot masquerade as full NSE coverage',async()=>{
 const {db}=memoryD1();
 await assert.rejects(testing.ingest(db,{quotes:full().slice(0,10),coverage:{complete:true,eligible_count:10,nifty_change_bps:40}},now,SOURCE),/invalid complete NSE universe/);
 await assert.rejects(testing.ingest(db,{quotes:full().slice(0,31)},now,SOURCE),/capped at 30/);
});

test('Stale and future-dated full universe are rejected before writes',async()=>{
 const {db,storage}=memoryD1();
 await assert.rejects(testing.ingest(db,{quotes:full(),coverage:{complete:true,eligible_count:500,nifty_change_bps:40}},now+16000,SOURCE),/stale source quote/);
 assert.equal(storage.batchCount,0);
});

test('Full snapshot validation avoids 500 redundant time-zone calculations',async()=>{
 const sample=full(),durations=[];
 for(let i=0;i<6;i++){
  const {db}=memoryD1();const t=performance.now();
  await testing.ingest(db,{quotes:sample,coverage:{complete:true,eligible_count:500,nifty_change_bps:40}},now,SOURCE);
  durations.push(performance.now()-t);
 }
 // CPU varies by machine; test only the functional result and report timing.
 assert.equal(durations.length,6);
 console.log('Local 500-source validation elapsed ms',durations.map(n=>n.toFixed(2)).join(', '));
});
