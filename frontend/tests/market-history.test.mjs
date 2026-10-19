import test from 'node:test';
import assert from 'node:assert/strict';
import handler, {getChart,normalizeCandles,candleRequestWindows,ASSETS,RANGES} from '../api/market-history.js';
const now=Date.parse('2026-10-19T12:00:00Z');
const valid=(time,close=85)=>({time,open:80,high:90,low:75,close,volume:120});
test('all selectable ranges and fixed INR markets are explicitly allowlisted',()=>{
 assert.deepEqual(Object.keys(RANGES),['1H','1D','1W','1M','1Y','5Y','ALL']);
 assert.deepEqual(Object.keys(ASSETS),['BTCINR','ETHINR','SOLINR','XRPINR','DOGEINR']);
 assert.throws(()=>candleRequestWindows(now,'UNKNOWN'));
});
test('only real provider candles are accepted, in sorted order; unfinished bars dropped',()=>{
 const first=now-3*60000,second=now-2*60000;
 const candles=normalizeCandles([
  valid(second),valid(now-60000),valid(first),
  valid(now),{...valid(now-4*60000),close:Infinity},
 ],{now,unit:60000,start:now-3600000,end:now});
 assert.deepEqual(candles.map(x=>x.time),[first,second,now-60000]);
 assert.ok(candles.every(x=>x.close===85));
});
test('duplicate historical timestamps fail instead of looking like two different trades',()=>{
 assert.throws(()=>normalizeCandles([valid(now-120000),valid(now-120000)],
 {now,unit:60000,start:now-3600000,end:now}),/duplicate/);
});
test('never allow fake OHLC, negative volume, future or invalid value',()=>{
 const set=[{...valid(now-300000),low:100},{...valid(now-300000),volume:-3},
 {...valid(now-300000),close:NaN},{...valid(now-300000),high:80.1,close:100}];
 const result=normalizeCandles(set,{now,unit:60000,start:now-3600000,end:now});
 assert.equal(result.length,0);
});
test('real provider URL uses fixed origin, audited INR market pair, and measured completed bars',async()=>{
 let calls=[];
 const fake=async(url,opts)=>{
  calls.push(url);
  assert.equal(opts.method,'GET');
  return {ok:true,text:async()=>JSON.stringify([valid(now-120000),valid(now-60000)])};
 };
 const r=await getChart({symbol:'BTCINR',range:'1H'},fake,now);
 assert.equal(r.currency,'INR');assert.equal(r.candles.length,2);
 assert.equal(r.candles[0].close,85);
 assert.equal(r.completeHistoryVerified,false);
 assert.equal(r.paperExecutionEnabled,false);assert.equal(r.realOrdersEnabled,false);
 assert.equal(calls.length,1);
 assert.match(calls[0],/^https:\/\/api\.coindcx\.com\/market_data\/candles\?/);
 assert.match(calls[0],/pair=I-BTC_INR/);assert.match(calls[0],/interval=1m/);
});
test('5Y and ALL chunk into bounded pages without claiming complete lifetime coverage',()=>{
 const five=candleRequestWindows(now,'5Y'),all=candleRequestWindows(now,'ALL');
 assert.ok(five.windows.length>=2);assert.ok(five.windows.length<=8);
 assert.ok(all.windows.length>=5&&all.windows.length<=8);
 for(const range of [five,all]){
  for(const w of range.windows)assert.ok(w.end>w.start);
 }
});
test('upstream errors do not fabricate past prices',async()=>{
 const data=await getChart({symbol:'SOLINR',range:'1D'},async()=>{throw Error('source offline')},now);
 assert.deepEqual(data.candles,[]);
 assert.equal(data.coverage,'unavailable');
});
test('unsafe HTTP methods, arbitrary symbols and ranges fail closed',async()=>{
 let status=0;
 const headers={};
 const response={setHeader(k,v){headers[k]=v},status(n){status=n;return this},json(v){return v}};
 assert.deepEqual(await handler({method:'POST',query:{}},response),{error:'method_not_allowed'});
 assert.equal(status,405);assert.equal(headers.Allow,'GET');
 const reject=await handler({method:'GET',query:{symbol:'HACKED',range:'ALL'}},response);
 assert.equal(status,400);assert.deepEqual(reject,{error:'unsupported_market_or_period'});
});
