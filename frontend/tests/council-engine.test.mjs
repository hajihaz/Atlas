import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCouncil} from '../src/lib/councilEngine.js';
const now=Date.parse('2026-10-20T03:00:00Z');
const fixture=()=>({
  schema:1,mode:'HISTORICAL_HYPOTHETICAL_REPLAY',
  currency:'INR',symbol:'BTCINR',source:'CoinDCX INR candles',
  generatedAt:'2026-10-20T02:00:00Z',
  latestClosedAt:'2026-10-20T01:00:00Z',
  barCount:150,liveOrdersEnabled:false,paperOrdersExecuted:false,
  paperLedgerStored:false,
  strategies:[{id:'sma_9_21',name:'SMA 9/21',modeledReturnPct:1.25,
    maxDrawdownPct:2.4,endingEquityINR:101250}],
});
test('exactly six distinct audited roles and no broker order',()=>{
 const result=evaluateCouncil(fixture(),'sma_9_21',now);
 assert.deepEqual(result.roles,['scout','news','sentiment','charts','risk','decision']);
 assert.equal(result.agents.length,6);
 assert.equal(result.outcome,'WAIT');
 assert.equal(result.liveOrdersEnabled,false);
 assert.equal(result.realOrdersPlaced,0);
 assert.equal(result.mode,'ADVISORY_RESEARCH_ONLY');
 assert.equal(result.agents[1].status,'NOT CONNECTED');
 assert.equal(result.agents[2].status,'NOT CONNECTED');
 assert.equal(result.agents[3].status,'HISTORICAL ONLY');
 assert.equal(result.agents[4].status,'SCREEN ONLY');
 assert.match(result.agents[5].detail,/No order/);
});
test('elevated historical drawdown triggers risk veto and skip',()=>{
 const source=fixture();
 source.strategies[0].maxDrawdownPct=6.5;
 const result=evaluateCouncil(source,'sma_9_21',now);
 assert.equal(result.agents[4].status,'VETO');
 assert.equal(result.outcome,'SKIP');
});
test('missing, corrupt and forged market evidence fail closed',()=>{
 for(const data of [
   null,{}, {...fixture(),barCount:0},
   {...fixture(),paperOrdersExecuted:true},
   {...fixture(),liveOrdersEnabled:true},
   {...fixture(),generatedAt:'2030-01-01T00:00:00Z'},
   {...fixture(),latestClosedAt:null},
   {...fixture(),strategies:[{id:'sma_9_21',name:'bad',
     modeledReturnPct:Infinity,maxDrawdownPct:0,endingEquityINR:100000}]},
 ]){
   const r=evaluateCouncil(data,'sma_9_21',now);
   assert.equal(r.outcome,'SKIP');
   assert.equal(r.realOrdersPlaced,0);
   assert.notEqual(r.agents[4].status,'SCREEN ONLY');
 }
});
test('unknown strategy cannot borrow the result of another',()=>{
 const r=evaluateCouncil(fixture(),'nonexistent',now);
 assert.equal(r.outcome,'SKIP');
 assert.equal(r.agents[3].status,'NO SIGNAL');
});
test('historical returns never produce BUY even if extremely positive',()=>{
 const lab=fixture();
 lab.strategies[0].modeledReturnPct=5000;
 for(let i=0;i<10;i++){
   const r=evaluateCouncil(lab,'sma_9_21',now+i*1000);
   assert.equal(r.outcome,'WAIT');
   assert.notEqual(r.outcome,'BUY');
 }
});
test('research screen appears only beside source-backed strategy data',()=>{
 const root=readFileSync(new URL('../src/components/StrategyLabPage.tsx',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../src/components/AgentCouncilPanel.tsx',import.meta.url),'utf8');
 const style=readFileSync(new URL('../src/strategy.css',import.meta.url),'utf8');
 assert.match(root,/lab&&<AgentCouncilPanel lab=\{lab\} strategyId=/);
 assert.match(panel,/Six-role research council/);
 assert.match(panel,/NOT CONNECTED|result\?\.status/);
 assert.match(panel,/No real or paper order/);
 assert.match(style,/@media\(max-width:640px\)/);
});
