// Atlas isolated virtual order-state contract. NOT wired to market/broker.
// Fill observations must be explicitly supplied and source-gated. This module
// neither submits real orders nor invents prices, slippage, execution or P/L.
const statuses=new Set(['CREATED','PENDING','PARTIALLY_FILLED',
 'FILLED','CANCELLED','REJECTED','EXPIRED']);
const terminals=new Set(['FILLED','CANCELLED','REJECTED','EXPIRED']);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const parsed=s=>typeof s==='string'?Date.parse(s):NaN;
const validTime=s=>Number.isFinite(parsed(s))&&parsed(s)>0;
const positive=n=>finite(n)&&n>0;
const maxSize=1e6,maxBudget=1e9;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function validateCommon(o){
 if(!o||o.schema!==1||o.mode!=='VIRTUAL_ORDER_INTENT_ONLY'
  ||o.realOrdersEnabled!==false||o.actualCapitalINR!==0
  ||!statuses.has(o.status)||!Array.isArray(o.fills)
  ||o.fills.length>120||!positive(o.requestedQty)
  ||!finite(o.filledQty)||o.filledQty<0||o.filledQty>o.requestedQty+1e-9
  ||!finite(o.modeledFeesINR)||o.modeledFeesINR<0
  ||!finite(o.modeledNotionalINR)||o.modeledNotionalINR<0
  ||!validTime(o.submittedAt)||!validTime(o.signalBarClosedAt)
  ||parsed(o.submittedAt)<parsed(o.signalBarClosedAt))
   throw Error('Unsafe virtual order state');
}
export function createVirtualOrder({id,strategyId,symbol='BTCINR',side,
 requestedQty,virtualCashLimitINR=0,virtualOwnedQty=0,
 signalBarClosedAt,submittedAt}={}){
 if(typeof id!=='string'||!/^[-A-Za-z0-9_:.]{6,128}$/.test(id)
  ||typeof strategyId!=='string'||!/^[a-z][a-z0-9_]{2,63}$/.test(strategyId)
  ||!['BTCINR','ETHINR','SOLINR','XRPINR','DOGEINR'].includes(symbol)
  ||!['BUY','SELL'].includes(side)
  ||!positive(requestedQty)||requestedQty>maxSize
  ||!finite(virtualCashLimitINR)||virtualCashLimitINR<0||virtualCashLimitINR>maxBudget
  ||!finite(virtualOwnedQty)||virtualOwnedQty<0||virtualOwnedQty>maxSize
  ||(side==='BUY'&&virtualCashLimitINR<=0)
  ||(side==='SELL'&&virtualOwnedQty+1e-9<requestedQty)
  ||!validTime(signalBarClosedAt)||!validTime(submittedAt)
  ||parsed(submittedAt)<parsed(signalBarClosedAt))
   throw Error('Invalid virtual-only order input');
 return Object.freeze({schema:1,mode:'VIRTUAL_ORDER_INTENT_ONLY',
  realOrdersEnabled:false,actualCapitalINR:0,id,strategyId,symbol,side,
  status:'CREATED',requestedQty,virtualCashLimitINR,virtualOwnedQty,
  signalBarClosedAt,submittedAt,filledQty:0,modeledNotionalINR:0,
  modeledFeesINR:0,unfilledQty:requestedQty,fills:[],audit:[]});
}
export function applyVirtualOrder(order,event,now){
 validateCommon(order);
 if(!event||typeof event!=='object'||!finite(now)||now<=0
  ||!['SUBMIT','FILL','CANCEL','REJECT','EXPIRE'].includes(event.action)
  ||!validTime(event.at)||parsed(event.at)>now+5000
  ||parsed(event.at)<parsed(order.submittedAt))
  throw Error('Invalid virtual lifecycle event');
 if(event.action==='FILL'){
  const fill={fillId:event.fillId,at:event.at,sourceAt:event.sourceAt,
   barClosedAt:event.barClosedAt,modeledPriceINR:event.modeledPriceINR,
   quantity:event.quantity,feeINR:event.feeINR,
   mode:'MODELED_FILL_NOT_BROKER_EXECUTION'};
  if(typeof fill.fillId!=='string'||!/^[-A-Za-z0-9_:.]{6,128}$/.test(fill.fillId)
   ||!positive(fill.quantity)||!positive(fill.modeledPriceINR)
   ||!finite(fill.feeINR)||fill.feeINR<0||!validTime(fill.sourceAt)
   ||!validTime(fill.barClosedAt)||parsed(fill.sourceAt)<parsed(fill.barClosedAt)
   ||parsed(fill.sourceAt)>now+5000||now-parsed(fill.sourceAt)>90000
   ||parsed(fill.barClosedAt)<parsed(order.signalBarClosedAt)
   ||now-parsed(fill.barClosedAt)>45*60000
   ||parsed(fill.at)<parsed(fill.sourceAt)
   ||parsed(fill.at)>now+5000)
   throw Error('Unverified or invalid modeled fill evidence');
  const prior=order.fills.find(x=>x.fillId===fill.fillId);
  if(prior){
   if(!same(prior,fill))throw Error('Reused fill ID with altered evidence');
   return order; // exact replay is idempotent, including terminal order.
  }
  if(!['PENDING','PARTIALLY_FILLED'].includes(order.status))
   throw Error('Order cannot receive modeled fills in this state');
  if(order.fills.length>=120||fill.quantity>order.unfilledQty+1e-9)
   throw Error('Modeled quantity exceeds outstanding order');
  const notional=fill.quantity*fill.modeledPriceINR;
  if(!finite(notional)||notional>maxBudget)return never('modeled exposure limit');
  const totalNotional=order.modeledNotionalINR+notional;
  const totalFees=order.modeledFeesINR+fill.feeINR;
  if(order.side==='BUY'&&totalNotional+totalFees>order.virtualCashLimitINR+1e-6)
   throw Error('Insufficient virtual cash after modeled costs');
  if(order.side==='SELL'&&order.filledQty+fill.quantity>order.virtualOwnedQty+1e-9)
   throw Error('Modeled sale exceeds owned virtual quantity');
  const filled=Math.min(order.requestedQty,order.filledQty+fill.quantity);
  return {...order,status:filled>=order.requestedQty-1e-9?'FILLED':'PARTIALLY_FILLED',
   filledQty:filled,unfilledQty:Math.max(0,order.requestedQty-filled),
   modeledNotionalINR:totalNotional,modeledFeesINR:totalFees,
   fills:[...order.fills,fill],audit:[...order.audit,{type:'MODEL_FILL',at:event.at,
     fillId:fill.fillId}].slice(-120)};
 }
 if(terminals.has(order.status))throw Error('Virtual order is terminal');
 const next=event.action==='SUBMIT'?'PENDING':
  event.action==='CANCEL'?'CANCELLED':
  event.action==='REJECT'?'REJECTED':'EXPIRED';
 if(event.action==='SUBMIT'&&order.status!=='CREATED')
  throw Error('Virtual order already submitted');
 if(event.action==='REJECT'&&order.filledQty>0)
  throw Error('Cannot reject an already partially modeled order');
 if(event.action!=='SUBMIT'&&order.status==='CREATED'&&event.action==='CANCEL')
  throw Error('Unsubmitted virtual order cannot be cancelled');
 return {...order,status:next,audit:[...order.audit,
  {type:event.action,at:event.at}].slice(-120)};
}
function never(message){throw Error(message);}
