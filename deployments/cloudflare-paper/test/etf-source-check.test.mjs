import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyEtfSource} from '../src/etf-source-check.js';
const token='x'.repeat(120),day='2026-11-03';
test('ETF probe uses bounded official read-only GET and reports unadjusted bars',async()=>{
 let called=0;
 const fetcher=async(url,options)=>{called++;
  assert.match(url,/api\.upstox\.com\/v3\/historical-candle\/NSE_EQ%7CINF204KB14I2\/days\/1\/2026-11-03\/2025-01-01/);
  assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');
  return new Response(JSON.stringify({status:'success',data:{candles:[['2026-11-03T00:00:00+05:30',100,101,99,100,1000,0]]}}),
   {status:200,headers:{'content-type':'application/json'}});
 };
 const result=await verifyEtfSource({UPSTOX_ANALYTICS_TOKEN:token},{day,symbol:'NIFTYBEES',kind:'daily'},fetcher);
 assert.equal(result.records,1);assert.equal(result.adjusted,false);assert.equal(called,1);
});
test('ETF probe cannot route any mutation or unknown instrument',async()=>{
 let called=false;
 await assert.rejects(verifyEtfSource({UPSTOX_ANALYTICS_TOKEN:token},{day,symbol:'RELIANCE',kind:'daily'},()=>{called=true}),/invalid dated/);
 assert.equal(called,false);
});
