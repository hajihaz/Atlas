/** Provider-declared split/bonus price-series pilot; never claims total-return certification. */
import {fetchContextSource} from './forward-context.js';
import {readValidatedEtfSeries} from './etf-daily-archive.js';
import {PERIOD_POLICY} from './forward-period.js';
const fail=r=>{const e=Error('PERIOD_SOURCE_BLOCKED: '+r);e.atlasDiagnostic='period source '+r;throw e};
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export const PRICE_SOURCE_POLICY=Object.freeze({method:'PROVIDER_DECLARED_SPLIT_BONUS_PRICE_V1',reviewedOn:'2026-11-05',reviewedAt:'2026-11-05T17:15:00Z',reviewValidDays:30,
 evidenceUrl:'https://community.upstox.com/t/is-historical-price-adjusted-for-corporate-action/3548',
 declaration:'Provider support describes split and bonus adjustment, rather than dividend-adjusted total returns.',
 independentlyReconciled:false,dividendAdjusted:false});
const date=t=>new Date(t).toISOString().slice(0,10);
const validDay=d=>typeof d==='string'&&/^\d{4}-\d\d-\d\d$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&date(Date.parse(d+'T00:00:00Z'))===d;
export function qualifyCalendar(body,day){
 if(!validDay(day)||body?.status!=='success'||!Array.isArray(body.data)||body.data.length<10||body.data.length>200)fail('complete current-year calendar missing');
 const map=new Map();
 for(const r of body.data){
  if(!validDay(r.date)||r.date.slice(0,4)!==day.slice(0,4)||map.has(r.date)||!Array.isArray(r.closed_exchanges)||!Array.isArray(r.open_exchanges))fail('calendar year, date or exchange shape');
  map.set(r.date,r);
 }
 const isSession=d=>{
  const r=map.get(d),special=r?.open_exchanges.find(x=>x?.exchange==='NSE');
  if(special){
   const open=Date.parse(d+'T03:45:00Z'),end=Date.parse(d+'T10:00:00Z');
   if(special.start_time!==open||special.end_time!==end)fail('nonstandard NSE session requires separate timing support');
   return true;
  }
  if(r?.closed_exchanges.includes('NSE'))return false;
  const dow=new Date(d+'T00:00:00Z').getUTCDay();return dow!==0&&dow!==6;
 };
 if(!isSession(day))return {session:false,previousSession:null,firstSessionOfMonth:false};
 let t=Date.parse(day+'T00:00:00Z');
 for(let i=0;i<14;i++){
  t-=86400000;const prior=date(t);if(prior.slice(0,4)!==day.slice(0,4))fail('prior-year calendar boundary not covered');
  if(isSession(prior))return {session:true,previousSession:prior,firstSessionOfMonth:prior.slice(0,7)!==day.slice(0,7)};
 }
 fail('prior regular session missing');
}
export async function collectPeriodCalendar(env,day,{fetcher=fetch,clock=()=>Date.now(),probeOnly=false}={}){
 if(new Date(clock()+19800000).toISOString().slice(0,10)!==day)fail('current calendar date');
 const r=await fetchContextSource(env,'https://api.upstox.com/v2/market/holidays',fetcher,clock),calendar=qualifyCalendar(r.body,day);
 if(!probeOnly){
  await env.HISTORY_DB.prepare('INSERT OR IGNORE INTO period_calendar_receipts(source_date,known_ms,source_url,body_json,body_sha256) VALUES(?,?,?,?,?)').bind(day,r.knownAt,r.url,r.raw,r.sha256).run();
 }
 return {status:'CALENDAR_AVAILABLE',...calendar,sourceDate:day,knownAt:r.knownAt,sourceSha256:r.sha256,forwardQualified:!probeOnly&&r.knownAt<Date.parse(day+'T03:45:00Z'),sourcePolicy:PRICE_SOURCE_POLICY,realOrdersEnabled:false};
}
export async function readQualifiedPeriodInputs(env,day){
 const open=Date.parse(day+'T03:45:00Z'),r=await env.HISTORY_DB.prepare('SELECT known_ms,source_url,body_json,body_sha256 FROM period_calendar_receipts WHERE source_date=?').bind(day).first();
 if(!r||r.known_ms>=open||r.source_url!=='https://api.upstox.com/v2/market/holidays'||await digest(r.body_json)!==r.body_sha256)return {ready:false,reason:'PREOPEN_CALENDAR_RECEIPT_MISSING'};
 const calendar=qualifyCalendar(JSON.parse(r.body_json),day);
 if(!calendar.session)return {ready:false,reason:'NSE_REGULAR_SESSION_CLOSED'};
 const policyAt=Date.parse(PRICE_SOURCE_POLICY.reviewedAt);
 if(open<policyAt||open-policyAt>PRICE_SOURCE_POLICY.reviewValidDays*86400000)return {ready:false,reason:'PRICE_SOURCE_POLICY_REVIEW_EXPIRED'};
 const evidenceSha256=await digest(JSON.stringify(PRICE_SOURCE_POLICY)),series=[];
 for(const symbol of ['NIFTYBEES','GOLDBEES']){
  let item;try{item=await readValidatedEtfSeries(env,calendar.previousSession,symbol)}catch{return {ready:false,reason:'LATEST_PRIOR_ETF_RECEIPT_MISSING_OR_CORRUPT'};}
  const knownAt=Date.parse(item.proof.receivedAt);
  if(knownAt>=open||!Number.isSafeInteger(knownAt))return {ready:false,reason:'ETF_RECEIPT_NOT_KNOWN_BEFORE_OPEN'};
  if(item.bars.some((b,i)=>i&&Math.abs(b.close/item.bars[i-1].close-1)>.2))return {ready:false,reason:'ETF_PRICE_DISCONTINUITY_REQUIRES_ACTION_RECONCILIATION'};
  series.push({symbol,instrumentKey:item.proof.instrumentKey,knownAt,sourceSha256:await digest(JSON.stringify(item.proof)),
   sourceManifestSha256:await digest(JSON.stringify(item.proof)),
   adjustment:{status:'PROVIDER_DECLARED_SPLIT_BONUS',evidenceSha256,evidenceUrl:PRICE_SOURCE_POLICY.evidenceUrl,independentlyReconciled:false,dividendAdjusted:false},bars:item.bars});
 }
 if(series[0].bars.length!==series[1].bars.length||series[0].bars.some((b,i)=>b.day!==series[1].bars[i].day))return {ready:false,reason:'ETF_SESSION_CALENDARS_DISAGREE'};
 return {ready:true,context:{day,...calendar,calendarSha256:r.body_sha256,calendarKnownAt:r.known_ms,series},policy:PERIOD_POLICY,sourcePolicy:PRICE_SOURCE_POLICY};
}
export async function probePeriodSource(env,day,options={}){
 try{return await collectPeriodCalendar(env,day,{...options,probeOnly:true})}catch(e){return {status:'BLOCKED',reason:e?.atlasDiagnostic||'CALENDAR_PROVIDER_UNAVAILABLE',forwardQualified:false,realOrdersEnabled:false};}
}
