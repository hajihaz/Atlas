import test from 'node:test';
import assert from 'node:assert/strict';
import {readPeriodRank} from '../src/period-rank-reader.js';
test('legacy period reader cannot claim ETF results from fixed-ten equities',async()=>{
 const result=await readPeriodRank({HISTORY_DB:{}},{sourceDay:'2026-10-30',asOfDay:'2026-11-02',strategyId:'rsi2_snapback'});
 assert.equal(result.status,'WAITING_ETF_HISTORY');
 assert.deepEqual(result.selected,[]);
 assert.equal(result.realOrdersEnabled,false);
});
