import test from 'node:test';
import assert from 'node:assert/strict';
import {createNsePaper,advanceNsePaper,POLICY,summarizeNsePaper} from '../../scripts/nse_paper_engine.mjs';
import {NOW,START,universe,input,refresh} from './nse-pilot-fixture.mjs';
const seed=()=>createNsePaper(universe,START,'SYNTHETIC_QA');

test('ten-stock NSE allocation uses separate100000 INR accounts, whole shares, fees and cash-only sizing',()=>{
  const first=advanceNsePaper(seed(),input(),NOW);
  assert.equal(first.events.filter(x=>x.type==='FILL').length,0);
  const second=advanceNsePaper(first.state,refresh(input(),NOW+2000),NOW+2000);
  const sma=second.state.sessions.find(x=>x.strategyId==='sma_9_21');
  assert.equal(Object.keys(sma.positions).length,10);
  for(const p of Object.values(sma.positions)){
    assert.ok(Number.isInteger(p.quantity)&&p.quantity>0);
    assert.ok(p.entryCostPaise<=POLICY.slotPaise);
  }
  assert.ok(sma.cashPaise>=0&&sma.feesPaise>0);
  for(const event of second.events.filter(x=>x.type==='FILL')){
    assert.ok(event.sourceTradeAt>event.signalObservedAt);
    assert.equal(event.feePaise,Math.ceil(event.quantity*event.pricePaise*.001));
  }
  const report=summarizeNsePaper(second.state,second.events,NOW+2000);
  assert.equal(report.realOrdersEnabled,false);assert.equal(report.actualCapitalINR,0);
  assert.equal(report.qualified,false);assert.equal(report.certifiedScalpStormSessions,0);
});

test('same exchange trade cannot fill a pending signal merely because REST receive time advances',()=>{
  const first=advanceNsePaper(seed(),input(),NOW);
  const repeated=input();repeated.observedAt=new Date(NOW+2000).toISOString();
  repeated.marketObservedAt=repeated.observedAt;
  const second=advanceNsePaper(first.state,repeated,NOW+2000);
  assert.equal(second.events.filter(x=>x.type==='FILL').length,0);
});

test('duplicate input does not duplicate decisions, fills or cash changes',()=>{
  const first=advanceNsePaper(seed(),input(),NOW);
  const duplicate=advanceNsePaper(first.state,input(),NOW);
  assert.equal(duplicate.status,'DUPLICATE_INPUT');assert.deepEqual(duplicate.state,first.state);
  assert.deepEqual(duplicate.events,[]);
});

test('after-hours and closed-exchange observations never produce paper fills',()=>{
  const first=advanceNsePaper(seed(),input(),NOW);
  const data=refresh(input(),NOW+2000);
  data.market={exchange:'NSE',status:'CLOSING_END',marketOpen:false};
  const closed=advanceNsePaper(first.state,data,NOW+2000);
  assert.equal(closed.status,'MARKET_CLOSED');assert.deepEqual(closed.events,[]);
  assert.ok(closed.state.sessions.every(s=>Object.keys(s.pending).length===0));
  const evening=Date.parse('2026-10-26T20:00:00+05:30');
  assert.equal(advanceNsePaper(seed(),refresh(input(),evening),evening).status,'MARKET_CLOSED');
});

for(const kind of ['stale','future','wrong-source','wrong-universe','forged-orders','stale-market']){
  test('NSE refuses '+kind+' before changing its caller state',()=>{
    const state=seed(),before=structuredClone(state),data=input();
    if(kind==='stale')data.observedAt=new Date(NOW-11000).toISOString();
    if(kind==='future')data.observedAt=new Date(NOW+2000).toISOString();
    if(kind==='wrong-source')data.source='unverified';
    if(kind==='wrong-universe')data.universe[0].instrumentKey='NSE_EQ|INE999999999';
    if(kind==='forged-orders')data.realOrdersEnabled=true;
    if(kind==='stale-market')data.marketObservedAt=new Date(NOW-66000).toISOString();
    assert.throws(()=>advanceNsePaper(state,data,NOW));assert.deepEqual(state,before);
  });
}

for(const kind of ['missing-book','crossed-book','wide-spread','stale-trade','zero-size']){
  test('NSE refuses modeled fills on '+kind,()=>{
    const first=advanceNsePaper(seed(),input(),NOW),data=refresh(input(),NOW+2000);
    for(const q of data.quotes){
      if(kind==='missing-book')q.depth=null;
      if(kind==='crossed-book')q.depth.buy.price=122;
      if(kind==='wide-spread')q.depth.sell.price=125;
      if(kind==='stale-trade')q.lastTradeAt=new Date(NOW-12000).toISOString();
      if(kind==='zero-size')q.depth.sell.quantity=0;
    }
    assert.equal(advanceNsePaper(first.state,data,NOW+2000).events.filter(e=>e.type==='FILL').length,0);
  });
}

test('oversized visible liquidity does not override allocation and unavailable liquidity leaves exits unresolved',()=>{
  const first=advanceNsePaper(seed(),input(),NOW);
  const filled=advanceNsePaper(first.state,refresh(input(),NOW+2000),NOW+2000);
  const drop=refresh(input(),NOW+4000,50),risk=advanceNsePaper(filled.state,drop,NOW+4000);
  assert.equal(risk.events.filter(x=>x.type==='FILL').length,0);
  assert.ok(risk.state.sessions.every(s=>s.halted));
  const small=refresh(input(),NOW+6000,50);for(const q of small.quotes)q.depth.buy.quantity=1;
  const unresolved=advanceNsePaper(risk.state,small,NOW+6000);
  assert.equal(unresolved.events.filter(x=>x.type==='FILL').length,0);
  assert.ok(unresolved.state.sessions.some(s=>Object.keys(s.positions).length));
  const liquid=advanceNsePaper(unresolved.state,refresh(input(),NOW+8000,50),NOW+8000);
  assert.ok(liquid.events.some(x=>x.side==='SELL'));
  assert.ok(liquid.state.sessions.every(s=>Object.keys(s.positions).length===0));
  assert.ok(liquid.state.sessions.every(s=>s.realizedPaise<0));
});

test('missing warmup minute prevents hindsight signal generation',()=>{
  const data=input();
  for(const h of Object.values(data.history))h.bars.splice(-5,1);
  const result=advanceNsePaper(seed(),data,NOW);
  assert.ok(result.events.every(e=>e.action==='HOLD'));
  assert.ok(result.state.sessions.every(s=>Object.keys(s.pending).length===0));
});

test('unobserved pending entries expire rather than filling after a sleep gap',()=>{
  const first=advanceNsePaper(seed(),input(),NOW);
  const late=advanceNsePaper(first.state,refresh(input(),NOW+100000),NOW+100000);
  assert.equal(late.events.filter(e=>e.type==='FILL').length,0);
});

test('a historical/synthetic data class cannot enter a forward account',()=>{
  const forward=createNsePaper(universe,START,'FORWARD');
  assert.throws(()=>advanceNsePaper(forward,input(),NOW));
  const replay=createNsePaper(universe,START,'HISTORICAL_REPLAY');
  assert.throws(()=>advanceNsePaper(replay,input(),NOW));
});

test('session square-off is pending until a subsequent genuine observation',()=>{
  const first=advanceNsePaper(seed(),input(),NOW);
  const filled=advanceNsePaper(first.state,refresh(input(),NOW+2000),NOW+2000);
  const close=Date.parse('2026-10-26T15:20:00+05:30');
  const data=refresh(input(),close);
  const pending=advanceNsePaper(filled.state,data,close);
  assert.equal(pending.events.filter(e=>e.type==='FILL').length,0);
  const exits=advanceNsePaper(pending.state,refresh(input(),close+2000),close+2000);
  assert.ok(exits.events.some(e=>e.side==='SELL'));
  assert.ok(exits.state.sessions.every(s=>Object.keys(s.positions).length===0));
});
