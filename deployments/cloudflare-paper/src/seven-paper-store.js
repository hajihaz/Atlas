/** D1 compare-and-swap store for isolated seven-strategy paper ledgers. */
import {createSevenAccount,assertSevenAccount} from './seven-paper-ledger.js';
import {SEVEN_STRATEGIES} from './seven-strategy-replay.js';
import {paperExperimentReport} from './paper-experiment-report.js';
const fail=reason=>{throw Error('SEVEN_STORE_BLOCKED: '+reason);};
export async function ensureSevenAccounts(db,startedAt){
 if(!db||!Number.isSafeInteger(startedAt)||startedAt<=0)fail('store or time');
 for(const spec of SEVEN_STRATEGIES){
  const state=createSevenAccount(spec.id,startedAt);
  await db.prepare('INSERT OR IGNORE INTO seven_paper_accounts(strategy_id,revision,state_json,updated_ms) VALUES(?,?,?,?)')
   .bind(spec.id,0,JSON.stringify(state),startedAt).run();
 }
 return listSevenAccounts(db);
}
export async function loadSevenAccount(db,strategyId){
 if(!db||!SEVEN_STRATEGIES.some(x=>x.id===strategyId))fail('strategy or store');
 const row=await db.prepare('SELECT strategy_id,revision,state_json FROM seven_paper_accounts WHERE strategy_id=?').bind(strategyId).first();
 if(!row)return null;
 let state;try{state=JSON.parse(row.state_json)}catch{fail('stored JSON')}
 assertSevenAccount(state);
 if(row.strategy_id!==strategyId||row.revision!==state.revision)fail('stored revision');
 return state;
}
export async function saveSevenAccount(db,previous,next,now){
 assertSevenAccount(previous);assertSevenAccount(next);
 if(!db||previous.strategyId!==next.strategyId||next.revision<=previous.revision||
   next.revision>previous.revision+20||
   !Number.isSafeInteger(now)||now<previous.startedAt)fail('revision or time');
 const result=await db.prepare('UPDATE seven_paper_accounts SET revision=?,state_json=?,updated_ms=? WHERE strategy_id=? AND revision=?')
  .bind(next.revision,JSON.stringify(next),now,next.strategyId,previous.revision).run();
 if(result?.meta?.changes!==1)fail('concurrent or missing account');
 return next;
}
export async function listSevenAccounts(db){
 if(!db)fail('store');
 // Earlier unarmed research accounts remain in D1 as an audit trail. Only
 // identities in the owner-approved seven-rule catalog belong to this view.
 const ids=SEVEN_STRATEGIES.map(x=>x.id);
 const result=await db.prepare('SELECT strategy_id,revision,state_json,updated_ms FROM seven_paper_accounts WHERE strategy_id IN (?,?,?,?,?,?,?) ORDER BY strategy_id')
  .bind(...ids).all();
 const rows=result.results;if(rows.length!==7)fail('incomplete seven accounts');
 const seen=new Set();
 return {schema:'atlas.seven-paper-accounts.v1',paperOnly:true,realOrdersEnabled:false,
  executionStatus:'X_PAPER_PILOT_ARMED_OTHER_SIX_UNARMED',
  accounts:rows.map(row=>{
   let state;try{state=JSON.parse(row.state_json)}catch{fail('stored JSON')}
   assertSevenAccount(state);
   if(seen.has(row.strategy_id)||row.strategy_id!==state.strategyId||row.revision!==state.revision)fail('stored identity');
   seen.add(row.strategy_id);
   const fills=[...state.fills].sort((a,b)=>a.tradeAt-b.tradeAt);
   if(fills.some(f=>!Number.isSafeInteger(f.tradeAt)||!Number.isSafeInteger(f.pnlPaise)))fail('fill performance audit');
   let running=state.realizedPaise-fills.reduce((sum,f)=>sum+f.pnlPaise,0);
   if(!Number.isSafeInteger(running))fail('realized performance audit');
   const closedPnlSeries=fills.map(f=>{running+=f.pnlPaise;return {at:new Date(f.tradeAt).toISOString(),realizedPnlINR:running/100};});
   if(Math.abs(running-state.realizedPaise)>1)fail('realized performance mismatch');
   // A legacy fill may lack reporting details; preserve the independently audited basic balance view.
   let experiment=null;try{experiment=paperExperimentReport(state)}catch{ /* Detailed statistics remain unavailable. */ }
   return {strategyId:state.strategyId,revision:state.revision,cashINR:state.cashPaise/100,
    realizedPnlINR:state.realizedPaise/100,pendingCount:Object.keys(state.pending).length,
    positionCount:Object.keys(state.positions).length,paperFills:state.fills.length,updatedAt:row.updated_ms,
    closedPnlSeries,historyTruncated:state.fills.length===1000,experiment,experimentStatus:experiment?'AVAILABLE':'UNAVAILABLE_LEGACY_OR_INVALID_FILL_DETAIL'};
  })};
}
