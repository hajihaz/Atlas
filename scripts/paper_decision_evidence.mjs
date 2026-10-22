// Explain WHY a validated, forward-only paper checkpoint did/not record a
// hypothetical trade. Never creates signals, fills, prices or broker orders.
// Called only AFTER sourceEligible() has independently passed.
import {decision,STRATEGIES} from '../frontend/lib/research-engine.js';
const H=7200000;
const validDate=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const codes=new Set(['SEED_ONLY_NO_BACKFILL','SAME_BAR_REPLAY_BLOCKED',
 'MISSED_BARS_NO_BACKFILL','RISK_HALTED','NO_ELIGIBLE_SIGNAL',
 'SELL_SIGNAL_WITHOUT_HOLDINGS','BUY_SIGNAL_ALREADY_HOLDING',
 'MODELED_BUY_RECORDED','MODELED_SELL_RECORDED',
 'BUY_SIGNAL_NO_AFFORDABLE_FILL','SELL_SIGNAL_NO_VALID_FILL']);
function recentEvents(old,now){
 const a=old??[],b=now??[];
 if(!Array.isArray(a)||!Array.isArray(b)||b.length>120)throw Error('Unsafe research event history');
 if(a.length<120){
  if(!equal(a,b.slice(0,a.length)))throw Error('Historical modeled fills altered');
  return b.slice(a.length);
 }
 if(equal(a,b))return [];
 if(b.length!==120||!equal(a.slice(1),b.slice(0,119)))
  throw Error('Modeled event rollover altered');
 return [b[119]];
}
function label(code,signal,newEvents,after){
 if(!codes.has(code)||!['BUY','SELL','HOLD','NOT_EVALUATED'].includes(signal))
  throw Error('Invalid model decision label');
 return {schema:1,mode:'SOURCE_VERIFIED_PAPER_DECISION_ONLY',
  code,signal,modeledFills:newEvents,checkedAt:after.lastRunAt,
  completedBarAt:after.lastBarClosedAt,
  realOrdersEnabled:false,actualCapitalINR:0};
}
export function attachPaperDecisionEvidence(previous,after,bars){
 if(!after||after.schema!==1||after.mode!=='SCHEDULED_VIRTUAL_PAPER'
  ||after.realOrdersEnabled!==false||after.actualCapitalINR!==0
  ||!['RUNNING','GAP_SKIPPED'].includes(after.status)
  ||!validDate(after.lastRunAt)||!validDate(after.lastBarClosedAt)
  ||!Array.isArray(after.sessions)||after.sessions.length!==5
  ||!Array.isArray(bars)||bars.length<55
  ||bars.at(-1).time+H!==Date.parse(after.lastBarClosedAt))
  throw Error('Cannot explain a source-unverified virtual checkpoint');
 const prev=new Map((previous?.sessions??[]).map(s=>[s.strategyId,s]));
 const oldBar=previous?.lastBarClosedAt?Date.parse(previous.lastBarClosedAt):null;
 const gap=oldBar===null?null:Date.parse(after.lastBarClosedAt)-oldBar;
 if(oldBar!==null&&(!Number.isFinite(gap)||gap<0||gap%H!==0))
  throw Error('Impossible paper decision interval');
 const names=new Set(STRATEGIES.map(s=>s.id));
 const sessions=after.sessions.map(s=>{
  if(!names.has(s.strategyId))throw Error('Unknown paper strategy identity');
  const old=prev.get(s.strategyId);
  const added=recentEvents(old?.events,s.events);
  if(added.length>1)throw Error('Too many modeled fills for one decision');
  let code,signal='NOT_EVALUATED';
  if(!old){code='SEED_ONLY_NO_BACKFILL';}
  else if(gap===0){code='SAME_BAR_REPLAY_BLOCKED';}
  else if(gap>H){code='MISSED_BARS_NO_BACKFILL';}
  else if(old.status==='HALTED'||s.status==='HALTED'){
   code='RISK_HALTED';
  }else if(gap===H){
   signal=decision(s.strategyId,bars,bars.length-1);
   if(signal==='HOLD')code='NO_ELIGIBLE_SIGNAL';
   else if(signal==='SELL'&&old.quantity===0)code='SELL_SIGNAL_WITHOUT_HOLDINGS';
   else if(signal==='BUY'&&old.quantity>0)code='BUY_SIGNAL_ALREADY_HOLDING';
   else if(signal==='BUY')
    code=added.some(e=>e.side==='BUY')?'MODELED_BUY_RECORDED':'BUY_SIGNAL_NO_AFFORDABLE_FILL';
   else
    code=added.some(e=>e.side==='SELL')?'MODELED_SELL_RECORDED':'SELL_SIGNAL_NO_VALID_FILL';
  }else throw Error('Unexpected paper decision interval');
  if(added.length){
   if(!['MODELED_BUY_RECORDED','MODELED_SELL_RECORDED'].includes(code)||
    added[0].side!==signal||after.status!=='RUNNING')
    throw Error('Model trade does not match the verified decision');
  }
  if((code==='MODELED_BUY_RECORDED'||code==='MODELED_SELL_RECORDED')&&!added.length)
   throw Error('Unsubstantiated modeled trade classification');
  return {...s,lastDecisionEvidence:label(code,signal,added.length,after)};
 });
 return {...after,sessions};
}
export function countPaperDecisionEvidence(report){
 const counts=Object.create(null);
 if(!Array.isArray(report?.sessions))return {};
 for(const s of report.sessions){
  const proof=s.lastDecisionEvidence;
  if(!proof)continue;
  if(proof.mode!=='SOURCE_VERIFIED_PAPER_DECISION_ONLY'||
   !codes.has(proof.code)||proof.realOrdersEnabled!==false||
   proof.actualCapitalINR!==0||proof.completedBarAt!==report.lastBarClosedAt||
   proof.checkedAt!==report.lastRunAt)
   throw Error('Untrusted paper decision evidence');
  counts[proof.code]=(counts[proof.code]??0)+1;
 }
 return {...counts};
}
