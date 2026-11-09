import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalInput,validateHistoricalDataset} from '../../scripts/nse_history_replay.mjs';
import {universe} from './nse-pilot-fixture.mjs';
const date='2026-09-18',start=Date.parse(date+'T09:15:00+05:30');
function dataset(){
  return{schema:'atlas.nse-fixed-history.v1',universe,dates:[date],
    history:Object.fromEntries(universe.map(u=>[u.symbol,{[date]:Array.from({length:375},(_,i)=>({
      time:start+i*60000,open:100+i*.01,high:102+i*.01,low:99+i*.01,close:101+i*.01,volume:1000+i}))}]))};
}
test('historical decision frame never reads the current candle high/low/close/volume or later candles',()=>{
  const original=dataset(),changed=structuredClone(original);
  const before=historicalInput(original,date,50);
  for(const u of universe){
    const rows=changed.history[u.symbol][date];
    rows[50].high=1e6;rows[50].low=.01;rows[50].close=1e5;rows[50].volume=1e9;
    for(let i=51;i<375;i++){rows[i].open=1e6;rows[i].high=1e6;rows[i].close=1e6;rows[i].volume=1e9;}
  }
  assert.deepEqual(historicalInput(changed,date,50),before);
  assert.equal(before.input.history.RELIANCE.bars.length,50);
  assert.equal(before.input.quotes[0].depth.buy.quantity,original.history.RELIANCE[date][49].volume);
  assert.equal(before.input.dataClass,'HISTORICAL_CANDLE_SIMULATION');
});
test('historical pilot rejects incomplete or shifted cross-stock session grids',()=>{
  assert.equal(validateHistoricalDataset(dataset()).dates.length,1);
  const missing=dataset();missing.history.RELIANCE[date].pop();
  assert.throws(()=>validateHistoricalDataset(missing));
  const shifted=dataset();shifted.history.RELIANCE[date][0].time+=60000;
  assert.throws(()=>validateHistoricalDataset(shifted));
});
