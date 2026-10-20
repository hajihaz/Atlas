// Operational run summary of already persisted virtual-paper observations.
// No network, broker, notification service, orders or inferred market prices.
const safeText=x=>String(x??'not available').replace(/[|\r\n`<>]/g,' ').slice(0,180);
const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
function newEvents(a,b){
 const old=a??[],next=b??[];
 if(!Array.isArray(old)||!Array.isArray(next)||old.length>120||next.length>120)
  throw Error('Untrusted event retention history');
 if(old.length<120){
  if(!same(old,next.slice(0,old.length))||next.length<old.length)
   throw Error('Changed retained modeled events');
  return next.slice(old.length);
 }
 if(same(old,next))return [];
 if(next.length===120&&same(old.slice(1),next.slice(0,119)))
  return next.slice(119);
 throw Error('Untrusted modeled event rollover');
}
export function describePaperRun(before,after){
 if(!after||after.schema!==1||after.mode!=='SCHEDULED_VIRTUAL_PAPER'
  ||after.realOrdersEnabled!==false||after.actualCapitalINR!==0
  ||!Array.isArray(after.sessions)||![0,5].includes(after.sessions.length)
  ||!Number.isSafeInteger(after.runCount)||after.runCount<1
  ||!['RUNNING','GAP_SKIPPED','DEGRADED','AWAITING_VALID_SOURCE'].includes(after.status))
  throw Error('Unsafe paper research snapshot');
 let newlyModeledFills=0,haltedStrategies=0;
 const previous=new Map((before?.sessions??[]).map(s=>[s.strategyId,s]));
 for(const s of after.sessions){
  if(!s||!Array.isArray(s.events)||!['RUNNING','HALTED'].includes(s.status))
   throw Error('Invalid paper strategy');
  const added=newEvents(previous.get(s.strategyId)?.events,s.events);
  if(added.length>1)throw Error('Unexpected simultaneous paper events');
  newlyModeledFills+=added.length;
  if(s.status==='HALTED')haltedStrategies++;
 }
 const sourceCode=after.lastSourceCheck?.code??'NO_SOURCE_REASON_RECORDED';
 const sourceAccepted=after.lastSourceCheck?.status==='PASS';
 const safe=after.status==='RUNNING'&&sourceAccepted&&haltedStrategies===0;
 let classification=haltedStrategies?'VIRTUAL_RISK_HALTED':
  after.status==='DEGRADED'?'SOURCE_REJECTED':
  after.status==='GAP_SKIPPED'?'SKIPPED_SOURCE_INTERVALS':
  after.status==='AWAITING_VALID_SOURCE'?'SOURCE_NOT_INITIALIZED':
  safe?'SOURCE_VERIFIED_PAPER_ONLY':'SOURCE_STATUS_UNVERIFIED';
 if(after.status!=='RUNNING'&&newlyModeledFills)
  throw Error('New model fill on unsafe runner status');
 return {
  schema:1,mode:'PUBLIC_PAPER_OPERATIONS_SUMMARY',
  classification,sourceAccepted,sourceCode,
  runStatus:after.status,runCount:after.runCount,
  runAt:after.lastRunAt??null,
  lastBarClosedAt:after.lastBarClosedAt??null,
  candleAgeMinutes:after.lastSourceCheck?.candleAgeMinutes??null,
  latencyClass:after.lastSourceCheck?.latencyClass??'UNVERIFIED',
  strategies:after.sessions.length,haltedStrategies,
  skippedIntervals:after.skippedIntervals??0,
  newlyModeledFills,realOrdersEnabled:false,actualCapitalINR:0,
  note:'Modeled fills are hypothetical, not broker trades. Job success means the checkpoint was safely handled, not that market data passed.'
 };
}
export function renderPaperRunHealthMarkdown(health){
 if(health?.schema!==1||health.mode!=='PUBLIC_PAPER_OPERATIONS_SUMMARY'
  ||health.realOrdersEnabled!==false||health.actualCapitalINR!==0)
  throw Error('Untrusted health summary');
 return [
  '## Atlas virtual-paper checkpoint — research only',
  '',
  '| Metric | Saved observation |',
  '| --- | --- |',
  '| Runner classification | '+safeText(health.classification)+' |',
  '| Market-source check | '+safeText(health.sourceCode)+' |',
  '| Source accepted | '+(health.sourceAccepted?'Yes':'No / unverified')+' |',
  '| Run timestamp UTC | '+safeText(health.runAt)+' |',
  '| Last completed source bar UTC | '+safeText(health.lastBarClosedAt)+' |',
  '| Candle age at check | '+safeText(health.candleAgeMinutes)+' minutes |',
  '| Latency policy | '+safeText(health.latencyClass)+' |',
  '| Model accounts | '+health.strategies+' |',
  '| **New hypothetical fills** | **'+health.newlyModeledFills+'** |',
  '| Halted strategies | '+health.haltedStrategies+' |',
  '| Missed research intervals | '+health.skippedIntervals+' |',
  '| Real capital | ₹0 |',
  '',
  '**Note:** A green GitHub job only confirms safe execution. Source rejection and missing fills are not successful trades.',
  'No new broker orders, actual capital, or guaranteed forward profits.',
  ''
 ].join('\n');
}
