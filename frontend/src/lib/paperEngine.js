// Forward virtual-paper ledger — browser-owned, never a broker order.
// Data is a genuine provider quote, but fills are deliberately HYPOTHETICAL.
import {STRATEGIES,decision,validateResearchBars,MODELED_CAPITAL_INR} from '../../lib/research-engine.js';
const BAR_MS=60000;
const FEE_RATE=0.001,SLIPPAGE=0.0005;
const MAX_GAP_MS=3*BAR_MS;
const MAX_LOSS_RATIO=0.05;
const round=v=>Number(v.toFixed(2));
export const PAPER_STORE_KEY='atlas.virtual.paper.v1';

export function createPaperGroup(symbol='BTCINR',now=Date.now()){
 if(!['BTCINR','ETHINR','SOLINR','XRPINR','DOGEINR'].includes(symbol))
   throw RangeError('unknown public INR market');
 if(!Number.isFinite(now)||now<=0)throw RangeError('invalid start');
 return {schema:1,mode:'LOCAL_FORWARD_PAPER_TRIAL',symbol,currency:'INR',
  createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),
  capitalPerStrategyINR:MODELED_CAPITAL_INR,realOrdersEnabled:false,
  sessions:STRATEGIES.map(s=>({
    strategyId:s.id,status:'running',startedAt:now,lastProcessedClose:now,
    cash:MODELED_CAPITAL_INR,quantity:0,feesINR:0,equityINR:MODELED_CAPITAL_INR,
    lastQuoteAt:null,entryValueINR:0,events:[],pausedReason:null,
  }))};
}
export function pausePaperGroup(group,reason='user_paused',now=Date.now()){
 return {...group,updatedAt:new Date(now).toISOString(),
   sessions:group.sessions.map(s=>s.status==='running'?{...s,status:'paused',pausedReason:reason}:s)};
}
export function resumePaperGroup(group,now=Date.now()){
 return {...group,updatedAt:new Date(now).toISOString(),
   sessions:group.sessions.map(s=>({...s,status:'running',pausedReason:null,
      lastProcessedClose:now,startedAt:Math.max(now,s.startedAt)}))};
}
export function advancePaperGroup(group,bars,quote,now=Date.now()){
 if(!group||group.schema!==1||group.mode!=='LOCAL_FORWARD_PAPER_TRIAL'
   ||group.realOrdersEnabled!==false)throw Error('bad group contract');
 validateResearchBars(bars,BAR_MS);
 if(!Array.isArray(group.sessions)||!STRATEGIES.every(s=>group.sessions.some(x=>x.strategyId===s.id)))
   throw Error('missing strategy sessions');
 if(!quote||quote.symbol!==group.symbol||quote.currency!=='INR'
   ||!Number.isFinite(quote.price)||quote.price<=0
   ||typeof quote.sourceAt!=='string'||!Number.isFinite(Date.parse(quote.sourceAt)))
   return group;
 const qt=Date.parse(quote.sourceAt);
 if(qt>now+5000||qt<now-90000)return group;
 if(!bars.length||bars.length<55)return group;
 const latest=bars.at(-1);
 const closedAt=latest.time+BAR_MS;
 // Quote must be observed AFTER latest strategy-signal close, not earlier.
 const hasEligiblePrice=qt>=closedAt;
 return {...group,updatedAt:new Date(now).toISOString(),sessions:group.sessions.map(session=>{
   if(session.status!=='running')return session;
   const value=session.cash+session.quantity*quote.price;
   const current={...session,equityINR:round(value),lastQuoteAt:quote.sourceAt};
   if(value<MODELED_CAPITAL_INR*(1-MAX_LOSS_RATIO)){
     return {...current,status:'paused',pausedReason:'virtual_5pct_drawdown_halt'};
   }
   if(closedAt<=session.lastProcessedClose||!hasEligiblePrice)return current;
   if(closedAt-session.lastProcessedClose>MAX_GAP_MS){
     return {...current,status:'paused',pausedReason:'unobserved_candle_gap'};
   }
   if(closedAt-session.startedAt>BAR_MS&&session.events.length===0
      &&session.lastProcessedClose===session.startedAt&&closedAt-session.startedAt>MAX_GAP_MS){
     return {...current,status:'paused',pausedReason:'unobserved_candle_gap'};
   }
   const next={...current,lastProcessedClose:closedAt};
   const action=decision(session.strategyId,bars,bars.length-1);
   if(action==='BUY'&&session.quantity===0){
     const fill=quote.price*(1+SLIPPAGE);
     const qty=session.cash/(fill*(1+FEE_RATE));
     if(qty<=0||!Number.isFinite(qty))return next;
     const fee=qty*fill*FEE_RATE;
     const cost=qty*fill+fee;
     return {...next,cash:Math.max(0,session.cash-cost),quantity:qty,
       feesINR:round(session.feesINR+fee),entryValueINR:cost,
       equityINR:round(session.cash-cost+qty*quote.price),
       events:[...session.events,{side:'BUY',observedAt:quote.sourceAt,
         sourceBarCloseAt:new Date(closedAt).toISOString(),priceINR:round(fill),
         feeINR:round(fee),quantity:Number(qty.toFixed(8)),realizedPnlINR:null,
         executionType:'VIRTUAL_SOURCE_SNAPSHOT'}].slice(-120)};
   }
   if(action==='SELL'&&session.quantity>0){
     const fill=quote.price*(1-SLIPPAGE);
     const fee=session.quantity*fill*FEE_RATE;
     const proceeds=session.quantity*fill-fee;
     const pnl=proceeds-session.entryValueINR;
     return {...next,cash:session.cash+proceeds,quantity:0,
       feesINR:round(session.feesINR+fee),entryValueINR:0,
       equityINR:round(session.cash+proceeds),
       events:[...session.events,{side:'SELL',observedAt:quote.sourceAt,
         sourceBarCloseAt:new Date(closedAt).toISOString(),priceINR:round(fill),
         feeINR:round(fee),quantity:Number(session.quantity.toFixed(8)),
         realizedPnlINR:round(pnl),executionType:'VIRTUAL_SOURCE_SNAPSHOT'}].slice(-120)};
   }
   return next;
 })};
}
export function summarizePaperGroup(group){
 if(!group)return [];
 return group.sessions.map(s=>({
  strategyId:s.strategyId,status:s.status,capitalINR:MODELED_CAPITAL_INR,
  virtualEquityINR:s.equityINR,modeledPnlINR:round(s.equityINR-MODELED_CAPITAL_INR),
  events:s.events.length,openPosition:s.quantity>0,
  lastQuoteAt:s.lastQuoteAt,pausedReason:s.pausedReason,
 }));
}
