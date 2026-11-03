/** Official Upstox, READ-ONLY, cloud-cron market-data adapter.
 * No OAuth flows, brokerage execution, fabricated quotes, or credential logging.
 * This module is inert unless the owner installs a long-lived Analytics Token.
 */
import {normalizeUpstoxV3} from './upstox-adapter.js';

const MIS_URL='https://assets.upstox.com/market-quote/instruments/exchange/NSE_MIS.json.gz';
const QUOTE_URL='https://api.upstox.com/v3/market-quote/quotes';
const INDEX_KEY='NSE_INDEX|Nifty 50';
// Official Upstox V3 docs publish the NHPC instrument-key example; diagnostic only.
const DIAGNOSTIC_EQUITY_KEY='NSE_EQ|INE848E01016';
const NSE_STOCK=/^(?=.{1,30}$)(?=.*[A-Z])[A-Z0-9&-]+$/;
const NSE_INSTRUMENT=/^NSE_EQ\|[A-Z0-9]{8,20}$/;
const MAX_SOURCE_MS=24*3600*1000;
const MAX_RECEIPT_SKEW_MS=8000;
const MAX_BOD_BYTES=1500000;
const MAX_QUOTE_BYTES=3500000;
const fail=reason=>{const e=Error('UPSTOX_COLLECTOR_BLOCKED: '+reason);e.atlasDiagnostic=reason;throw e;};
const fieldStatus=value=>value===undefined||value===null?'missing':typeof value!=='number'||!Number.isFinite(value)?'invalid':value===0?'zero':value>0?'positive':'negative';
const sameIstDay=(a,b)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(a)===new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(b);
/** Owner-only public-source reachability probe. No quote token or catalog body leaves the Worker. */
export async function verifyMisSourceReachability(profile='plain',fetcher=fetch){
 if(!['plain','identified','parsed'].includes(profile))fail('invalid MIS probe profile');
 if(profile==='parsed'){
  const universe=await nseMaster(fetcher,Date.now());
  return {source:'UPSTOX_PUBLIC_MIS',profile,http_status:200,eligible_count:universe.length,
   first_symbol:universe[0].symbol,last_symbol:universe.at(-1).symbol};
 }
 const headers=profile==='identified'?{Accept:'application/gzip','User-Agent':'AtlasPrivateResearch/1.0'}:undefined;
 const res=await fetcher(MIS_URL,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(7000),...(headers?{headers}:{})});
 const result={source:'UPSTOX_PUBLIC_MIS',profile,http_status:res.status,content_type:res.headers.get('content-type'),
  last_modified:res.headers.get('last-modified'),content_length:res.headers.get('content-length')};
 await res.body?.cancel();
 return result;
}
export function selectMisUniverse(items,modifiedAt,now){
 if(!Array.isArray(items))fail('invalid official MIS catalog');
 const time=Date.parse(modifiedAt);
 if(!Number.isFinite(time)||time>now+120000||now-time>MAX_SOURCE_MS||!sameIstDay(time,now))fail('official MIS catalog is not from current India trading day');
 const bySymbol=new Map(),byToken=new Set();
 for(const v of items){
  if(v?.segment!=='NSE_EQ'||v?.instrument_type!=='EQ'||v.security_type!=='NORMAL')continue;
  const symbol=v.trading_symbol,key=v.instrument_key;
  if(typeof symbol!=='string'||!NSE_STOCK.test(symbol)||typeof key!=='string'||!NSE_INSTRUMENT.test(key))fail('invalid NSE MIS trading instrument');
  if(bySymbol.has(symbol)){
   if(bySymbol.get(symbol)!==key)fail('duplicate symbol instrument mismatch');
   continue; // BOD occasionally repeats exactly the same equity key.
  }
  if(byToken.has(key))fail('duplicate instrument token mismatch');
  bySymbol.set(symbol,key);byToken.add(key);
 }
 if(bySymbol.size<500||bySymbol.size>4000)fail('incomplete NSE MIS equity universe');
 return [...bySymbol].map(([symbol,instrument_token])=>({symbol,instrument_token})).sort((a,b)=>a.symbol.localeCompare(b.symbol));
}
async function jsonBody(res,maxBytes){
 if(res.status>=300&&res.status<400)fail('official provider redirect refused');
 if(!res.ok)fail('official provider HTTP '+res.status);
 if(Number(res.headers.get('content-length'))>maxBytes)fail('provider response too large');
 const text=await res.text();if(text.length>maxBytes)fail('provider response too large');
 try{return JSON.parse(text)}catch{fail('provider response was not valid JSON')}
}
async function nseMaster(fetcher,now){
 const res=await fetcher(MIS_URL,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(7000),
  headers:{Accept:'application/gzip','User-Agent':'AtlasPrivateResearch/1.0'}});
 if(res.status>=300&&res.status<400)fail('official MIS master redirect refused');
 if(!res.ok)fail('official MIS master HTTP '+res.status);
 const length=Number(res.headers.get('content-length'));
 if(length>MAX_BOD_BYTES)fail('official MIS master is unusually large');
 const bytes=new Uint8Array(await res.arrayBuffer());
 if(bytes.length>MAX_BOD_BYTES)fail('official MIS master exceeds size bound');
 // Cloudflare and Node may automatically decode fetch bodies depending on runtime.
 let raw;
 if(bytes[0]===0x1f&&bytes[1]===0x8b){
  if(typeof DecompressionStream!=='function')fail('gzip decoding not supported');
  raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
 }else raw=new TextDecoder().decode(bytes);
 if(raw.length>2500000)fail('unpacked MIS master exceeds expected size');
 let entries;try{entries=JSON.parse(raw)}catch{fail('invalid official MIS master JSON')}
 return selectMisUniverse(entries,res.headers.get('last-modified'),now);
}
async function quotes(fetcher,token,keys,receiptClock=()=>Date.now()){
 if(keys.length<1||keys.length>500)fail('provider quote request outside 500-instrument limit');
 const u=new URL(QUOTE_URL);u.searchParams.set('instrument_key',keys.join(','));
 const res=await fetcher(u.toString(),{
  method:'GET',redirect:'manual',signal:AbortSignal.timeout(7000),
  headers:{Authorization:'Bearer '+token,Accept:'application/json'},
 });
 const data=await jsonBody(res,MAX_QUOTE_BYTES);
 if(data?.status!=='success')fail('official quote response not successful');
 return {data,receivedAt:receiptClock()};
}
// A small owner-only home ticker. It never submits orders or treats an old
// provider quote as a live price. ETF prices are labeled as ETFs, not metal spot.
export async function homeMarketQuotes(env,now=Date.now(),fetcher=fetch){
 const instruments=[
  {symbol:'NIFTY 50',key:'NSE_INDEX|Nifty 50',kind:'INDEX'},
  {symbol:'SENSEX',key:'BSE_INDEX|SENSEX',kind:'INDEX'},
  {symbol:'GOLDBEES',key:'NSE_EQ|INF204KB17I5',kind:'GOLD_ETF'},
  {symbol:'SILVERBEES',key:'NSE_EQ|INF204KC1402',kind:'SILVER_ETF'},
  {symbol:'RELIANCE',key:'NSE_EQ|INE002A01018',kind:'STOCK'},
  {symbol:'HDFCBANK',key:'NSE_EQ|INE040A01034',kind:'STOCK'},
  {symbol:'TCS',key:'NSE_EQ|INE467B01029',kind:'STOCK'}
 ];
 if(env.UPSTOX_FEED_ENABLED!=='true'||typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)
  fail('read-only quote feed unavailable');
 const {data,receivedAt}=await quotes(fetcher,env.UPSTOX_ANALYTICS_TOKEN,instruments.map(x=>x.key),()=>now);
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const parts=Object.fromEntries(fmt.formatToParts(new Date(now)).map(x=>[x.type,x.value]));
 const minute=Number(parts.hour)*60+Number(parts.minute),marketOpen=!['Sat','Sun'].includes(parts.weekday)&&minute>=555&&minute<930;
 const items=instruments.map(item=>{
  const q=Object.values(data.data||{}).find(v=>v?.instrument_token===item.key);
  const price=Number(q?.last_price),previous=Number(q?.prev_close_price);
  const parsed=q?.last_trade_time==null?NaN:Number(q.last_trade_time);
  const sourceAt=q?.last_trade_time==null?Date.parse(q?.timestamp||''):
   Number.isFinite(parsed)&&parsed>1e12?parsed:NaN;
  const valid=Number.isFinite(price)&&price>0&&Number.isFinite(sourceAt)&&sourceAt<=receivedAt+2000&&receivedAt-sourceAt<7*86400000;
  const fresh=valid&&marketOpen&&receivedAt-sourceAt<=90000;
  return {symbol:item.symbol,kind:item.kind,instrumentKey:item.key,
   price:valid?price:null,previousClose:Number.isFinite(previous)&&previous>0?previous:null,
   sourceAt:valid?new Date(sourceAt).toISOString():null,status:!valid?'UNAVAILABLE':fresh?'RECENT_QUOTE':marketOpen?'STALE_QUOTE':'MARKET_CLOSED'};
 });
 return {schema:'atlas.home-market.v1',mode:'PAPER_ONLY',realOrdersEnabled:false,
  receivedAt:new Date(receivedAt).toISOString(),source:'UPSTOX_ANALYTICS_READONLY_V3',quotes:items};
}
export async function collectMisSnapshot(env,now=Date.now(),fetcher=fetch,receiptClock=()=>Date.now()){
 const token=env.UPSTOX_ANALYTICS_TOKEN;
 if(env.UPSTOX_FEED_ENABLED!=='true'||!token||token.length<100||!env.FEED_SOURCE_ID)fail('read-only live feed not explicitly enabled');
 const universe=await nseMaster(fetcher,now);
 const batches=[];for(let i=0;i<universe.length;i+=500)batches.push(universe.slice(i,i+500));
 const requests=batches.map(b=>quotes(fetcher,token,b.map(x=>x.instrument_token),receiptClock));
 const results=await Promise.all([...requests,quotes(fetcher,token,[INDEX_KEY],receiptClock)]);
 const index=results.pop();
 const times=results.map(x=>x.receivedAt);
 const finalTime=Math.max(...times,index.receivedAt),firstTime=Math.min(...times,index.receivedAt);
 if(finalTime-firstTime>MAX_RECEIPT_SKEW_MS||finalTime-now>13000||firstTime<now-3000)fail('unacceptably skewed quote batches');
 const all=[];let nifty=null;
 for(let i=0;i<batches.length;i++){
  const batch=normalizeUpstoxV3({payload:results[i].data,universe:batches[i],receivedAt:results[i].receivedAt,
   index:index.data,sourceId:env.FEED_SOURCE_ID,authorized:true,allowPartialBatch:true,
   deferTopTenFreshness:true,includeTradeTimestamp:true});
  if(nifty!==null&&batch.coverage.nifty_change_bps!==nifty)fail('Nifty quote changed during batch collection');
  nifty=batch.coverage.nifty_change_bps;all.push(...batch.quotes);
 }
 if(all.length!==universe.length)fail('Upstox universe missing quotes');
 const keys=new Map(universe.map(x=>[x.symbol,x.instrument_token]));
 if(keys.size!==all.length||all.some(q=>!keys.has(q.symbol)))fail('quoted universe identity mismatch');
 // Compare volumes across ALL NSE intraday candidates, not independently per
 // API batch. Only the global top-ten must have traded within 15 seconds.
 const top=[...all].sort((a,b)=>b.cumulative_volume-a.cumulative_volume||a.symbol.localeCompare(b.symbol)).slice(0,10);
 if(top.length!==10||top.some(q=>finalTime-q._last_trade_ms>15000||q._last_trade_ms>finalTime+2000))fail('stale global top-ten market trades');
 return {quotes:all.map(({_last_trade_ms,...q})=>({...q,instrument_key:keys.get(q.symbol)})),coverage:{complete:true,eligible_count:all.length,nifty_change_bps:nifty},
  source:'UPSTOX_ANALYTICS_READONLY_V3',snapshot_end_ms:finalTime};
}

export async function collectWatchedQuotes(env,symbols,now=Date.now(),fetcher=fetch,receiptClock=()=>Date.now()){
 if(env.UPSTOX_FEED_ENABLED!=='true'||typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100||!env.FEED_SOURCE_ID)fail('read-only live feed not configured');
 const unique=[...new Set(symbols)];
 if(!unique.length)return {quotes:[]};
 if(unique.length>30||unique.some(s=>!NSE_STOCK.test(s)))fail('watched symbols must be <=30 verified equities');
 const universe=await nseMaster(fetcher,now),map=new Map(universe.map(x=>[x.symbol,x]));
 const watched=unique.map(s=>map.get(s));if(watched.some(x=>!x))fail('a watched stock is not in current official intraday universe');
 const response=await quotes(fetcher,env.UPSTOX_ANALYTICS_TOKEN,watched.map(x=>x.instrument_token),receiptClock);
 const normal=normalizeUpstoxV3({payload:response.data,universe:watched,receivedAt:response.receivedAt,
  index:null,sourceId:env.FEED_SOURCE_ID,authorized:true,allowPartialBatch:true,skipNifty:true,
  deferTopTenFreshness:true,includeTradeTimestamp:true});
 // A stale last trade for one held symbol must not prevent fresh held symbols
 // from receiving their own paper exit quote. Never use the stale price.
 return {quotes:normal.quotes.filter(q=>response.receivedAt-q._last_trade_ms<=15000)
  .map(({_last_trade_ms,...q})=>q)};
}

/** Authenticated owner-only diagnostic. Makes one GET; never ingests or trades. */
export async function verifyAnalyticsFeed(env,fetcher=fetch,clock=()=>Date.now()){
 const token=env.UPSTOX_ANALYTICS_TOKEN;
 if(typeof token!=='string'||token.length<100||env.UPSTOX_FEED_ENABLED!=='true')fail('Analytics credential missing');
 const response=await quotes(fetcher,token,[INDEX_KEY,DIAGNOSTIC_EQUITY_KEY],clock);
 const nifty=response.data?.data?.['NSE_INDEX:Nifty 50'];
 if(!nifty||nifty.instrument_token!==INDEX_KEY||!Number.isFinite(Number(nifty.last_price))||Number(nifty.last_price)<=0)fail('Nifty market quote cannot be verified');
 const stock=response.data?.data?.['NSE_EQ:NHPC'];
 if(!stock||stock.instrument_token!==DIAGNOSTIC_EQUITY_KEY||stock.symbol!=='NHPC'||
   !Number.isFinite(Number(stock.last_price))||Number(stock.last_price)<=0)fail('official NSE equity quote cannot be verified');
 const stockTrade=Number(stock.last_trade_time);
 if(!Number.isSafeInteger(stockTrade)||stockTrade<=0||stockTrade>response.receivedAt+2000)fail('NSE equity last trade timestamp invalid');
 const lastTrade=Number(nifty.last_trade_time);
 if(!Number.isSafeInteger(lastTrade)||lastTrade<=0||lastTrade>response.receivedAt+2000)fail('Nifty last trade timestamp invalid');
 return {mode:'PAPER_ONLY',realOrdersEnabled:false,readOnly:true,authenticated:true,
  provider:'UPSTOX_ANALYTICS',instrument:'NSE_INDEX:Nifty 50',
  quote_received_at:new Date(response.receivedAt).toISOString(),
  last_trade_at:new Date(lastTrade).toISOString(),
  data_current:response.receivedAt-lastTrade<=15000,
  stock_verified:true,stock_symbol:'NHPC',stock_last_trade_at:new Date(stockTrade).toISOString(),
  stock_data_current:response.receivedAt-stockTrade<=15000,
  // Owner-only shape diagnostic; never return quote values or credentials.
  benchmark_field_status:{
   last_price:fieldStatus(nifty.last_price),
   prev_close_price:fieldStatus(nifty.prev_close_price),
   net_change:fieldStatus(nifty.net_change),
   ohlc_close:fieldStatus(nifty.ohlc?.close),
   derived_prev_from_net_change:fieldStatus(Number(nifty.last_price)-Number(nifty.net_change)),
  },
 };
}
