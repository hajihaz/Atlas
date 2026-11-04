import test from 'node:test';
import assert from 'node:assert/strict';
import {createSevenAccount} from '../src/seven-paper-ledger.js';
import {paperExperimentReport} from '../src/paper-experiment-report.js';
const T=Date.parse('2026-11-04T04:30:00Z');
const fill=(symbol,side,pnl,fee,time,reason='STRATEGY_SIGNAL')=>({symbol,side,pnlPaise:pnl,feePaise:fee,tradeAt:time,qty:10,pricePaise:10000,reason,riskPolicyVersion:'v1'});
test('no closed trades means no invented win rate, drawdown or profit factor',()=>{
 const s=createSevenAccount('scalpstorm_x',T);const r=paperExperimentReport(s);
 assert.equal(r.closedTrades,0);assert.equal(r.winRatePct,null);assert.equal(r.maxClosedPnlDrawdownINR,null);
 assert.equal(r.profitFactor,null);assert.equal(r.equityINR,100000);assert.equal(r.settingsLocked,true);
});
test('open cost is reported once and stale/unobserved equity remains null',()=>{
 const s=createSevenAccount('scalpstorm_x',T);s.fills=[fill('IDEA','BUY',0,100,T)];s.feesPaise=100;
 s.positions.IDEA={qty:10,entryPricePaise:10000,openedAt:T,direction:'LONG'};
 const r=paperExperimentReport(s);assert.equal(r.historyComplete,true);assert.equal(r.feesPaidINR,1);
 assert.equal(r.closedTrades,0);assert.equal(r.equityINR,null);assert.equal(r.unrealizedPnlINR,null);
 assert.equal(r.daily[0].day,'2026-11-04');assert.equal(r.daily[0].feesINR,1);
});
test('long and short round trips pair without treating a short entry as a closed sell',()=>{
 const s=createSevenAccount('scalpstorm_x',T);s.fills=[fill('A','BUY',0,100,T),fill('A','SELL',900,100,T+1000,'RISK_TARGET'),
  fill('B','SELL',0,100,T+2000),fill('B','BUY',-500,100,T+3000,'RISK_STOP')];s.feesPaise=400;s.realizedPaise=400;
 const r=paperExperimentReport(s);assert.equal(r.closedTrades,2);assert.equal(r.winRatePct,50);assert.equal(r.feesPaidINR,4);
 assert.equal(r.closedTradesJournal[0].netPnlINR,9);assert.equal(r.maxClosedPnlDrawdownINR,5);assert.equal(r.profitFactor,1.8);
 assert.equal(r.daily[0].realizedPnlINR,4);assert.equal(s.fills.length,4);
});
test('incomplete retained history suppresses totals and invalid fills fail closed',()=>{
 const s=createSevenAccount('scalpstorm_x',T);s.fills=[fill('A','SELL',100,100,T,'CARRYOVER_RECOVERY')];s.feesPaise=200;s.realizedPaise=100;
 const r=paperExperimentReport(s);assert.equal(r.historyComplete,false);assert.equal(r.closedTrades,null);assert.deepEqual(r.daily,[]);
 s.fills[0].feePaise=-1;assert.throws(()=>paperExperimentReport(s),/invalid fill/);
});
