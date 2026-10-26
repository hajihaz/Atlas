const STRATEGIES=['sma_9_21','ema_12_26','rsi_14','breakout_20','sps_pullback'];
const SYMBOLS=['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','SBIN','ITC','LT','BHARTIARTL','HINDUNILVR'];
const fail=()=>{throw Error('Invalid private NSE paper report');};
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e9;
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=1e9;
const stamp=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const text=v=>typeof v==='string'&&v.length<=400?v:fail();
export function validateNsePaperReport(v,now=Date.now(),expectedMode='FORWARD'){
  if(v?.schema!=='atlas.nse-paper-report.v1'||v.mode!==expectedMode||
    !['FORWARD','HISTORICAL_REPLAY'].includes(v.mode)||v.source!=='Upstox Analytics'||
    !stamp(v.observedAt)||Date.parse(v.observedAt)>now+5000||
    expectedMode==='FORWARD'&&now-Date.parse(v.observedAt)>90000||
    !stamp(v.startedAt)||v.realOrdersEnabled!==false||v.actualCapitalINR!==0||v.paperOnly!==true||
    v.qualified!==false||v.certifiedScalpStormSessions!==0||v.cashOnly!==true||v.leverage!==1||
    v.ledgerVerified!==true||!Array.isArray(v.sessions)||v.sessions.length!==5||
    v.classification!=='FIXED_TEN_STOCK_PILOT_NOT_MARKET_WIDE_TOP_TEN'||
    !['ARMED','MARKET_CLOSED','OBSERVING','SOURCE_UNAVAILABLE','REPLAY_COMPLETE'].includes(v.status)||
    !Array.isArray(v.universe)||v.universe.length!==10)fail();
  const universe=v.universe.map((r,i)=>{
    if(r.symbol!==SYMBOLS[i]||r.lotSize!==1||!/^NSE_EQ\|INE[A-Z0-9]{9}$/.test(r.instrumentKey))fail();
    return{symbol:r.symbol,instrumentKey:r.instrumentKey,lotSize:1};
  });
  const seen=new Set();
  const sessions=v.sessions.map(s=>{
    if(!STRATEGIES.includes(s.strategyId)||seen.has(s.strategyId)||s.initialCapitalINR!==100000||
      s.allocationPerStockINR!==10000||typeof s.halted!=='boolean'||!Array.isArray(s.positions)||
      ![s.cashINR,s.equityINR,s.realizedPnlINR,s.unrealizedPnlINR,s.netPnlINR,s.feesINR].every(finite)||
      s.cashINR<0||s.feesINR<0||![s.fills,s.decisions,s.gaps,s.pendingCount].every(count))fail();
    seen.add(s.strategyId);
    const symbols=new Set();
    const positions=s.positions.map(p=>{
      if(!SYMBOLS.includes(p.symbol)||symbols.has(p.symbol)||!count(p.quantity)||p.quantity===0||
        ![p.averageEntryINR,p.entryCostINR,p.lastMarkINR,p.unrealizedPnlINR].every(finite)||
        p.averageEntryINR<=0||p.entryCostINR<0||p.entryCostINR>10000||p.lastMarkINR<=0||
        !stamp(p.lastTradeAt))fail();
      symbols.add(p.symbol);
      return{symbol:p.symbol,quantity:p.quantity,averageEntryINR:p.averageEntryINR,
        entryCostINR:p.entryCostINR,lastMarkINR:p.lastMarkINR,
        unrealizedPnlINR:p.unrealizedPnlINR,lastTradeAt:p.lastTradeAt};
    });
    const marked=positions.reduce((n,p)=>n+p.quantity*p.lastMarkINR,0);
    if(Math.abs(s.cashINR+marked-s.equityINR)>.02||
      Math.abs(s.equityINR-100000-s.netPnlINR)>.02||
      Math.abs(s.realizedPnlINR+s.unrealizedPnlINR-s.netPnlINR)>.02)fail();
    return{strategyId:s.strategyId,name:text(s.name),description:text(s.description),
      initialCapitalINR:100000,allocationPerStockINR:10000,cashINR:s.cashINR,equityINR:s.equityINR,
      realizedPnlINR:s.realizedPnlINR,unrealizedPnlINR:s.unrealizedPnlINR,netPnlINR:s.netPnlINR,
      feesINR:s.feesINR,fills:s.fills,decisions:s.decisions,gaps:s.gaps,halted:s.halted,
      positions,pendingCount:s.pendingCount,sessionDate:s.sessionDate===null?null:text(s.sessionDate)};
  });
  const events=(Array.isArray(v.events)?v.events:fail()).slice(-200).map(e=>{
    if(!['FILL','DECISION'].includes(e.type)||!STRATEGIES.includes(e.strategyId)||
      !SYMBOLS.includes(e.symbol)||!Number.isSafeInteger(e.at)||e.at<=0||
      !/^[a-f0-9]{64}$/.test(e.id))fail();
    const base={type:e.type,id:e.id,strategyId:e.strategyId,symbol:e.symbol,at:e.at,reason:text(e.reason)};
    if(e.type==='DECISION'){
      if(!['BUY','SELL','HOLD'].includes(e.action))fail();
      return{...base,action:e.action,signalBarTime:e.signalBarTime};
    }
    if(!['BUY','SELL'].includes(e.side)||!count(e.quantity)||e.quantity<=0||
      ![e.pricePaise,e.feePaise,e.cashAfterPaise].every(count)||!finite(e.realizedPaise)||
      !Number.isSafeInteger(e.sourceTradeAt)||!Number.isSafeInteger(e.signalObservedAt)||
      e.sourceTradeAt<=e.signalObservedAt||
      e.executionType!==(expectedMode==='FORWARD'?'HYPOTHETICAL_NEXT_OBSERVED_TRADE':'HISTORICAL_CANDLE_FILL_ASSUMPTION'))fail();
    return{...base,side:e.side,quantity:e.quantity,pricePaise:e.pricePaise,feePaise:e.feePaise,
      realizedPaise:e.realizedPaise,cashAfterPaise:e.cashAfterPaise,sourceTradeAt:e.sourceTradeAt,signalObservedAt:e.signalObservedAt,
      signalBarTime:e.signalBarTime,executionType:e.executionType};
  });
  const days=(Array.isArray(v.days)?v.days:[]).slice(0,200).map(d=>{
    if(!STRATEGIES.includes(d.strategyId)||!/^\d{4}-\d\d-\d\d$/.test(d.date)||!count(d.fills)||
      !finite(d.realizedPnlINR)||!finite(d.feesINR)||d.feesINR<0)fail();
    return{strategyId:d.strategyId,date:d.date,fills:d.fills,realizedPnlINR:d.realizedPnlINR,feesINR:d.feesINR};
  });
  if(!count(v.admittedCycles)||!count(v.skippedCycles)||
    v.sourceObservedAt!==null&&!stamp(v.sourceObservedAt))fail();
  return{schema:'atlas.nse-paper-report.v1',mode:v.mode,observedAt:v.observedAt,source:v.source,
    status:v.status,startedAt:v.startedAt,sourceObservedAt:v.sourceObservedAt,
    classification:v.classification,cashOnly:true,leverage:1,realOrdersEnabled:false,paperOnly:true,
    actualCapitalINR:0,qualified:false,certifiedScalpStormSessions:0,ledgerVerified:true,
    admittedCycles:v.admittedCycles,skippedCycles:v.skippedCycles,universe,sessions,events,days,
    hasMore:v.hasMore===true,costModel:{feeBpsEachSide:10,slippageBpsEachSide:5,
      label:'Illustrative combined costs; actual broker charges and fills are unverified'},
    note:text(v.note)};
}
