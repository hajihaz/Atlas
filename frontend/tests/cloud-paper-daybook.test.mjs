import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCloudPaperSummary,istDay} from '../src/lib/cloudPaperDaybook.js';

const original=()=>JSON.parse(readFileSync(
 new URL('../public/cloud-paper.json',import.meta.url),'utf8'));
const cloned=()=>structuredClone(original());
const pick=report=>buildCloudPaperSummary(report).strategies[0];

test('deployed source ledgers create reproducible, read-only daybook results',()=>{
 const r=cloned(),s=buildCloudPaperSummary(r);
 assert.equal(s.mode,'PUBLIC_READ_ONLY_PAPER_DAYBOOK');
 assert.equal(s.actualCapitalINR,0);
 assert.equal(s.realOrdersEnabled,false);
 assert.equal(s.strategyAccountsAreIndependent,true);
 assert.equal(s.status,r.status);
 assert.equal(s.strategies.length,r.sessions.length);
 for(const v of s.strategies){
  assert.equal(v.virtualCapitalINR,100000);
  assert.equal(v.totalModeledPnlINR,v.virtualEquityINR-100000);
  assert.ok(v.days.every(d=>d.dayChangeINR===null||Number.isFinite(d.dayChangeINR)));
  assert.ok(v.days.every(d=>d.events.every(e=>e.note.includes('not a broker'))));
 }
 assert.deepEqual(buildCloudPaperSummary(r),s);
});
test('IST day boundaries are deterministic across browsers, source in UTC',()=>{
 assert.equal(istDay('2026-10-19T18:29:59Z'),'2026-10-19');
 assert.equal(istDay('2026-10-19T18:30:00Z'),'2026-10-20');
 assert.throws(()=>istDay('unknown'),/timestamp/);
});
test('consecutive checkpoint days show equity change from previous day, not profits invented from gaps',()=>{
 const r=cloned();
 if(r.sessions.length!==5) return;
 r.lastRunAt='2026-10-20T22:00:00Z';
 const one=r.sessions[0],at='2026-10-20T20:45:00Z';
 one.equityHistory=[...one.equityHistory,{at,equityINR:101200}];
 one.virtualEquityINR=101200;
 const s=pick(r);
 const newer=s.days.find(d=>d.dayIST==='2026-10-21');
 assert.ok(newer);
 assert.equal(newer.dayChangeINR,1200);
 assert.equal(newer.changeBasis,'PREVIOUS_CALENDAR_DAY_LAST_SNAPSHOT');
 assert.equal(s.totalModeledPnlINR,1200);
 const gap=cloned();gap.lastRunAt='2026-10-22T22:00:00Z';const g=gap.sessions[0];
 g.equityHistory=[...g.equityHistory,
 {at:'2026-10-22T20:45:00Z',equityINR:102000}];
 g.virtualEquityINR=102000;
 const far=pick(gap).days.find(d=>d.dayIST==='2026-10-23');
 assert.equal(far.dayChangeINR,null);
 assert.equal(far.changeBasis,'NOT_ENOUGH_ADJACENT_CHECKPOINTS');
});
test('modeled exits, buys, per-day fees preserve attribution without broker claims',()=>{
 const r=cloned(); if(r.sessions.length!==5)return;
 r.lastRunAt='2026-10-20T22:00:00Z';
 const session=r.sessions[0],at='2026-10-20T20:45:00Z';
 session.events.push(
  {side:'BUY',quoteAt:at,barClosedAt:'2026-10-20T20:00:00Z',
   modeledPriceINR:100,quantity:1,feeINR:0.10,realizedPnlINR:null,
   mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'},
  {side:'SELL',quoteAt:'2026-10-20T21:45:00Z',
   barClosedAt:'2026-10-20T20:00:00Z',modeledPriceINR:101,
   quantity:1,feeINR:0.10,realizedPnlINR:0.8,
   mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'});
 session.realizedPnlINR=0.8;session.closedTrades=1;session.feesINR=0.2;
 session.equityHistory.push({at,equityINR:100000.8});
 session.virtualEquityINR=100000.8;
 const day=pick(r).days.find(d=>d.dayIST==='2026-10-21');
 assert.equal(day.modeledBuys,1);
 assert.equal(day.modeledSells,1);
 assert.equal(day.modeledFeesINR,0.2);
 assert.equal(day.realizedExitPnlINR,0.8);
 assert.equal(day.dayChangeINR,0.8);
 assert.ok(day.events.every(e=>/HYPOTHETICAL/.test(e.note)));
});
test('bad data, duplicate sessions, nonfinite numbers, live-money flags fail closed',()=>{
 const src=cloned();
 const a=cloned();a.realOrdersEnabled=true;
 assert.throws(()=>buildCloudPaperSummary(a),/Untrusted/);
 const b=cloned();b.actualCapitalINR=1;
 assert.throws(()=>buildCloudPaperSummary(b),/Untrusted/);
 const c=cloned();c.sessions.push({...c.sessions[0]});
 assert.throws(()=>buildCloudPaperSummary(c),/Untrusted/);
 if(src.sessions.length){
  const d=cloned();d.sessions[0].virtualEquityINR=NaN;
  assert.throws(()=>buildCloudPaperSummary(d),/Unsafe/);
  const e=cloned();e.sessions[0].equityHistory.push({at:'invalid',equityINR:500});
  assert.throws(()=>buildCloudPaperSummary(e),/Invalid equity/);
  const f=cloned();f.sessions[1].strategyId=f.sessions[0].strategyId;
  assert.throws(()=>buildCloudPaperSummary(f),/Unsafe/);
 }
});
test('unstarted state remains an empty, truthful daybook without virtual fills',()=>{
 const seed=cloned();seed.status='AWAITING_FIRST_RUN';seed.sessions=[];
 const d=buildCloudPaperSummary(seed);
 assert.equal(d.strategies.length,0);
 assert.equal(d.actualCapitalINR,0);
 assert.throws(()=>buildCloudPaperSummary({...seed,status:'RUNNING'}),/Empty running/);
});
test('build/export is tied to source report, and UI has clickable date drilldown',()=>{
 const component=readFileSync(new URL('../src/components/CloudPaperCard.tsx',import.meta.url),'utf8');
 const script=readFileSync(new URL('../../scripts/build_cloud_paper_daybook.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/strategy.css',import.meta.url),'utf8');
 assert.match(component,/buildCloudPaperSummary\(d\)/);
 assert.match(component,/setSelectedDay\(d\.dayIST\)/);
 assert.match(component,/cloud-paper-daybook\.json/);
 assert.match(component,/No adjacent daily closing observations/);
 assert.match(script,/buildCloudPaperSummary\(data\)/);
 assert.match(script,/frontend\/public\/cloud-paper\.json/);
 assert.match(css,/\.cloud-daybook-dates/);
 assert.match(css,/@media\(max-width:640px\)/);
});

test('future, pre-start, non-hypothetical, or impossible source events fail closed',()=>{
 const data=cloned();if(data.sessions.length!==5)return;
 const makeEvent=()=>({side:'SELL',
   quoteAt:'2026-10-19T22:37:32.197Z',barClosedAt:'2026-10-19T22:00:00Z',
   modeledPriceINR:9000000,quantity:0.001,feeINR:9,
   realizedPnlINR:12,mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'});
 const later=cloned();
 later.sessions[0].equityHistory.push({at:'2026-10-25T10:00:00Z',equityINR:200000});
 assert.throws(()=>buildCloudPaperSummary(later),/Invalid equity observation/);
 const future=cloned();
 future.sessions[0].events.push({...makeEvent(),quoteAt:'2026-10-25T10:00:00Z'});
 assert.throws(()=>buildCloudPaperSummary(future),/Invalid modeled event/);
 const tampered=cloned();
 tampered.sessions[0].events.push({...makeEvent(),mode:'BROKER_ORDER'});
 assert.throws(()=>buildCloudPaperSummary(tampered),/Invalid modeled event/);
 const reverseTime=cloned();
 reverseTime.sessions[0].events.push({...makeEvent(),
   barClosedAt:'2026-10-20T22:00:00Z'});
 assert.throws(()=>buildCloudPaperSummary(reverseTime),/Invalid modeled event/);
 const fakeBuy=cloned();
 fakeBuy.sessions[0].events.push({...makeEvent(),side:'BUY',realizedPnlINR:50});
 assert.throws(()=>buildCloudPaperSummary(fakeBuy),/Invalid modeled event/);
 const missingPnl=cloned();
 missingPnl.sessions[0].events.push({...makeEvent(),realizedPnlINR:null});
 assert.throws(()=>buildCloudPaperSummary(missingPnl),/Invalid modeled event/);
 const badWindow=cloned();
 badWindow.lastRunAt='2026-10-18T00:00:00Z';
 assert.throws(()=>buildCloudPaperSummary(badWindow),/Invalid cloud-paper run provenance/);
});
