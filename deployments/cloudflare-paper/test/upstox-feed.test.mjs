import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {selectMisUniverse,collectMisSnapshot,collectWatchedQuotes} from '../src/upstox-feed.js';
import {testing} from '../src/index.js';

const now=Date.parse('2026-10-27T09:40:04+05:30');
const at=now-800;
const token='UPSTOX_ANALYTICS_TEST_TOKEN_NEVER_REAL_'+ 'x'.repeat(90);
const env={UPSTOX_ANALYTICS_TOKEN:token,UPSTOX_FEED_ENABLED:'true',FEED_SOURCE_ID:'UPSTOX_ANALYTICS_READONLY_V3'};
function master(n=1369){
 return Array.from({length:n},(_,i)=>({segment:'NSE_EQ',instrument_type:'EQ',security_type:'NORMAL',
   instrument_key:`NSE_EQ|INE${String(i).padStart(9,'0')}`,
   trading_symbol:`MISTEST${String(i).padStart(4,'0')}`}));
}
function fetchFixture(data,opts={}){
 const source=master(data);
 const gz=gzipSync(Buffer.from(JSON.stringify([...source,source[0]])));
 let calls=0;
 return {calls:()=>calls,fetch:async(url,config)=>{
  calls++;
  const str=String(url);
  if(str.includes('NSE_MIS.json.gz'))return new Response(gz,{headers:{'last-modified':'Tue, 27 Oct 2026 03:00:05 GMT','content-length':String(gz.length)}});
  if(!str.startsWith('https://api.upstox.com/v3/market-quote/quotes?'))throw Error('unexpected outbound provider');
  assert.equal(config?.headers?.Authorization,`Bearer ${token}`);
  assert.equal(config?.method,'GET');
  const keys=new URL(str).searchParams.get('instrument_key').split(',');
  assert.ok(keys.length<=500);
  const items={};
  for(const k of keys){
   if(k==='NSE_INDEX|Nifty 50'){
    items['NSE_INDEX:Nifty 50']={instrument_token:k,timestamp:new Date(at).toISOString(),
     last_trade_time:String(at),last_price:24870,prev_close_price:24700};
   }else{
    const entity=source.find(x=>x.instrument_key===k);
    if(!entity)throw Error('fixture missing listed instrument');
    items[`NSE_EQ:${entity.trading_symbol}`]={symbol:entity.trading_symbol,instrument_token:k,
     last_price:100.15,volume:100000+Number(k.split('INE')[1]),
     timestamp:new Date(at).toISOString(),last_trade_time:String(opts.staleAt===entity.trading_symbol?at-30000:at)};
   }
  }
  if(opts.omitOneQuote&&keys.length>300&&Object.keys(items).length>1)delete items[Object.keys(items)[0]];
  return new Response(JSON.stringify({status:'success',data:items}),{headers:{'content-type':'application/json'}});
 }};
}

test('official current-day NSE MIS full equity universe deduplicates exact repeat',()=>{
 const list=master(1369);
 const result=selectMisUniverse([...list,list[0]],'Tue, 27 Oct 2026 03:00:05 GMT',now);
 assert.equal(result.length,1369);
 assert.equal(new Set(result.map(x=>x.symbol)).size,1369);
 assert.equal(selectMisUniverse(list,'Tue, 27 Oct 2026 03:00:05 GMT',Date.parse('2026-10-27T15:15:04+05:30')).length,1369,
  'source BOD must remain valid for the 15:15 close');
 assert.throws(()=>selectMisUniverse(list,'Mon, 26 Oct 2026 03:00:05 GMT',now),/not from current/);
 assert.throws(()=>selectMisUniverse(list.slice(0,499),'Tue, 27 Oct 2026 03:00:05 GMT',now),/incomplete/);
});

test('signed Analytics token uses official 500-instrument REST batches for 1369 MIS symbols',async()=>{
 const f=fetchFixture(1369);
 const result=await collectMisSnapshot(env,now,f.fetch,()=>at);
 assert.equal(f.calls(),5,'1 MIS file + three 500-cap equity batches + Nifty');
 assert.equal(result.coverage.eligible_count,1369);
 assert.equal(result.quotes.length,1369);
 assert.equal(result.coverage.complete,true);
 assert.equal(result.quotes[0].source,'UPSTOX_ANALYTICS_READONLY_V3');
 assert.equal(result.coverage.nifty_change_bps,69);
 assert.ok(result.quotes.every(x=>x.exchange_open===true&&x.observed_at===new Date(at).toISOString()));
});

test('missing one broker quote rejects entire full-universe signal',async()=>{
 const f=fetchFixture(1001,{omitOneQuote:true});
 await assert.rejects(collectMisSnapshot(env,now,f.fetch,()=>at),/missing or mismatched NSE instrument/);
});

test('watched 2-stock quote feed does not require an index and makes 2 HTTP requests',async()=>{
 const f=fetchFixture(1369);const expected=['MISTEST0001','MISTEST0033'];
 const result=await collectWatchedQuotes(env,expected,now,f.fetch,()=>at);
 assert.equal(result.quotes.length,2);assert.equal(f.calls(),2);
 assert.deepEqual(result.quotes.map(q=>q.symbol).sort(),expected);
});

test('no user-provided Analytics token: Collector fails closed with no requests',async()=>{
 let calls=0;
 await assert.rejects(collectMisSnapshot({...env,UPSTOX_ANALYTICS_TOKEN:null},now,async()=>{calls++}),/not explicitly enabled/);
 assert.equal(calls,0);
 const d={DB:{prepare(){throw Error('DB should not be called if source disabled')}}};
 const disabled=await testing.sourceTick(d,now);
 assert.deepEqual(disabled,{sourceEnabled:false});
});


test('stale trade in a lower-ranked batch is not mistaken for a global top-ten trade',async()=>{
 const f=fetchFixture(1369,{staleAt:'MISTEST0499'});
 const data=await collectMisSnapshot(env,now,f.fetch,()=>at);
 assert.equal(data.quotes.length,1369);
});

test('stale trade in global most-active candidates causes no signal',async()=>{
 const f=fetchFixture(1369,{staleAt:'MISTEST1368'});
 await assert.rejects(collectMisSnapshot(env,now,f.fetch,()=>at),/stale global top-ten/);
});

test('mixed quote batch receipt times outside eight seconds fail closed',async()=>{
 const f=fetchFixture(1369);let count=0;
 await assert.rejects(collectMisSnapshot(env,now,f.fetch,()=>at+(count++*5000)),/skewed quote batches/);
});

test('owner-only Analytics diagnostics prove GET scope without sending brokerage orders',async()=>{
 const {verifyAnalyticsFeed}=await import('../src/upstox-feed.js');
 const f=fetchFixture(1369);
 const check=await verifyAnalyticsFeed(env,f.fetch,()=>at);
 assert.equal(check.authenticated,true);
 assert.equal(check.readOnly,true);
 assert.equal(check.realOrdersEnabled,false);
 assert.equal(check.data_current,true);
 assert.equal(f.calls(),1,'diagnostic must request Nifty only');
 assert.equal(JSON.stringify(check).includes(token),false);
});

test('owner-only Analytics diagnostics cannot authenticate without a token',async()=>{
 const {verifyAnalyticsFeed}=await import('../src/upstox-feed.js');
 let calls=0;
 await assert.rejects(verifyAnalyticsFeed({...env,UPSTOX_ANALYTICS_TOKEN:null},async()=>{calls++}),/credential missing/);
 assert.equal(calls,0);
});
