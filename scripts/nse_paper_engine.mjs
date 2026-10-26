// Pure whole-share NSE simulation. No network, credentials or broker-order capability.
import {createHash} from 'node:crypto';
import {STRATEGIES,decision,validateResearchBars} from '../frontend/lib/research-engine.js';
export const PILOT_SYMBOLS=Object.freeze(['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK',
  'SBIN','ITC','LT','BHARTIARTL','HINDUNILVR']);
export const POLICY=Object.freeze({capitalPaise:10000000,slotPaise:1000000,feeBps:10,
  slippageBps:5,stopBps:200,maxDrawdownBps:500,dailyLossPaise:200000,
  entryCutoffMinute:14*60+45,exitMinute:15*60+20,quoteMaxAgeMs:10000,
  signalMaxAgeMs:120000,pendingMaxAgeMs:90000,leverage:1,shorting:false});
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone=x=>structuredClone(x);
const fail=()=>{throw Error('NSE pilot contract or accounting invalid');};
const iso=n=>new Date(n).toISOString();
const minute=n=>{const d=new Date(n+19800000);return d.getUTCHours()*60+d.getUTCMinutes();};
const day=n=>new Date(n+19800000).toISOString().slice(0,10);
const stamp=x=>typeof x==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)?Date.parse(x):NaN;
const paise=v=>Number.isFinite(v)&&v>0&&v<=1e7?Math.round(v*100):fail();
const integer=v=>Number.isSafeInteger(v)&&v>=0;
export function validateUniverse(rows){
  if(!Array.isArray(rows)||rows.length!==10)return fail();
  const keys=new Set();
  rows.forEach((row,i)=>{
    if(row.symbol!==PILOT_SYMBOLS[i]||row.lotSize!==1||
      !/^NSE_EQ\|INE[A-Z0-9]{9}$/.test(row.instrumentKey)||keys.has(row.instrumentKey))fail();
    keys.add(row.instrumentKey);
  });
  return rows.map(({symbol,instrumentKey,lotSize})=>({symbol,instrumentKey,lotSize}));
}
export function createNsePaper(universe,startedAt,mode='FORWARD'){
  if(!['FORWARD','HISTORICAL_REPLAY','SYNTHETIC_QA'].includes(mode)||
    !Number.isSafeInteger(startedAt)||startedAt<=0)fail();
  const rows=validateUniverse(universe);
  return {schema:'atlas.nse-paper-state.v1',mode,startedAt,
    configHash:digest({universe:rows,policy:POLICY,strategies:STRATEGIES}),
    universe:rows,policy:clone(POLICY),lastInputAt:0,lastStatus:'ARMED',
    admittedCycles:0,skippedCycles:0,historyHashes:{},
    sessions:STRATEGIES.map(s=>({strategyId:s.id,cashPaise:POLICY.capitalPaise,
      realizedPaise:0,feesPaise:0,peakEquityPaise:POLICY.capitalPaise,
      dailyStartEquityPaise:POLICY.capitalPaise,sessionDate:null,halted:false,
      positions:{},pending:{},lastBars:{},fills:0,decisions:0,gaps:0}))};
}
export function assertNseState(state){
  if(state?.schema!=='atlas.nse-paper-state.v1'||!['FORWARD','HISTORICAL_REPLAY','SYNTHETIC_QA'].includes(state.mode)||
    state.configHash!==digest({universe:validateUniverse(state.universe),policy:POLICY,strategies:STRATEGIES})||
    JSON.stringify(state.policy)!==JSON.stringify(POLICY)||state.sessions?.length!==5)fail();
  const seen=new Set();
  for(const s of state.sessions){
    if(!STRATEGIES.some(x=>x.id===s.strategyId)||seen.has(s.strategyId)||
      !integer(s.cashPaise)||!integer(s.feesPaise)||!Number.isSafeInteger(s.realizedPaise)||
      !integer(s.fills)||!integer(s.decisions)||!integer(s.gaps))fail();
    seen.add(s.strategyId);
    for(const [symbol,p] of Object.entries(s.positions)){
      if(!PILOT_SYMBOLS.includes(symbol)||!Number.isSafeInteger(p.quantity)||p.quantity<=0||
        !integer(p.entryCostPaise)||!integer(p.entryPricePaise)||p.entryPricePaise<=0||
        !integer(p.markPaise)||p.markPaise<=0)fail();
    }
    for(const [symbol,p] of Object.entries(s.pending)){
      if(!PILOT_SYMBOLS.includes(symbol)||!['BUY','SELL'].includes(p.side)||
        !integer(p.createdAt)||!integer(p.sourceTradeAt)||p.expiresAt<=p.createdAt)fail();
    }
  }
  return state;
}
function availableQuote(q,now){
  if(!q||q.priceUnit!=='INR'||!Number.isFinite(q.lastPrice)||q.lastPrice<=0)return false;
  const traded=stamp(q.lastTradeAt),quoted=stamp(q.quoteTimestamp);
  if(!Number.isFinite(traded)||!Number.isFinite(quoted)||traded>now+1000||quoted>now+1000||
    now-traded>POLICY.quoteMaxAgeMs||now-quoted>POLICY.quoteMaxAgeMs)return false;
  const bid=q.depth?.buy,ask=q.depth?.sell;
  return !!bid&&!!ask&&Number.isFinite(bid.price)&&Number.isFinite(ask.price)&&
    bid.price>0&&ask.price>=bid.price&&ask.price/bid.price<=1.01&&
    Number.isSafeInteger(bid.quantity)&&bid.quantity>0&&Number.isSafeInteger(ask.quantity)&&ask.quantity>0&&
    q.lastPrice>=bid.price*.95&&q.lastPrice<=ask.price*1.05;
}
function equity(s){return s.cashPaise+Object.values(s.positions).reduce((n,p)=>n+p.quantity*p.markPaise,0);}
function execute(s,symbol,pending,q,now,events,mode){
  const tradeAt=stamp(q.lastTradeAt);
  if(tradeAt<=pending.createdAt||tradeAt<=pending.sourceTradeAt||now<=pending.createdAt)return false;
  const side=pending.side,pos=s.positions[symbol];
  if(side==='BUY'&&(pos||s.halted||minute(now)>=POLICY.entryCutoffMinute))return false;
  if(side==='SELL'&&!pos)return false;
  const book=side==='BUY'?q.depth.sell:q.depth.buy;
  const reference=paise(book.price);
  const price=side==='BUY'?Math.ceil(reference*(10000+POLICY.slippageBps)/10000):
    Math.floor(reference*(10000-POLICY.slippageBps)/10000);
  const visibleCap=Math.floor(book.quantity/4);
  let quantity;
  if(side==='BUY'){
    const budget=Math.min(POLICY.slotPaise,s.cashPaise);
    quantity=Math.min(visibleCap,Math.floor(budget/(price*(1+POLICY.feeBps/10000))));
  }else{
    quantity=pos.quantity;
    // No fabricated partial liquidation: retain the pending exit if visible size is insufficient.
    if(quantity>visibleCap)return false;
  }
  if(!Number.isSafeInteger(quantity)||quantity<=0)return false;
  const gross=quantity*price,fee=Math.ceil(gross*POLICY.feeBps/10000);
  if(!integer(gross)||!integer(fee))fail();
  let realized=0;
  if(side==='BUY'){
    if(gross+fee>s.cashPaise)return false;
    s.cashPaise-=gross+fee;
    s.positions[symbol]={quantity,entryCostPaise:gross+fee,entryPricePaise:price,
      markPaise:paise(q.lastPrice),markTradeAt:q.lastTradeAt};
  }else{
    realized=gross-fee-pos.entryCostPaise;
    s.cashPaise+=gross-fee;s.realizedPaise+=realized;delete s.positions[symbol];
  }
  s.feesPaise+=fee;s.fills++;
  events.push({type:'FILL',id:digest([s.strategyId,symbol,side,pending.createdAt,tradeAt]),
    strategyId:s.strategyId,symbol,side,quantity,pricePaise:price,feePaise:fee,
    realizedPaise:realized,at:now,sourceTradeAt:tradeAt,signalObservedAt:pending.createdAt,
    signalBarTime:pending.signalBarTime,reason:pending.reason,
    cashAfterPaise:s.cashPaise,executionType:mode==='FORWARD'?'HYPOTHETICAL_NEXT_OBSERVED_TRADE':
      mode==='HISTORICAL_REPLAY'?'HISTORICAL_CANDLE_FILL_ASSUMPTION':'SYNTHETIC_QA_FILL',
    quote:{lastTradeAt:q.lastTradeAt,quoteTimestamp:q.quoteTimestamp,depth:q.depth}});
  return true;
}
export function advanceNsePaper(previous,input,now=Date.now()){
  assertNseState(previous);
  if(!Number.isSafeInteger(now)||now<previous.startedAt)fail();
  const state=clone(previous),events=[];
  const expectedClass=state.mode==='FORWARD'?'BROKER_API_OBSERVATION':
    state.mode==='HISTORICAL_REPLAY'?'HISTORICAL_CANDLE_SIMULATION':'SYNTHETIC_FIXTURE';
  if(input?.schema!=='atlas.nse-paper-input.v1'||input.source!=='Upstox Analytics'||
    input.dataClass!==expectedClass||input.realOrdersEnabled!==false||
    !Number.isFinite(stamp(input.observedAt))||stamp(input.observedAt)>now+1000||
    now-stamp(input.observedAt)>10000||
    digest(validateUniverse(input.universe))!==digest(state.universe))fail();
  if(stamp(input.observedAt)<=state.lastInputAt)return {state,events,status:'DUPLICATE_INPUT'};
  const market=input.market;
  if(market?.exchange!=='NSE'||typeof market.marketOpen!=='boolean'||
    market.marketOpen!==(market.status==='NORMAL_OPEN')||
    !Number.isFinite(stamp(input.marketObservedAt))||
    now-stamp(input.marketObservedAt)>65000||stamp(input.marketObservedAt)>now+1000)fail();
  const quotes=new Map();
  if(!Array.isArray(input.quotes))fail();
  for(const q of input.quotes){
    if(quotes.has(q.instrumentKey))fail();
    quotes.set(q.instrumentKey,q);
  }
  for(const row of state.universe){
    const q=quotes.get(row.instrumentKey);
    if(!q||q.symbol!==row.symbol||q.priceUnit!=='INR')fail();
  }
  for(const row of state.universe){
    const history=input.history?.[row.symbol];
    if(!history)continue;
    const received=stamp(history.observedAt);
    if(!Number.isFinite(received)||received>now+1000)fail();
    validateResearchBars(history.bars,60000);
    if(history.bars.some(b=>b.time+60000>received||b.time+60000>now||
      day(b.time)!==day(now)||minute(b.time)<555||minute(b.time)>=930))fail();
  }
  state.lastInputAt=stamp(input.observedAt);
  const m=minute(now),weekday=new Date(now+19800000).getUTCDay();
  const open=market.marketOpen&&m>=555&&m<930&&weekday>=1&&weekday<=5;
  if(!open){
    state.lastStatus='MARKET_CLOSED';state.skippedCycles++;
    for(const s of state.sessions)s.pending={};
    return {state,events,status:state.lastStatus};
  }
  state.admittedCycles++;
  const sessionDate=day(now);
  for(const s of state.sessions){
    // Overnight gaps never replay old orders. Any unresolved position remains real in the virtual ledger.
    if(s.sessionDate!==sessionDate){
      s.sessionDate=sessionDate;s.pending={};s.lastBars={};
      s.dailyStartEquityPaise=equity(s);s.halted=false;
    }
    for(const row of state.universe){
      const q=quotes.get(row.instrumentKey);
      if(availableQuote(q,now)&&s.positions[row.symbol]){
        s.positions[row.symbol].markPaise=paise(q.lastPrice);
        s.positions[row.symbol].markTradeAt=q.lastTradeAt;
      }
    }
    const currentEquity=equity(s);
    s.peakEquityPaise=Math.max(s.peakEquityPaise,currentEquity);
    if(currentEquity<s.dailyStartEquityPaise-POLICY.dailyLossPaise||
      currentEquity*10000<s.peakEquityPaise*(10000-POLICY.maxDrawdownBps))s.halted=true;
    for(const row of state.universe){
      const symbol=row.symbol,q=quotes.get(row.instrumentKey),fresh=availableQuote(q,now);
      const pending=s.pending[symbol];
      if(pending){
        if(now>pending.expiresAt){delete s.pending[symbol];}
        else if(fresh&&execute(s,symbol,pending,q,now,events,state.mode)){delete s.pending[symbol];}
      }
      const position=s.positions[symbol];
      const stop=position&&fresh&&paise(q.lastPrice)*10000<=position.entryPricePaise*(10000-POLICY.stopBps);
      const exitRequired=!!position&&(s.halted||m>=POLICY.exitMinute||stop);
      if(exitRequired&&!s.pending[symbol]){
        s.pending[symbol]={side:'SELL',createdAt:now,sourceTradeAt:stamp(q.lastTradeAt)||0,
          signalBarTime:null,expiresAt:now+POLICY.pendingMaxAgeMs,
          reason:s.halted?'RISK_EXIT':stop?'STOP_EXIT':'SESSION_EXIT'};
      }
      const history=input.history?.[symbol];
      if(!fresh||!history||!Array.isArray(history.bars)||exitRequired)continue;
      const bars=history.bars;
      validateResearchBars(bars,60000);
      if(bars.some(b=>b.time+60000>now||day(b.time)!==sessionDate||
        minute(b.time)<555||minute(b.time)>=930))fail();
      const latest=bars.at(-1),closed=latest?latest.time+60000:0;
      if(!closed||closed<=previous.startedAt||closed<now-POLICY.signalMaxAgeMs||
        closed<=(s.lastBars[symbol]??0))continue;
      const previousClose=s.lastBars[symbol];
      s.lastBars[symbol]=closed;
      const contiguous=bars.length>=28&&bars.slice(-28).every((b,i,a)=>i===0||b.time-a[i-1].time===60000);
      const gap=!!previousClose&&closed-previousClose>180000;
      if(gap||!contiguous){
        s.gaps+=gap?1:0;
        events.push({type:'DECISION',id:digest([s.strategyId,symbol,closed]),strategyId:s.strategyId,
          symbol,at:now,signalBarTime:latest.time,action:'HOLD',reason:gap?'MISSED_INTERVAL':'WARMUP_OR_GAP',
          sourceBarsHash:digest(bars),sourceObservedAt:history.observedAt});
        s.decisions++;continue;
      }
      const action=decision(s.strategyId,bars,bars.length-1);
      let reason=action==='HOLD'?'NO_SIGNAL':'SIGNAL';
      if(action==='BUY'&&(s.halted||position||m>=POLICY.entryCutoffMinute))reason='ENTRY_GUARD';
      else if(action==='SELL'&&!position)reason='NO_POSITION';
      else if(action!=='HOLD'&&!s.pending[symbol]){
        s.pending[symbol]={side:action,createdAt:now,sourceTradeAt:stamp(q.lastTradeAt),
          signalBarTime:latest.time,expiresAt:now+POLICY.pendingMaxAgeMs,reason:'STRATEGY_SIGNAL'};
      }
      events.push({type:'DECISION',id:digest([s.strategyId,symbol,closed]),strategyId:s.strategyId,
        symbol,at:now,signalBarTime:latest.time,action,reason,sourceBarsHash:digest(bars),
        sourceObservedAt:history.observedAt,sourceTradeAt:stamp(q.lastTradeAt)});
      s.decisions++;
    }
  }
  state.lastStatus='OBSERVING';
  assertNseState(state);
  return {state,events,status:state.lastStatus};
}
export function summarizeNsePaper(state,events=[],now=Date.now()){
  assertNseState(state);
  const sessions=state.sessions.map(s=>{
    const positions=Object.entries(s.positions).map(([symbol,p])=>({
      symbol,quantity:p.quantity,averageEntryINR:p.entryPricePaise/100,
      entryCostINR:p.entryCostPaise/100,lastMarkINR:p.markPaise/100,lastTradeAt:p.markTradeAt,
      unrealizedPnlINR:(p.quantity*p.markPaise-p.entryCostPaise)/100}));
    return {strategyId:s.strategyId,name:STRATEGIES.find(x=>x.id===s.strategyId).name,
      description:STRATEGIES.find(x=>x.id===s.strategyId).description,
      initialCapitalINR:100000,allocationPerStockINR:10000,cashINR:s.cashPaise/100,
      equityINR:equity(s)/100,realizedPnlINR:s.realizedPaise/100,
      unrealizedPnlINR:positions.reduce((n,p)=>n+p.unrealizedPnlINR,0),
      netPnlINR:(equity(s)-POLICY.capitalPaise)/100,feesINR:s.feesPaise/100,
      fills:s.fills,decisions:s.decisions,gaps:s.gaps,halted:s.halted,positions,
      pendingCount:Object.keys(s.pending).length,sessionDate:s.sessionDate};
  });
  return {schema:'atlas.nse-paper-report.v1',mode:state.mode,observedAt:iso(now),
    source:'Upstox Analytics',status:state.lastStatus,startedAt:iso(state.startedAt),
    universe:state.universe,classification:'FIXED_TEN_STOCK_PILOT_NOT_MARKET_WIDE_TOP_TEN',
    cashOnly:true,leverage:1,realOrdersEnabled:false,paperOnly:true,actualCapitalINR:0,
    qualified:false,certifiedScalpStormSessions:0,admittedCycles:state.admittedCycles,
    skippedCycles:state.skippedCycles,sourceObservedAt:state.lastInputAt?iso(state.lastInputAt):null,
    costModel:{feeBpsEachSide:10,slippageBpsEachSide:5,
      label:'Illustrative combined cost allowance; not verified brokerage/tax rates'},
    sessions,events:events.slice(-200),ledgerVerified:true,
    note:'Independent100000 INR comparison accounts are not additive. Modeled fills are not exchange executions.'};
}
