/** Pure independent virtual accounts for Atlas paper research. No broker transport. */
import {SEVEN_STRATEGIES} from './seven-strategy-replay.js';
const IDS=new Set(SEVEN_STRATEGIES.map(x=>x.id));
const fail=reason=>{throw Error('SEVEN_LEDGER_BLOCKED: '+reason);};
const clone=x=>structuredClone(x);
const time=x=>typeof x==='string'?Date.parse(x):NaN;
const price=x=>Number.isFinite(x)&&x>=0.01&&x<10000000?Math.round(x*100):fail('invalid price');
export function createSevenAccount(strategyId,startedAt){
 if(!IDS.has(strategyId)||!Number.isSafeInteger(startedAt)||startedAt<=0)fail('account identity');
 return {schema:'atlas.seven-paper-account.v1',strategyId,startedAt,revision:0,
  initialCapitalPaise:10000000,cashPaise:10000000,realizedPaise:0,feesPaise:0,
  positions:{},pending:{},seenSignals:{},fills:[],paperOnly:true,realOrdersEnabled:false};
}
export function assertSevenAccount(state){
 if(state?.schema!=='atlas.seven-paper-account.v1'||!IDS.has(state.strategyId)||
   state.paperOnly!==true||state.realOrdersEnabled!==false||state.initialCapitalPaise!==10000000||
   !Number.isSafeInteger(state.revision)||state.revision<0||!Number.isSafeInteger(state.cashPaise)||state.cashPaise<0||
   !Number.isSafeInteger(state.realizedPaise)||!Number.isSafeInteger(state.feesPaise)||state.feesPaise<0||
   !state.positions||!state.pending||!state.seenSignals||!Array.isArray(state.fills))fail('account state');
 for(const [symbol,p] of Object.entries(state.positions)){
  if(!/^[A-Z][A-Z0-9]{0,19}$/.test(symbol)||!Number.isSafeInteger(p.qty)||p.qty<=0||
    !Number.isSafeInteger(p.entryCostPaise)||p.entryCostPaise<=0)fail('position state');
 }
 return state;
}
/** A signal only creates a pending paper intent; it cannot fill from its own quote. */
export function submitSevenSignal(previous,input,now){
 assertSevenAccount(previous);
 if(!Number.isSafeInteger(now)||!input||input.strategyId!==previous.strategyId||
   input.realOrdersEnabled!==false||typeof input.id!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(input.id)||
   typeof input.symbol!=='string'||!/^[A-Z][A-Z0-9]{0,19}$/.test(input.symbol)||
   !/^NSE_EQ\|INE[A-Z0-9]{9}$/.test(input.instrumentKey)||
   !['BUY','SELL'].includes(input.side)||!Number.isFinite(time(input.signalAt)))fail('signal identity');
 const cadence=SEVEN_STRATEGIES.find(x=>x.id===previous.strategyId)?.cadence;
 const at=time(input.signalAt),maxAge=cadence==='SWING'||cadence==='MONTHLY'?3600000:120000;
 if(at<previous.startedAt||at>now||now-at>maxAge)fail('signal time');
 if(previous.seenSignals[input.id])return {state:previous,status:'DUPLICATE_SIGNAL'};
 const state=clone(previous),held=state.positions[input.symbol];
 if(input.side==='BUY'&&held||input.side==='SELL'&&!held)return {state,status:'NO_ACTION'};
 if(state.pending[input.symbol])return {state,status:'PENDING_EXISTS'};
 state.pending[input.symbol]={id:input.id,side:input.side,symbol:input.symbol,
  instrumentKey:input.instrumentKey,signalAt:at,createdAt:now,expiresAt:now+90000,
  reason:typeof input.reason==='string'&&/^[A-Z_]{3,30}$/.test(input.reason)?input.reason:'STRATEGY_SIGNAL'};
 state.seenSignals[input.id]=now;
 for(const [id,seenAt] of Object.entries(state.seenSignals))if(now-seenAt>7200000)delete state.seenSignals[id];
 state.revision++;
 return {state,status:'PENDING'};
}
/** Only a later, fresh observed trade with usable book depth can settle. */
export function settleSevenPending(previous,symbol,quote,now){
 assertSevenAccount(previous);
 const pending=previous.pending[symbol];
 if(!pending)return {state:previous,status:'NO_PENDING'};
 if(!Number.isSafeInteger(now)||now>pending.expiresAt){
  const state=clone(previous);delete state.pending[symbol];state.revision++;
  return {state,status:'EXPIRED'};
 }
 const traded=time(quote?.lastTradeAt),observed=time(quote?.observedAt);
 if(quote?.source!=='Upstox Analytics'||quote.instrumentKey!==pending.instrumentKey||
   !Number.isFinite(traded)||!Number.isFinite(observed)||traded<=pending.signalAt||
   traded<=pending.createdAt||observed>now+1000||traded>now+1000||
   now-traded>10000||now-observed>10000)return {state:previous,status:'WAIT_FRESH_QUOTE'};
 const book=pending.side==='BUY'?quote.ask:quote.bid;
 if(!book||!Number.isFinite(book.price)||book.price<=0||
   !Number.isSafeInteger(book.quantity)||book.quantity<1)return {state:previous,status:'WAIT_BOOK'};
 const base=price(book.price),fillPrice=pending.side==='BUY'?
  Math.ceil(base*10005/10000):Math.floor(base*9995/10000);
 const state=clone(previous),position=state.positions[symbol];
 let qty,fee,pnl=0;
 if(pending.side==='BUY'){
  if(position)return {state:previous,status:'ALREADY_HELD'};
  qty=Math.min(Math.floor(book.quantity/4),Math.floor(Math.min(1000000,state.cashPaise)/(fillPrice*1.001)));
  if(qty<1)return {state:previous,status:'NO_BUYING_POWER'};
  fee=Math.ceil(qty*fillPrice*10/10000);
  const cost=qty*fillPrice+fee;if(cost>state.cashPaise)fail('cash invariant');
  state.cashPaise-=cost;state.positions[symbol]={qty,entryCostPaise:cost,entryPricePaise:fillPrice};
 }else{
  if(!position)return {state:previous,status:'NO_POSITION'};
  qty=position.qty;if(Math.floor(book.quantity/4)<qty)return {state:previous,status:'WAIT_BOOK'};
  fee=Math.ceil(qty*fillPrice*10/10000);
  const proceeds=qty*fillPrice-fee;
  pnl=proceeds-position.entryCostPaise;
  state.cashPaise+=proceeds;state.realizedPaise+=pnl;delete state.positions[symbol];
 }
 state.feesPaise+=fee;
 state.fills.push({id:pending.id,strategyId:state.strategyId,symbol,side:pending.side,qty,
  pricePaise:fillPrice,feePaise:fee,pnlPaise:pnl,signalAt:pending.signalAt,
  tradeAt:traded,mode:'HYPOTHETICAL_NEXT_OBSERVED_TRADE',reason:pending.reason});
 if(state.fills.length>1000)state.fills.shift();
 delete state.pending[symbol];state.revision++;
 assertSevenAccount(state);
 return {state,status:'PAPER_FILLED'};
}
