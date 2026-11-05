/** Fixed read-only context collection. No arbitrary URL, order or credential export. */
import {fetchSupplemental} from './supplemental-sources.js';
import {qualifyEarningsNews,EXTRA_METHODS} from './forward-extra.js';
const fail=r=>{const e=Error('FORWARD_CONTEXT_BLOCKED: '+r);e.atlasDiagnostic='forward context '+r;throw e};
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const dayOf=t=>new Date(t+19800000).toISOString().slice(0,10);
const sectors=Object.freeze({Bank:'Nifty Bank',Banks:'Nifty Bank',Banking:'Nifty Bank','Information Technology':'Nifty IT',Automobiles:'Nifty Auto',Pharmaceuticals:'Nifty Pharma',Metals:'Nifty Metal',Realty:'Nifty Realty',FMCG:'Nifty FMCG'});
async function get(env,url,fetcher,clock){
 if(!env.UPSTOX_ANALYTICS_TOKEN||!url.startsWith('https://api.upstox.com/'))fail('fixed source');
 const requestedAt=clock(),r=await fetcher(url,{method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'},signal:AbortSignal.timeout(7000)});
 if(!r.ok||r.redirected||Number(r.headers.get('content-length'))>1000000)fail('provider HTTP '+r.status);
 const raw=await r.text(),knownAt=clock();if(raw.length>1000000||knownAt-requestedAt>15000||knownAt<requestedAt)fail('receipt bound');
 let body;try{body=JSON.parse(raw)}catch{fail('provider JSON')}
 if(body.status!=='success')fail('provider status');
 return {url,raw,body,requestedAt,knownAt,sha256:await digest(raw)};
}
function candles(receipt){const rows=receipt.body?.data?.candles;if(!Array.isArray(rows)||rows.length>10000)fail('candle array');return rows;}
function opening(rows,day,count,interval=60000){
 const start=Date.parse(day+'T03:45:00Z'),by=new Map();
 for(const r of rows){const t=Date.parse(r[0]);if(t>=start&&t<start+count*interval){if(by.has(t)||![r[1],r[2],r[3],r[4]].every(x=>Number.isFinite(x)&&x>0)||r[2]<Math.max(r[1],r[4])||r[3]>Math.min(r[1],r[4])||!Number.isSafeInteger(r[5])||r[5]<0)fail('opening candle invalid');by.set(t,r);}}
 const result=Array.from({length:count},(_,i)=>by.get(start+i*interval));if(result.some(x=>!x))fail('complete opening missing');return result;
}
async function save(env,day,kind,key,payload,knownAt){
 const rawReceipts=JSON.stringify(payload.receipts.map(({body,...receipt})=>receipt));
 const body=JSON.stringify({context:payload.context,receipts:payload.receipts.map(({url,sha256,knownAt,requestedAt})=>({url,sha256,knownAt,requestedAt}))}),hash=await digest(body);
 await env.HISTORY_DB.prepare('INSERT OR IGNORE INTO forward_context_receipts(source_date,kind,instrument_key,known_ms,payload_json,payload_sha256,raw_receipts_json) VALUES(?,?,?,?,?,?,?)').bind(day,kind,key,knownAt,body,hash,rawReceipts).run();
 const row=await env.HISTORY_DB.prepare('SELECT known_ms,payload_json,payload_sha256 FROM forward_context_receipts WHERE source_date=? AND kind=? AND instrument_key=?').bind(day,kind,key).first();
 if(!row||await digest(row.payload_json)!==row.payload_sha256)fail('context persistence');
 return {status:'CONTEXT_RECORDED',sourceDate:day,kind,instrumentKey:key,knownAt:row.known_ms,sourceSha256:row.payload_sha256,realOrdersEnabled:false};
}
export function giftOpeningContext(receipt,day){
 const from=Date.parse(day+'T01:00:00Z'),to=Date.parse(day+'T03:59:00Z'),rows=candles(receipt),by=new Map();
 for(const r of rows){const t=Date.parse(r[0]);if(t>=from&&t<=to){if(by.has(t)||![r[1],r[2],r[3],r[4]].every(x=>Number.isFinite(x)&&x>0)||r[2]<Math.max(r[1],r[4])||r[3]>Math.min(r[1],r[4]))fail('GIFT candle shape');by.set(t,r)}}
 if(!by.has(from)||!by.has(to)||receipt.knownAt<to+180000||receipt.knownAt>=Date.parse(day+'T04:10:00Z'))fail('GIFT opening anchors or pre-entry availability');
 return {method:EXTRA_METHODS.scalpstorm_x2,open:by.get(from)[1],close:by.get(to)[4],openTime:from,closeTime:to,observedOpeningMinutes:by.size,missingInteriorMinutes:180-by.size,declaredLatencySeconds:120,sameContractCertified:false};
}
export async function collectGiftOpening(env,day,{fetcher=fetch,clock=()=>Date.now()}={}){
 if(day!==dayOf(clock()))fail('current GIFT date');
 const key='GLOBAL_INDEX|SGX NIFTY',url='https://api.upstox.com/v3/historical-candle/intraday/'+encodeURIComponent(key)+'/minutes/1';
 const receipt=await get(env,url,fetcher,clock),context=giftOpeningContext(receipt,day);
 return save(env,day,'gift_opening',key,{context,receipts:[receipt]},receipt.knownAt);
}
export async function collectXtremeContext(env,day,slot,{fetcher=fetch,clock=()=>Date.now(),probeOnly=false}={}){
 if(day!==dayOf(clock())||!Number.isInteger(slot)||slot<0||slot>9)fail('dated context slot');
 const rr=await env.HISTORY_DB.prepare('SELECT roster_json,roster_sha256 FROM live_top_roster WHERE source_date=?').bind(day).first();
 if(!rr||await digest(rr.roster_json)!==rr.roster_sha256)fail('dated roster');
 const top=JSON.parse(rr.roster_json),stock=top[slot],key=stock?.instrument_key;
 if(!Array.isArray(top)||top.length!==10||new Set(top.map(s=>s.instrument_key)).size!==10||!/^NSE_EQ\|INE[A-Z0-9]{9}$/.test(key||''))fail('company equity identity');
 const profile=await get(env,'https://api.upstox.com/v2/fundamentals/'+key.slice(7)+'/profile',fetcher,clock);
 const sectorName=profile.body?.data?.sector,benchmark=sectors[sectorName];if(!benchmark){if(probeOnly)return {status:'UNSUPPORTED_SECTOR',instrumentKey:key,sectorProfile:sectorName??null,profileFields:Object.keys(profile.body?.data||{}),forwardQualified:false};fail('no exact supported sector benchmark');}
 const before=Date.parse(day+'T00:00:00Z'),date=t=>new Date(t).toISOString().slice(0,10);
 const split=before-28*86400000,from=before-56*86400000;
 const history=[];
 for(const [a,b] of [[from,split-86400000],[split,before-86400000]]){
  history.push(await get(env,'https://api.upstox.com/v3/historical-candle/'+encodeURIComponent(key)+'/minutes/5/'+date(b)+'/'+date(a),fetcher,clock));
 }
 const grouped=new Map();
 for(const r of history)for(const c of candles(r)){const d=dayOf(Date.parse(c[0]));if(d<day){if(!grouped.has(d))grouped.set(d,[]);grouped.get(d).push(c)}}
 const baseline=[];
 for(const [d,rows] of [...grouped].sort(([a],[b])=>a.localeCompare(b))){try{const bars=opening(rows,d,5,300000);baseline.push({day:d,volume:bars.reduce((n,b)=>n+b[5],0)})}catch{/* Incomplete prior sessions cannot enter the baseline. */}}
 if(baseline.length<20||baseline.slice(-20).some(x=>x.volume<=0))fail('20 complete positive opening volumes missing');
 const sectorKey='NSE_INDEX|'+benchmark,sector=await get(env,'https://api.upstox.com/v3/historical-candle/intraday/'+encodeURIComponent(sectorKey)+'/minutes/1',fetcher,clock);
 const bars=opening(candles(sector),day,15),context={method:EXTRA_METHODS.scalpstorm_xtreme,priorOpeningVolumes:baseline.slice(-20),sectorName,sectorKey,sectorBps:(bars[14][4]/bars[0][1]-1)*10000,sectorSourceSha256:sector.sha256};
 if(probeOnly)return {status:'SOURCE_AVAILABLE',instrumentKey:key,sector:sectorName,baselineSessions:20,knownAt:clock(),forwardQualified:false};
 return save(env,day,'xtreme',key,{context,receipts:[profile,...history,sector]},clock());
}
export async function readExtraContext(env,strategyId,day,stock,windowStart){return (await loadExtraContexts(env,strategyId,day,windowStart))(stock,windowStart);}
export async function probeExtraSource(env,kind,day,slot=0,options={}){
 try{
  if(kind==='xtreme')return await collectXtremeContext(env,day,slot,{...options,probeOnly:true});
  if(kind==='news'){
   const r=await fetchSupplemental(env,'news',day,options);
   const rr=await env.HISTORY_DB.prepare('SELECT roster_json,roster_sha256 FROM live_top_roster WHERE source_date=?').bind(day).first();
   if(!rr||await digest(rr.roster_json)!==rr.roster_sha256)fail('news probe roster');
   const top=JSON.parse(rr.roster_json),eligible=r.metadata.paginationComplete===true&&r.metadata.rejectedTimes===0;
   return {status:eligible?'SOURCE_AVAILABLE':'NEWS_RECEIPT_UNQUALIFIED',articles:r.metadata.articles,classifiedAsOf:r.knownAt,method:EXTRA_METHODS.scalpstorm_x3,evaluations:top.map(s=>{const q=eligible?qualifyEarningsNews(r.body.data?.[s.instrument_key]||[],s.symbol,r.knownAt,r.knownAt):null;return {symbol:s.symbol,qualifiesNow:Boolean(q),direction:q?.direction??null,publishedAt:q?.publishedAt??null}}),forwardQualified:false,realOrdersEnabled:false};
  }
  if(kind!=='gift')fail('unsupported probe kind');
  const r=await get(env,'https://api.upstox.com/v3/historical-candle/intraday/'+encodeURIComponent('GLOBAL_INDEX|SGX NIFTY')+'/minutes/1',options.fetcher||fetch,options.clock||(()=>Date.now()));
  const rows=candles(r),from=Date.parse(day+'T01:00:00Z'),openingMinutes=new Set(rows.map(x=>Date.parse(x[0])).filter(t=>t>=from&&t<from+180*60000));
  const completeOpening=Array.from({length:180},(_,i)=>openingMinutes.has(from+i*60000)).every(Boolean);
  return {status:openingMinutes.has(from)&&openingMinutes.has(from+179*60000)?'ANCHOR_SOURCE_AVAILABLE':'REQUIRED_ANCHOR_MISSING',openingAnchorsPresent:openingMinutes.has(from)&&openingMinutes.has(from+179*60000),instrumentKey:'GLOBAL_INDEX|SGX NIFTY',candles:rows.length,openingMinuteCount:openingMinutes.size,missingOpeningMinutes:Array.from({length:180},(_,i)=>from+i*60000).filter(t=>!openingMinutes.has(t)).map(t=>new Date(t).toISOString()),completeOpening,knownAt:r.knownAt,sourceSha256:r.sha256,forwardQualified:false,warning:'Read-only availability probe; late observations never certify an earlier decision.'};
 }catch(e){return {status:'BLOCKED',reason:e?.atlasDiagnostic||'FIXED_PROVIDER_SOURCE_UNAVAILABLE',forwardQualified:false,realOrdersEnabled:false};}
}
/** Load each context archive once per strategy/window, not once per stock. */
export async function loadExtraContexts(env,strategyId,day,now){
 if(strategyId==='scalpstorm_x3'){
  const rows=(await env.HISTORY_DB.prepare("SELECT known_ms,source_url,body_json,body_sha256,metadata_json FROM strategy_context_receipts WHERE source_date=? AND kind='news' AND known_ms<=? ORDER BY known_ms DESC LIMIT 4").bind(day,now).all()).results;
  const receipts=[];
  for(const r of rows){if(await digest(r.body_json)!==r.body_sha256)fail('news receipt hash');const u=new URL(r.source_url),m=JSON.parse(r.metadata_json),b=JSON.parse(r.body_json);
   if(u.origin!=='https://api.upstox.com'||u.pathname!=='/v2/news'||u.searchParams.get('category')!=='instrument_keys'||b.status!=='success')fail('news source identity');
   if(m.paginationComplete===true&&m.rejectedTimes===0)receipts.push({knownAt:r.known_ms,sourceSha256:r.body_sha256,keys:u.searchParams.get('instrument_keys')?.split(',')||[],data:b.data});
  }
  return (stock,start)=>{const r=receipts.find(x=>x.knownAt<=start&&x.keys.includes(stock.instrument_key));return r?{knownAt:r.knownAt,sourceSha256:r.sourceSha256,items:r.data?.[stock.instrument_key]||[]}:null};
 }
 const kind=strategyId==='scalpstorm_x2'?'gift_opening':'xtreme';
 const rows=(await env.HISTORY_DB.prepare('SELECT instrument_key,known_ms,payload_json,payload_sha256 FROM forward_context_receipts WHERE source_date=? AND kind=? AND known_ms<=?').bind(day,kind,now).all()).results;
 const contexts=new Map();
 for(const r of rows){if(await digest(r.payload_json)!==r.payload_sha256)fail('normalized context hash');
  const p=JSON.parse(r.payload_json);if(!p.context||!Array.isArray(p.receipts)||p.receipts.some(x=>!Number.isSafeInteger(x.knownAt)||x.knownAt>r.known_ms||!/^https:\/\/api\.upstox\.com\//.test(x.url)||!/^[a-f0-9]{64}$/.test(x.sha256)))fail('context causal sources');
  contexts.set(r.instrument_key,{...p.context,knownAt:r.known_ms,sourceSha256:r.payload_sha256});
 }
 return (stock,start)=>{const c=contexts.get(kind==='gift_opening'?'GLOBAL_INDEX|SGX NIFTY':stock.instrument_key);return c?.knownAt<=start?c:null};
}

export {get as fetchContextSource};
