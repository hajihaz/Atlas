import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDailySource,dailySpec} from '../src/upstox-daily-cohort.js';
const day='2026-11-02',symbol='AXISBANK',token='TEST_READONLY_'+ 'x'.repeat(100),env={UPSTOX_ANALYTICS_TOKEN:token};

test('owner daily source probe reveals bounded metadata without OHLC or token',async()=>{
 const expected=dailySpec(day,symbol).url;
 let calls=0;
 const fetcher=async(url,config)=>{
  calls++;assert.equal(url,expected);assert.equal(config.method,'GET');
  assert.equal(config.headers.Authorization,'Bearer '+token);
  return new Response(JSON.stringify({status:'success',data:{candles:[
   ['2026-10-30T00:00:00+05:30',100,102,99,101,1500],
   ['2026-11-02T00:00:00+05:30',101,103,100,102,1800],
  ]}}),{status:200,headers:{'content-type':'application/json'}});
 };
 const result=await verifyDailySource(env,{day,symbol,kind:'historical'},fetcher);
 assert.equal(calls,1);assert.equal(result.candle_count,2);
 assert.equal(result.last_day,day);assert.equal(result.includes_source_day,true);
 assert.equal(result.realOrdersEnabled,false);
 assert.ok(!JSON.stringify(result).includes('1800'));
 assert.ok(!JSON.stringify(result).includes(token));
});

test('current-day intraday daily probe is read-only and rejects absent token',async()=>{
 const url='https://api.upstox.com/v3/historical-candle/intraday/'+encodeURIComponent(dailySpec(day,symbol).key)+'/days/1';
 const fetcher=async(input,config)=>{
  assert.equal(input,url);assert.equal(config.method,'GET');
  return new Response(JSON.stringify({status:'success',data:{candles:[]}}),{status:200,headers:{'content-type':'application/json'}});
 };
 const result=await verifyDailySource(env,{day,symbol,kind:'intraday'},fetcher);
 assert.equal(result.candle_count,0);assert.equal(result.includes_source_day,false);
 await assert.rejects(verifyDailySource({UPSTOX_ANALYTICS_TOKEN:null},{day,symbol,kind:'historical'},()=>{throw Error('network should not run')}),/source unavailable/);
 await assert.rejects(verifyDailySource(env,{day,symbol,kind:'unknown'},()=>{throw Error('network should not run')}),/source kind/);
});
