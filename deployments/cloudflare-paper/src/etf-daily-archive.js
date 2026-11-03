/** Immutable private raw ETF history. Corporate-action API evidence is stored separately. */
const IDS=Object.freeze({NIFTYBEES:'NSE_EQ|INF204KB14I2',GOLDBEES:'NSE_EQ|INF204KB17I5'});
const fail=reason=>{const e=Error('ETF_ARCHIVE_BLOCKED: '+reason);e.atlasDiagnostic='ETF archive '+reason;throw e;};
const sha=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const istDay=ms=>new Date(ms+19800000).toISOString().slice(0,10);
const spec=(day,symbol)=>{
 if(!/^\d{4}-\d\d-\d\d$/.test(day||'')||day<'2025-10-01'||!Object.hasOwn(IDS,symbol))fail('invalid source day or identity');
 const key=IDS[symbol],base='https://api.upstox.com/v3/historical-candle/';
 return {key,historicalUrl:base+encodeURIComponent(key)+'/days/1/'+day+'/2025-01-01',
  intradayUrl:base+'intraday/'+encodeURIComponent(key)+'/days/1',
  actionsUrl:'https://api.upstox.com/v2/fundamentals/'+key.split('|')[1]+'/corporate-actions'};
};
function candlesOf(body){
 let parsed;try{parsed=JSON.parse(body)}catch{fail('invalid provider JSON')}
 if(parsed?.status!=='success'||!Array.isArray(parsed?.data?.candles))fail('historical response shape');
 return parsed.data.candles;
}
function validateBars(candles,day){
 if(!Array.isArray(candles)||candles.length<201||candles.length>900)fail('ETF daily warmup missing');
 const seen=new Set(),sorted=[...candles].sort((a,b)=>String(a?.[0]).localeCompare(String(b?.[0])));
 for(const bar of sorted){
  const date=bar?.[0]?.slice(0,10),[open,high,low,close,volume]=bar?.slice(1,6)||[];
  if(!/^\d{4}-\d\d-\d\d$/.test(date||'')||date<'2025-01-01'||date>day||seen.has(date)||
   ![open,high,low,close].every(x=>Number.isFinite(x)&&x>0)||
   high<Math.max(open,close,low)||low>Math.min(open,close,high)||
   !Number.isSafeInteger(volume)||volume<0)fail('invalid ETF daily bar');
  seen.add(date);
 }
 if(sorted.at(-1)[0].slice(0,10)!==day)fail('latest ETF daily session missing');
 return {first:sorted[0][0].slice(0,10),last:day,count:sorted.length};
}
async function get(env,url,fetcher){
 const res=await fetcher(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'}});
 if(res.status!==200||res.redirected||Number(res.headers.get('content-length'))>150000)fail('provider HTTP or size');
 const body=await res.text();if(body.length<10||body.length>150000)fail('provider body size');
 return body;
}
async function metadata(row){
 if(!row)return null;
 const s=spec(row.source_day,row.symbol);
 if(row.instrument_key!==s.key||row.historical_url!==s.historicalUrl||row.actions_url!==s.actionsUrl||
  row.intraday_url!==null&&row.intraday_url!==s.intradayUrl||
  await sha(row.historical_body)!==row.historical_sha256||
  await sha(row.actions_body)!==row.actions_sha256||
  row.intraday_body!==null&&await sha(row.intraday_body)!==row.intraday_sha256)fail('stored ETF receipt changed');
 const history=candlesOf(row.historical_body),today=row.intraday_body?candlesOf(row.intraday_body):[];
 const bars=validateBars([...history,...today],row.source_day);
 if(bars.count!==row.candle_count||bars.first!==row.first_day||bars.last!==row.last_day)fail('ETF manifest changed');
 return {sourceDay:row.source_day,symbol:row.symbol,instrumentKey:row.instrument_key,
  firstDay:bars.first,lastDay:bars.last,candleCount:bars.count,receivedAt:new Date(row.received_ms).toISOString(),
  historicalSha256:row.historical_sha256,intradaySha256:row.intraday_sha256,
  actionsSha256:row.actions_sha256,adjustmentStatus:row.adjustment_status,
  adjusted:false,paperFills:0,rawBodiesExposed:false};
}
export async function readEtfDaily(env,day,symbol){
 spec(day,symbol);if(!env.HISTORY_DB)fail('private history missing');
 const row=await env.HISTORY_DB.prepare('SELECT * FROM etf_daily_receipts WHERE source_day=? AND symbol=?').bind(day,symbol).first();
 return row?{status:'VERIFIED_EXISTING',...await metadata(row)}:{status:'MISSING',sourceDay:day,symbol,adjusted:false};
}
/** Internal-only bars for retrospective raw-price research; never returned by the public API. */
export async function readValidatedEtfSeries(env,day,symbol){
 spec(day,symbol);if(!env.HISTORY_DB)fail('private history missing');
 const row=await env.HISTORY_DB.prepare('SELECT * FROM etf_daily_receipts WHERE source_day=? AND symbol=?').bind(day,symbol).first();
 if(!row)fail('dated ETF receipt missing');
 const proof=await metadata(row);
 const bars=[...candlesOf(row.historical_body),...(row.intraday_body?candlesOf(row.intraday_body):[])]
  .sort((a,b)=>a[0].localeCompare(b[0])).map(x=>({day:x[0].slice(0,10),open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]}));
 return {proof,bars};
}
export async function archiveEtfDaily(env,{day,symbol},fetcher=fetch,clock=()=>Date.now()){
 const s=spec(day,symbol),now=clock();
 if(day>istDay(now)||now<Date.parse(day+'T10:30:00Z')||!env.HISTORY_DB||
  typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)fail('source day not completed or token unavailable');
 const old=await env.HISTORY_DB.prepare('SELECT * FROM etf_daily_receipts WHERE source_day=? AND symbol=?').bind(day,symbol).first();
 if(old)return {status:'VERIFIED_EXISTING',...await metadata(old)};
 const historicalBody=await get(env,s.historicalUrl,fetcher),historical=candlesOf(historicalBody);
 const last=[...historical].map(x=>x?.[0]?.slice(0,10)).sort().at(-1);
 let intradayBody=null,intraday=[];
 if(last!==day){
  if(day!==istDay(now))fail('provider historical daily session missing');
  intradayBody=await get(env,s.intradayUrl,fetcher);intraday=candlesOf(intradayBody);
  if(intraday.length!==1||intraday[0]?.[0]?.slice(0,10)!==day)fail('completed intraday ETF bar missing');
 }
 const bars=validateBars([...historical,...intraday],day);
 const actionsBody=await get(env,s.actionsUrl,fetcher);
 let actions;try{actions=JSON.parse(actionsBody)}catch{fail('corporate-action JSON')}
 if(actions?.status!=='success'||!Array.isArray(actions.data))fail('corporate-action response shape');
 const received=clock();if(received<now||received-now>15000)fail('source receipt clock');
 const h=await sha(historicalBody),i=intradayBody?await sha(intradayBody):null,a=await sha(actionsBody);
 const adjustment='RAW_UNADJUSTED_ACTIONS_API_'+(actions.data.length?'EVENTS_REQUIRE_REVIEW':'ZERO_EVENTS_UNCONFIRMED');
 await env.HISTORY_DB.prepare(`INSERT OR IGNORE INTO etf_daily_receipts(source_day,symbol,instrument_key,historical_url,historical_sha256,historical_body,
 intraday_url,intraday_sha256,intraday_body,actions_url,actions_sha256,actions_body,received_ms,candle_count,first_day,last_day,adjustment_status)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(day,symbol,s.key,s.historicalUrl,h,historicalBody,
  intradayBody?s.intradayUrl:null,i,intradayBody,s.actionsUrl,a,actionsBody,received,
  bars.count,bars.first,bars.last,adjustment).run();
 const saved=await env.HISTORY_DB.prepare('SELECT * FROM etf_daily_receipts WHERE source_day=? AND symbol=?').bind(day,symbol).first();
 return {status:'CAPTURED',...await metadata(saved)};
}
