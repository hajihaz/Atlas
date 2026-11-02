import test from 'node:test';
import assert from 'node:assert/strict';
import {SEVEN_STRATEGIES} from '../src/seven-strategy-replay.js';
import {createSevenAccount,submitSevenSignal,settleSevenPending} from '../src/seven-paper-ledger.js';
const KEY='NSE_EQ|INE002A01018',T=Date.parse('2026-10-30T04:30:00Z');
const signal=(strategyId,side='BUY',at=T,id='signal-unique-000001')=>({strategyId,id,symbol:'RELIANCE',instrumentKey:KEY,side,signalAt:new Date(at).toISOString(),realOrdersEnabled:false});
const quote=(at=T+1000,price=100,quantity=1000)=>({source:'Upstox Analytics',instrumentKey:KEY,
 lastTradeAt:new Date(at).toISOString(),observedAt:new Date(at).toISOString(),
 bid:{price:price-.05,quantity},ask:{price:price+.05,quantity}});
test('all seven receive independent ₹100k paper accounts with no broker route',()=>{
 const accounts=SEVEN_STRATEGIES.map(s=>createSevenAccount(s.id,T-10000));
 assert.equal(accounts.length,7);
 assert.equal(new Set(accounts.map(x=>x.strategyId)).size,7);
 assert.ok(accounts.every(x=>x.cashPaise===10000000&&x.realOrdersEnabled===false));
});
test('signal cannot fill until a later fresh trade, then closes with integer cash ledger',()=>{
 const original=createSevenAccount('scalpstorm_x',T-10000);
 const accepted=submitSevenSignal(original,signal('scalpstorm_x'),T);
 assert.equal(accepted.status,'PENDING');
 assert.equal(original.cashPaise,10000000);
 assert.equal(submitSevenSignal(accepted.state,signal('scalpstorm_x'),T).status,'DUPLICATE_SIGNAL');
 assert.equal(settleSevenPending(accepted.state,'RELIANCE',quote(T),T).status,'WAIT_FRESH_QUOTE');
 const bought=settleSevenPending(accepted.state,'RELIANCE',quote(),T+1000);
 assert.equal(bought.status,'PAPER_FILLED');
 assert.ok(bought.state.cashPaise<10000000);
 assert.equal(bought.state.fills[0].mode,'HYPOTHETICAL_NEXT_OBSERVED_TRADE');
 const sellAt=T+2000,sellSignal=signal('scalpstorm_x','SELL',sellAt,'signal-unique-000002');
 const exit=submitSevenSignal(bought.state,sellSignal,sellAt);
 assert.equal(exit.status,'PENDING');
 const sold=settleSevenPending(exit.state,'RELIANCE',quote(T+3000,101),T+3000);
 assert.equal(sold.status,'PAPER_FILLED');
 assert.equal(Object.keys(sold.state.positions).length,0);
 assert.equal(sold.state.cashPaise,10000000+sold.state.realizedPaise);
 assert.equal(sold.state.fills.length,2);
});
test('forged, stale, missing-depth, same-tick and wrong-account evidence fail closed',()=>{
 const state=createSevenAccount('rsi2_snapback',T-10000);
 assert.throws(()=>submitSevenSignal(state,signal('scalpstorm_x'),T),/signal identity/);
 assert.throws(()=>submitSevenSignal(state,{...signal(state.strategyId),realOrdersEnabled:true},T),/signal identity/);
 const accepted=submitSevenSignal(state,signal(state.strategyId),T);
 assert.equal(settleSevenPending(accepted.state,'RELIANCE',quote(T+1000),T+20000).status,'WAIT_FRESH_QUOTE');
 assert.equal(settleSevenPending(accepted.state,'RELIANCE',{...quote(),ask:null},T+1000).status,'WAIT_BOOK');
 assert.equal(settleSevenPending(accepted.state,'RELIANCE',{...quote(),instrumentKey:'NSE_EQ|INE000000000'},T+1000).status,'WAIT_FRESH_QUOTE');
 assert.equal(settleSevenPending(accepted.state,'RELIANCE',quote(T+1000,100,1),T+1000).status,'NO_BUYING_POWER');
 assert.equal(Object.keys(state.positions).length,0);
});
