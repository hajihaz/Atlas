// Nominal GitHub schedule window for delayed public crypto research.
// GitHub cron is best effort. A stale ledger != proof a job did not run.
const PERIOD=2*60*60*1000,MINUTE=60000,GRACE=45*MINUTE;
export function assessPaperCadence(lastRunAt,now=Date.now()){
 if(!Number.isFinite(now)||now<=0)throw new RangeError('Invalid clock');
 const d=new Date(now);
 const oddHour=Math.floor((d.getUTCHours()-1)/2)*2+1;
 const first=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),
  oddHour,5,0);
 const candidates=[first-PERIOD,first-PERIOD+12*MINUTE,
  first,first+12*MINUTE,first+PERIOD,first+PERIOD+12*MINUTE,
  first+2*PERIOD,first+2*PERIOD+12*MINUTE];
 const prior=candidates.filter(t=>t<=now);
 const future=candidates.filter(t=>t>now);
 const lastDue=Math.max(...prior);
 const nextDue=Math.min(...future);
 const seen=typeof lastRunAt==='string'?Date.parse(lastRunAt):NaN;
 if(Number.isFinite(seen)&&seen>now+5000)
  return {state:'INVALID_FUTURE_SNAPSHOT',lastDueAt:new Date(lastDue).toISOString(),
   nextDueAt:new Date(nextDue).toISOString(),lastRunAgeMinutes:null,overdue:false};
 const observed=Number.isFinite(seen)&&seen>0;
 const overdue=now>lastDue+GRACE&&(!observed||seen<lastDue);
 return {state:overdue?'LATE_OR_NOT_PUBLISHED':observed?'CHECKPOINT_SAVED':'AWAITING_FIRST_RUN',
  lastDueAt:new Date(lastDue).toISOString(),nextDueAt:new Date(nextDue).toISOString(),
  lastRunAgeMinutes:observed?Math.floor((now-seen)/MINUTE):null,overdue};
}
