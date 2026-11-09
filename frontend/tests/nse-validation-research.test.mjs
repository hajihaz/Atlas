import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionalCostSensitivity,validateTemporalProtocol} from '../../scripts/nse_validation_research.mjs';
import {CODE_HASH} from '../../scripts/nse_paper_store.mjs';
const fills=[{type:'FILL',strategyId:'sma_9_21',side:'BUY',quantity:1,pricePaise:10000,feePaise:10},
 {type:'FILL',strategyId:'sma_9_21',side:'SELL',quantity:1,pricePaise:11000,feePaise:11}];
const accounts=[{strategyId:'sma_9_21',netPnlINR:9.79}];
test('fixed-path friction arithmetic reproduces baseline and worsens with specified extra costs',()=>{
 const result=conditionalCostSensitivity(fills,accounts,[{feeBps:0,extraSlippageBps:0},
  {feeBps:10,extraSlippageBps:0},{feeBps:20,extraSlippageBps:5}]);
 assert.deepEqual(result.map(r=>r.sessions[0].netPnlINR),[10,9.79,9.47]);
 assert.ok(result.every(r=>r.method==='CONDITIONAL_FIXED_FILL_PATH_NOT_FULL_REEXECUTION'));
 assert.equal(accounts[0].netPnlINR,9.79);assert.equal(fills[0].pricePaise,10000);
});
test('friction audit rejects corrupted original fees, unknown accounts and invalid scenario costs',()=>{
 assert.throws(()=>conditionalCostSensitivity([{...fills[0],feePaise:0}],accounts,[{feeBps:10,extraSlippageBps:0}]));
 assert.throws(()=>conditionalCostSensitivity([{...fills[0],strategyId:'unknown'}],accounts,[{feeBps:10,extraSlippageBps:0}]));
 assert.throws(()=>conditionalCostSensitivity(fills,accounts,[{feeBps:-1,extraSlippageBps:0}]));
 assert.throws(()=>conditionalCostSensitivity(fills,accounts,[{feeBps:10,extraSlippageBps:NaN}]));
});
test('temporal protocol rejects overlapping dates and changed strategy configuration before dataset replay',()=>{
 const p={schema:'atlas.nse-validation-protocol.v1',codeHash:CODE_HASH,parameterTuning:false,
 capitalINREach:100000,perStockINR:10000,feeBpsEachSide:10,slippageBpsEachSide:5,spreadBpsEachSide:2,
 strategies:['sma_9_21','ema_12_26','rsi_14','breakout_20','sps_pullback'],
 trainingDates:['2026-10-19'],validationDates:['2026-10-19']};
 assert.throws(()=>validateTemporalProtocol(p,{dates:['2026-10-19']}),/overlap/);
 assert.throws(()=>validateTemporalProtocol({...p,parameterTuning:true},{dates:['2026-10-19']}),/protocol/);
 assert.throws(()=>validateTemporalProtocol({...p,trainingDates:['2026-02-31']},{dates:['2026-10-19']}),/dates/);
 assert.throws(()=>validateTemporalProtocol({...p,trainingDates:['2026-10-16']},
  {dates:['2026-10-19'],classification:'SYNTHETIC_FIXTURE'}),/classification/);
});
