/** Owner-only, one-symbol/one-rule immutable historical replay. */
import {cohortSpec} from './upstox-history-cohort.js';
import {topVolumeRoster} from './top-volume-history.js';
import {validateHistoricalCandles} from './upstox-history-pilot.js';
import {SEVEN_STRATEGIES,replayIntradayDay} from './seven-strategy-replay.js';
import {readNiftyOpening} from './nifty-live-ohlc.js';
const fail=reason=>{const e=Error('SEVEN_REPLAY_BLOCKED: '+reason);e.atlasDiagnostic='seven replay '+reason;throw e;};
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
async function validatedMinuteSource(env,{day,symbol}){
 let spec=null,coverage='FIXED_TEN_STOCK_SAMPLE_NOT_FULL_MARKET';
 try{const top=await topVolumeRoster(env,day),match=top.find(x=>x.symbol===symbol);
  if(match){const base='https://api.upstox.com/v3/historical-candle/';
   spec={key:match.instrument_key,roster:null,url:base+encodeURIComponent(match.instrument_key)+'/minutes/1/'+day+'/'+day,
    intradayUrl:base+'intraday/'+encodeURIComponent(match.instrument_key)+'/minutes/1'};
   coverage='COMPLETE_0940_TOP_VOLUME_STOCK_MINUTE_HISTORY';}
 }catch{ /* Older fixed samples predate immutable instrument keys. */ }
 if(!spec)try{spec=cohortSpec({source_date:day,symbol})}catch{fail('invalid dated symbol')}
 if(!env.HISTORY_DB)fail('private history unavailable');
 const row=await env.HISTORY_DB.prepare('SELECT instrument_key,source_date,source_url,known_at_utc,body_sha256,body_bytes,candle_count,first_minute,last_minute,response_body FROM history_samples WHERE instrument_key=? AND source_date=?').bind(spec.key,day).first();
 if(!row)fail('dated source missing');
 if(row.instrument_key!==spec.key||row.source_date!==day||
   ![spec.url,spec.intradayUrl].includes(row.source_url)||typeof row.response_body!=='string'||
   !/^[a-f0-9]{64}$/.test(row.body_sha256)||!Number.isFinite(Date.parse(row.known_at_utc))||
   Date.parse(row.known_at_utc)<Date.parse(day+'T10:30:00Z'))fail('source identity or publication time');
 const bytes=new TextEncoder().encode(row.response_body);
 if(bytes.length!==row.body_bytes||hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))!==row.body_sha256)fail('source hash mismatch');
 let parsed;try{parsed=JSON.parse(row.response_body)}catch{fail('source JSON')}
 const proof=validateHistoricalCandles(parsed,day);
 if(proof.candle_count!==row.candle_count||proof.first_minute!==row.first_minute||proof.last_minute!==row.last_minute)fail('source metadata mismatch');
 if(coverage==='COMPLETE_0940_TOP_VOLUME_STOCK_MINUTE_HISTORY'&&
  (proof.candle_count!==375||!proof.first_minute.includes('T09:15:')||!proof.last_minute.includes('T15:29:')))fail('top-volume minute session incomplete');
 const bars=parsed.data.candles.map(c=>({time:Date.parse(c[0]),open:c[1],high:c[2],low:c[3],close:c[4],volume:c[5]})).sort((a,b)=>a.time-b.time);
 return {spec,row,bars,coverage};
}
export async function readMarketReplay(env,{day,symbol}){
 const {spec,row,bars,coverage}=await validatedMinuteSource(env,{day,symbol});
 return {schema:'atlas.market-replay.v1',mode:'PAPER_ONLY',realOrdersEnabled:false,
  sourceDate:day,symbol,instrumentKey:spec.key,sourceSha256:row.body_sha256,
  sourceKnownAt:row.known_at_utc,rosterSha256:spec.roster,
  coverage,bars};
}
export async function readIntradayStrategyReplay(env,{day,symbol,strategyId}){
 if(!SEVEN_STRATEGIES.slice(0,5).some(x=>x.id===strategyId))fail('invalid intraday strategy');
 const {spec,row,bars}=await validatedMinuteSource(env,{day,symbol});
 const strategy=SEVEN_STRATEGIES.find(x=>x.id===strategyId);
 if(['scalpstorm_x','vwap_precision'].includes(strategyId)){
  let top,nifty;
  try{top=await topVolumeRoster(env,day);nifty=await readNiftyOpening(env,day)}catch(e){
   if(/complete live 0940 coverage missing|incomplete or unqualified 0940 identity|both completed opening candles required|dated opening receipt missing/.test(e?.message||'')){
    return {schema:'atlas.seven-strategy-replay.v2',sourceDate:day,symbol,instrumentKey:spec.key,
     rosterSha256:spec.roster,sourceSha256:row.body_sha256,sourceKnownAt:row.known_at_utc,
     minuteBars:bars.length,status:'WAITING_REQUIRED_CONTEXT',required:strategy.requires,
     result:null,realOrdersEnabled:false};
   }
   throw e;
  }
  const context={symbol,niftyBars:nifty.bars,roster:{day,eligibleCount:top[0].captured,
   knownAt:new Date(Math.max(...top.map(x=>x.observed_ms))).toISOString(),
   top:top.map(x=>({symbol:x.symbol,volume:x.cumulative_volume}))}};
  const result=replayIntradayDay(strategyId,bars,{context});
  return {schema:'atlas.seven-strategy-replay.v2',sourceDate:day,symbol,instrumentKey:spec.key,
   sourceSha256:row.body_sha256,sourceKnownAt:row.known_at_utc,minuteBars:bars.length,
   status:result.status==='SIGNAL'?'RETROSPECTIVE_SIGNAL':'RETROSPECTIVE_NO_TRADE',
   required:strategy.requires,niftySourceSha256:nifty.bars.map(x=>x.sourceSha256),
   rosterKnownAt:context.roster.knownAt,result,realOrdersEnabled:false};
 }
 // The other rules still lack GIFT, time-stamped news, or 20 prior same-time
 // RVOL/sector evidence. A one-symbol receipt cannot invent those inputs.
 return {schema:'atlas.seven-strategy-replay.v2',sourceDate:day,symbol,instrumentKey:spec.key,
  rosterSha256:spec.roster,sourceSha256:row.body_sha256,sourceKnownAt:row.known_at_utc,
  minuteBars:bars.length,status:'WAITING_REQUIRED_CONTEXT',required:strategy.requires,
  result:null,realOrdersEnabled:false};
}
