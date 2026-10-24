import test from 'node:test';
import assert from 'node:assert/strict';
import {chartCandles,chartObservations} from '../src/lib/financialChartData.js';
const now=1800000000000;
const candle={time:now-60000,open:100,high:110,low:90,close:105,volume:20};
test('financial chart preserves provider OHLC and does not manufacture gap bars',()=>{
 const rows=[candle,{...candle,time:now-1000}];
 const result=chartCandles(rows,now);
 assert.equal(result.length,2);assert.equal(result[0].close,105);assert.equal(result[1].time-result[0].time,59);
 assert.deepEqual(rows,[candle,{...candle,time:now-1000}]);
});
test('invalid and duplicate source times, future bars and impossible candles fail closed',()=>{
 for(const rows of [[candle,candle],[{...candle,time:now+1}],[{...candle,high:80}],[{...candle,volume:-1}],[{...candle,close:NaN}]])
  assert.throws(()=>chartCandles(rows,now));
});
test('same-second events retain actual latest observation and never average prices',()=>{
 const rows=[{time:now-900,close:100},{time:now-200,close:110},{time:now-800,close:101}];
 assert.deepEqual(chartObservations(rows,0,now),[{time:Math.floor((now-200)/1000),value:110}]);
 assert.deepEqual(chartObservations(rows,now,now),[]);
 assert.throws(()=>chartObservations([{time:now,close:-1}],0,now));
});
