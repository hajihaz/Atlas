import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { normalizeTickers, getLiveFeed } from '../api/live-feed.js';

const now = 1900000000000;
const sample = [
 {market:'BTCINR',timestamp:Math.floor(now/1000)-2,last_price:'8245000',
  bid:'8244000',ask:'8247000'},
 {market:'ETHINR',timestamp:Math.floor(now/1000)-2,last_price:'240000',
  bid:'239999',ask:'240001'}
];
test('INR quotes are timestamped and not fabricated', () => {
 const result=normalizeTickers(sample,now);
 assert.deepEqual(result.map(x=>x.symbol),['BTCINR','ETHINR','SOLINR','XRPINR','DOGEINR']);
 assert.equal(result[0].currency,'INR');
 assert.equal(result[0].price,8245000);
 assert.equal(result[0].status,'recent_provider_snapshot');
});
test('stale and manipulated quotes are hidden',()=>{
 const old=normalizeTickers([{...sample[0],timestamp:Math.floor(now/1000)-200}, sample[1]],now);
 assert.equal(old[0].price,null);
 assert.equal(old[0].status,'stale_or_future');
 const invalid=normalizeTickers([{...sample[0],bid:'9000000'}, sample[1]],now);
 assert.equal(invalid[0].price,null);
 assert.throws(()=>normalizeTickers([sample[0],sample[0],sample[1]],now));
});
test('failed provider returns honest disconnected state',async()=>{
 const result=await getLiveFeed(async()=>{throw Error('blocked');},now+200000);
 assert.equal(result.feedStatus,'DISCONNECTED');
 assert.ok(result.quotes.every(x=>x.price===null));
 assert.equal(result.realOrdersEnabled,false);
});
test('cached quotes lose RECENT status exactly when source timestamps expire',async()=>{
 const base=now+400000;
 const rows=['BTCINR','ETHINR','SOLINR','XRPINR','DOGEINR'].map(market=>({
  ...sample[0],market,timestamp:Math.floor(base/1000)-88,
 }));
 let requests=0;
 const fetcher=async()=>{requests++;return {ok:true,json:async()=>rows};};
 const first=await getLiveFeed(fetcher,base);
 assert.equal(first.feedStatus,'RECENT');
 assert.ok(first.quotes.every(q=>q.price!==null));
 const expired=await getLiveFeed(fetcher,base+3000);
 assert.equal(requests,1,'must reuse cache without an extra provider request');
 assert.equal(expired.feedStatus,'DISCONNECTED');
 assert.ok(expired.quotes.every(q=>q.price===null&&q.status==='stale_or_future'));
 assert.equal(expired.realOrdersEnabled,false);
});
test('GET only; no order or mutation endpoint',async()=>{
 const res={setHeader(k,v){this[k]=v;},status(n){this.code=n;return this;},json(v){return v;}};
 const output=await handler({method:'POST',body:{side:'BUY',quantity:1}},res);
 assert.equal(res.code,405);
 assert.equal(res.Allow,'GET');
 assert.equal(output.error,'method_not_allowed');
});
