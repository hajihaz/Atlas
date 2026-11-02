import test from 'node:test';
import assert from 'node:assert/strict';
import {readFastPeriodRank} from '../src/fast-period-rank.js';
const env={HISTORY_DB:{}};
test('ETF swing and monthly routes report the missing adjusted ETF archive',async()=>{
 for(const strategyId of ['rsi2_snapback','dual_momentum_rotation']){
  const result=await readFastPeriodRank(env,{sourceDay:'2026-10-30',asOfDay:'2026-11-02',strategyId});
  assert.equal(result.status,'WAITING_ETF_HISTORY');
  assert.deepEqual(result.selected,[]);
  assert.equal(result.realOrdersEnabled,false);
 }
});
test('old strategy IDs and invalid timing are rejected',async()=>{
 await assert.rejects(readFastPeriodRank(env,{sourceDay:'2026-10-30',asOfDay:'2026-11-02',strategyId:'weekly_5d_momentum_v1'}),/invalid ETF/);
 await assert.rejects(readFastPeriodRank(env,{sourceDay:'2026-11-02',asOfDay:'2026-10-30',strategyId:'rsi2_snapback'}),/invalid ETF/);
});
