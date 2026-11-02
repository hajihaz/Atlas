/** Owner-approved Atlas strategy research definitions. No broker or order capability. */
const fail=reason=>{throw Error('SEVEN_STRATEGY_BLOCKED: '+reason);};
const spec=(id,name,cadence,summary,needs,provisional=[])=>Object.freeze({
  id,name,cadence,summary,requires:Object.freeze(needs),provisional:Object.freeze(provisional),
  executionStatus:'SIGNAL_ONLY_UNARMED',paperOnly:true
});
export const SEVEN_STRATEGIES=Object.freeze([
  spec('scalpstorm_x','ScalpStorm X','INTRADAY','9:40 top-volume NSE equities; Nifty morning bias; confirmed opening-range break',
    ['dated full NSE 09:40 volume roster','Nifty 09:15-09:30','stock one-minute OHLCV'],['stop and target distances']),
  spec('scalpstorm_x2','ScalpStorm X2','INTRADAY','GIFT Nifty morning bias; same stock selection and confirmation as X',
    ['dated full NSE 09:40 volume roster','same-contract GIFT Nifty 06:30 and 09:30','Nifty conflict check','stock one-minute OHLCV'],['GIFT reference and threshold validation','stop and target distances']),
  spec('scalpstorm_x3','ScalpStorm X3','INTRADAY','Timestamped company news with liquid, price-confirmed response',
    ['verified time-stamped company news','stock one-minute OHLCV','liquidity evidence'],['news materiality classification','liquidity threshold','stop and target distances']),
  spec('scalpstorm_xtreme','ScalpStorm Xtreme','INTRADAY','9:40 relative volume, Nifty-relative strength, breakout and retest',
    ['20 prior same-time volume baselines','Nifty and sector returns','stock one-minute OHLCV'],['RVOL and strength thresholds','stop placement']),
  spec('vwap_precision','VWAP Precision','INTRADAY','Nifty-aligned VWAP and EMA9 trend pullback after 10:00',
    ['dated full NSE 09:40 volume roster','Nifty morning bias','stock one-minute OHLCV'],['pullback proximity','stop distance']),
  spec('rsi2_snapback','RSI-2 Snapback','SWING','NIFTYBEES daily close above SMA200 and RSI2 below 5; next-session entry',
    ['time-qualified adjusted NIFTYBEES daily bars'],['ATR stop and sizing under gap risk']),
  spec('dual_momentum_rotation','Dual Momentum Rotation','MONTHLY','Choose positive six-month momentum leader of NIFTYBEES and GOLDBEES; otherwise cash',
    ['time-qualified adjusted daily bars for both ETFs'],['six-month session convention'])
]);
export function catalog(){
  return {schema:'atlas.owner-seven-strategies.v1',paperOnly:true,realOrdersEnabled:false,
    executionStatus:'SIGNAL_ONLY_UNARMED',strategies:SEVEN_STRATEGIES};
}
const date=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const ms=x=>typeof x==='string'?Date.parse(x):NaN;
const sum=(items,field)=>items.reduce((n,x)=>n+x[field],0);
function validateMinuteBars(bars){
  if(!Array.isArray(bars)||bars.length!==375)fail('complete 375-minute NSE session required');
  const first=bars[0]?.time;
  if(!Number.isSafeInteger(first))fail('minute timestamp');
  const day=new Date(first+19800000).toISOString().slice(0,10);
  if(first!==Date.parse(day+'T03:45:00Z'))fail('NSE session open');
  for(let i=0;i<375;i++){
    const b=bars[i];
    if(!b||b.time!==first+i*60000||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||
       b.open<=0||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||b.volume<0)fail('minute gap or OHLCV');
  }
  return day;
}
function verifyNifty(bars,nifty){
  if(Array.isArray(nifty)&&nifty.length===2){
    const [open,close]=nifty;
    if(open?.time!==bars[0].time||close?.time!==bars[14].time||
       !Number.isFinite(open.open)||!Number.isFinite(close.close)||open.open<=0||close.close<=0||
       !Number.isFinite(ms(open.sourceKnownAt))||!Number.isFinite(ms(close.sourceKnownAt))||
       ms(open.sourceKnownAt)<bars[0].time+60000||ms(close.sourceKnownAt)<bars[14].time+60000||
       ms(open.sourceKnownAt)>Date.parse(new Date(bars[0].time+19800000).toISOString().slice(0,10)+'T04:10:00Z')||
       ms(close.sourceKnownAt)>Date.parse(new Date(bars[0].time+19800000).toISOString().slice(0,10)+'T04:10:00Z'))fail('Nifty predecision OHLC receipt missing');
    return Math.round((close.close/open.open-1)*10000);
  }
  if(!Array.isArray(nifty)||nifty.length<15)fail('Nifty morning receipt missing');
  for(let i=0;i<15;i++){
    const n=nifty[i];
    if(!n||n.time!==bars[i].time||!Number.isFinite(n.open)||!Number.isFinite(n.close)||n.open<=0||n.close<=0)fail('Nifty timestamp or price');
  }
  return Math.round((nifty[14].close/nifty[0].open-1)*10000);
}
function topTen(context,day,symbol){
  const roster=context?.roster;
  if(!roster||roster.day!==day||roster.eligibleCount<500||
     !Number.isFinite(ms(roster.knownAt))||ms(roster.knownAt)>Date.parse(day+'T04:10:00Z')||
     !Array.isArray(roster.top)||roster.top.length!==10)fail('full 09:40 roster unavailable');
  const seen=new Set();
  for(const row of roster.top){
    if(!row||typeof row.symbol!=='string'||seen.has(row.symbol)||!Number.isSafeInteger(row.volume)||row.volume<0)fail('roster identity');
    seen.add(row.symbol);
  }
  if(!seen.has(symbol))return false;
  return true;
}
function openingRange(bars){
  return {high:Math.max(...bars.slice(0,25).map(x=>x.high)),
    low:Math.min(...bars.slice(0,25).map(x=>x.low))};
}
function confirmedBreak(bars,side,from=29){
  const range=openingRange(bars);
  const firstEnd=Math.max(29,4+5*Math.ceil((from-4)/5));
  for(let end=firstEnd;end<355;end+=5){
    const first=end-4;
    if(side==='BUY'&&bars[end].close>range.high&&bars[end].close>bars[first].open)return end;
    if(side==='SELL'&&bars[end].close<range.low&&bars[end].close<bars[first].open)return end;
  }
  return null;
}
function signal(side,end,reason,extra={}){
  return {status:'SIGNAL',side,signalBarTime:extra.bars[end].time,
    nextOpenTime:extra.bars[end+1].time,entryIndex:end+1,reason,
    paperOnly:true,realOrdersEnabled:false,riskParametersFinal:false};
}
function noTrade(reason){return {status:'NO_TRADE',reason,paperOnly:true,realOrdersEnabled:false};}
function ema(values,period){
  if(values.length<period)return null;
  let value=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for(let i=period;i<values.length;i++)value=value* (1-2/(period+1))+values[i]*2/(period+1);
  return value;
}
export function intradaySignal(id,bars,context={}){
  const spec=SEVEN_STRATEGIES.find(x=>x.id===id);
  if(!spec||spec.cadence!=='INTRADAY')fail('unknown intraday rule');
  const day=validateMinuteBars(bars),symbol=context.symbol;
  if(typeof symbol!=='string'||!/^[A-Z][A-Z0-9]{0,19}$/.test(symbol))fail('stock identity');
  if(id==='scalpstorm_x3'){
    const news=context.news;
    if(!news||news.symbol!==symbol||news.verified!==true||news.material!==true||
       !['BUY','SELL'].includes(news.direction)||!Number.isFinite(ms(news.publishedAt))||
       ms(news.publishedAt)>bars[354].time||ms(news.publishedAt)<Date.parse(day+'T00:00:00Z'))fail('verified dated news missing');
    if(!Number.isSafeInteger(context.liquidityVolume)||context.liquidityVolume<10000)fail('liquidity evidence missing');
    // Confirm with a complete candle that began after the news was published.
    const newsEnd=4+5*Math.ceil((ms(news.publishedAt)-bars[0].time)/300000);
    const end=confirmedBreak(bars,news.direction,Math.max(29,newsEnd));
    return end===null?noTrade('NO_PRICE_CONFIRMATION'):signal(news.direction,end,'VERIFIED_NEWS_AND_PRICE',{bars});
  }
  const niftyBps=verifyNifty(bars,context.niftyBars);
  if(id==='scalpstorm_xtreme'){
    const baseline=context.sameTimeVolumes;
    if(!Array.isArray(baseline)||baseline.length!==20||baseline.some(v=>!Number.isSafeInteger(v)||v<=0)||
       !Number.isFinite(context.sectorReturnBps))fail('20-session RVOL or sector evidence missing');
    const today=sum(bars.slice(0,25),'volume'),average=baseline.reduce((a,b)=>a+b,0)/20;
    if(today/average<2)return noTrade('RVOL_BELOW_2');
    const stockBps=Math.round((bars[24].close/bars[0].open-1)*10000),relative=stockBps-niftyBps;
    const side=relative>=50?'BUY':relative<=-50?'SELL':null;
    if(!side)return noTrade('INSUFFICIENT_RELATIVE_STRENGTH');
    if(side==='BUY'&&context.sectorReturnBps<=-50||side==='SELL'&&context.sectorReturnBps>=50)return noTrade('SECTOR_OPPOSED');
    const first=confirmedBreak(bars,side);
    if(first===null)return noTrade('NO_BREAKOUT');
    const edge=side==='BUY'?openingRange(bars).high:openingRange(bars).low;
    for(let i=first+1;i<350;i++){
      const retest=side==='BUY'?bars[i].low<=edge&&bars[i].close>=edge:bars[i].high>=edge&&bars[i].close<=edge;
      if(!retest)continue;
      const resume=confirmedBreak(bars,side,Math.max(29,i+4));
      if(resume!==null&&resume>i)return signal(side,resume,'RVOL_BREAK_RETEST',{bars});
    }
    return noTrade('NO_CONFIRMED_RETEST');
  }
  if(!topTen(context,day,symbol))return noTrade('NOT_TOP_TEN_AT_0940');
  if(id==='vwap_precision'){
    if(niftyBps<20)return noTrade('NIFTY_NOT_BULLISH');
    let pv=0,vol=0;const closes=[],vwap=[];
    for(let i=0;i<bars.length;i++){
      const b=bars[i];pv+=((b.high+b.low+b.close)/3)*b.volume;vol+=b.volume;vwap.push(vol?pv/vol:NaN);
    }
    for(let end=4;end<355;end+=5){
      closes.push(bars[end].close);
      if(end<49||closes.length<10)continue; // 10:00 IST or later
      const current=ema(closes,9),previous=ema(closes.slice(0,-1),9),prior=bars[end-5];
      const near=Math.min(Math.abs(prior.close-vwap[end-5])/vwap[end-5],Math.abs(prior.close-previous)/previous);
      if(Number.isFinite(vwap[end])&&current>previous&&bars[end].close>current&&
         bars[end].close>vwap[end]&&vwap[end]>vwap[end-5]&&near<=0.003&&
         bars[end].close>prior.high)return signal('BUY',end,'VWAP_EMA_PULLBACK',{bars});
    }
    return noTrade('NO_CONFIRMED_PULLBACK');
  }
  let side=niftyBps>=20?'BUY':niftyBps<=-20?'SELL':null;
  if(id==='scalpstorm_x2'){
    const gift=context.gift;
    if(!gift||!gift.contract||gift.contract!==gift.referenceContract||gift.contract!==gift.decisionContract||
       ms(gift.referenceAt)!==Date.parse(day+'T01:00:00Z')||
       ms(gift.decisionAt)!==Date.parse(day+'T04:00:00Z')||
       !Number.isFinite(gift.referencePrice)||!Number.isFinite(gift.decisionPrice)||gift.referencePrice<=0)fail('same-contract GIFT source missing');
    const giftBps=Math.round((gift.decisionPrice/gift.referencePrice-1)*10000);
    side=giftBps>=20?'BUY':giftBps<=-20?'SELL':null;
    if(side&&((side==='BUY'&&niftyBps<=-20)||(side==='SELL'&&niftyBps>=20)))return noTrade('NIFTY_CONFLICT');
  }
  if(!side)return noTrade('NEUTRAL_DIRECTION');
  const end=confirmedBreak(bars,side);
  return end===null?noTrade('NO_5_MINUTE_BREAKOUT'):signal(side,end,'DIRECTION_AND_RANGE_CONFIRMED',{bars});
}
export function replayIntradayDay(id,bars,{context}={}){
  const result=intradaySignal(id,bars,context);
  return {strategyId:id,session:validateMinuteBars(bars),status:result.status,
    evidenceClass:'RETROSPECTIVE_SIGNAL_ONLY',signal:result,
    fills:[],realizedPaise:null,winRatePct:null,
    warning:'Signal research only; stops, targets, source completeness and later executable quotes are not certified.',
    paperOnly:true,realOrdersEnabled:false};
}
function validateDaily(item,asOf,need,mode){
  if(!item||!Array.isArray(item.bars)||item.bars.length<need||!/^[A-Z][A-Z0-9]{0,19}$/.test(item.symbol))fail('ETF identity or warmup');
  let prev='';
  for(const b of item.bars){
    if(!date(b.day)||b.day>=asOf||b.day<=prev||![b.open,b.high,b.low,b.close].every(Number.isFinite)||
       b.open<=0||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||!Number.isFinite(ms(b.knownAt))||
       (mode==='FORWARD'&&ms(b.knownAt)>Date.parse(asOf+'T03:45:00Z')))fail('daily bar or publication time');
    prev=b.day;
  }
  return item.bars;
}
const average=(bars,n)=>bars.slice(-n).reduce((a,b)=>a+b.close,0)/n;
function rsi2(bars){
  const a=bars.at(-1).close-bars.at(-2).close,b=bars.at(-2).close-bars.at(-3).close;
  const gain=Math.max(a,0)+Math.max(b,0),loss=Math.max(-a,0)+Math.max(-b,0);
  return loss===0?(gain===0?50:100):100-100/(1+gain/loss);
}
export function rankPeriod(id,asOfDay,series,{mode='RETROSPECTIVE'}={}){
  if(!date(asOfDay)||!['RETROSPECTIVE','FORWARD'].includes(mode)||!Array.isArray(series))fail('period request');
  if(id==='rsi2_snapback'){
    const item=series.find(x=>x.symbol==='NIFTYBEES');
    const bars=validateDaily(item,asOfDay,201,mode);
    const ready=bars.at(-1).close>average(bars,200)&&rsi2(bars)<5;
    return {strategyId:id,asOfDay,status:ready?'SIGNAL':'NO_TRADE',selected:ready?['NIFTYBEES']:[],
      entry:'NEXT_SESSION_OPEN',exit:'FIRST_NEXT_OPEN_AFTER_CLOSE_ABOVE_SMA5_OR_10_SESSIONS',
      mode,evidenceClass:mode==='FORWARD'?'TIME_QUALIFIED_ETF_DAILY':'RETROSPECTIVE_ETF_RESEARCH',
      executionStatus:'SIGNAL_ONLY_UNARMED',paperOnly:true,realOrdersEnabled:false};
  }
  if(id==='dual_momentum_rotation'){
    const a=series.find(x=>x.symbol==='NIFTYBEES'),b=series.find(x=>x.symbol==='GOLDBEES');
    const aa=validateDaily(a,asOfDay,127,mode),bb=validateDaily(b,asOfDay,127,mode);
    if(aa.at(-1).day!==bb.at(-1).day||aa.at(-1).day.slice(0,7)===asOfDay.slice(0,7))fail('monthly decision timing');
    const ret=x=>x.at(-1).close/x.at(-127).close-1;
    const selected=ret(aa)>0||ret(bb)>0?(ret(aa)>=ret(bb)?'NIFTYBEES':'GOLDBEES'):'CASH';
    return {strategyId:id,asOfDay,status:selected==='CASH'?'NO_TRADE':'SIGNAL',selected:[selected],
      targetExposurePct:selected==='CASH'?0:80,mode,
      evidenceClass:mode==='FORWARD'?'TIME_QUALIFIED_ETF_DAILY':'RETROSPECTIVE_ETF_RESEARCH',
      executionStatus:'SIGNAL_ONLY_UNARMED',paperOnly:true,realOrdersEnabled:false};
  }
  fail('unknown period strategy');
}
