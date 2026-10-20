// Human-readable nominal GitHub cron visibility. Schedules are best-effort;
// this does not assert that a workflow ran, or that a market snapshot is fresh.
const PERIOD=2*60*60*1000,MINUTE=60*1000,GRACE=45*MINUTE;
export function assessPaperCadence(lastRunAt,now=Date.now()){
 if(!Number.isFinite(now)||now<=0)throw new RangeError('Invalid clock');
 const nowDate=new Date(now);
 const currentEvenHour=Math.floor(nowDate.getUTCHours()/2)*2;
 let lastDue=Date.UTC(nowDate.getUTCFullYear(),nowDate.getUTCMonth(),
  nowDate.getUTCDate(),currentEvenHour,17,0);
 if(lastDue>now)lastDue-=PERIOD;
 const nextDue=lastDue+PERIOD;
 const seen=typeof lastRunAt==='string'?Date.parse(lastRunAt):NaN;
 if(Number.isFinite(seen)&&seen>now+5000)
  return {state:'INVALID_FUTURE_SNAPSHOT',lastDueAt:new Date(lastDue).toISOString(),
   nextDueAt:new Date(nextDue).toISOString(),lastRunAgeMinutes:null,overdue:false};
 const observed=Number.isFinite(seen)&&seen>0;
 // The next runner may start late; don't confuse "no published new bar" with
 // an actual GitHub Actions failure.
 const overdue=now>lastDue+GRACE&&(!observed||seen<lastDue);
 return {state:overdue?'LATE_OR_NOT_PUBLISHED':observed?'CHECKPOINT_SAVED':'AWAITING_FIRST_RUN',
  lastDueAt:new Date(lastDue).toISOString(),nextDueAt:new Date(nextDue).toISOString(),
  lastRunAgeMinutes:observed?Math.floor((now-seen)/MINUTE):null,overdue};
}
