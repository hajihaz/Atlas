import test from 'node:test';
import assert from 'node:assert/strict';
import {SEVEN_STRATEGIES,catalog,intradaySignal,replayIntradayDay,rankPeriod} from '../src/seven-strategy-replay.js';

const DAY='2026-10-30',START=Date.parse(DAY+'T03:45:00Z');
const ids=['scalpstorm_x','scalpstorm_x2','scalpstorm_x3','scalpstorm_xtreme','vwap_precision','rsi2_snapback','dual_momentum_rotation'];
function bars(){
 return Array.from({length:375},(_,i)=>{
  const close=i>=29?102:100;
  return {time:START+i*60000,open:100,high:Math.max(101,close),low:99,close,volume:1000};
 });
}
function context(){
 const stock=bars(),nifty=bars().map(x=>({...x,close:100.3,high:101}));
 return {symbol:'RELIANCE',niftyBars:nifty,
  roster:{day:DAY,eligibleCount:1368,knownAt:DAY+'T04:10:00Z',
   top:[{symbol:'RELIANCE',volume:25000},...Array.from({length:9},(_,i)=>({symbol:'STOCK'+i,volume:24000-i}))]},
  sameTimeVolumes:Array(20).fill(10000),sectorReturnBps:0,liquidityVolume:25000,
  news:{symbol:'RELIANCE',verified:true,material:true,direction:'BUY',publishedAt:DAY+'T04:05:00Z'},
  gift:{contract:'NOV26',referenceContract:'NOV26',decisionContract:'NOV26',
   referenceAt:DAY+'T01:00:00Z',decisionAt:DAY+'T04:00:00Z',referencePrice:25000,decisionPrice:25060}};
}
function daily(symbol,count,base=100){
 const end=Date.parse('2026-10-30T00:00:00Z');
 return {symbol,bars:Array.from({length:count},(_,i)=>{
  const day=new Date(end-(count-1-i)*86400000).toISOString().slice(0,10);
  const close=base+i*.15;
  return {day,open:close,high:close+1,low:close-1,close,knownAt:day+'T11:00:00Z'};
 })};
}
test('catalog exposes X and VWAP paper pilots and five unarmed owner strategies',()=>{
 assert.deepEqual(SEVEN_STRATEGIES.map(x=>x.id),ids);
 assert.equal(catalog().realOrdersEnabled,false);
 assert.equal(catalog().executionStatus,'X_VWAP_PAPER_PILOTS_ARMED_OTHER_FIVE_UNARMED');
 assert.equal(SEVEN_STRATEGIES.find(x=>x.id==='scalpstorm_x').executionStatus,'PAPER_PILOT_ARMED');
 assert.equal(SEVEN_STRATEGIES.find(x=>x.id==='vwap_precision').executionStatus,'PAPER_PILOT_ARMED');
 assert.ok(SEVEN_STRATEGIES.filter(x=>!['scalpstorm_x','vwap_precision'].includes(x.id)).every(x=>x.paperOnly&&x.executionStatus==='SIGNAL_ONLY_UNARMED'));
});
test('ScalpStorm X waits for completed 5-minute breakout and next-minute entry',()=>{
 const result=intradaySignal('scalpstorm_x',bars(),context());
 assert.equal(result.status,'SIGNAL');
 assert.equal(result.side,'BUY');
 assert.equal(result.signalBarTime,START+29*60000);
 assert.equal(result.nextOpenTime,START+30*60000);
 const opening=context();opening.niftyBars=opening.niftyBars.slice(0,15);
 assert.equal(intradaySignal('scalpstorm_x',bars(),opening).status,'SIGNAL');
 const live=context();live.niftyBars=[
  {...live.niftyBars[0],sourceKnownAt:DAY+'T03:46:10Z'},
  {...live.niftyBars[14],sourceKnownAt:DAY+'T04:00:10Z'}];
 assert.equal(intradaySignal('scalpstorm_x',bars(),live).status,'SIGNAL');
 const replay=replayIntradayDay('scalpstorm_x',bars(),{context:context()});
 assert.equal(replay.fills.length,0);
 assert.equal(replay.realizedPaise,null);
});
test('X2 uses same-contract GIFT and rejects strong Nifty conflict',()=>{
 const c=context();
 assert.equal(intradaySignal('scalpstorm_x2',bars(),c).status,'SIGNAL');
 c.gift.decisionContract='DEC26';
 assert.throws(()=>intradaySignal('scalpstorm_x2',bars(),c),/same-contract GIFT/);
 const opposite=context();opposite.niftyBars=opposite.niftyBars.map(x=>({...x,close:99.7}));
 assert.equal(intradaySignal('scalpstorm_x2',bars(),opposite).reason,'NIFTY_CONFLICT');
});
test('X3 needs verified dated news and liquidity before a signal',()=>{
 const c=context();
 assert.equal(intradaySignal('scalpstorm_x3',bars(),c).status,'SIGNAL');
 c.news.verified=false;
 assert.throws(()=>intradaySignal('scalpstorm_x3',bars(),c),/news missing/);
});
test('X3 never uses a breakout that happened before the news was published',()=>{
 const c=context();c.news.publishedAt=DAY+'T05:00:00Z'; // 10:30 IST
 const later=intradaySignal('scalpstorm_x3',bars(),c);
 assert.equal(later.status,'SIGNAL');
 assert.ok(later.signalBarTime>=START+79*60000);
 const onlyEarly=bars();
 for(let i=30;i<onlyEarly.length;i++)onlyEarly[i]={...onlyEarly[i],close:100,high:101};
 assert.equal(intradaySignal('scalpstorm_x3',onlyEarly,c).status,'NO_TRADE');
});
test('Xtreme and VWAP require their distinct source evidence',()=>{
 const c=context();
 assert.ok(['SIGNAL','NO_TRADE'].includes(intradaySignal('scalpstorm_xtreme',bars(),c).status));
 assert.ok(['SIGNAL','NO_TRADE'].includes(intradaySignal('vwap_precision',bars(),c).status));
 c.sameTimeVolumes=[];
 assert.throws(()=>intradaySignal('scalpstorm_xtreme',bars(),c),/RVOL/);
});
test('missing or corrupt minute and universe evidence fails closed',()=>{
 const b=bars();b.splice(3,1);
 assert.throws(()=>intradaySignal('scalpstorm_x',b,context()),/375-minute/);
 const c=context();c.roster.eligibleCount=10;
 assert.throws(()=>intradaySignal('scalpstorm_x',bars(),c),/full 09:40 roster/);
 assert.throws(()=>intradaySignal('sma_9_21',bars(),context()),/unknown intraday/);
});
test('RSI-2 and monthly rotation use prior published ETF bars only',()=>{
 const n=daily('NIFTYBEES',201);
 const swing=rankPeriod('rsi2_snapback','2026-11-02',[n],{mode:'FORWARD'});
 assert.equal(swing.strategyId,'rsi2_snapback');
 const gold=daily('GOLDBEES',127,90),equity=daily('NIFTYBEES',127,100);
 const rotation=rankPeriod('dual_momentum_rotation','2026-11-02',[equity,gold],{mode:'FORWARD'});
 assert.equal(rotation.selected.length,1);
 assert.equal(rotation.targetExposurePct,80);
 gold.bars.at(-1).knownAt='2026-11-02T04:00:00Z';
 assert.throws(()=>rankPeriod('dual_momentum_rotation','2026-11-02',[equity,gold],{mode:'FORWARD'}),/publication time/);
 assert.throws(()=>rankPeriod('weekly_5d_momentum_v1','2026-11-02',[n]),/unknown period/);
});
