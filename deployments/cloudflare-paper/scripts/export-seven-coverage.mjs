/** Private, spreadsheet-ready evidence inventory. Empty performance cells are intentional. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';

const [output,auditFile]=process.argv.slice(2);
if(!output||!auditFile)throw Error('usage: export-seven-coverage.mjs output.csv audited-replay.json');
const token=execFileSync('security',['find-generic-password','-a','atlas-private-desk',
 '-s','atlas-free-cloud-paper-owner','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
if(token.length<32)throw Error('private owner credential missing');
const response=await fetch('https://atlas-free-cloud-paper.kuddosahib.workers.dev/api/cloud-paper/data-availability',
 {headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error('private cloud availability failed');
const inventory=await response.json(),audit=JSON.parse(readFileSync(auditFile,'utf8'));
if(audit.evidenceClass!=='RETROSPECTIVE_REPLAY_NOT_FORWARD_FILL'||
 audit.sourceDay!=='2026-11-03'||audit.paperFills!==0)throw Error('local replay audit mismatch');
const strategies=['scalpstorm_x','scalpstorm_x2','scalpstorm_x3','scalpstorm_xtreme',
 'vwap_precision','rsi2_snapback','dual_momentum_rotation'];
const byDay=key=>new Map(inventory[key].dates.map(x=>[x.day,x]));
const full=byDay('full_0940'),nifty=byDay('nifty_open'),live=byDay('live_minute');
const escape=x=>{const s=String(x??'');const safe=/^[=+@-]/.test(s)?"'"+s:s;return '"'+safe.replaceAll('"','""')+'"'};
const rows=[['date','strategy','minute_symbols','bars_per_symbol_min','bars_per_symbol_max',
 'full_0940_captured','full_0940_eligible','nifty_open_bars','live_minutes',
 'research_status','symbols_evaluated','retrospective_signals','retrospective_no_trade',
 'forward_paper_fills','net_pnl_inr','win_rate_pct','evidence_class']];
for(const minute of inventory.minute.dates){
 const day=minute.day,coverage=full.get(day),open=nifty.get(day),liveDay=live.get(day);
 for(const id of strategies){
  let status='REQUIRED_POINT_IN_TIME_CONTEXT_NOT_CERTIFIED',evaluated='',signals='',noTrade='',fills='',evidence='FIXED_TEN_STOCK_MINUTE_SAMPLE';
  if(id==='rsi2_snapback'||id==='dual_momentum_rotation')status='ADJUSTED_ETF_HISTORY_MISSING';
  else if(day===audit.sourceDay){
   const counts=audit.summary[id]||{};
   status=counts.RETROSPECTIVE_NO_TRADE===10?'RETROSPECTIVE_NO_TRADE':
    counts.WAITING_REQUIRED_CONTEXT===10?'WAITING_REQUIRED_CONTEXT':'UNVERIFIED';
   evaluated=counts.RETROSPECTIVE_NO_TRADE===10?10:0;
   noTrade=counts.RETROSPECTIVE_NO_TRADE??'';
   signals=0;fills=0;evidence='ACTUAL_0940_TOP_TEN_RETROSPECTIVE_NOT_FORWARD';
  }
  rows.push([day,id,minute.symbols,minute.min_bars,minute.max_bars,
   coverage?.captured??'',coverage?.eligible??'',open?.bars??'',liveDay?.minutes??'',
   status,evaluated,signals,noTrade,fills,'','',evidence]);
 }
}
writeFileSync(output,rows.map(row=>row.map(escape).join(',')).join('\n')+'\n',{mode:0o600});
console.log(JSON.stringify({output,sourceAsOf:inventory.as_of,dates:inventory.minute.days,
 rows:rows.length-1,verifiedMinuteBars:inventory.minute.dates
 .filter(x=>x.symbols===10&&x.min_bars===375&&x.max_bars===375).length*10*375,
 performanceClaim:false}));
