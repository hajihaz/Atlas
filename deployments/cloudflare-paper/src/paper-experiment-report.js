/** Read-only experiment reporting. Never estimates a missing market price or changes a fill. */
import {SEVEN_RISK_POLICY} from './seven-paper-ledger.js';
const money=n=>n/100,day=t=>new Date(t+19800000).toISOString().slice(0,10);
const exits=new Set(['RISK_STOP','RISK_TARGET','MANDATORY_1515_EXIT','CARRYOVER_RECOVERY']);
export function paperExperimentReport(state){
 const fills=[...state.fills].sort((a,b)=>a.tradeAt-b.tradeAt),open=new Map(),closed=[],daily=new Map();
 let complete=fills.length<1000,fees=0,pnl=0,peak=0,drawdown=0;
 for(const f of fills){
  if(!Number.isSafeInteger(f.tradeAt)||!Number.isSafeInteger(f.pnlPaise)||!Number.isSafeInteger(f.feePaise)||f.feePaise<0||
    !Number.isSafeInteger(f.qty)||f.qty<1||!Number.isSafeInteger(f.pricePaise)||f.pricePaise<1||!['BUY','SELL'].includes(f.side))throw Error('PAPER_REPORT_BLOCKED: invalid fill');
  fees+=f.feePaise;pnl+=f.pnlPaise;
  const d=day(f.tradeAt),r=daily.get(d)||{day:d,fills:0,feesINR:0,realizedPnlINR:0};
  r.fills++;r.feesINR=money(Math.round(r.feesINR*100)+f.feePaise);r.realizedPnlINR=money(Math.round(r.realizedPnlINR*100)+f.pnlPaise);daily.set(d,r);
  const entry=open.get(f.symbol);
  if(entry){
   if(entry.side===f.side||f.qty>entry.remaining){complete=false;continue;}
   entry.remaining-=f.qty;entry.netPnl+=f.pnlPaise;entry.exitFees+=f.feePaise;
   if(entry.remaining===0){
    closed.push({symbol:f.symbol,entryAt:new Date(entry.tradeAt).toISOString(),exitAt:new Date(f.tradeAt).toISOString(),
     quantity:entry.qty,netPnlINR:money(entry.netPnl),feesINR:money(entry.feePaise+entry.exitFees),exitReason:f.reason});
    open.delete(f.symbol);
   }
   peak=Math.max(peak,pnl);drawdown=Math.max(drawdown,peak-pnl);
  }else if(exits.has(f.reason)||f.positionEffect==='REDUCE'){complete=false;}
  else open.set(f.symbol,{...f,remaining:f.qty,netPnl:0,exitFees:0});
 }
 if(fees!==state.feesPaise||pnl!==state.realizedPaise||open.size!==Object.keys(state.positions).length)complete=false;
 for(const [symbol,p] of Object.entries(state.positions))if(open.get(symbol)?.remaining!==p.qty)complete=false;
 const wins=closed.filter(t=>t.netPnlINR>0).length,losses=closed.filter(t=>t.netPnlINR<0).length;
 const positive=closed.reduce((n,t)=>n+Math.max(0,t.netPnlINR),0),negative=-closed.reduce((n,t)=>n+Math.min(0,t.netPnlINR),0);
 return {schema:'atlas.paper-experiment.v1',evidenceClass:'FORWARD_PAPER_LEDGER_NOT_REAL_TRADES',
  decisionEngine:'DETERMINISTIC_RULES',settingsLocked:true,currentRiskPolicy:SEVEN_RISK_POLICY,
  recordedPolicyVersions:[...new Set(fills.map(f=>f.riskPolicyVersion||'UNRECORDED'))],
  historyComplete:complete,feesPaidINR:money(state.feesPaise),
  costModel:'Modeled 0.10% fee per fill plus 0.05% adverse price adjustment; not a broker/tax bill.',
  equityINR:Object.keys(state.positions).length?null:money(state.cashPaise),
  unrealizedPnlINR:Object.keys(state.positions).length?null:0,
  closedTrades:complete?closed.length:null,wins:complete?wins:null,losses:complete?losses:null,
  breakeven:complete?closed.length-wins-losses:null,winRatePct:complete&&closed.length?100*wins/closed.length:null,
  profitFactor:complete&&negative>0?positive/negative:null,
  maxClosedPnlDrawdownINR:complete&&closed.length?money(drawdown):null,
  realizedPnlSeries:complete?fills.filter(f=>f.positionEffect==='REDUCE'||exits.has(f.reason)).map(f=>({at:new Date(f.tradeAt).toISOString(),symbol:f.symbol,netPnlINR:money(f.pnlPaise)})):[],
  daily:complete?[...daily.values()]:[],closedTradesJournal:complete?closed.slice(-100):[],
  openPositions:Object.entries(state.positions).map(([symbol,p])=>({symbol,quantity:p.qty,direction:p.direction||'LONG',
   entryPriceINR:money(p.entryPricePaise),openedAt:new Date(p.openedAt).toISOString(),riskPolicyVersion:p.riskPolicyVersion})),
  pending:Object.values(state.pending).map(p=>({symbol:p.symbol,side:p.side,reason:typeof p.reason==='string'?p.reason:'UNRECORDED_REASON',createdAt:new Date(p.createdAt).toISOString()})),
  note:'Open positions are unpriced here. Win rate uses matched closed trades only; drawdown uses closed P/L only. Policy changes are shown explicitly.'};
}
