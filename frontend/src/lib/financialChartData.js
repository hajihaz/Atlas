// Values remain provider observations. No generated candles or gap filling.
export function chartCandles(rows, now=Date.now()) {
 if(!Array.isArray(rows)||rows.length>100000)throw Error('Invalid candle series');
 let previous=-Infinity;
 return rows.map(r=>{
  if(!r||![r.time,r.open,r.high,r.low,r.close,r.volume].every(Number.isFinite)||
    r.time<=0||r.time>now||r.time<=previous||Math.floor(r.time/1000)<=Math.floor(previous/1000)||
    Math.min(r.open,r.high,r.low,r.close)<=0||r.volume<0||
    r.high<Math.max(r.open,r.close)||r.low>Math.min(r.open,r.close)||r.low>r.high)
   throw Error('Invalid provider candle');
  previous=r.time;
  return {time:Math.floor(r.time/1000),open:r.open,high:r.high,low:r.low,close:r.close};
 });
}
export function chartObservations(rows, after=0, now=Date.now()) {
 if(!Array.isArray(rows)||rows.length>100000)throw Error('Invalid observation series');
 const points=new Map();
 for(const r of rows){
  if(!r||!Number.isFinite(r.time)||!Number.isFinite(r.close)||r.close<=0||
     r.time<=0||r.time>now+5000)throw Error('Invalid provider observation');
  if(r.time<=after)continue;
  const time=Math.floor(r.time/1000),old=points.get(time);
  // Preserve the last actual event in a second; never average or interpolate.
  if(!old||r.time>=old.sourceTime)points.set(time,{time,value:r.close,sourceTime:r.time});
 }
 return [...points.values()].sort((a,b)=>a.time-b.time).map(({time,value})=>({time,value}));
}
