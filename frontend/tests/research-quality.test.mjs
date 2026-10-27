import test from 'node:test';
import assert from 'node:assert/strict';
import {getLab} from '../api/strategy-lab.js';
test('the active catalog reports no invented source quality or historical performance',async()=>{
 const lab=await getLab();assert.equal(lab.schema,'atlas.owner-strategy-catalog.v1');
 assert.equal(lab.actualCapitalINR,0);assert.equal(lab.strategies.length,1);
 assert.equal(lab.strategies[0].results,null);assert.equal(lab.paperOnly,true);
 assert.equal(lab.realOrdersEnabled,false);
 for(const key of ['dataQuality','modeledReturnPct','barCount','endingEquityINR'])assert.equal(lab[key],undefined);
});
test('caller input cannot select an archived comparison or inject a simulated result',async()=>{
 for(const query of [{strategy:'sma_9_21'},{range:'10Y'},{result:100},{symbol:'NIFTY50'}])
  await assert.rejects(getLab(query),/unsupported/);
});
