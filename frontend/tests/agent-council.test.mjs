import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCouncil} from '../src/lib/councilEngine.js';

const NOW=Date.parse('2026-10-20T00:00:00Z');
const source=()=>({
 schema:1,mode:'HISTORICAL_HYPOTHETICAL_REPLAY',symbol:'BTCINR',
 currency:'INR',liveOrdersEnabled:false,paperOrdersExecuted:false,
 paperLedgerStored:false,barCount:100,source:'CoinDCX INR spot candles',
 generatedAt:'2026-10-19T23:59:00Z',
 latestClosedAt:'2026-10-19T23:00:00Z',
 strategies:[{id:'sma_9_21',name:'SMA 9/21 Crossover',
   modeledReturnPct:2.1,maxDrawdownPct:3.2,endingEquityINR:102100}],
});

test('council has six unique named research roles with no order authority',()=>{
 const result=evaluateCouncil(source(),'sma_9_21',NOW);
 assert.deepEqual(result.agents.map(a=>a.id),
  ['scout','news','sentiment','charts','risk','decision']);
 assert.equal(result.outcome,'WAIT');
 assert.equal(result.mode,'ADVISORY_RESEARCH_ONLY');
 assert.equal(result.liveOrdersEnabled,false);
 assert.equal(result.realOrdersPlaced,0);
 assert.equal(result.agents.find(a=>a.id==='news').status,'NOT CONNECTED');
 assert.equal(result.agents.find(a=>a.id==='sentiment').status,'NOT CONNECTED');
 assert.match(result.agents.find(a=>a.id==='charts').detail,/historical/i);
});

test('missing or tampered research evidence cannot generate a BUY',()=>{
 for(const data of [
   null,{}, {...source(),mode:'LIVE_ORDER'},
   {...source(),liveOrdersEnabled:true},
   {...source(),paperOrdersExecuted:true},
   {...source(),paperLedgerStored:true},
   {...source(),currency:'USD'},
   {...source(),barCount:12},
   {...source(),source:''},
   {...source(),generatedAt:'nonsense'},
   {...source(),latestClosedAt:'2050-01-01T00:00:00Z'},
   {...source(),strategies:[]},
 ]) {
   const result=evaluateCouncil(data,'sma_9_21',NOW);
   assert.equal(result.outcome,'SKIP');
   assert.equal(result.realOrdersPlaced,0);
 }
});

test('historical 5% drawdown screening threshold is a veto, not approval',()=>{
 const bad=source();
 bad.strategies[0].maxDrawdownPct=5.01;
 const rejected=evaluateCouncil(bad,'sma_9_21',NOW);
 assert.equal(rejected.outcome,'SKIP');
 assert.equal(rejected.agents.find(a=>a.id==='risk').status,'VETO');
 const atThreshold=source();
 atThreshold.strategies[0].maxDrawdownPct=5;
 const screened=evaluateCouncil(atThreshold,'sma_9_21',NOW);
 assert.equal(screened.outcome,'WAIT');
 assert.equal(screened.agents.find(a=>a.id==='risk').status,'SCREEN ONLY');
});

test('zero and negative hypothetical returns never become claimed earnings',()=>{
 const data=source();
 data.strategies[0].modeledReturnPct=-25;
 const result=evaluateCouncil(data,'sma_9_21',NOW);
 assert.equal(result.outcome,'WAIT');
 assert.match(result.rationale,/not .*investment returns/i);
 assert.match(result.agents.find(a=>a.id==='charts').detail,/modeled return -25\.00%/);
});

test('invalid price outcomes and missing strategy fail shut',()=>{
 const data=source();
 data.strategies[0].endingEquityINR=NaN;
 assert.equal(evaluateCouncil(data,'sma_9_21',NOW).outcome,'SKIP');
 assert.equal(evaluateCouncil(source(),'unknown',NOW).outcome,'SKIP');
 assert.throws(()=>evaluateCouncil(source(),'sma_9_21',NaN),/invalid council time/);
});

test('council cannot substitute stale confidence for independent live-risk and owner gates',()=>{
 const result=evaluateCouncil(source(),'sma_9_21',NOW);
 assert.equal(result.outcome,'WAIT');
 assert.match(result.agents.find(a=>a.id==='decision').detail,/No order/);
 assert.ok(!result.agents.some(a=>a.status==='BUY'||a.status==='APPROVED'));
});
