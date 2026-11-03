/** Point-in-time ScalpStorm X decision from completed source bars only. */
const fail=reason=>{const e=Error('FORWARD_X_BLOCKED: '+reason);e.atlasDiagnostic='forward X '+reason;throw e;};
const HEX=/^[a-f0-9]{64}$/;
const DAY=/^\d{4}-\d\d-\d\d$/;
const validBar=b=>b&&Number.isSafeInteger(b.time)&&[b.open,b.high,b.low,b.close].every(Number.isFinite)&&
 b.open>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)&&
 Number.isSafeInteger(b.volume)&&b.volume>=0;

export function forwardXDecision({day,symbol,roster,seed,window,nifty,now}){
 if(!DAY.test(day||'')||!/^[A-Z][A-Z0-9]{0,19}$/.test(symbol||'')||!Number.isSafeInteger(now)||
  !roster||roster.day!==day||roster.eligibleCount<500||!Array.isArray(roster.top)||roster.top.length!==10||
  !roster.top.some(x=>x.symbol===symbol)||!Number.isSafeInteger(roster.knownAt)||
  roster.knownAt>=Date.parse(day+'T04:11:00Z'))fail('09:40 roster identity or timing');
 const open=Date.parse(day+'T03:45:00Z');
 if(!Array.isArray(seed)||seed.length!==25||seed.some((b,i)=>!validBar(b)||b.time!==open+i*60000)||
  !Array.isArray(window)||window.length!==5||window.some((b,i)=>!validBar(b)||
   b.time!==window[0].time+i*60000||!HEX.test(b.sourceSha256||'')||
   !Number.isSafeInteger(b.knownAt)||b.knownAt<b.time+60000||b.knownAt>b.time+120000||b.knownAt>now)||
  window[0].time<open+25*60000||(window[0].time-open)%300000!==0||
  window[4].time>Date.parse(day+'T09:34:00Z')||window[4].time+60000>now||
  now-window[4].knownAt>120000)fail('completed five minute window or opening range missing');
 if(!Array.isArray(nifty)||nifty.length!==2||nifty[0].time!==open||nifty[1].time!==open+14*60000||
  !Number.isFinite(nifty[0].open)||!Number.isFinite(nifty[1].close)||nifty[0].open<=0||nifty[1].close<=0||
  nifty.some(x=>!HEX.test(x.sourceSha256||'')||!Number.isSafeInteger(x.knownAt)||
   x.knownAt<x.time+60000||x.knownAt>=Date.parse(day+'T04:10:00Z')))fail('Nifty opening source missing');
 const niftyBps=Math.round((nifty[1].close/nifty[0].open-1)*10000);
 const side=niftyBps>=20?'BUY':niftyBps<=-20?'SELL':null;
 const rangeHigh=Math.max(...seed.map(x=>x.high)),rangeLow=Math.min(...seed.map(x=>x.low));
 const base={strategyId:'scalpstorm_x',sourceDate:day,symbol,barEndedAt:new Date(window[4].time+60000).toISOString(),
  niftyBps,openingRangeHigh:rangeHigh,openingRangeLow:rangeLow,rosterKnownAt:new Date(roster.knownAt).toISOString(),
  sourceSha256:window.map(x=>x.sourceSha256),evidenceClass:'FORWARD_COMPLETED_SOURCE_ONLY',paperOnly:true,realOrdersEnabled:false};
 if(!side)return {...base,status:'NO_TRADE',reason:'NIFTY_NEUTRAL'};
 const confirmed=side==='BUY'?window[4].close>rangeHigh&&window[4].close>window[0].open:
  window[4].close<rangeLow&&window[4].close<window[0].open;
 return confirmed?{...base,status:'SIGNAL',side,reason:'NIFTY_AND_OPENING_RANGE_CONFIRMED'}:
  {...base,status:'NO_TRADE',reason:'NO_CONFIRMED_BREAKOUT'};
}
