import test from 'node:test';
import assert from 'node:assert/strict';
import {homeMarketQuotes} from '../src/upstox-feed.js';

const token='SYNTHETIC_READ_ONLY_'+'x'.repeat(110);
const env={UPSTOX_ANALYTICS_TOKEN:token,UPSTOX_FEED_ENABLED:'true'};
const keys=['NSE_INDEX|Nifty 50','BSE_INDEX|SENSEX','NSE_EQ|INF204KB17I5','NSE_EQ|INF204KC1402',
 'NSE_EQ|INE002A01018','NSE_EQ|INE040A01034','NSE_EQ|INE467B01029'];
const now=Date.parse('2026-11-04T10:00:30+05:30');
function source(at){return async(url,options)=>{
 assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');
 assert.equal(options.headers.Authorization,'Bearer '+token);
 assert.deepEqual(new URL(url).searchParams.get('instrument_key').split(','),keys);
 const data=Object.fromEntries(keys.map((key,i)=>[String(i),{instrument_token:key,last_price:100+i,prev_close_price:99+i,
  timestamp:new Date(at).toISOString(),last_trade_time:String(at)}]));
 return new Response(JSON.stringify({status:'success',data}),{headers:{'content-type':'application/json'}});
};}
test('owner market strip shows only a recent verified provider quote as recent',async()=>{
 const r=await homeMarketQuotes(env,now,source(now-5000));
 assert.equal(r.mode,'PAPER_ONLY');assert.equal(r.realOrdersEnabled,false);assert.equal(r.quotes.length,7);
 assert.ok(r.quotes.every(q=>q.status==='RECENT_QUOTE'&&q.price>0));
 assert.equal(r.quotes[2].kind,'GOLD_ETF');assert.equal(r.quotes[3].kind,'SILVER_ETF');
 assert.equal(r.quotes[4].symbol,'RELIANCE');assert.equal(r.quotes[4].kind,'STOCK');
});
test('closed and stale markets are never advertised as recent',async()=>{
 const closed=await homeMarketQuotes(env,Date.parse('2026-11-04T18:00:30+05:30'),source(now-5000));
 assert.ok(closed.quotes.every(q=>q.status==='MARKET_CLOSED'));
 const stale=await homeMarketQuotes(env,now,source(now-120000));
 assert.ok(stale.quotes.every(q=>q.status==='STALE_QUOTE'));
});
test('missing credentials and mismatched identity fail closed',async()=>{
 await assert.rejects(homeMarketQuotes({},now,source(now)),/unavailable/);
 const bad=async()=>new Response(JSON.stringify({status:'success',data:{a:{instrument_token:'WRONG',last_price:100,timestamp:new Date(now).toISOString()}}}));
 const r=await homeMarketQuotes(env,now,bad);
 assert.ok(r.quotes.every(q=>q.price===null&&q.status==='UNAVAILABLE'));
});
