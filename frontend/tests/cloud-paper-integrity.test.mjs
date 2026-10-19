import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertNextCloudSnapshot} from '../../scripts/paper_ledger_guard.mjs';
import {failureState,freshState} from '../../scripts/scheduled_paper_engine.mjs';
const original=()=>JSON.parse(readFileSync(new URL('../public/cloud-paper.json',import.meta.url),'utf8'));
const copy=x=>structuredClone(x);
test('published paper ledger accepts a genuinely recorded no-trade retry',()=>{
 const from=original();assert.equal(from.sessions.length,5);
 const at=Date.parse(from.lastRunAt)+10_000;
 const next=failureState(from,'provider lost',at);
 assert.equal(assertNextCloudSnapshot(from,next,at),true);
 assert.ok(next.sessions.every(s=>s.events.length===0));
});
test('a repeated completed candle cannot produce another synthetic BUY',()=>{
 const old=original(),at=Date.parse(old.lastRunAt)+20_000;
 const next=copy(old);next.runCount++;next.lastRunAt=new Date(at).toISOString();
 next.sessions[0].events.push({side:'BUY',quoteAt:new Date(at).toISOString(),
  barClosedAt:old.lastBarClosedAt,modeledPriceINR:8e6,
  quantity:0.012,feeINR:100,realizedPnlINR:null,
  mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'});
 assert.throws(()=>assertNextCloudSnapshot(old,next,at),/Duplicate modeled fill/);
});
test('repeated snapshots are monotonic and never authorize real orders',()=>{
 const old=original(),at=Date.parse(old.lastRunAt)+10_000;
 for(const mutate of [
  n=>{n.runCount=old.runCount;},
  n=>{n.realOrdersEnabled=true;},
  n=>{n.actualCapitalINR=10;},
  n=>{n.lastRunAt=new Date(at+100_000).toISOString();},
  n=>{n.sessions[0].cashINR=-1;},
  n=>{n.sessions=[];},
  n=>{n.lastBarClosedAt='2020-01-01T00:00:00Z';},
  n=>{n.sessions[0].strategyId=n.sessions[1].strategyId;},
 ]){
  const n=copy(old);n.runCount++;n.lastRunAt=new Date(at).toISOString();
  mutate(n);assert.throws(()=>assertNextCloudSnapshot(old,n,at));
 }
});
test('never backfill virtual entry orders into a first-run portfolio',()=>{
 const old=original(),now=Date.parse(old.lastRunAt);
 const seed={...old,sessions:[],runCount:0,lastRunAt:null,createdAt:null,
  lastBarClosedAt:null,status:'AWAITING_FIRST_RUN'};
 const next=freshState('BTCINR',Date.parse(old.lastBarClosedAt),now,
  {symbol:'BTCINR',sourceAt:new Date(now).toISOString()});
 assert.equal(assertNextCloudSnapshot(seed,next,now),true);
 const fake=copy(next);fake.sessions[0].quantity=1;
 assert.throws(()=>assertNextCloudSnapshot(seed,fake,now),/backfill fills/);
});
test('duplicate trades for the same strategy/source candle are rejected',()=>{
 const old=original(),now=Date.parse(old.lastRunAt)+7200000;
 const trial=copy(old);trial.runCount++;trial.lastRunAt=new Date(now).toISOString();
 trial.lastBarClosedAt=new Date(Date.parse(old.lastBarClosedAt)+7200000).toISOString();
 const ev={side:'BUY',quoteAt:new Date(now).toISOString(),
  barClosedAt:trial.lastBarClosedAt,modeledPriceINR:8e6,
  quantity:0.01,feeINR:80,realizedPnlINR:null,
  mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'};
 trial.sessions[0].events.push(ev,ev);
 assert.throws(()=>assertNextCloudSnapshot(old,trial,now),/duplicate virtual fill/i);
 trial.sessions[0].events.splice(1,1);
 trial.status='GAP_SKIPPED';
 assert.throws(()=>assertNextCloudSnapshot(old,trial,now),/Fills forbidden/);
});
