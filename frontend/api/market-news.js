// Atlas public market-news observation — metadata only, never a trade signal.
// GDELT DOC ArticleList is best-effort. Source articles retain publishers' rights.
// No client-supplied search query, credentials, inference, buy/sell scores or real orders.
const SEARCH=Object.freeze({
 BTCINR:'bitcoin',ETHINR:'ethereum',SOLINR:'solana cryptocurrency',
 XRPINR:'XRP cryptocurrency',DOGEINR:'dogecoin',
});
const SOURCE='GDELT DOC 2.0 public article metadata';
const MAX_RECORDS=8,MAX_SOURCE_AGE=36*60*60*1000;
function isoDate(value){
 if(typeof value!=='string'||!/^[0-9]{8}T[0-9]{6}Z$/.test(value))return null;
 const converted=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8)+
   'T'+value.slice(9,11)+':'+value.slice(11,13)+':'+value.slice(13,15)+'Z';
 const at=Date.parse(converted);
 return Number.isFinite(at)?{at,iso:new Date(at).toISOString()}:null;
}
export function normalizeGdelt(articles,now=Date.now()){
 if(!Array.isArray(articles)||!Number.isFinite(now))throw Error('invalid article payload');
 const seen=new Set(),safe=[];
 for(const a of articles.slice(0,80)){
  if(!a||typeof a!=='object'||typeof a.url!=='string'||typeof a.title!=='string')continue;
  const parsed=isoDate(a.seendate);
  if(!parsed||parsed.at>now+120000||now-parsed.at>MAX_SOURCE_AGE)continue;
  let u;
  try{u=new URL(a.url)}catch{continue}
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!u.hostname)continue;
  const url=u.href;
  if(seen.has(url))continue;
  seen.add(url);
  const title=a.title.replace(/[\x00-\x1F\x7F]/g,' ').trim().slice(0,180);
  if(title.length<5)continue;
  const domain=u.hostname.toLowerCase().slice(0,120);
  // Explorer gas dashboards and bot telemetry are not editorial headlines.
  if(['etherscan.io','bscscan.com','solscan.io','tronscan.org'].includes(domain)
    ||/^(eth|btc|bnb|sol)\s+(gas|price)\s*:/i.test(title))continue;
  safe.push({title,url,domain,publishedAt:parsed.iso});
  if(safe.length>=5)break;
 }
 return safe.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
}
export function buildNewsUrl(symbol){
 if(!Object.hasOwn(SEARCH,symbol))throw new RangeError('unsupported news symbol');
 const url=new URL('https://api.gdeltproject.org/api/v2/doc/doc');
 url.search=new URLSearchParams({query:SEARCH[symbol],mode:'artlist',
   maxrecords:String(MAX_RECORDS),timespan:'1day',sort:'datedesc',format:'json'}).toString();
 return url.href;
}
// Hosted API access is permitted by the publisher's README; its CODE is NOT
// open-licensed (all rights reserved). Do not vendor, rehost or redistribute code.
export function buildHostedNewsUrl(symbol){
 if(!Object.hasOwn(SEARCH,symbol))throw new RangeError('unsupported news symbol');
 const u=new URL(symbol==='BTCINR'
   ?'https://cryptocurrency.cv/api/bitcoin'
   :'https://cryptocurrency.cv/api/search');
 if(symbol!=='BTCINR')u.searchParams.set('q',SEARCH[symbol]);
 u.searchParams.set('limit',String(MAX_RECORDS));
 return u.href;
}
export function normalizeHostedNews(articles,now=Date.now()){
 if(!Array.isArray(articles))throw Error('invalid hosted news');
 return normalizeGdelt(articles.map(a=>{
  const at=Date.parse(a?.pubDate??'');
  const stamp=Number.isFinite(at)?new Date(at).toISOString().replace(/[-:]/g,'').slice(0,15)+'Z':null;
  return {title:a?.title,url:a?.link,seendate:stamp};
 }),now);
}
async function loadNews(url,normalize,getter,now,label){
 const ac=new AbortController();
 const timer=setTimeout(()=>ac.abort(),3600);
 try{
  const response=await getter(url,{method:'GET',signal:ac.signal,headers:{Accept:'application/json'}});
  if(!response?.ok)throw Error('provider_http_'+String(response?.status??'unknown'));
  const ct=response.headers?.get?.('content-type')??'';
  if(!ct.toLowerCase().includes('json'))throw Error('provider_format_error');
  const json=await response.json();
  if(!json||typeof json!=='object'||!Array.isArray(json.articles))
    throw Error('untrusted news provider contract');
  const articles=normalize(json.articles,now);
  return {schema:1,mode:'SOURCE_LINKS_ONLY',symbol:null,
   source:label,observedAt:new Date(now).toISOString(),
   status:articles.length?'OBSERVED':'NO_MATCHES',articles,
   liveOrdersEnabled:false,paperOrdersExecuted:false,
   warning:'Source article links may be inaccurate or incomplete. No sentiment score, independently verified news or trading signal. Publisher rights apply.'};
 }finally{clearTimeout(timer)}
}
export async function getMarketNews(symbol='BTCINR',getter=fetch,now=Date.now()){
 if(!Number.isFinite(now)||now<=0)throw new RangeError('invalid time');
 // Two bounded free public providers, no credentials and no LLM billing.
 // Prefer an explicitly free hosted article-link API; GDELT is best-effort fallback.
 const providers=[
  [buildHostedNewsUrl(symbol),normalizeHostedNews,'cryptocurrency.cv (publisher-linked news aggregation)'],
  [buildNewsUrl(symbol),normalizeGdelt,SOURCE],
 ];
 let firstEmpty=null,lastError=null;
 for(const [url,normalizer,label] of providers){
  try{
   const item=await loadNews(url,normalizer,getter,now,label);
   if(item.articles.length)return {...item,symbol};
   if(!firstEmpty)firstEmpty={...item,symbol};
  }catch(e){lastError=e;}
 }
 if(firstEmpty)return firstEmpty;
 throw lastError??new Error('news provider unavailable');
}
export default async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','public, max-age=0, s-maxage=300');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});
 }
 const symbol=typeof req.query?.symbol==='string'?req.query.symbol:'BTCINR';
 if(!Object.hasOwn(SEARCH,symbol))return res.status(400).json({error:'unsupported_market'});
 try{return res.status(200).json(await getMarketNews(symbol))}
 catch(e){
  const msg=String(e?.message??'');
  const reason=/^provider_http_[0-9]{3}$/.test(msg)?msg:
    msg.includes('JSON')?'provider_format_error':
    e?.name==='AbortError'?'provider_timeout':'provider_network_error';
  return res.status(503).json({error:'news_provider_unavailable',reason,
    articles:[],liveOrdersEnabled:false});
 }
}
