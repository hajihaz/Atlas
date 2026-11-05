/** Pure independent virtual accounts for Atlas paper research. No broker transport. */
import {SEVEN_STRATEGIES} from './seven-strategy-replay.js';
const IDS=new Set(SEVEN_STRATEGIES.map(x=>x.id));
const fail=reason=>{throw Error('SEVEN_LEDGER_BLOCKED: '+reason);};
const clone=x=>structuredClone(x);
const time=x=>typeof x==='string'?Date.parse(x):NaN;
const price=x=>Number.isFinite(x)&&x>=0.01&&x<10000000?Math.round(x*100):fail('invalid price');
// Conservative paper pilot values. Versioned so results cannot silently mix policies.
export const SEVEN_RISK_POLICY=Object.freeze({version:'paper-risk-2026-11-05-v4',
 maxAllocationPaise:1000000,maxLossPerTradePaise:25000,dailyLossPaise:50000,
 stopBps:100,targetBps:150,entryCutoffMinute:885,exitMinute:915});
const istDay=x=>new Date(x+19800000).toISOString().slice(0,10);
const istMinute=x=>{const d=new Date(x+19800000);return d.getUTCHours()*60+d.getUTCMinutes()};
const direction=p=>p?.direction||'LONG';
const entryCount=(state,day)=>state.fills.filter(f=>(f.positionEffect==='OPEN'||!f.positionEffect&&['NIFTY_AND_OPENING_RANGE_CONFIRMED','VWAP_EMA_PULLBACK'].includes(f.reason))&&istDay(f.tradeAt)===day).length;
export function createSevenAccount(strategyId,startedAt){
 if(!IDS.has(strategyId)||!Number.isSafeInteger(startedAt)||startedAt<=0)fail('account identity');
 return {schema:'atlas.seven-paper-account.v1',strategyId,startedAt,revision:0,
  initialCapitalPaise:10000000,cashPaise:10000000,realizedPaise:0,feesPaise:0,
  positions:{},pending:{},seenSignals:{},fills:[],events:[],paperOnly:true,realOrdersEnabled:false};
}
export function assertSevenAccount(state){
 if(state?.schema!=='atlas.seven-paper-account.v1'||!IDS.has(state.strategyId)||
   state.paperOnly!==true||state.realOrdersEnabled!==false||state.initialCapitalPaise!==10000000||
   !Number.isSafeInteger(state.revision)||state.revision<0||!Number.isSafeInteger(state.cashPaise)||state.cashPaise<0||
   !Number.isSafeInteger(state.realizedPaise)||!Number.isSafeInteger(state.feesPaise)||state.feesPaise<0||
   !state.positions||!state.pending||!state.seenSignals||!Array.isArray(state.fills)||
   state.events!==undefined&&!Array.isArray(state.events))fail('account state');
 for(const [symbol,p] of Object.entries(state.positions)){
  if(!/^[A-Z][A-Z0-9]{0,19}$/.test(symbol)||!Number.isSafeInteger(p.qty)||p.qty<=0||
    !Number.isSafeInteger(p.entryCostPaise)||p.entryCostPaise<=0||
    !['LONG','SHORT'].includes(direction(p)))fail('position state');
 }
 return state;
}
/** A signal only creates a pending paper intent; it cannot fill from its own quote. */
export function submitSevenSignal(previous,input,now){
 assertSevenAccount(previous);
 if(!Number.isSafeInteger(now)||!input||input.strategyId!==previous.strategyId||
   input.realOrdersEnabled!==false||typeof input.id!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(input.id)||
   typeof input.symbol!=='string'||!/^[A-Z][A-Z0-9]{0,19}$/.test(input.symbol)||
   !/^NSE_EQ\|IN[EF][A-Z0-9]{9}$/.test(input.instrumentKey)||
   !['BUY','SELL'].includes(input.side)||!Number.isFinite(time(input.signalAt)))fail('signal identity');
 const cadence=SEVEN_STRATEGIES.find(x=>x.id===previous.strategyId)?.cadence;
 const at=time(input.signalAt),maxAge=cadence==='SWING'||cadence==='MONTHLY'?3600000:240000;
 if(at<previous.startedAt||at>now||now-at>maxAge)fail('signal time');
 if(previous.seenSignals[input.id])return {state:previous,status:'DUPLICATE_SIGNAL'};
 const state=clone(previous),held=state.positions[input.symbol];
 state.events??=[];
 const reject=status=>{state.seenSignals[input.id]=now;
  for(const [id,seenAt] of Object.entries(state.seenSignals))if(now-seenAt>7200000)delete state.seenSignals[id];
  state.events.push({at:now,symbol:input.symbol,kind:'SKIPPED',reason:status,side:input.side});
  if(state.events.length>300)state.events.shift();state.revision++;return {state,status};};
 const entry=!held;
 if(held&&((direction(held)==='LONG'&&input.side==='BUY')||
   (direction(held)==='SHORT'&&input.side==='SELL')))return reject('NO_ACTION');
 if(entry&&cadence==='INTRADAY'){
  const day=istDay(now),minute=istMinute(now);
  if(minute<580||minute>=SEVEN_RISK_POLICY.entryCutoffMinute)return reject('ENTRY_WINDOW_CLOSED');
  if(Object.values(state.positions).some(p=>p.openedAt&&istDay(p.openedAt)!==day))
   return reject('UNRESOLVED_CARRYOVER');
  if((state.dailyRiskDay===day?state.dailyRealizedPaise||0:0)<=-SEVEN_RISK_POLICY.dailyLossPaise)
   return reject('DAILY_LOSS_LIMIT');
  if(['scalpstorm_x','vwap_precision'].includes(previous.strategyId)&&
    entryCount(state,day)+Object.values(state.pending).filter(p=>istDay(p.createdAt)===day&&!state.positions[p.symbol]).length>=2)
   return reject('MAX_DAILY_ENTRIES');
 }
 if(state.pending[input.symbol])return reject('PENDING_EXISTS');
 if(held){state.positions[input.symbol].exitRequestedReason=input.reason||'STRATEGY_SIGNAL';state.positions[input.symbol].exitRequestedAt??=now;}
 state.pending[input.symbol]={id:input.id,side:input.side,symbol:input.symbol,
  instrumentKey:input.instrumentKey,signalAt:at,createdAt:now,expiresAt:now+90000,
  riskPolicyVersion:SEVEN_RISK_POLICY.version,
  reason:typeof input.reason==='string'&&/^[A-Z0-9_]{3,40}$/.test(input.reason)?input.reason:'STRATEGY_SIGNAL'};
 state.seenSignals[input.id]=now;
 for(const [id,seenAt] of Object.entries(state.seenSignals))if(now-seenAt>7200000)delete state.seenSignals[id];
 state.revision++;
 return {state,status:'PENDING'};
}
/** Only a later, fresh provider-generated book with usable depth can settle. */
export function settleSevenPending(previous,symbol,quote,now){
 assertSevenAccount(previous);
 const pending=previous.pending[symbol];
 if(!pending)return {state:previous,status:'NO_PENDING'};
 if(!Number.isSafeInteger(now)||now>pending.expiresAt){
  const state=clone(previous);delete state.pending[symbol];state.events??=[];
  state.events.push({at:now,symbol,kind:'EXPIRED',reason:'NO_LATER_FRESH_BOOK',side:pending.side});
  if(state.events.length>300)state.events.shift();state.revision++;
  return {state,status:'EXPIRED'};
 }
 const provider=time(quote?.providerAt),observed=time(quote?.observedAt);
 if(quote?.source!=='Upstox Analytics'||quote.instrumentKey!==pending.instrumentKey||
   !Number.isFinite(provider)||!Number.isFinite(observed)||provider<=pending.signalAt||
   provider<=pending.createdAt||quote.sourceKnownAt!==undefined&&quote.sourceKnownAt<=pending.createdAt||provider<=(pending.lastFillProviderAt||0)||provider>observed+1000||observed>now+1000||
   now-provider>10000||now-observed>10000)return {state:previous,status:'WAIT_FRESH_QUOTE'};
 const book=pending.side==='BUY'?quote.ask:quote.bid;
 if(!book||!Number.isFinite(book.price)||book.price<=0||
   !Number.isSafeInteger(book.quantity)||book.quantity<1)return {state:previous,status:'WAIT_BOOK'};
 const base=price(book.price),fillPrice=pending.side==='BUY'?
  Math.ceil(base*10005/10000):Math.floor(base*9995/10000);
 const state=clone(previous),position=state.positions[symbol];
 let qty,fee,pnl=0,allocatedCost=0;
 if(!position){
  qty=Math.min(Math.floor(book.quantity/4),Math.floor(Math.min(SEVEN_RISK_POLICY.maxAllocationPaise,state.cashPaise)/(fillPrice*1.001)));
  if(qty<1)return {state:previous,status:'NO_BUYING_POWER'};
  fee=Math.ceil(qty*fillPrice*10/10000);
  const cost=qty*fillPrice+fee;if(cost>state.cashPaise)fail('cash invariant');
  state.cashPaise-=cost;
  const long=pending.side==='BUY';
  state.positions[symbol]={qty,entryCostPaise:cost,entryPricePaise:fillPrice,
   instrumentKey:pending.instrumentKey,direction:long?'LONG':'SHORT',openedAt:provider,
   stopPaise:long?Math.floor(fillPrice*(10000-SEVEN_RISK_POLICY.stopBps)/10000):Math.ceil(fillPrice*(10000+SEVEN_RISK_POLICY.stopBps)/10000),
   targetPaise:long?Math.ceil(fillPrice*(10000+SEVEN_RISK_POLICY.targetBps)/10000):Math.floor(fillPrice*(10000-SEVEN_RISK_POLICY.targetBps)/10000),
   riskPolicyVersion:pending.riskPolicyVersion};
 }else{
  if((direction(position)==='LONG'&&pending.side!=='SELL')||
     (direction(position)==='SHORT'&&pending.side!=='BUY'))return {state:previous,status:'INVALID_EXIT_SIDE'};
  qty=Math.min(position.qty,Math.floor(book.quantity/4));if(qty<1)return {state:previous,status:'WAIT_BOOK'};
  allocatedCost=qty===position.qty?position.entryCostPaise:Math.floor(position.entryCostPaise*qty/position.qty);
  fee=Math.ceil(qty*fillPrice*10/10000);
  if(direction(position)==='LONG'){
   const proceeds=qty*fillPrice-fee;
   pnl=proceeds-allocatedCost;state.cashPaise+=proceeds;
  }else{
   pnl=qty*(position.entryPricePaise-fillPrice)-(allocatedCost-qty*position.entryPricePaise)-fee;
   state.cashPaise+=allocatedCost+pnl;
  }
  state.realizedPaise+=pnl;
  const day=istDay(provider);
  state.dailyRealizedPaise=(state.dailyRiskDay===day?state.dailyRealizedPaise||0:0)+pnl;
  state.dailyRiskDay=day;
  if(qty===position.qty)delete state.positions[symbol];
  else {position.qty-=qty;position.entryCostPaise-=allocatedCost;}
 }
 state.feesPaise+=fee;
 state.fills.push({id:pending.filledQuantity?pending.id+'-part-'+pending.filledQuantity:pending.id,strategyId:state.strategyId,symbol,instrumentKey:pending.instrumentKey,side:pending.side,qty,
  pricePaise:fillPrice,feePaise:fee,pnlPaise:pnl,positionEffect:position?'REDUCE':'OPEN',
  allocatedEntryCostPaise:position?allocatedCost:null,positionRemaining:position?state.positions[symbol]?.qty||0:qty,signalAt:pending.signalAt,
  tradeAt:provider,intentCreatedAt:pending.createdAt,observedAt:observed,sourceKnownAt:quote.sourceKnownAt??observed,processedAt:now,mode:'HYPOTHETICAL_NEXT_OBSERVED_BOOK',reason:pending.reason,
  riskPolicyVersion:pending.riskPolicyVersion,
  quoteSha256:/^[a-f0-9]{64}$/.test(quote.sourceSha256||'')?quote.sourceSha256:null});
 if(state.fills.length>1000)state.fills.shift();
 if(position&&state.positions[symbol])state.pending[symbol]={...pending,lastFillProviderAt:provider,filledQuantity:(pending.filledQuantity||0)+qty};
 else delete state.pending[symbol];state.revision++;
 assertSevenAccount(state);
 return {state,status:'PAPER_FILLED'};
}

/** Queue timed exits without a quote; price exits require a fresh executable book. */
export function sevenRiskExit(previous,symbol,quote,now){
 assertSevenAccount(previous);
 const p=previous.positions[symbol];if(!p||previous.pending[symbol])return null;
 const long=direction(p)==='LONG',minute=istMinute(now);
 const timed=p.openedAt&&istDay(p.openedAt)!==istDay(now)?'CARRYOVER_RECOVERY':
  minute>=SEVEN_RISK_POLICY.exitMinute?'MANDATORY_1515_EXIT':p.exitRequestedReason||null;
 const provider=time(quote?.providerAt),observed=time(quote?.observedAt);
 const book=long?quote?.bid:quote?.ask;
 const fresh=quote?.source==='Upstox Analytics'&&quote.instrumentKey===p.instrumentKey&&
  Number.isFinite(provider)&&Number.isFinite(observed)&&provider<=observed+1000&&
  observed<=now+1000&&now-provider<=10000&&now-observed<=10000&&
  Number.isFinite(book?.price)&&book.price>0&&Number.isSafeInteger(book?.quantity)&&book.quantity>0;
 if(!timed&&!fresh)return null;
 const current=fresh?price(book.price):null;
 const reason=timed||(
  long&&current<=p.stopPaise||!long&&current>=p.stopPaise?'RISK_STOP':
  long&&current>=p.targetPaise||!long&&current<=p.targetPaise?'RISK_TARGET':null);
 if(!reason)return null;
 return {strategyId:previous.strategyId,id:`risk-${istDay(now)}-${symbol}-${reason}-${Math.floor(now/60000)}`,
  symbol,instrumentKey:p.instrumentKey,side:long?'SELL':'BUY',signalAt:new Date(now).toISOString(),
  reason,realOrdersEnabled:false};
}
