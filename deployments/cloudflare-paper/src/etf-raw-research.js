/** Retrospective raw-price ETF simulations. Unadjusted data cannot certify either rule. */
import {readValidatedEtfSeries} from './etf-daily-archive.js';
const INITIAL=10000000,SLIP=5,FEE=10;
const fail=reason=>{const e=Error('ETF_RESEARCH_BLOCKED: '+reason);e.atlasDiagnostic='ETF research '+reason;throw e;};
const paise=x=>Math.round(x*100);
const buy=x=>Math.ceil(paise(x)*(10000+SLIP)/10000);
const sell=x=>Math.floor(paise(x)*(10000-SLIP)/10000);
const fee=(qty,px)=>Math.ceil(qty*px*FEE/10000);
const sma=(bars,i,n)=>bars.slice(i-n+1,i+1).reduce((sum,b)=>sum+b.close,0)/n;
function rsi2(bars,i){
 const a=bars[i].close-bars[i-1].close,b=bars[i-1].close-bars[i-2].close;
 const gain=Math.max(a,0)+Math.max(b,0),loss=Math.max(-a,0)+Math.max(-b,0);
 return loss===0?(gain===0?50:100):100-100/(1+gain/loss);
}
function atr14(bars,i){let total=0;for(let j=i-13;j<=i;j++){
 const b=bars[j],prior=bars[j-1].close;
 total+=Math.max(b.high-b.low,Math.abs(b.high-prior),Math.abs(b.low-prior));
 }return total/14;}
function drawdown(values){let peak=INITIAL,worst=0;for(const value of values){
  peak=Math.max(peak,value);worst=Math.max(worst,(peak-value)/peak);
 }return Math.round(worst*10000)/100;}
const finish=(id,dates,trades,cash,markValue,fees,equityPath,extra={})=>{
 const closed=trades.filter(x=>x.exitDay),wins=closed.filter(x=>x.netPnlPaise>0).length;
 return {strategyId:id,status:'MODELED_RAW_PRICE_NOT_QUALIFIED',evidenceClass:'RETROSPECTIVE_UNADJUSTED_ETF_PRICES',
  sourceFirstDay:dates[0],sourceLastDay:dates.at(-1),initialCapitalINR:INITIAL/100,
  closedTrades:closed.length,wins,winRatePct:closed.length?Math.round(wins/closed.length*10000)/100:null,
  netPnlINR:Math.round((cash+markValue-INITIAL))/100,realizedPnlINR:Math.round(cash-INITIAL+trades.filter(x=>!x.exitDay).reduce((n,x)=>n+x.entryCostPaise,0))/100,
  estimatedFeesINR:fees/100,maxDrawdownPct:drawdown(equityPath),openPositions:trades.filter(x=>!x.exitDay).length,
  costModel:'5 bps adverse price slippage and 10 bps fee per side; taxes and market impact excluded',
  adjustmentCertified:false,forwardPaperFills:0,trades:trades.slice(-50),...extra};
};

export function simulateRsi2(bars){
 if(!Array.isArray(bars)||bars.length<202)fail('RSI2 warmup');
 let cash=INITIAL,fees=0;const trades=[],equity=[INITIAL];
 for(let i=199;i<bars.length-1;i++){
  if(!(bars[i].close>sma(bars,i,200)&&rsi2(bars,i)<5))continue;
  const entryDay=bars[i+1],entry=buy(entryDay.open),stop=paise(entryDay.open-3*atr14(bars,i));
  if(stop<=0||stop>=entry)continue;
  const estimatedLoss=entry-stop+Math.ceil(entry*2*(SLIP+FEE)/10000);
  const qty=Math.min(Math.floor(4000000/(entry*1.001)),Math.floor(50000/estimatedLoss),Math.floor(cash/(entry*1.001)));
  if(qty<1)continue;
  const entryFee=fee(qty,entry),entryCost=qty*entry+entryFee;
  if(entryCost>cash)continue;
  cash-=entryCost;fees+=entryFee;
  const trade={entryDay:entryDay.day,entryPriceINR:entry/100,entryCostPaise:entryCost,quantity:qty,
   stopINR:stop/100,exitDay:null,exitReason:null,netPnlPaise:null};
  let exitIndex=null,exitPrice=null,reason=null;
  for(let j=i+1;j<bars.length;j++){
   if(j>i+1&&(bars[j-1].close>sma(bars,j-1,5)||j-(i+1)>=10)){
    exitIndex=j;exitPrice=sell(bars[j].open);reason='NEXT_OPEN_RECOVERY_OR_TIME';break;
   }
   if(bars[j].low*100<=stop){exitIndex=j;exitPrice=sell(Math.min(bars[j].open,stop/100));reason='ATR_STOP_OR_GAP';break;}
  }
  if(exitIndex===null){trades.push(trade);break;}
  const exitFee=fee(qty,exitPrice),proceeds=qty*exitPrice-exitFee;
  cash+=proceeds;fees+=exitFee;
  Object.assign(trade,{exitDay:bars[exitIndex].day,exitPriceINR:exitPrice/100,
   exitReason:reason,netPnlPaise:proceeds-entryCost,entryCostPaise:undefined});
  trades.push(trade);equity.push(cash);i=exitIndex-1;
 }
 const last=bars.at(-1),open=trades.find(x=>!x.exitDay),mark=open?open.quantity*sell(last.close)-fee(open.quantity,sell(last.close)):0;
 return finish('rsi2_snapback',bars.map(x=>x.day),trades,cash,mark,fees,[...equity,cash+mark],
  {stopModel:'3 x prior ATR14; gap at next observed open; max 10 sessions; maximum ₹500 planned loss'});
}

export function simulateDualMomentum(nifty,gold){
 if(!Array.isArray(nifty)||!Array.isArray(gold)||nifty.length<128||nifty.length!==gold.length||
  nifty.some((x,i)=>x.day!==gold[i].day))fail('aligned ETF daily history missing');
 const bySymbol={NIFTYBEES:nifty,GOLDBEES:gold};
 let cash=INITIAL,fees=0,holding=null;const trades=[],equity=[INITIAL];
 for(let i=126;i<nifty.length-1;i++){
  if(nifty[i].day.slice(0,7)===nifty[i+1].day.slice(0,7))continue;
  const rn=nifty[i].close/nifty[i-126].close-1,rg=gold[i].close/gold[i-126].close-1;
  const choice=Math.max(rn,rg)<=0?'CASH':rn>=rg?'NIFTYBEES':'GOLDBEES';
  const next=i+1;
  if(holding&&holding.symbol!==choice){
   const px=sell(bySymbol[holding.symbol][next].open),exitFee=fee(holding.qty,px),proceeds=holding.qty*px-exitFee;
   cash+=proceeds;fees+=exitFee;
   Object.assign(holding.trade,{exitDay:nifty[next].day,exitPriceINR:px/100,exitReason:'MONTHLY_ROTATION',
    netPnlPaise:proceeds-holding.entryCostPaise,entryCostPaise:undefined});
   holding=null;
  }
  if(choice!=='CASH'&&!holding){
   const px=buy(bySymbol[choice][next].open),qty=Math.floor(Math.min(cash*0.8,cash)/(px*1.001));
   if(qty>0){const entryFee=fee(qty,px),entryCost=qty*px+entryFee;
    if(entryCost<=cash){cash-=entryCost;fees+=entryFee;
     const trade={entryDay:nifty[next].day,entryPriceINR:px/100,quantity:qty,symbol:choice,
      entryCostPaise:entryCost,exitDay:null,exitReason:null,netPnlPaise:null};
     holding={symbol:choice,qty,entryCostPaise:entryCost,trade};trades.push(trade);}
   }
  }
  const mark=holding?holding.qty*sell(bySymbol[holding.symbol][next].close)-fee(holding.qty,sell(bySymbol[holding.symbol][next].close)):0;
  equity.push(cash+mark);
 }
 const mark=holding?holding.qty*sell(bySymbol[holding.symbol].at(-1).close)-fee(holding.qty,sell(bySymbol[holding.symbol].at(-1).close)):0;
 return finish('dual_momentum_rotation',nifty.map(x=>x.day),trades,cash,mark,fees,[...equity,cash+mark],
  {currentSelection:holding?.symbol??'CASH',allocationRule:'80% maximum exposure, six-month 126-session momentum, next-session open'});
}

export async function runRawEtfResearch(env,day,clock=()=>Date.now()){
 if(!/^\d{4}-\d\d-\d\d$/.test(day||'')||!env.HISTORY_DB)fail('invalid dated research request');
 const db=env.HISTORY_DB;
 const old=await db.prepare('SELECT * FROM etf_raw_research_runs WHERE source_day=?').bind(day).first();
 if(old)return {status:'VERIFIED_EXISTING',...validatedReport(old,day)};
 const [n,g]=await Promise.all([readValidatedEtfSeries(env,day,'NIFTYBEES'),readValidatedEtfSeries(env,day,'GOLDBEES')]);
 const results=[simulateRsi2(n.bars),simulateDualMomentum(n.bars,g.bars)];
 const report={schema:'atlas.raw-etf-research.v1',sourceDay:day,completedAt:new Date(clock()).toISOString(),
  evidenceClass:'RETROSPECTIVE_RAW_UNADJUSTED_NOT_FORWARD_OR_STRATEGY_CERTIFIED',
  sourceHashes:{NIFTYBEES:n.proof.intradaySha256||n.proof.historicalSha256,
   GOLDBEES:g.proof.intradaySha256||g.proof.historicalSha256},
  sourceReceiptHashes:{NIFTYBEES:{historical:n.proof.historicalSha256,intraday:n.proof.intradaySha256,actions:n.proof.actionsSha256},
   GOLDBEES:{historical:g.proof.historicalSha256,intraday:g.proof.intradaySha256,actions:g.proof.actionsSha256}},
  results,realOrdersEnabled:false};
 await db.prepare('INSERT OR IGNORE INTO etf_raw_research_runs(source_day,completed_ms,nifty_sha256,gold_sha256,result_json) VALUES(?,?,?,?,?)')
  .bind(day,Date.parse(report.completedAt),report.sourceHashes.NIFTYBEES,report.sourceHashes.GOLDBEES,JSON.stringify(report)).run();
 const saved=await db.prepare('SELECT * FROM etf_raw_research_runs WHERE source_day=?').bind(day).first();
 if(!saved||saved.nifty_sha256!==report.sourceHashes.NIFTYBEES||saved.gold_sha256!==report.sourceHashes.GOLDBEES)fail('research receipt conflict');
 return {status:'MODELED_RAW_PRICE',...validatedReport(saved,day)};
}
function validatedReport(row,day){
 let report;try{report=JSON.parse(row.result_json)}catch{fail('stored report JSON changed')}
 if(report?.schema!=='atlas.raw-etf-research.v1'||report.sourceDay!==day||
  report.realOrdersEnabled!==false||report.evidenceClass!=='RETROSPECTIVE_RAW_UNADJUSTED_NOT_FORWARD_OR_STRATEGY_CERTIFIED'||
  report.sourceHashes?.NIFTYBEES!==row.nifty_sha256||report.sourceHashes?.GOLDBEES!==row.gold_sha256||
  !/^[a-f0-9]{64}$/.test(row.nifty_sha256)||!/^[a-f0-9]{64}$/.test(row.gold_sha256)||
  !Array.isArray(report.results)||report.results.length!==2||
  report.results.map(x=>x.strategyId).join('|')!=='rsi2_snapback|dual_momentum_rotation'||
  report.results.some(x=>x.adjustmentCertified!==false||x.forwardPaperFills!==0||
   x.status!=='MODELED_RAW_PRICE_NOT_QUALIFIED'||!Number.isFinite(x.netPnlINR)||
   !Number.isFinite(x.maxDrawdownPct)||!Array.isArray(x.trades)))fail('stored report manifest changed');
 return report;
}
export async function readRawEtfResearch(env,day){
 if(!/^\d{4}-\d\d-\d\d$/.test(day||'')||!env.HISTORY_DB)fail('invalid report day');
 const row=await env.HISTORY_DB.prepare('SELECT * FROM etf_raw_research_runs WHERE source_day=?').bind(day).first();
 return row?{status:'VERIFIED_EXISTING',...validatedReport(row,day)}:{status:'MISSING',sourceDay:day,realOrdersEnabled:false};
}
