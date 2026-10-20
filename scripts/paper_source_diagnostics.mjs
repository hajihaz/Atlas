// Fail-closed source gate diagnostics for Atlas's existing BTC/INR virtual
// research runner. Do not infer prices, execute orders, or weaken
// scheduled_paper_engine.mjs sourceEligible().
const HOUR=3600000;
const TWO_HOURS=2*HOUR;
const MAX_QUOTE_AGE=90000;
const MAX_BAR_AGE=90*60000; // Delayed public-candle research only, no broker execution
const supported=new Set(['BTCINR','ETHINR','SOLINR','XRPINR','DOGEINR']);
const iso=v=>Number.isFinite(v)&&v>0?new Date(v).toISOString():null;

export function diagnosePaperSource({symbol='BTCINR',history,feed,bars,quote,now}={}){
 const at=Number(now),checkedAt=iso(at);
 const make=(code,latestBarClosedAt=null,providerQuoteAt=null)=>({
  schema:1,status:code==='ELIGIBLE'?'PASS':'BLOCKED',code,
  checkedAt,latestBarClosedAt,providerQuoteAt,
  // These are observations, not permissions to execute a market order.
  candleAgeMinutes:latestBarClosedAt===null?null:Math.floor((at-Date.parse(latestBarClosedAt))/60000),
  latencyClass:code==='ELIGIBLE'&&latestBarClosedAt!==null&&at-Date.parse(latestBarClosedAt)>45*60000
    ?'DELAYED_PAPER_ONLY':'RECENT_OR_UNVERIFIED',
  liveOrdersEnabled:false,paperOrdersExecuted:false,
 });
 if(!Number.isFinite(at)||at<=0||!supported.has(symbol))
  return make('INVALID_REQUEST');
 if(history?.source!=='CoinDCX public INR spot candles'||history.symbol!==symbol
  ||history.currency!=='INR'||history.realOrdersEnabled!==false
  ||history.paperExecutionEnabled!==false||feed?.currency!=='INR'
  ||feed?.realOrdersEnabled!==false||!Array.isArray(history.candles))
  return make('SOURCE_CONTRACT_INVALID');
 if(!Array.isArray(bars)||bars.length<55)return make('INSUFFICIENT_CLOSED_BARS');
 const last=bars.at(-1);
 if(!last||!Number.isSafeInteger(last.time)||last.time<=0)
  return make('INVALID_BAR_TIMESTAMP');
 const lastClosed=last.time+TWO_HOURS,closedIso=iso(lastClosed);
 if(!Number.isSafeInteger(lastClosed)||!closedIso
  ||lastClosed>at)return make('FUTURE_OR_INVALID_BAR',closedIso);
 const recent=bars.slice(-55);
 for(let i=1;i<recent.length;i++){
  if(!Number.isSafeInteger(recent[i].time)
   ||recent[i].time-recent[i-1].time!==TWO_HOURS)
   return make('GAP_IN_55_COMPLETED_BARS',closedIso);
 }
 if(at-lastClosed>MAX_BAR_AGE)
  return make('CLOSED_CANDLE_TOO_OLD',closedIso);
 if(!quote||quote.symbol!==symbol||quote.currency!=='INR'
  ||!Number.isFinite(quote.price)||quote.price<=0)
  return make('QUOTE_MISSING_OR_INVALID',closedIso);
 const stamp=typeof quote.sourceAt==='string'?Date.parse(quote.sourceAt):NaN;
 const qiso=iso(stamp);
 if(!qiso)return make('QUOTE_TIMESTAMP_INVALID',closedIso);
 if(stamp>at+5000)return make('QUOTE_FROM_FUTURE',closedIso,qiso);
 if(stamp<lastClosed)return make('QUOTE_BEFORE_BAR_CLOSE',closedIso,qiso);
 if(at-stamp>MAX_QUOTE_AGE)return make('QUOTE_TOO_OLD',closedIso,qiso);
 return make('ELIGIBLE',closedIso,qiso);
}
export function unavailablePaperSource(now,code='SOURCE_FETCH_FAILED'){
 if(!['SOURCE_FETCH_FAILED','CANDLE_AGGREGATION_FAILED',
  'SIMULATION_VALIDATION_FAILED'].includes(code))throw Error('Unknown source failure');
 return {schema:1,status:'BLOCKED',code,checkedAt:iso(now),
  latestBarClosedAt:null,providerQuoteAt:null,
  liveOrdersEnabled:false,paperOrdersExecuted:false};
}
