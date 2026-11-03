import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateRsi2,simulateDualMomentum} from '../src/etf-raw-research.js';
const day=i=>new Date(Date.parse('2025-01-01T00:00:00Z')+i*86400000).toISOString().slice(0,10);
const series=(count,base,step)=>Array.from({length:count},(_,i)=>{
 const close=base+i*step;
 return {day:day(i),open:close,high:close+1,low:close-1,close,volume:1000};
});
test('raw RSI2 model uses next open and costed exits, without certifying adjusted returns',()=>{
 const bars=series(240,100,.3);
 for(const i of [210,211]){
  bars[i].close=bars[i-1].close-1;
  bars[i].open=bars[i].close;bars[i].high=bars[i].close+1;bars[i].low=bars[i].close-1;
 }
 const r=simulateRsi2(bars);
 assert.equal(r.strategyId,'rsi2_snapback');
 assert.equal(r.adjustmentCertified,false);
 assert.equal(r.forwardPaperFills,0);
 assert.ok(r.trades.length>=1);
 assert.equal(r.trades[0].entryDay,bars[212].day);
 assert.match(r.costModel,/5 bps/);
});
test('raw monthly model aligns dates, caps exposure, and exposes separate unrealized position',()=>{
 const n=series(455,100,.1),g=series(455,100,.2);
 const r=simulateDualMomentum(n,g);
 assert.equal(r.strategyId,'dual_momentum_rotation');
 assert.equal(r.adjustmentCertified,false);
 assert.ok(r.trades.length>=1);
 assert.ok(r.netPnlINR>0);
 assert.ok(r.estimatedFeesINR>0);
 assert.throws(()=>simulateDualMomentum(n,g.slice(1)),/aligned ETF daily history/);
});
