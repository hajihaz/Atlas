// Nominal free GitHub schedule for delayed public crypto research.
// Every even UTC two-hour candle close gets two best-effort attempts:
// +35 and +80 minutes. GitHub can delay or skip cron triggers.
// These are published-ledger freshness hints, NEVER simulated trade clocks.
const PERIOD=2*60*60*1000,MINUTE=60000,GRACE=45*MINUTE;
const SLOT_OFFSETS=[35*MINUTE,80*MINUTE];
export function assessPaperCadence(lastRunAt,now=Date.now()){
 if(!Number.isFinite(now)||now<=0)throw new RangeError('Invalid clock');
 const start=Math.floor(now/PERIOD)*PERIOD;
 const candidates=[];
 for(let i=-1;i<=2;i++)
  for(const offset of SLOT_OFFSETS)candidates.push(start+i*PERIOD+offset);
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
