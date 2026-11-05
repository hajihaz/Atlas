/** Period orchestration. Raw/unconfirmed archives fail closed without creating intents. */
import {readQualifiedPeriodInputs} from './forward-period-source.js';
import {periodDecisions,PERIOD_POLICY} from './forward-period.js';
import {loadSevenAccount,saveSevenAccount} from './seven-paper-store.js';
import {submitSevenSignal} from './seven-paper-ledger.js';
const ids=['rsi2_snapback','dual_momentum_rotation'];
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function runPeriodForward(env,day,now,{readInput=readQualifiedPeriodInputs}={}){
 const open=Date.parse(day+'T03:45:00Z');
 if(!Number.isSafeInteger(now)||new Date(now+19800000).toISOString().slice(0,10)!==day||now<open||now>=open+15*60000)throw Error('PERIOD_FORWARD_BLOCKED: next-session action window');
 const source=await readInput(env,day),results=[];
 for(const strategyId of ids){
  const before=await loadSevenAccount(env.DB,strategyId);if(!before)throw Error('PERIOD_FORWARD_BLOCKED: account missing');
  const windowEnd=Math.floor(now/60000)*60000;
  const existing=await env.HISTORY_DB.prepare('SELECT payload_json,payload_sha256 FROM forward_strategy_windows WHERE source_date=? AND strategy_id=? AND window_end_ms=?').bind(day,strategyId,windowEnd).first();
  if(existing&&await digest(existing.payload_json)!==existing.payload_sha256)throw Error('PERIOD_FORWARD_BLOCKED: existing journal hash');
  const result=existing?JSON.parse(existing.payload_json):source.ready===true?periodDecisions(strategyId,before,source.context,now):{strategyId,status:'BLOCKED',decisions:[],reason:source.reason,sources:source.sources,policy:PERIOD_POLICY};
  if(result.strategyId!==strategyId||!Array.isArray(result.decisions))throw Error('PERIOD_FORWARD_BLOCKED: journal identity');
  const payload=existing?existing.payload_json:JSON.stringify(result);
  await env.HISTORY_DB.prepare('INSERT OR IGNORE INTO forward_strategy_windows(source_date,strategy_id,window_end_ms,completed_ms,status,payload_json,payload_sha256) VALUES(?,?,?,?,?,?,?)').bind(day,strategyId,windowEnd,now,result.status==='BLOCKED'?'SKIPPED':'EVALUATED',payload,await digest(payload)).run();
  // Read back the exact persisted input/actions before any account mutation.
  const stored=await env.HISTORY_DB.prepare('SELECT payload_json,payload_sha256 FROM forward_strategy_windows WHERE source_date=? AND strategy_id=? AND window_end_ms=?').bind(day,strategyId,windowEnd).first();
  if(!stored||await digest(stored.payload_json)!==stored.payload_sha256||stored.payload_json!==payload)throw Error('PERIOD_FORWARD_BLOCKED: persisted decision conflict');
  let state=before;const actions=[];
  for(const signal of result.decisions){const queued=submitSevenSignal(state,{...signal,decisionSha256:stored.payload_sha256,methodVersion:result.methodVersion},now);state=queued.state;actions.push({symbol:signal.symbol,status:queued.status});}
  if(state.revision!==before.revision)await saveSevenAccount(env.DB,before,state,now);
  results.push({strategyId,status:result.status,reason:result.reason,actions,realOrdersEnabled:false});
 }
 return {results,realOrdersEnabled:false};
}
