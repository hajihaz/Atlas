/** Owner-only, one-symbol/one-rule immutable historical replay. */
import {cohortSpec} from './upstox-history-cohort.js';
import {validateHistoricalCandles} from './upstox-history-pilot.js';
import {SEVEN_STRATEGIES} from './seven-strategy-replay.js';
const fail=reason=>{const e=Error('SEVEN_REPLAY_BLOCKED: '+reason);e.atlasDiagnostic='seven replay '+reason;throw e;};
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function readIntradayStrategyReplay(env,{day,symbol,strategyId}){
 let spec;try{spec=cohortSpec({source_date:day,symbol})}catch{fail('invalid dated symbol')}
 if(!SEVEN_STRATEGIES.slice(0,5).some(x=>x.id===strategyId))fail('invalid intraday strategy');
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
 const bars=parsed.data.candles.map(c=>({time:Date.parse(c[0]),open:c[1],high:c[2],low:c[3],close:c[4],volume:c[5]})).sort((a,b)=>a.time-b.time);
 // A one-symbol after-close receipt cannot reconstruct the 09:40 full universe,
 // 09:30 Nifty/GIFT decision, dated news, or 20-session same-time RVOL.
 // Preserve its exact proof and report the missing context instead of a fake replay.
 const strategy=SEVEN_STRATEGIES.find(x=>x.id===strategyId);
 return {schema:'atlas.seven-strategy-replay.v2',sourceDate:day,symbol,instrumentKey:spec.key,
  rosterSha256:spec.roster,sourceSha256:row.body_sha256,sourceKnownAt:row.known_at_utc,
  minuteBars:bars.length,status:'WAITING_REQUIRED_CONTEXT',required:strategy.requires,
  result:null,realOrdersEnabled:false};
}
