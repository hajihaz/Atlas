// Explicit, offline synthetic settlement candidate: NOT connected to the
// scheduled runner, market provider, broker, or any real-money order route.
// Every candidate must pass the existing persisted ledger replay guard.
import {assertNextCloudSnapshot} from './paper_ledger_guard.mjs';
const T=7200000,MAX_QUOTE_AGE=90000,MAX_BAR_AGE=45*60000;
const round=n=>Number(n.toFixed(2));
const valid=n=>typeof n==='number'&&Number.isFinite(n);
const ms=s=>typeof s==='string'?Date.parse(s):NaN;
function fail(message){throw Error('Virtual settlement blocked: '+message);}
export function buildVirtualSettlementCandidate(before,order,quote,now){
 if(!before||before.schema!==1||before.mode!=='SCHEDULED_VIRTUAL_PAPER'
  ||before.realOrdersEnabled!==false||before.actualCapitalINR!==0
  ||before.symbol!=='BTCINR'||!Array.isArray(before.sessions)
  ||before.sessions.length!==5||!['RUNNING','DEGRADED'].includes(before.status)
  ||!valid(now)||now<=0)fail('invalid paper-only ledger or clock');
 if(!order||order.schema!==1||order.mode!=='VIRTUAL_ORDER_INTENT_ONLY'
  ||order.realOrdersEnabled!==false||order.actualCapitalINR!==0
  ||order.status!=='FILLED'||!['BUY','SELL'].includes(order.side)
  ||order.symbol!==before.symbol||!Array.isArray(order.fills)
  ||order.fills.length!==1||!valid(order.requestedQty)
  ||!valid(order.filledQty)||order.filledQty<=0
  ||Math.abs(order.requestedQty-order.filledQty)>1e-9)
  fail('only one fully source-verified hypothetical fill is supported');
 const fill=order.fills[0],oldAt=ms(before.lastRunAt),
  oldClose=ms(before.lastBarClosedAt),newClose=ms(fill?.barClosedAt),
  sourceAt=ms(fill?.sourceAt),fillAt=ms(fill?.at);
 if(!Number.isFinite(oldAt)||!Number.isFinite(oldClose)
  ||!Number.isFinite(newClose)||!Number.isFinite(sourceAt)
  ||!Number.isFinite(fillAt)||!Number.isFinite(ms(order.submittedAt))
  ||newClose-oldClose!==T||order.signalBarClosedAt!==fill.barClosedAt
  ||ms(order.submittedAt)<newClose||fillAt<sourceAt
  ||sourceAt<newClose||sourceAt<oldAt||now<oldAt
  ||sourceAt>now+5000||fillAt>now+5000
  ||now-sourceAt>MAX_QUOTE_AGE||now-newClose>MAX_BAR_AGE)
  fail('source observation or next eligible candle invalid');
 if(!quote||quote.symbol!==before.symbol||quote.currency!=='INR'
  ||quote.status!=='recent_provider_snapshot'
  ||quote.sourceAt!==fill.sourceAt||!valid(quote.price)||quote.price<=0
  ||!valid(fill.modeledPriceINR)||fill.modeledPriceINR<=0
  ||!valid(fill.quantity)||fill.quantity<=0
  ||!valid(fill.feeINR)||fill.feeINR<0
  ||fill.mode!=='MODELED_FILL_NOT_BROKER_EXECUTION'
  ||Math.abs(fill.quantity-order.filledQty)>1e-9
  ||!valid(order.modeledNotionalINR)||!valid(order.modeledFeesINR)
  ||Math.abs(fill.quantity*fill.modeledPriceINR-order.modeledNotionalINR)>0.01
  ||Math.abs(fill.feeINR-order.modeledFeesINR)>0.01
  ||Math.abs(fill.modeledPriceINR/quote.price-1)>0.05)
  fail('quote and recorded modeled fill disagree');
 const session=before.sessions.find(s=>s.strategyId===order.strategyId);
 if(!session||session.status!=='RUNNING'||!valid(session.cashINR)
  ||!valid(session.quantity)||!valid(session.costINR)
  ||!valid(session.feesINR)||!valid(session.realizedPnlINR)
  ||!valid(session.highestEquityINR)||!valid(session.maxDrawdownPct)
  ||!Array.isArray(session.events)||!Array.isArray(session.equityHistory))
  fail('virtual strategy account not eligible');
 if(session.events.some(e=>e.barClosedAt===fill.barClosedAt))
  fail('this strategy already has a modeled fill for this candle');
 const notional=fill.quantity*fill.modeledPriceINR,fee=fill.feeINR;
 let cash,quantity,costINR,profit=null,closedTrades=session.closedTrades,wins=session.wins;
 if(order.side==='BUY'){
  const spent=notional+fee;
  if(session.quantity!==0||session.costINR!==0
   ||spent>session.cashINR+0.000001
   ||spent>order.virtualCashLimitINR+0.000001)
   fail('modeled purchase exceeds available cash or existing position');
  cash=Math.max(0,session.cashINR-spent);
  quantity=fill.quantity;
  costINR=spent;
 }else{
  if(session.quantity<=0||Math.abs(session.quantity-fill.quantity)>1e-8
    ||fill.quantity>order.virtualOwnedQty+1e-8
    ||session.costINR<0)
    fail('virtual sale exceeds or mismatches owned position');
  const net=notional-fee;
  if(net<0)fail('modeled selling costs exceed proceeds');
  cash=session.cashINR+net;
  quantity=0;costINR=0;profit=net-session.costINR;
  closedTrades+=1;wins+=(profit>0?1:0);
 }
 const equity=round(cash+quantity*quote.price);
 if(!valid(equity)||equity<0||!valid(cash)||cash<0)
  fail('nonfinite virtual balance or equity');
 const highest=Math.max(session.highestEquityINR,equity);
 const drawdown=highest>0?(highest-equity)/highest*100:0;
 const halt=equity<before.virtualCapitalPerStrategyINR*0.95;
 const event={side:order.side,quoteAt:fill.sourceAt,
  barClosedAt:fill.barClosedAt,modeledPriceINR:round(fill.modeledPriceINR),
  quantity:fill.quantity,feeINR:round(fee),
  realizedPnlINR:profit===null?null:round(profit),
  mode:'HYPOTHETICAL_AFTER_OBSERVED_SIGNAL',fillId:fill.fillId};
 const updated={...session,cashINR:cash,quantity,costINR,
  virtualEquityINR:equity,feesINR:round(session.feesINR+fee),
  highestEquityINR:highest,maxDrawdownPct:round(Math.max(drawdown,session.maxDrawdownPct)),
  status:halt?'HALTED':'RUNNING',pausedReason:halt?'virtual_5pct_loss_halt':null,
  realizedPnlINR:profit===null?session.realizedPnlINR:round(session.realizedPnlINR+profit),
  closedTrades,wins,lastFillAt:fill.sourceAt,
  events:[...session.events,event].slice(-120),
  equityHistory:[...session.equityHistory,{at:new Date(now).toISOString(),equityINR:equity}].slice(-120)};
 const after={...before,runCount:before.runCount+1,
  status:'RUNNING',alert:null,lastRunAt:new Date(now).toISOString(),
  lastProviderAt:quote.sourceAt,lastBarClosedAt:fill.barClosedAt,
  sessions:before.sessions.map(s=>s.strategyId===updated.strategyId?updated:s)};
 assertNextCloudSnapshot(before,after,now);
 return {schema:1,mode:'OFFLINE_HYPOTHETICAL_ACCOUNTING_CANDIDATE',
  realOrdersEnabled:false,actualCapitalINR:0,
  candidate:after,modeledOrderEvent:event,
  warning:'Test-only source-stamped settlement proposal; nothing was saved, traded, or sent to a broker.'};
}
