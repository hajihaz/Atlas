/** Private owner CSV export: raw ETF research only, never certified returns. */
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const day=process.argv[2],destination=process.argv[3];
if(!/^\d{4}-\d\d-\d\d$/.test(day||'')||!destination)throw Error('Usage: export-etf-raw-report.mjs YYYY-MM-DD /private/path.csv');
const token=execFileSync('security',['find-generic-password','-a','atlas-private-desk','-s','atlas-free-cloud-paper-owner','-w'],
 {encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
const url='https://atlas-free-cloud-paper.kuddosahib.workers.dev/api/cloud-paper/etf-raw-research?day='+day;
const response=await fetch(url,{headers:{Authorization:'Bearer '+token}});
if(response.status!==200)throw Error('Private report HTTP '+response.status);
const report=await response.json();
if(report.schema!=='atlas.raw-etf-research.v1'||report.sourceDay!==day||report.realOrdersEnabled!==false||
 report.evidenceClass!=='RETROSPECTIVE_RAW_UNADJUSTED_NOT_FORWARD_OR_STRATEGY_CERTIFIED'||
 !Array.isArray(report.results)||report.results.length!==2)throw Error('Report is not the expected raw-price research');
const columns=['row_type','strategy_id','source_day','source_first_day','source_last_day','evidence_class',
 'adjustment_certified','forward_paper_fills','closed_trades','wins','win_rate_pct','modeled_net_pnl_inr',
 'estimated_fees_inr','max_drawdown_pct','entry_day','exit_day','symbol','quantity','entry_price_inr',
 'exit_price_inr','trade_net_pnl_inr','exit_reason'];
const csv=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const rows=[];
for(const result of report.results){
 if(result.adjustmentCertified!==false||result.forwardPaperFills!==0||!Array.isArray(result.trades))throw Error('Unexpected certification claim');
 const common={strategy_id:result.strategyId,source_day:day,source_first_day:result.sourceFirstDay,
  source_last_day:result.sourceLastDay,evidence_class:report.evidenceClass,adjustment_certified:false,
  forward_paper_fills:0};
 rows.push({row_type:'SUMMARY',...common,closed_trades:result.closedTrades,wins:result.wins,
  win_rate_pct:result.winRatePct,modeled_net_pnl_inr:result.netPnlINR,
  estimated_fees_inr:result.estimatedFeesINR,max_drawdown_pct:result.maxDrawdownPct});
 for(const trade of result.trades)rows.push({row_type:'TRADE',...common,entry_day:trade.entryDay,
  exit_day:trade.exitDay,symbol:trade.symbol??'NIFTYBEES',quantity:trade.quantity,
  entry_price_inr:trade.entryPriceINR,exit_price_inr:trade.exitPriceINR,
  trade_net_pnl_inr:trade.netPnlPaise==null?'':trade.netPnlPaise/100,exit_reason:trade.exitReason});
}
writeFileSync(destination,columns.join(',')+'\n'+rows.map(row=>columns.map(column=>csv(row[column])).join(',')).join('\n')+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({day,rows:rows.length,destination,evidenceClass:report.evidenceClass}));
