import test from 'node:test';
import assert from 'node:assert/strict';
import {createSevenAccount,submitSevenSignal,settleSevenPending,sevenRiskExit} from '../src/seven-paper-ledger.js';
import {paperExperimentReport} from '../src/paper-experiment-report.js';
const T=Date.parse('2026-11-06T04:30:00Z'),KEY='NSE_EQ|INE002A01018';
const quote=(at,depth=10000)=>({source:'Upstox Analytics',instrumentKey:KEY,providerAt:new Date(at).toISOString(),observedAt:new Date(at).toISOString(),bid:{price:101,quantity:depth},ask:{price:101.1,quantity:depth},sourceSha256:'a'.repeat(64)});
for(const side of ['BUY','SELL'])test(side+' partial reductions conserve cash, quantities, fees and round-trip reporting',()=>{
 const base=createSevenAccount('scalpstorm_x',T-1000);
 let state=submitSevenSignal(base,{strategyId:base.strategyId,id:'partial-entry-test-0001',symbol:'RELIANCE',instrumentKey:KEY,side,signalAt:new Date(T).toISOString(),reason:'NIFTY_AND_OPENING_RANGE_CONFIRMED',realOrdersEnabled:false},T).state;
 state=settleSevenPending(state,'RELIANCE',quote(T+1000),T+1000).state;
 const qty=state.positions.RELIANCE.qty,at=Date.parse('2026-11-06T09:45:00Z');
 state=submitSevenSignal(state,sevenRiskExit(state,'RELIANCE',null,at),at).state;
 let fills=0,lastQuote;
 while(state.positions.RELIANCE){
  const stamp=at+1000+fills*1000;lastQuote=quote(stamp,48);
  const before=state;state=settleSevenPending(state,'RELIANCE',lastQuote,stamp).state;fills++;
  assert.equal(state.cashPaise+(state.positions.RELIANCE?.entryCostPaise||0),10000000+state.realizedPaise);
  assert.ok(state.fills.at(-1).qty<=12);
  const report=paperExperimentReport(state);assert.equal(report.historyComplete,true);
  if(state.positions.RELIANCE){
   assert.equal(report.closedTrades,0);assert.equal(report.equityINR,null);
   assert.equal(settleSevenPending(state,'RELIANCE',lastQuote,stamp).status,'WAIT_FRESH_QUOTE');
   assert.equal(before.positions.RELIANCE.qty-state.positions.RELIANCE.qty,state.fills.at(-1).qty);
  }
  assert.ok(fills<100);
 }
 const reductions=state.fills.slice(1);
 assert.equal(reductions.reduce((n,f)=>n+f.qty,0),qty);
 assert.equal(new Set(state.fills.map(f=>f.id)).size,state.fills.length);
 assert.equal(state.feesPaise,state.fills.reduce((n,f)=>n+f.feePaise,0));
 assert.equal(state.cashPaise,10000000+state.realizedPaise);
 assert.equal(Object.keys(state.pending).length,0);
 const report=paperExperimentReport(state);
 assert.equal(report.closedTrades,1);assert.equal(report.closedTradesJournal[0].quantity,qty);
 assert.equal(report.closedTradesJournal[0].netPnlINR,state.realizedPaise/100);
 assert.equal(report.closedTradesJournal[0].feesINR,state.feesPaise/100);
 assert.equal(report.realizedPnlSeries.reduce((n,f)=>n+Math.round(f.netPnlINR*100),0),state.realizedPaise);
});
test('insufficient quarter-book quantity cannot settle any part of an exit',()=>{
 const base=createSevenAccount('scalpstorm_x',T-1000);
 let s=submitSevenSignal(base,{strategyId:base.strategyId,id:'partial-no-depth-0001',symbol:'RELIANCE',instrumentKey:KEY,side:'BUY',signalAt:new Date(T).toISOString(),realOrdersEnabled:false},T).state;
 s=settleSevenPending(s,'RELIANCE',quote(T+1000),T+1000).state;
 const at=Date.parse('2026-11-06T09:45:00Z');s=submitSevenSignal(s,sevenRiskExit(s,'RELIANCE',null,at),at).state;
 assert.equal(settleSevenPending(s,'RELIANCE',quote(at+1000,3),at+1000).status,'WAIT_BOOK');
 assert.equal(s.fills.length,1);
});
