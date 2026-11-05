/** Period account decisions use qualified prior-session closes, never same-day bars. */
export const PERIOD_POLICY=Object.freeze({version:'period-paper-risk-2026-11-05-v1',maxAllocationPaise:1000000,maxLossPerTradePaise:25000,atrMultiple:2,holdingSessions:10,monthlyTargetPct:80,pilotExposureCapPct:10});
const fail=r=>{throw Error('PERIOD_FORWARD_BLOCKED: '+r)};
const IDS=['rsi2_snapback','dual_momentum_rotation'],KEYS={NIFTYBEES:'NSE_EQ|INF204KB14I2',GOLDBEES:'NSE_EQ|INF204KB17I5'};
const sha=x=>/^[a-f0-9]{64}$/.test(x||'');
const dayOf=t=>new Date(t+19800000).toISOString().slice(0,10);
const mean=(a,n)=>a.slice(-n).reduce((s,b)=>s+b.close,0)/n;
/** Wilder smoothing, separately versioned from the older two-change research RSI. */
export function wilderRsi2(bars){
 if(bars.length<3)fail('RSI warmup');
 let up=0,down=0;
 for(let i=1;i<bars.length;i++){const d=bars[i].close-bars[i-1].close;
  if(i<=2){up+=Math.max(d,0)/2;down+=Math.max(-d,0)/2}
  else {up=(up+Math.max(d,0))/2;down=(down+Math.max(-d,0))/2}
 }
 return !down?up?100:50:100-100/(1+up/down);
}
export function atr14(bars){
 if(bars.length<15)fail('ATR warmup');
 let atr=0;
 for(let i=1;i<bars.length;i++){const b=bars[i],tr=Math.max(b.high-b.low,Math.abs(b.high-bars[i-1].close),Math.abs(b.low-bars[i-1].close));
  atr=i<=14?atr+tr/14:(atr*13+tr)/14;
 }return atr;
}
export function validatePeriodSeries(item,{day,previousSession,now}){
 const open=Date.parse(day+'T03:45:00Z');
 if(!KEYS[item?.symbol]||item.instrumentKey!==KEYS[item.symbol]||!Array.isArray(item.bars)||item.bars.length<201||
  !['VERIFIED_SPLIT_DIVIDEND_ADJUSTED','PROVIDER_DECLARED_SPLIT_BONUS'].includes(item.adjustment?.status)||!sha(item.adjustment.evidenceSha256)||
  !Number.isSafeInteger(item.knownAt)||item.knownAt>=open||item.knownAt>now||!sha(item.sourceSha256))fail('adjusted source proof missing');
 let prev='';
 for(const b of item.bars){if(!/^\d{4}-\d\d-\d\d$/.test(b.day)||b.day<=prev||b.day>=day||
  ![b.open,b.high,b.low,b.close].every(x=>Number.isFinite(x)&&x>0)||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||b.low>b.high)fail('daily bar sequence');prev=b.day}
 if(prev!==previousSession)fail('latest prior session missing');
 return item.bars;
}
/** The action time is this session's open; the evidence remains the prior close. */
export function periodDecisions(strategyId,state,context,now){
 if(!IDS.includes(strategyId)||state?.strategyId!==strategyId||!Number.isSafeInteger(now)||context?.day!==dayOf(now)||
  !/^\d{4}-\d\d-\d\d$/.test(context.previousSession||'')||context.previousSession>=context.day||
  !sha(context.calendarSha256)||!Number.isSafeInteger(context.calendarKnownAt)||context.calendarKnownAt>=Date.parse(context.day+'T03:45:00Z')||
  context.firstSessionOfMonth!==true&&context.firstSessionOfMonth!==false)fail('session calendar or account');
 const open=Date.parse(context.day+'T03:45:00Z');if(now<open||now>=open+15*60000)fail('next-session action window');
 const series=new Map((context.series||[]).map(x=>[x.symbol,x]));
 if(series.size!==(context.series||[]).length)fail('duplicate series');
 const needed=strategyId==='rsi2_snapback'?['NIFTYBEES']:Object.keys(KEYS);
 const bars=new Map(needed.map(s=>[s,validatePeriodSeries(series.get(s),{...context,now})]));
 const decisions=[],held=Object.keys(state.positions),pending=Object.keys(state.pending);
 if(held.some(s=>!needed.includes(s))||pending.some(s=>!needed.includes(s)))fail('unexpected period exposure');
 const action=(symbol,side,reason)=>{
  const b=bars.get(symbol),item=series.get(symbol),stopDistancePaise=Math.ceil(atr14(b)*2*100);
  if(!Number.isSafeInteger(stopDistancePaise)||stopDistancePaise<1)fail('ATR stop invalid');
  return {strategyId,id:`period-${strategyId}-${context.day}-${symbol}-${side}`,symbol,instrumentKey:KEYS[symbol],side,
   signalAt:new Date(now).toISOString(),reason,risk:{version:PERIOD_POLICY.version,stopDistancePaise},
   sourceDate:context.previousSession,sourceSha256:item.sourceSha256,calendarSha256:context.calendarSha256,
   adjustmentEvidenceSha256:item.adjustment.evidenceSha256,realOrdersEnabled:false};
 };
 if(strategyId==='rsi2_snapback'){
  const b=bars.get('NIFTYBEES'),p=state.positions.NIFTYBEES;
  if(p){const heldSessions=b.filter(x=>x.day>=dayOf(p.openedAt)).length;
   if(b.at(-1).close>mean(b,5)||heldSessions>=10)decisions.push(action('NIFTYBEES','SELL',heldSessions>=10?'RSI2_TEN_SESSION_EXIT':'RSI2_SMA5_EXIT'));
  }else if(!pending.length&&b.at(-1).close>mean(b,200)&&wilderRsi2(b)<5)decisions.push(action('NIFTYBEES','BUY','RSI2_WILDER_PULLBACK'));
 }else if(context.firstSessionOfMonth){
  const a=bars.get('NIFTYBEES'),b=bars.get('GOLDBEES'),ret=x=>x.at(-1).close/x.at(-127).close-1;
  if(a.length!==b.length||a.some((x,i)=>x.day!==b[i].day)||context.previousSession.slice(0,7)===context.day.slice(0,7))fail('monthly aligned calendar');
  const target=Math.max(ret(a),ret(b))>0?(ret(a)>=ret(b)?'NIFTYBEES':'GOLDBEES'):null;
  // Liquidate first. A later invocation can buy only after all old holdings/pending exit orders disappear.
  for(const symbol of held)if(symbol!==target)decisions.push(action(symbol,'SELL','MONTHLY_ROTATION_EXIT'));
  const tradedThisMonth=state.fills.some(f=>f.positionEffect==='OPEN'&&dayOf(f.tradeAt).slice(0,7)===context.day.slice(0,7));
  if(target&&!held.length&&!pending.length&&!tradedThisMonth)decisions.push(action(target,'BUY','MONTHLY_POSITIVE_LEADER'));
 }
 return {strategyId,status:decisions.length?'ACTIONS':'NO_TRADE',decisions,policy:PERIOD_POLICY,methodVersion:'WILDER_RSI2_AND_SPLIT_BONUS_PRICE_MOMENTUM_V1',sourceQualification:context.series.map(x=>({symbol:x.symbol,adjustment:x.adjustment})),paperOnly:true,realOrdersEnabled:false};
}
