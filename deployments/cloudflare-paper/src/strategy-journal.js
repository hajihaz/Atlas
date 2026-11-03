/** Owner-only evidence timeline. Research decisions are never paper fills. */
import {SEVEN_STRATEGIES} from './seven-strategy-replay.js';
import {loadSevenAccount} from './seven-paper-store.js';
import {SEVEN_RISK_POLICY} from './seven-paper-ledger.js';

const fail=reason=>{const e=Error('STRATEGY_JOURNAL_BLOCKED: '+reason);e.atlasDiagnostic='strategy journal '+reason;throw e;};
const dayOk=day=>typeof day==='string'&&/^\d{4}-\d\d-\d\d$/.test(day)&&
 Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;

export async function readStrategyJournal(env,{day,strategyId}){
 const spec=SEVEN_STRATEGIES.find(x=>x.id===strategyId);
 if(!dayOk(day)||!spec||!env.DB||!env.HISTORY_DB)fail('invalid strategy day or archive');
 const state=await loadSevenAccount(env.DB,strategyId);
 if(!state)fail('account missing');
 const events=[];
 for(const fill of state.fills.slice(-20)){
  if(!Number.isSafeInteger(fill.tradeAt)||!['BUY','SELL'].includes(fill.side)||
    !Number.isSafeInteger(fill.qty)||fill.qty<1||!Number.isSafeInteger(fill.pricePaise))fail('fill audit invalid');
  if(new Date(fill.tradeAt+19800000).toISOString().slice(0,10)===day)
   events.push({at:new Date(fill.tradeAt).toISOString(),kind:'PAPER_FILL',symbol:fill.symbol,
    side:fill.side,reason:fill.reason,quantity:fill.qty,priceINR:fill.pricePaise/100,
    feeINR:fill.feePaise/100,realizedPnlINR:fill.pnlPaise/100,
    sourceHashes:fill.quoteSha256?[fill.quoteSha256]:[]});
 }
 for(const pending of Object.values(state.pending)){
  if(!Number.isSafeInteger(pending.createdAt)||!['BUY','SELL'].includes(pending.side))fail('pending audit invalid');
  if(new Date(pending.createdAt+19800000).toISOString().slice(0,10)===day)
   events.push({at:new Date(pending.createdAt).toISOString(),kind:'PENDING',symbol:pending.symbol,
    side:pending.side,reason:pending.reason,quantity:null,priceINR:null,sourceHashes:[]});
 }
 for(const item of state.events??[]){
  if(!Number.isSafeInteger(item.at)||!['SKIPPED','EXPIRED'].includes(item.kind)||
    typeof item.reason!=='string')fail('paper event audit invalid');
  if(new Date(item.at+19800000).toISOString().slice(0,10)===day)
   events.push({at:new Date(item.at).toISOString(),kind:item.kind,symbol:item.symbol,
    side:item.side,reason:item.reason,quantity:null,priceINR:null,sourceHashes:[]});
 }
 if(strategyId==='scalpstorm_x'){
  const [decisions,runs]=await Promise.all([
   env.HISTORY_DB.prepare('SELECT window_end_ms,symbol,status,side,reason,decision_json FROM live_x_decisions WHERE source_date=? ORDER BY window_end_ms DESC,symbol LIMIT 30').bind(day).all(),
   env.HISTORY_DB.prepare("SELECT completed_ms,reason FROM live_x_runs WHERE source_date=? AND status='SKIPPED' ORDER BY window_end_ms DESC LIMIT 10").bind(day).all()
  ]);
  for(const d of decisions.results){
   let proof;try{proof=JSON.parse(d.decision_json)}catch{fail('decision source JSON invalid')}
   if(!['SIGNAL','NO_TRADE'].includes(d.status)||proof.status!==d.status||proof.symbol!==d.symbol||
    !Number.isSafeInteger(d.window_end_ms)||!Array.isArray(proof.sourceSha256)||
    proof.sourceSha256.length!==5||proof.sourceSha256.some(x=>!/^[a-f0-9]{64}$/.test(x)))fail('decision source invalid');
   events.push({at:new Date(d.window_end_ms+60000).toISOString(),kind:d.status,symbol:d.symbol,
    side:d.side,reason:d.reason,quantity:null,priceINR:null,sourceHashes:proof.sourceSha256});
  }
  for(const run of runs.results){
   if(!Number.isSafeInteger(run.completed_ms))fail('skip time invalid');
   events.push({at:new Date(run.completed_ms).toISOString(),kind:'SKIPPED',symbol:null,side:null,
    reason:run.reason,quantity:null,priceINR:null,sourceHashes:[]});
  }
 }
 events.sort((a,b)=>b.at.localeCompare(a.at)||String(a.symbol).localeCompare(String(b.symbol)));
 return {schema:'atlas.strategy-journal.v1',mode:'PAPER_ONLY',realOrdersEnabled:false,
  strategyId,sourceDate:day,executionStatus:strategyId==='scalpstorm_x'?'X_PAPER_PILOT_ARMED':spec.executionStatus,
  riskPolicy:strategyId==='scalpstorm_x'?SEVEN_RISK_POLICY:null,
  account:{cashINR:state.cashPaise/100,realizedPnlINR:state.realizedPaise/100,
   pending:Object.keys(state.pending).length,positions:Object.keys(state.positions).length,fills:state.fills.length},
  events:events.slice(0,40),note:'A source-qualified decision is not a fill. Paper fills require a later fresh observed trade and usable book depth.'};
}
