import {describePaperRun} from './paper_run_health.mjs';
// Append-only bounded evidence of GENUINE FUTURE virtual runner attempts.
// No backfill from legacy runCount; an older published ledger with no history
// starts its audit window with the first NEW observed attempt.
const MAX=24;
const knownClass=new Set(['SOURCE_VERIFIED_PAPER_ONLY','SOURCE_REJECTED',
 'SKIPPED_SOURCE_INTERVALS','VIRTUAL_RISK_HALTED','SOURCE_NOT_INITIALIZED',
 'SOURCE_STATUS_UNVERIFIED']);
const knownStatus=new Set(['RUNNING','GAP_SKIPPED','DEGRADED','AWAITING_VALID_SOURCE']);
const validDate=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&
 Date.parse(v)>0&&new Date(Date.parse(v)).toISOString()===v;
const eq=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
function validateRecord(e){
 if(!e||typeof e!=='object'||Array.isArray(e)||
  !Number.isSafeInteger(e.runCount)||e.runCount<1||
  !knownClass.has(e.classification)||!knownStatus.has(e.status)||
  !validDate(e.at)||!Number.isSafeInteger(e.newModeledFills)||
  e.newModeledFills<0||e.newModeledFills>5||
  !Number.isSafeInteger(e.haltedStrategies)||e.haltedStrategies<0||
  e.haltedStrategies>5||!Number.isSafeInteger(e.skippedIntervals)||
  e.skippedIntervals<0||e.skippedIntervals>1000000||
  typeof e.sourceAccepted!=='boolean'||
  typeof e.sourceCode!=='string'||!/^[-A-Z0-9_]{3,64}$/.test(e.sourceCode)||
  (e.completedBarAt!==null&&!validDate(e.completedBarAt))||
  (e.candleAgeMinutes!==null&&(!Number.isSafeInteger(e.candleAgeMinutes)||
    e.candleAgeMinutes<0||e.candleAgeMinutes>10000000))||
  e.realOrdersEnabled!==false||e.actualCapitalINR!==0||
  (e.classification==='SOURCE_VERIFIED_PAPER_ONLY'&&!e.sourceAccepted)||
  (e.status!=='RUNNING'&&e.newModeledFills!==0)||
  (e.classification==='SOURCE_REJECTED'&&e.status!=='DEGRADED'))
  throw Error('Invalid published paper checkpoint evidence');
}
function validateWindow(rows){
 if(!Array.isArray(rows)||rows.length>MAX)throw Error('Unsafe checkpoint retention window');
 for(let i=0;i<rows.length;i++){
  validateRecord(rows[i]);
  if(i&&(rows[i].runCount!==rows[i-1].runCount+1||
     Date.parse(rows[i].at)<Date.parse(rows[i-1].at)))
   throw Error('Nonmonotonic paper checkpoint evidence');
 }
}
export function appendPaperCheckpointEvidence(before,after,health){
 const prev=before?.recentCheckpoints??[];
 validateWindow(prev);
 if(!health||health.schema!==1||
  health.mode!=='PUBLIC_PAPER_OPERATIONS_SUMMARY'||
  health.realOrdersEnabled!==false||health.actualCapitalINR!==0||
  health.runCount!==after?.runCount||health.runAt!==after?.lastRunAt||
  health.runStatus!==after?.status)
  throw Error('Checkpoint evidence does not match actual run');
 const entry={
  runCount:health.runCount,at:health.runAt,
  status:health.runStatus,classification:health.classification,
  sourceAccepted:health.sourceAccepted,sourceCode:health.sourceCode,
  completedBarAt:health.lastBarClosedAt??null,
  candleAgeMinutes:health.candleAgeMinutes??null,
  newModeledFills:health.newlyModeledFills,
  haltedStrategies:health.haltedStrategies,
  skippedIntervals:health.skippedIntervals,
  realOrdersEnabled:false,actualCapitalINR:0
 };
 validateRecord(entry);
 // Do not allow callers to invent a source PASS / modeled fill count.
 // Validate the proposed record against independently derived ledger health.
 const derived=describePaperRun(before,after);
 if(derived.classification!==entry.classification||
    derived.sourceAccepted!==entry.sourceAccepted||
    derived.sourceCode!==entry.sourceCode||
    derived.newlyModeledFills!==entry.newModeledFills||
    derived.haltedStrategies!==entry.haltedStrategies||
    derived.skippedIntervals!==entry.skippedIntervals)
  throw Error('Checkpoint evidence conflicts with actual modeled ledger');
 if(prev.length){
  const last=prev.at(-1);
  if(entry.runCount!==last.runCount+1||
   Date.parse(entry.at)<Date.parse(last.at))
   throw Error('Checkpoint evidence replay or clock regression');
 }
 return [...prev,entry].slice(-MAX);
}
export function assertPaperCheckpointContinuity(before,after){
 // Backward compatibility: legacy state/checkpoint fixtures may not have
 // the feature until a new real run appends its first proof record.
 const old=before?.recentCheckpoints,now=after?.recentCheckpoints;
 if(old===undefined&&now===undefined)return true;
 if(old!==undefined)validateWindow(old);
 if(now===undefined)throw Error('Published paper checkpoint evidence erased');
 validateWindow(now);
 const history=old??[];
 if(!now.length||now.at(-1).runCount!==after.runCount||
  now.at(-1).at!==after.lastRunAt)
  throw Error('Latest paper checkpoint evidence does not match ledger');
 // The single newly executed run is the ONLY permitted append.
 const expected=history.length>=MAX?history.slice(1):history;
 if(now.length!==Math.min(MAX,history.length+1)||
    !eq(now.slice(0,-1),expected))
  throw Error('Historical paper checkpoint evidence changed');
 if(history.length&&now.at(-1).runCount!==history.at(-1).runCount+1)
  throw Error('Duplicate or skipped paper checkpoint run ID');
 // A saved checkpoint cannot change a genuine source reason, market bar,
 // modeled event count, risk veto or missed-interval count after publication.
 const health=describePaperRun(before,after),latest=now.at(-1);
 if(latest.status!==health.runStatus||
   latest.classification!==health.classification||
   latest.sourceAccepted!==health.sourceAccepted||
   latest.sourceCode!==health.sourceCode||
   latest.completedBarAt!==(health.lastBarClosedAt??null)||
   latest.candleAgeMinutes!==(health.candleAgeMinutes??null)||
   latest.newModeledFills!==health.newlyModeledFills||
   latest.haltedStrategies!==health.haltedStrategies||
   latest.skippedIntervals!==health.skippedIntervals)
  throw Error('Latest checkpoint evidence conflicts with real source/fill data');
 return true;
}
export function checkpointEvidenceSummary(report){
 const rows=report?.recentCheckpoints??[];
 validateWindow(rows);
 const yes=rows.filter(r=>r.sourceAccepted&&r.status==='RUNNING');
 const rejected=rows.filter(r=>r.classification==='SOURCE_REJECTED');
 return {recordedAttempts:rows.length,
  acceptedSourceAttempts:yes.length,rejectedSourceAttempts:rejected.length,
  modeledFillsRecordedInWindow:rows.reduce((n,r)=>n+r.newModeledFills,0),
  windowIsPartial:report?.runCount>rows.length,
  newest:rows.at(-1)??null,
  reminder:'Only actual persisted attempts after this feature was deployed; not historical backfill or a complete certification.'};
}
