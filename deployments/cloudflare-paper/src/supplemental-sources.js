/** Fixed read-only provider requests. Candidate sources never arm a strategy. */
const fail=reason=>{const e=Error('SUPPLEMENTAL_SOURCE_BLOCKED: '+reason);e.atlasDiagnostic='supplemental '+reason;throw e;};
const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const dayOf=t=>new Date(t+19800000).toISOString().slice(0,10);
async function request(env,url,fetcher,clock){
 if(typeof env.UPSTOX_ANALYTICS_TOKEN!=='string'||env.UPSTOX_ANALYTICS_TOKEN.length<100)fail('read-only credential missing');
 const started=clock(),res=await fetcher(url,{method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+env.UPSTOX_ANALYTICS_TOKEN,Accept:'application/json'},signal:AbortSignal.timeout(7000)});
 if(res.redirected||!res.ok||Number(res.headers.get('content-length'))>100000)fail('provider HTTP '+res.status);
 const raw=await res.text();if(raw.length>100000)fail('provider receipt too large');
 const knownAt=clock();if(knownAt<started||knownAt-started>15000)fail('receipt clock');
 let body;try{body=JSON.parse(raw)}catch{fail('provider JSON')};
 if(body.status!=='success')fail('provider did not report success');
 return {url,raw,body,knownAt,sha256:await digest(raw)};
}
async function topKeys(env,day){
 const row=await env.HISTORY_DB.prepare('SELECT roster_json,roster_sha256 FROM live_top_roster WHERE source_date=?').bind(day).first();
 if(!row||await digest(row.roster_json)!==row.roster_sha256)fail('dated roster missing');
 const top=JSON.parse(row.roster_json);
 if(!Array.isArray(top)||top.length!==10||new Set(top.map(x=>x.instrument_key)).size!==10||top.some(x=>!/^NSE_EQ\|INE[A-Z0-9]{9}$/.test(x.instrument_key)))fail('dated roster identities invalid');
 return top.map(x=>x.instrument_key);
}
export async function fetchSupplemental(env,kind,day,{fetcher=fetch,clock=()=>Date.now()}={}){
 if(!['gift','news'].includes(kind)||day!==dayOf(clock()))fail('source kind or current date');
 let url,keys;
 if(kind==='gift')url='https://api.upstox.com/v3/market-quote/quotes?instrument_key='+encodeURIComponent('GLOBAL_INDEX|SGX NIFTY');
 else {keys=await topKeys(env,day);const u=new URL('https://api.upstox.com/v2/news');u.searchParams.set('category','instrument_keys');u.searchParams.set('instrument_keys',keys.join(','));u.searchParams.set('page_size','30');url=u.toString();}
 const receipt=await request(env,url,fetcher,clock),{body,knownAt}=receipt;
 let metadata;
 if(kind==='gift'){
  const values=Object.values(body.data||{});
  if(values.length!==1)fail('GIFT response identity missing');
  const q=values[0];if(q.instrument_token!=='GLOBAL_INDEX|SGX NIFTY'||!Number.isFinite(q.last_price)||q.last_price<=0)fail('GIFT response identity missing');
  metadata={status:'CANDIDATE_ROLLING_INDEX_ONLY',instrumentKey:q.instrument_token,price:q.last_price,providerTimestamp:q.timestamp??null,contractExpiry:q.expiry??null,sameContractCertified:false,declaredLatencySeconds:120,forwardQualified:false,blocker:'Rolling global index does not establish identical futures contract at 06:30 and 09:30.'};
 }else{
  if(!body.data||Array.isArray(body.data)||Object.keys(body.data).some(k=>!keys.includes(k)))fail('news response identity changed');
  let articles=0,rejectedTimes=0;const stamps=[];
  for(const news of Object.values(body.data)){if(!Array.isArray(news))fail('news item shape');for(const item of news){articles++;if(!Number.isSafeInteger(item.published_time)||item.published_time>knownAt||typeof item.heading!=='string'||typeof item.article_link!=='string'||!item.article_link.startsWith('https://'))rejectedTimes++;else stamps.push(item.published_time);}}
  metadata={status:'CANDIDATE_NEWS_RECEIPT',instruments:keys.length,articles,rejectedTimes,latestPublishedAt:stamps.length?new Date(Math.max(...stamps)).toISOString():null,paginationComplete:(body.metadata?.page?.total_pages??1)<=1,materialityCertified:false,forwardQualified:false,blocker:'Provider association and publication time alone do not establish company-specific materiality or a trade direction.'};
 }
 return {...receipt,kind,day,metadata};
}
export async function probeSupplemental(env,kind,day,options={}){
 const r=await fetchSupplemental(env,kind,day,options);
 return {schema:'atlas.supplemental-source.v1',kind,sourceDate:day,knownAt:new Date(r.knownAt).toISOString(),sourceSha256:r.sha256,...r.metadata,mode:'PAPER_ONLY',realOrdersEnabled:false};
}
export async function archiveSupplemental(env,kind,day,options={}){
 const r=await fetchSupplemental(env,kind,day,options),slot=Math.floor(r.knownAt/300000)*300000;
 await env.HISTORY_DB.prepare('INSERT OR IGNORE INTO strategy_context_receipts(source_date,kind,slot_ms,known_ms,source_url,body_sha256,body_json,metadata_json) VALUES(?,?,?,?,?,?,?,?)').bind(day,kind,slot,r.knownAt,r.url,r.sha256,r.raw,JSON.stringify(r.metadata)).run();
 return {status:'ARCHIVED_CANDIDATE',kind,sourceDate:day,knownAt:new Date(r.knownAt).toISOString(),forwardQualified:false};
}
