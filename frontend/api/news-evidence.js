// Public GDELT DOC 2.0 headline observations. No broker orders or inferred news sentiment.
// Articles are third-party discoveries; GDELT seen time is NOT publication time.
// Official DOC API: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
const SEARCH=Object.freeze({
  BTCINR:'bitcoin cryptocurrency',ETHINR:'ethereum cryptocurrency',
  SOLINR:'solana cryptocurrency',XRPINR:'XRP cryptocurrency',
  DOGEINR:'dogecoin cryptocurrency',
});
const PROVIDER='GDELT DOC 2.0';
const MAX_ITEMS=8,CACHE_MS=300000;
const cache=new Map();
function seenStamp(s){
  if(typeof s!=='string')return NaN;
  const m=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  return m?Date.parse(m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5]+':'+m[6]+'Z'):
    /^\d{4}-\d\d-\d\dT/.test(s)?Date.parse(s):NaN;
}
export function normalizeNews(payload,now=Date.now()){
  if(!payload||!Array.isArray(payload.articles)||payload.articles.length>250)
    throw Error('Untrusted news provider response');
  const result=[],seen=new Set();
  for(const item of payload.articles){
    if(!item||typeof item.title!=='string'||typeof item.url!=='string')continue;
    const title=item.title.trim();
    if(title.length<8||title.length>260)continue;
    let url;
    try{url=new URL(item.url)}catch{continue}
    if(url.protocol!=='https:'||url.username||url.password||!url.hostname.includes('.'))continue;
    const timestamp=seenStamp(item.seendate);
    if(!Number.isFinite(timestamp)||timestamp>now+300000||now-timestamp>72*3600000)continue;
    const canonical=url.href;
    if(seen.has(canonical))continue;
    seen.add(canonical);
    result.push({title,url:canonical,sourceDomain:url.hostname.replace(/^www\./,''),
      discoveredAt:new Date(timestamp).toISOString()});
  }
  result.sort((a,b)=>Date.parse(b.discoveredAt)-Date.parse(a.discoveredAt));
  return result.slice(0,MAX_ITEMS);
}
export async function getNewsEvidence(symbol='BTCINR',fetcher=fetch,now=Date.now()){
  if(!Object.hasOwn(SEARCH,symbol))throw RangeError('unsupported news symbol');
  if(!Number.isFinite(now)||now<=0)throw RangeError('invalid observation time');
  const old=cache.get(symbol);
  if(old&&now>=old.at&&now-old.at<CACHE_MS)return old.result;
  const result={schema:1,mode:'SOURCE_HEADLINES_ONLY',symbol,
    observedAt:new Date(now).toISOString(),source:PROVIDER,publicationVerified:false,
    liveOrdersEnabled:false,realOrdersPlaced:0,
    disclaimer:'Article discovery time is not independently verified publication time. Headline mentions are not trading catalysts or sentiment signals.',
    status:'UNAVAILABLE',articles:[]};
  try{
    const qs=new URLSearchParams({query:SEARCH[symbol],mode:'artlist',format:'json',
      timespan:'24h',maxrecords:'25',sort:'datedesc'});
    const response=await fetcher('https://api.gdeltproject.org/api/v2/doc/doc?'+qs,
      {headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('news source not responding');
    const contentType=response.headers?.get?.('content-type')??'';
    if(!contentType.includes('json'))throw Error('news source returned non-JSON data');
    const articles=normalizeNews(await response.json(),now);
    result.articles=articles;
    result.status=articles.length?'OBSERVED':'NO RECENT HEADLINES';
  }catch{/* Fail closed; never manufacture a headline. */}
  cache.set(symbol,{at:now,result});
  return result;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=300');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
  const symbol=typeof req.query?.symbol==='string'?req.query.symbol:'BTCINR';
  if(!Object.hasOwn(SEARCH,symbol))
    return res.status(400).json({error:'unsupported_news_market'});
  return res.status(200).json(await getNewsEvidence(symbol));
}
