// Atlas deterministic read-only daily paper report. The same JSON is published
// to Atlas UI and can be inspected in ChatGPT. Not a brokerage ledger.
// Never fill gaps with invented market prices, equity or transactions.
const INITIAL_CAPITAL=100000;
const TZ='Asia/Kolkata';
const fmt=new Intl.DateTimeFormat('en-GB',{
  timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',
});
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
function when(s){
  if(typeof s!=='string')return null;
  const t=Date.parse(s);
  return Number.isFinite(t)&&t>0?t:null;
}
export function istDay(s){
 const at=when(s);
 if(at===null)throw new Error('Missing or invalid observation timestamp');
 const parts=Object.fromEntries(fmt.formatToParts(at).map(p=>[p.type,p.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
function validMoney(n){return typeof n==='number'&&Number.isFinite(n)}
function dayDelta(a,b){
 return Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z')===86400000;
}
export function buildCloudPaperSummary(report){
 if(!report||report.schema!==1||report.mode!=='SCHEDULED_VIRTUAL_PAPER'
   ||report.currency!=='INR'||report.realOrdersEnabled!==false
   ||report.actualCapitalINR!==0||report.symbol!=='BTCINR'
   ||!Array.isArray(report.sessions)||![0,5].includes(report.sessions.length))
   throw new Error('Untrusted virtual research ledger');
 if(report.sessions.length===0 && !['AWAITING_FIRST_RUN','AWAITING_VALID_SOURCE'].includes(report.status))
   throw new Error('Empty running ledger');
 // Retained observations may never extend beyond the source report's run time.
 const observedAt=when(report.lastRunAt),startedAt=when(report.createdAt);
 if(report.sessions.length && (observedAt===null||startedAt===null||
   startedAt>observedAt+5000||!Number.isSafeInteger(report.runCount)||
   report.runCount<1))
   throw new Error('Invalid cloud-paper run provenance');
 const isWithinRun=at=>at!==null && at>=startedAt-5000 && at<=observedAt+5000;
 const seen=new Set();
 const strategies=report.sessions.map(s=>{
   if(typeof s.strategyId!=='string'||seen.has(s.strategyId)||
     typeof s.strategyName!=='string'||!validMoney(s.virtualEquityINR)||
     !validMoney(s.realizedPnlINR)||!validMoney(s.feesINR)||
     !validMoney(s.maxDrawdownPct)||!Number.isInteger(s.closedTrades)||
     s.closedTrades<0||!Number.isInteger(s.wins)||s.wins<0||
     s.wins>s.closedTrades||!validMoney(s.cashINR)||s.cashINR<0||
     !validMoney(s.quantity)||s.quantity<0||
     !Array.isArray(s.events)||s.events.length>120||
     !Array.isArray(s.equityHistory)||s.equityHistory.length>120)
     throw new Error('Unsafe strategy in virtual ledger');
   seen.add(s.strategyId);
   const days=new Map();
   function dayOf(k){if(!days.has(k))days.set(k,{dayIST:k,checkpoints:0,
     modeledBuys:0,modeledSells:0,modeledFeesINR:0,
     realizedExitPnlINR:0,firstEquityINR:null,lastEquityINR:null,
     lastSnapshotAt:null,events:[]});
     return days.get(k);
   }
   const points=s.equityHistory.map(p=>{
     if(!isWithinRun(when(p?.at))||!validMoney(p.equityINR)||p.equityINR<0)
       throw new Error('Invalid equity observation');
     return p;
   }).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
   for(const p of points){
     const d=dayOf(istDay(p.at));d.checkpoints++;
     if(d.firstEquityINR===null)d.firstEquityINR=round(p.equityINR);
     d.lastEquityINR=round(p.equityINR);d.lastSnapshotAt=p.at;
   }
   for(const e of s.events){
     const quoteAt=when(e?.quoteAt),barAt=when(e?.barClosedAt);
     if(!isWithinRun(quoteAt)||barAt===null||barAt>quoteAt||
       barAt<startedAt-7*86400000||
       !['BUY','SELL'].includes(e.side)||e.mode!=='HYPOTHETICAL_AFTER_OBSERVED_SIGNAL'||
       !validMoney(e.modeledPriceINR)||e.modeledPriceINR<=0||
       !validMoney(e.feeINR)||e.feeINR<0||
       !validMoney(e.quantity)||e.quantity<=0||
       (e.side==='SELL'&&!validMoney(e.realizedPnlINR))||
       (e.side==='BUY'&&e.realizedPnlINR!==null))
       throw new Error('Invalid modeled event');
     const d=dayOf(istDay(e.quoteAt));
     if(e.side==='BUY')d.modeledBuys++;
     else d.modeledSells++;
     d.modeledFeesINR=round(d.modeledFeesINR+e.feeINR);
     if(e.side==='SELL'&&e.realizedPnlINR!==null)
       d.realizedExitPnlINR=round(d.realizedExitPnlINR+e.realizedPnlINR);
     d.events.push({side:e.side,at:e.quoteAt,
       completedBarAt:e.barClosedAt,priceINR:round(e.modeledPriceINR),
       quantity:e.quantity,feeINR:round(e.feeINR),
       realizedPnlINR:e.realizedPnlINR===null?null:round(e.realizedPnlINR),
       note:'HYPOTHETICAL MODELED FILL — not a broker execution'});
   }
   const ordered=[...days.values()].sort((a,b)=>a.dayIST.localeCompare(b.dayIST));
   for(let i=0;i<ordered.length;i++){
     const row=ordered[i],prev=ordered[i-1];
     // P/L is daily only with two consecutive observed calendar days.
     // Seed-day comparison uses the explicitly verified initial balance.
     const seedDay=i===0&&when(report.createdAt)!==null&&
       points.length>0&&points[0].at===report.createdAt&&
       points[0].equityINR===INITIAL_CAPITAL;
     let baseline=null;
     if(seedDay)baseline=INITIAL_CAPITAL;
     else if(prev&&dayDelta(prev.dayIST,row.dayIST)&&prev.lastEquityINR!==null)
       baseline=prev.lastEquityINR;
     row.dayChangeINR=baseline!==null&&row.lastEquityINR!==null
       ?round(row.lastEquityINR-baseline):null;
     row.changeBasis=baseline===null?'NOT_ENOUGH_ADJACENT_CHECKPOINTS'
       :seedDay?'INITIAL_VIRTUAL_BALANCE':'PREVIOUS_CALENDAR_DAY_LAST_SNAPSHOT';
     row.modeledFeesINR=round(row.modeledFeesINR);
   }
   return {strategyId:s.strategyId,strategyName:s.strategyName,status:s.status,
     virtualCapitalINR:INITIAL_CAPITAL,virtualEquityINR:round(s.virtualEquityINR),
     totalModeledPnlINR:round(s.virtualEquityINR-INITIAL_CAPITAL),
     realizedExitPnlINR:round(s.realizedPnlINR),feesINR:round(s.feesINR),
     maxDrawdownPct:round(s.maxDrawdownPct),closedTrades:s.closedTrades,
     winningModeledExits:s.wins,
     observedWinRatePct:s.closedTrades>0?round(s.wins/s.closedTrades*100):null,
     virtualCashINR:round(s.cashINR),
     markedPositionValueINR:round(Math.max(0,s.virtualEquityINR-s.cashINR)),
     openQuantity:s.quantity,
     marginBorrowedINR:0,leverageModel:'NONE',
     modeledUnrealizedResidualINR:round(
       s.virtualEquityINR-INITIAL_CAPITAL-s.realizedPnlINR),
     modeledFillsInRetainedHistory:s.events.length,
     days:ordered.reverse().map(d=>({...d,events:d.events.sort((a,b)=>
       b.at.localeCompare(a.at))}))};
 });
 return {schema:1,mode:'PUBLIC_READ_ONLY_PAPER_DAYBOOK',
   generatedFrom:'frontend/public/cloud-paper.json',currency:'INR',
   source:report.source??null,sourceSymbol:report.symbol,
   interval:report.interval,sourceBarClosedAt:report.lastBarClosedAt??null,
   lastAttemptAt:report.lastRunAt??null,status:report.status,
   virtualCapitalPerIndependentStrategyINR:INITIAL_CAPITAL,
   actualCapitalINR:0,realOrdersEnabled:false,
   strategyAccountsAreIndependent:true,runCount:report.runCount,
   skippedIntervals:report.skippedIntervals??0,alert:report.alert??null,
   strategies,disclaimer:'Read-only hypothetical research, not actual holdings, fills, profit or investment advice. Day changes require consecutive checkpoints; unavailable days remain null. Retained event history is bounded.'};
}
