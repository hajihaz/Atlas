import test from 'node:test';
import assert from 'node:assert/strict';
import {getLab} from '../api/strategy-lab.js';

const unit=3600000,now=Date.parse('2026-10-26T12:30:00Z');
const makeBars=(n=60)=>Array.from({length:n},(_,i)=>({
 time:Math.floor(now/unit)*unit-(n-i)*unit,
 open:100,high:102,low:99,close:101,volume:10,
}));
const source=(candles,extra={})=>async({symbol,range})=>({
 schema:1,currency:'INR',symbol,range,realOrdersEnabled:false,paperExecutionEnabled:false,
 source:'SYNTHETIC QA source',generatedAt:new Date(now).toISOString(),
 earliestAvailable:null,latestClosedAt:null,coverage:'provider_observations',
 completeHistoryVerified:false,warning:'QA only',candles,...extra,
});

test('strategy response exposes missing intervals and stale truncated source before qualification',async()=>{
 const bars=makeBars().filter((_,i)=>i!==20).slice(0,-5);
 const lab=await getLab({},source(bars,{coverage:'partial'}),now);
 assert.equal(lab.dataQuality.observedMissingBars,1);
 assert.equal(lab.dataQuality.trailingMissingBars,5);
 assert.equal(lab.dataQuality.latestCandleAgeMs,5.5*unit);
 assert.ok(lab.dataQuality.leadingMissingBars>600);
 assert.ok(lab.dataQuality.warnings.some(x=>x.includes('replay spans gaps')));
 assert.ok(lab.dataQuality.warnings.some(x=>x.includes('partial')));
 assert.ok(lab.dataQuality.warnings.some(x=>x.includes('two intervals old')));
 assert.equal(lab.dataQuality.certified,false);
 assert.equal(lab.paperOrdersExecuted,false);
});

test('aligned source or upstream certification flag cannot qualify data or a strategy',async()=>{
 const lab=await getLab({},source(makeBars(),{completeHistoryVerified:true}),now);
 assert.equal(lab.dataQuality.observedMissingBars,0);
 assert.equal(lab.dataQuality.latestCandleAgeMs,unit/2);
 assert.equal(lab.dataQuality.sourceRightsStatus,'UNVERIFIED');
 assert.equal(lab.dataQuality.crossSourceStatus,'NOT_CHECKED');
 assert.equal(lab.dataQuality.strategyQualified,false);
 assert.equal(lab.dataQuality.certified,false);
 assert.equal(lab.dataQuality.market,'PUBLIC_CRYPTO_SPOT');
 assert.equal(lab.liveOrdersEnabled,false);
});

test('empty history has unknown coverage counts and no modeled returns',async()=>{
 const lab=await getLab({},source([],{coverage:'unavailable'}),now);
 assert.equal(lab.dataQuality.latestCandleAgeMs,null);
 assert.equal(lab.dataQuality.leadingMissingBars,null);
 assert.ok(lab.strategies.every(x=>x.status==='insufficient_history'));
 assert.ok(lab.strategies.every(x=>x.modeledReturnPct===undefined));
});

test('even short history rejects duplicate, unfinished and invalid candles',async()=>{
 const bars=makeBars(1);
 await assert.rejects(getLab({},source([bars[0],bars[0]]),now),/invalid/);
 await assert.rejects(getLab({},source([{...bars[0],time:Math.floor(now/unit)*unit}]),now),/unfinished/);
 await assert.rejects(getLab({},source([{...bars[0],close:NaN}]),now),/invalid/);
});
