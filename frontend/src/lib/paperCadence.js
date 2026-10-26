// Nominal free GitHub schedule for delayed public crypto research.
// Every even UTC two-hour candle close gets two best-effort attempts:
// +35 and +80 minutes. GitHub can delay or skip cron triggers.
// These are published-ledger freshness hints, NEVER simulated trade clocks.
const PERIOD=2*60*60*1000,MINUTE=60000,GRACE=45*MINUTE;
const SLOT_OFFSETS=[35*MINUTE,80*MINUTE];
const RECENT_WINDOW=48*60*MINUTE;
// Counts *nominal opportunities* without a newer published ledger, never
// GitHub job failures, market outages, tradable bar gaps or virtual fills.
// Only inspect a bounded window: an old source must not result in a large
// speculative history of missed jobs.
function unpublishedNominalSlots(seen,now){
 if(!Number.isFinite(seen)||seen<=0||seen>now+5000)return null;
 const first=Math.max(seen,now-RECENT_WINDOW),deadline=now-GRACE;
 let count=0;
 for(let anchor=Math.floor(first/PERIOD)*PERIOD;anchor<=deadline;anchor+=PERIOD){
  for(const offset of SLOT_OFFSETS){
   const nominal=anchor+offset;
   if(nominal>seen&&nominal>=now-RECENT_WINDOW&&nominal<deadline)count++;
  }
 }
 return count;
}
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
   nextDueAt:new Date(nextDue).toISOString(),lastRunAgeMinutes:null,overdue:false,
   unpublishedNominalSlots48h:null};
 const observed=Number.isFinite(seen)&&seen>0;
 const overdue=now>lastDue+GRACE&&(!observed||seen<lastDue);
 return {state:overdue?'LATE_OR_NOT_PUBLISHED':observed?'CHECKPOINT_SAVED':'AWAITING_FIRST_RUN',
  lastDueAt:new Date(lastDue).toISOString(),nextDueAt:new Date(nextDue).toISOString(),
  lastRunAgeMinutes:observed?Math.floor((now-seen)/MINUTE):null,overdue,
  unpublishedNominalSlots48h:unpublishedNominalSlots(seen,now)};
}
