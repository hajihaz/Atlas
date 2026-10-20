// Atlas scheduled two-hour forward virtual paper research.
// No broker credentials, authenticated APIs, order routes, or real holdings.
// Missed scheduled checkpoints are SKIPPED rather than retroactively "filled".
import {STRATEGIES,decision,validateResearchBars,MODELED_CAPITAL_INR}
  from '../frontend/lib/research-engine.js';
const ONE_HOUR=3600000,TWO_HOUR=7200000;
const FEE=0.001,SLIPPAGE=0.0005,MAX_VIRTUAL_LOSS=0.05;
// Delayed public candles: virtual research only; fill at a fresh public quote.
const NOW_STALE_MS=90000,MAX_AGE_BAR_MS=90*60000;
const SYMBOLS=['BTCINR','ETHINR','SOLINR','XRPINR','DOGEINR'];
const money=v=>Number(v.toFixed(2));
export const MODE='SCHEDULED_VIRTUAL_PAPER';
export const CHECKPOINT_MS=TWO_HOUR;

export function composeTwoHourCandles(hourly,now){
  validateResearchBars(hourly,ONE_HOUR);
  const groups=new Map();
  for(const c of hourly){
    const bucket=Math.floor(c.time/TWO_HOUR)*TWO_HOUR;
    const list=groups.get(bucket)??[];
    list.push(c);groups.set(bucket,list);
  }
  const complete=[];
  for(const [bucket,list] of groups){
    const b=list.sort((a,z)=>a.time-z.time);
    if(b.length!==2||b[0].time!==bucket||b[1].time!==bucket+ONE_HOUR
      ||bucket+TWO_HOUR>now)continue;
    complete.push({time:bucket,open:b[0].open,high:Math.max(b[0].high,b[1].high),
      low:Math.min(b[0].low,b[1].low),close:b[1].close,volume:b[0].volume+b[1].volume});
  }
  complete.sort((a,b)=>a.time-b.time);
  validateResearchBars(complete,TWO_HOUR);
  return complete;
}
export function sourceEligible(bars,quote,now,symbol){
  if(!SYMBOLS.includes(symbol)||!Array.isArray(bars)||bars.length<55)return false;
  if(!quote||quote.symbol!==symbol||quote.currency!=='INR'
    ||!Number.isFinite(quote.price)||quote.price<=0
    ||typeof quote.sourceAt!=='string')return false;
  const at=Date.parse(quote.sourceAt);
  const latestClose=bars.at(-1).time+TWO_HOUR;
  if(!Number.isFinite(at)||at<latestClose||at>now+5000||now-at>NOW_STALE_MS
      ||now-latestClose>MAX_AGE_BAR_MS)return false;
  // Require 55 consecutively completed 2-hour bars before enabling signals.
  const tail=bars.slice(-55);
  for(let i=1;i<tail.length;i++)if(tail[i].time-tail[i-1].time!==TWO_HOUR)return false;
  return true;
}
export function freshState(symbol,latestClose,now,quote){
  if(!SYMBOLS.includes(symbol)||!Number.isSafeInteger(latestClose))throw Error('invalid initialization');
  return {schema:1,mode:MODE,currency:'INR',symbol,interval:'2h',
    source:'CoinDCX public completed spot candles + timestamped public ticker',
    execution:'SCHEDULED_MODEL_ONLY',actualCapitalINR:0,
    virtualCapitalPerStrategyINR:MODELED_CAPITAL_INR,realOrdersEnabled:false,
    createdAt:new Date(now).toISOString(),lastRunAt:new Date(now).toISOString(),
    lastProviderAt:quote.sourceAt,lastBarClosedAt:new Date(latestClose).toISOString(),
    scheduledEveryMinutes:120,runCount:1,skippedIntervals:0,
    lastCandleAgeMinutes:Math.floor((now-latestClose)/60000),
    latencyPolicy:'DELAYED_PUBLIC_CANDLE_MODEL_ONLY_MAX_90_MIN',
    status:'RUNNING',alert:null,firstRunHasNoBackfilledTrades:true,
    sessions:STRATEGIES.map(s=>({strategyId:s.id,strategyName:s.name,
      cashINR:MODELED_CAPITAL_INR,quantity:0,costINR:0,virtualEquityINR:MODELED_CAPITAL_INR,
      feesINR:0,highestEquityINR:MODELED_CAPITAL_INR,maxDrawdownPct:0,
      status:'RUNNING',lastSignal:'NONE',pausedReason:null,closedTrades:0,wins:0,
      realizedPnlINR:0,events:[],lastFillAt:null,
      equityHistory:[{at:new Date(now).toISOString(),equityINR:MODELED_CAPITAL_INR}]}))};
}
function markSession(session,price){
 const equity=money(session.cashINR+session.quantity*price);
 if(!Number.isFinite(equity)||equity<0)throw Error('invalid portfolio valuation');
 const peak=Math.max(session.highestEquityINR,equity);
 const drawdown=peak>0?((peak-equity)/peak)*100:0;
 const s={...session,virtualEquityINR:equity,highestEquityINR:peak,
   maxDrawdownPct:money(Math.max(session.maxDrawdownPct,drawdown))};
 if(equity<MODELED_CAPITAL_INR*(1-MAX_VIRTUAL_LOSS))
   return {...s,status:'HALTED',pausedReason:'virtual_5pct_loss_halt'};
 return s;
}
export function advanceCloud(state,bars,quote,now){
 if(!sourceEligible(bars,quote,now,state?.symbol??quote?.symbol))throw Error('invalid fresh market observation');
 const closeAt=bars.at(-1).time+TWO_HOUR;
 if(!state)return freshState(quote.symbol,closeAt,now,quote);
 if(state.schema!==1||state.mode!==MODE||state.realOrdersEnabled!==false
   ||state.symbol!==quote.symbol||!Array.isArray(state.sessions)
   ||state.sessions.length!==STRATEGIES.length)throw Error('state schema mismatch');
 const old=Date.parse(state.lastBarClosedAt);
 if(!Number.isFinite(old)||old>closeAt)throw Error('clock regression');
 const gap=closeAt-old;
 const skip=gap>TWO_HOUR;
 const canFill=gap===TWO_HOUR;
 const next={...state,runCount:state.runCount+1,lastRunAt:new Date(now).toISOString(),
   lastProviderAt:quote.sourceAt,lastBarClosedAt:new Date(closeAt).toISOString(),
   status:skip?'GAP_SKIPPED':'RUNNING',alert:skip?'Missing scheduled candle snapshots; no backfilled fills.':null,
   skippedIntervals:state.skippedIntervals+(skip?Math.max(1,Math.floor(gap/TWO_HOUR)-1):0),
   lastCandleAgeMinutes:Math.floor((now-closeAt)/60000),
   latencyPolicy:'DELAYED_PUBLIC_CANDLE_MODEL_ONLY_MAX_90_MIN'};
 next.sessions=state.sessions.map(session=>{
   if(session.status==='HALTED')return session;
   let s=markSession(session,quote.price);
   if(s.status==='HALTED'||!canFill)return s;
   const signal=decision(session.strategyId,bars,bars.length-1);
   s={...s,lastSignal:signal};
   if(signal==='BUY'&&s.quantity===0){
     // Persist exactly the modeled price, quantity and fee used in the cash
     // ledger. No hidden fractional tokens or rounding-driven overdrafts.
     const modeledPrice=money(quote.price*(1+SLIPPAGE));
     if(!Number.isFinite(modeledPrice)||modeledPrice<=0)return s;
     let quantity=Math.floor((s.cashINR/(modeledPrice*(1+FEE)))*1e8)/1e8;
     if(!Number.isFinite(quantity)||quantity<=0)return s;
     let fee=money(quantity*modeledPrice*FEE);
     let spent=quantity*modeledPrice+fee;
     // An exchange-fee round-up must never produce negative virtual cash.
     if(spent>s.cashINR+1e-7){
       quantity=Number((quantity-1e-8).toFixed(8));
       if(quantity<=0)return s;
       fee=money(quantity*modeledPrice*FEE);
       spent=quantity*modeledPrice+fee;
     }
     if(!Number.isFinite(spent)||spent>s.cashINR+1e-7)return s;
     const ev={side:'BUY',quoteAt:quote.sourceAt,barClosedAt:new Date(closeAt).toISOString(),
       modeledPriceINR:modeledPrice,quantity,
       feeINR:fee,realizedPnlINR:null,mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'};
     s={...s,quantity,cashINR:Math.max(0,s.cashINR-spent),costINR:spent,
       feesINR:money(s.feesINR+fee),events:[...s.events,ev].slice(-120),
       lastFillAt:quote.sourceAt};
   }else if(signal==='SELL'&&s.quantity>0){
     const modeledPrice=money(quote.price*(1-SLIPPAGE));
     const fee=money(s.quantity*modeledPrice*FEE);
     const proceeds=s.quantity*modeledPrice-fee;
     const profit=proceeds-s.costINR;
     const ev={side:'SELL',quoteAt:quote.sourceAt,barClosedAt:new Date(closeAt).toISOString(),
       modeledPriceINR:modeledPrice,quantity:Number(s.quantity.toFixed(8)),
       feeINR:fee,realizedPnlINR:money(profit),mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'};
     s={...s,cashINR:s.cashINR+proceeds,quantity:0,costINR:0,
       feesINR:money(s.feesINR+fee),closedTrades:s.closedTrades+1,
       wins:s.wins+(profit>0?1:0),realizedPnlINR:money(s.realizedPnlINR+profit),
       events:[...s.events,ev].slice(-120),lastFillAt:quote.sourceAt};
   }
   const marked=markSession(s,quote.price);
   return {...marked,equityHistory:[...(s.equityHistory??[]),
     {at:new Date(now).toISOString(),equityINR:marked.virtualEquityINR}].slice(-120)};
 });
 return next;
}
export function failureState(current,reason,now){
 if(!current||current.mode!==MODE)return current;
 return {...current,runCount:current.runCount+1,
   lastRunAt:new Date(now).toISOString(),status:'DEGRADED',
   alert:reason,realOrdersEnabled:false};
}


/**
 * Record a real scheduled attempt without asserting a verified source or fill.
 * A subsequent valid completed candle may still initialize from scratch.
 */
export function recordUnverifiedFirstCheckpoint(seed,now,reason){
 if(!seed||seed.schema!==1||seed.mode!==MODE||seed.realOrdersEnabled!==false
   ||seed.actualCapitalINR!==0||seed.symbol!=='BTCINR'
   ||!['AWAITING_FIRST_RUN','AWAITING_VALID_SOURCE'].includes(seed.status)
   ||!Array.isArray(seed.sessions)||seed.sessions.length!==0
   ||!Number.isFinite(now)||now<=0
   ||typeof reason!=='string'||reason.length===0)
   throw Error('Unsafe first checkpoint recovery');
 const previous=seed.lastRunAt?Date.parse(seed.lastRunAt):null;
 if(previous!==null&&(!Number.isFinite(previous)||now<previous))
   throw Error('First checkpoint clock regression');
 return {...seed,status:'AWAITING_VALID_SOURCE',
   lastRunAt:new Date(now).toISOString(),
   runCount:(Number.isSafeInteger(seed.runCount)&&seed.runCount>=0?seed.runCount:0)+1,
   alert:'Scheduled runner attempted source validation but no eligible market observation was available. No virtual positions or returns created.',
   lastProviderAt:null,lastBarClosedAt:null,sessions:[],
   realOrdersEnabled:false,actualCapitalINR:0};
}
