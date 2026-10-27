import {useEffect,useMemo,useState} from 'react';
import {ArrowDownRight,ArrowUpRight,Clock3,ShieldCheck} from 'lucide-react';
import '../owner-strategy.css';

type Fill={type:string;phase?:string;at:number;date:string;symbol?:string;side?:string;quantity?:number;pricePaise?:number;feePaise?:number;realizedPaise?:number};
type Choice={rank:number;symbol:string;volume:number;volumeAsOf:string;selectionPrice:number};
type Decision={action:string;reason:string;nifty?:{trend:string;side:string;changePct:number};eligibleCount?:number};
type Day={date:string;status:string;startingEquityPaise:number;endingEquityPaise?:number;realizedPaise:number;feesPaise:number;fills:number;decision:Decision|null;selection:Choice[]|null};
type Position={symbol:string;side:string;quantity:number;entryPricePaise:number;markPaise:number;markAt:string;entryAt:number};
type Period={period:string;recordedSessions?:number;completedSessions:number;incompleteSessions?:number;netPnlINR:number;returnPct:number|null;feesINR:number;fills:number};
type Report={schema:string;strategyId:string;mode:string;observedAt:string;sourceObservedAt:string|null;status:string;paperOnly:boolean;realOrdersEnabled:boolean;actualCapitalINR:number;virtualCapitalINR:number;allocationPerStockINR:number;cashINR:number;equityINR:number;realizedPnlINR:number;netPnlINR:number;feesINR:number;fills:number;positions:Position[];days:Day[];monthly:Period[];yearly:Period[];events:Fill[];ledgerVerified:boolean;costModel:string;ranking:{eligibleCount:number;asOf:string;selected:Choice[]}|null;nifty:{trend:string;changePct:number;side:string}|null};
type Bar={time:string;open:number;high:number;low:number;close:number;volume:number};
type HistoryCoverage={date:string;universeCount:number;observedCount:number;missingCount:number};
type History={schema:string;observedAt:string;realOrdersEnabled:boolean;actualCapitalINR:number;prices:{instrumentKey:string;symbol:string;bars:Bar[];firstDate:string|null;lastDate:string|null;source:string};strategyCoverage:{period:string;status:string;reason:string;completedSessions:number|null;netPnlINR:number|null}[];replay?:{scope:string;status:string;days:Day[];events:Fill[];monthly:Period[];yearly:Period[];netPnlINR:number|null;notes:string[];coverageByDay?:HistoryCoverage[]}};
const money=(v:number|null|undefined)=>v===null||v===undefined?'—':new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(v);
const when=(v:string|number|null|undefined)=>v?new Date(v).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})+' IST':'—';
const whole=(v:number)=>v.toLocaleString('en-IN');
function validReport(v:unknown):v is Report{
 if(!v||typeof v!=='object')return false;const x=v as Report;
 return x.schema==='atlas.scalpstorm-owner-report.v1'&&x.strategyId==='scalpstorm_x_0940'&&x.mode==='FORWARD'&&x.paperOnly===true&&x.realOrdersEnabled===false&&x.actualCapitalINR===0&&x.ledgerVerified===true&&[x.cashINR,x.equityINR,x.netPnlINR,x.feesINR].every(Number.isFinite)&&Array.isArray(x.days)&&Array.isArray(x.positions)&&Array.isArray(x.events);
}
function useOwnerReport(){
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState('');
 useEffect(()=>{
  let active=true,busy=false;let controller:AbortController|null=null;
  const refresh=async()=>{if(busy||document.hidden)return;busy=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),8000);
   try{const r=await fetch('/api/scalpstorm-owner',{cache:'no-store',credentials:'omit',signal:controller.signal});if(!r.ok)throw Error();const data:unknown=await r.json();if(!validReport(data))throw Error();if(active){setReport(data);setError('');}}
   catch{if(active)setError('Latest observation unavailable. The last verified account is preserved.');}
   finally{clearTimeout(timeout);busy=false;}
  };void refresh();const timer=setInterval(()=>void refresh(),2000);const focus=()=>void refresh();document.addEventListener('visibilitychange',focus);
  return()=>{active=false;controller?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',focus);};
 },[]);return {report,error};
}
function PriceHistory({history}:{history:History|null}){
 const [range,setRange]=useState('1M');
 const rows=useMemo(()=>{const all=history?.prices.bars??[];const years=range==='10Y'?10:range==='5Y'?5:range==='1Y'?1:0;const start=new Date();if(years)start.setFullYear(start.getFullYear()-years);else start.setMonth(start.getMonth()-1);return all.filter(x=>Date.parse(x.time)>=start.getTime());},[history,range]);
 const plot=useMemo(()=>{if(!rows.length)return '';const step=Math.max(1,Math.ceil(rows.length/500));const sampled=rows.filter((_,i)=>i%step===0);if(sampled.at(-1)!==rows.at(-1))sampled.push(rows.at(-1)!);const min=Math.min(...sampled.map(x=>x.close)),max=Math.max(...sampled.map(x=>x.close)),span=max-min||1;return sampled.map((x,i)=>(i?'L':'M')+(16+i*868/Math.max(1,sampled.length-1)).toFixed(2)+','+(190-(x.close-min)*166/span).toFixed(2)).join(' ');},[rows]);
 return <section className="panel owner-history"><div className="owner-section-heading"><div><small>MARKET PRICE HISTORY</small><h2>Nifty 50</h2></div><div className="market-switch" aria-label="Price history period">{['1M','1Y','5Y','10Y'].map(r=><button key={r} type="button" aria-pressed={r===range} className={r===range?'active':''} onClick={()=>setRange(r)}>{r}</button>)}</div></div>
  {rows.length?<><svg viewBox="0 0 900 215" role="img" aria-label={'Nifty 50 actual source closing prices, '+range}><path d="M16 24H884 M16 107H884 M16 190H884" stroke="currentColor" opacity=".1"/><path d={plot} fill="none" stroke="var(--accent,#36b38a)" strokeWidth="2.5"/></svg><div className="owner-chart-caption"><span>{rows[0].time.slice(0,10)} → {rows.at(-1)!.time.slice(0,10)}</span><strong>{rows.at(-1)!.close.toLocaleString('en-IN')} points</strong><span>{whole(rows.length)} daily observations</span></div></>:<p className="nse-empty">Source history is being checked. No price series is generated.</p>}
  <p className="owner-footnote">Actual daily source prices. A price chart is separate from an intraday strategy backtest.</p>
 </section>;
}
function PeriodResults({monthly=[],yearly=[]}:{monthly?:Period[];yearly?:Period[]}){
 const [range,setRange]=useState<'monthly'|'yearly'>('monthly');const rows=range==='monthly'?monthly:yearly;
 return <><div className="owner-section-heading"><h3>Recorded {range==='monthly'?'months':'years'}</h3><div className="market-switch"><button type="button" aria-pressed={range==='monthly'} onClick={()=>setRange('monthly')}>Month</button><button type="button" aria-pressed={range==='yearly'} onClick={()=>setRange('yearly')}>Year</button></div></div>{rows.length?<div className="nse-table-scroll"><table className="nse-trades-table"><thead><tr><th>Period</th><th>Sessions</th><th>Net paper P/L</th><th>Return</th><th>Costs</th></tr></thead><tbody>{rows.map(r=><tr key={r.period}><td>{r.period}</td><td>{r.recordedSessions??r.completedSessions} recorded · {r.completedSessions} complete</td><td>{money(r.netPnlINR)}</td><td>{r.returnPct===null?'—':r.returnPct.toFixed(2)+'%'}</td><td>{money(r.feesINR)}</td></tr>)}</tbody></table></div>:<p className="nse-empty">No completed sessions in this account yet.</p>}<p className="owner-footnote">All recorded days are included, including marks from unresolved positions. These are account changes, not realized-only returns or complete calendar months and years.</p></>;
}
function SessionCoverage({day,coverage}:{day:string;coverage:HistoryCoverage[]|undefined}){
 const row=coverage?.find(x=>x.date===day);return row?<small>Pre-entry candles: {whole(row.observedCount)} of {whole(row.universeCount)} stocks; {whole(row.missingCount)} unknown</small>:null;
}
function StrategyContent(){
 const {report,error}=useOwnerReport();const [history,setHistory]=useState<History|null>(null),[day,setDay]=useState(''),[detail,setDetail]=useState<Report|null>(null),[period,setPeriod]=useState('ALL');
 useEffect(()=>{
  let active=true,busy=false;let controller:AbortController|null=null;
  const refresh=async()=>{if(busy||document.hidden)return;busy=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),8000);
   try{const r=await fetch('/api/scalpstorm-history',{cache:'no-store',credentials:'omit',signal:controller.signal});if(!r.ok)return;const d:History=await r.json();if(active&&d.schema==='atlas.scalpstorm-history.v1'&&d.realOrdersEnabled===false&&d.actualCapitalINR===0&&Array.isArray(d.prices?.bars))setHistory(d);}
   catch{/* Retain the dated source history. */}finally{clearTimeout(timeout);busy=false;}
  };void refresh();const timer=setInterval(()=>void refresh(),300000);const visible=()=>void refresh();document.addEventListener('visibilitychange',visible);
  return()=>{active=false;controller?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[]);
 useEffect(()=>{setDetail(null);if(!day)return;const controller=new AbortController();fetch('/api/scalpstorm-owner?date='+encodeURIComponent(day),{cache:'no-store',credentials:'omit',signal:controller.signal}).then(r=>r.ok?r.json():null).then(d=>{if(validReport(d))setDetail(d);}).catch(()=>{});return()=>controller.abort();},[day]);
 const days=report?.days??[];const availablePeriods=Array.from(new Set(days.map(d=>d.date.slice(0,7))));const shownDays=period==='ALL'?days:days.filter(d=>d.date.startsWith(period));
 const currentDay=days[0];const chosen=day?days.find(d=>d.date===day):currentDay;
 const selection=chosen?(chosen.selection??[]):(report?.ranking?.selected??[]);
 const selectedNifty=chosen?(chosen.decision?.nifty??null):report?.nifty;
 const events=(day?detail?.events:report?.events)?.filter(e=>e.type==='FILL'&&(!day||e.date===day))??[];
 const status=report?.status==='MARKET_CLOSED'?'Market closed':report?.status==='WAITING_0940'?'Ready for 9:40 a.m.':report?.status==='OPEN_POSITIONS'?'Paper positions open':report?.status==='SESSION_COMPLETE'?'Session complete':report?.status==='NO_TRADE'?'No trade recorded':report?.status==='SOURCE_UNAVAILABLE'?'Source observation paused':report?.status==='NO_FILLED_ENTRIES'?'No eligible entries filled':'Waiting for a fresh trade';
 return <section className="owner-strategy-page"><div className="sub-page-header"><div className="breadcrumb">ATLAS / NSE PAPER STRATEGY</div><h1>ScalpStorm X<span className="period">.</span></h1><p>One strategy. Ten volume leaders. A single ₹1,00,000 virtual account.</p></div>
  <div className="owner-rule-strip panel"><span><Clock3 size={16}/><strong>9:30</strong> Nifty direction</span><span><strong>9:40</strong> Top-volume entry</span><span><strong>3:15</strong> Target exit</span><span><ShieldCheck size={16}/> Paper trading</span></div>
  <div className="owner-section-heading"><span className="owner-status" role="status">{report?status:'Reading the owner account…'}</span><small>{report?'Source '+when(report.sourceObservedAt):''}</small></div>
  {error&&<p className="owner-footnote" role="status">{error}</p>}
  {!!report?.positions.length&&report.status==='MARKET_CLOSED'&&<p className="owner-footnote" role="status">Session incomplete: {report.positions.length} paper positions remain open after the target exit. Account equity includes their last accepted marks; these are not closing prices or a final session return. No new entries are allowed until unresolved positions close.</p>}
  <div className="owner-account-grid">{[['Virtual capital',report?.virtualCapitalINR],['Account equity',report?.equityINR],['Cash available',report?.cashINR],['Net paper P/L',report?.netPnlINR],['Recorded fills',report?.fills],['Modeled costs',report?.feesINR]].map(([label,value])=><div className="panel owner-account-card" key={String(label)}><small>{label}</small><strong>{label==='Recorded fills'?(value===undefined?'—':whole(Number(value))):money(value as number|undefined)}</strong></div>)}</div>
  <section className="panel owner-protocol"><h2>Trading rules</h2><p>NSE regular cash equities ranked by cumulative share volume observed before 9:40. Up to ten ₹10,000 allocations; whole shares and remaining cash. Nifty change at 9:30 uses its source-reported previous close: above +0.2% bullish/buy; −0.2% to +0.2% moderate/buy; below −0.2% bearish/paper sell.</p><p>Entries require a subsequent fresh trade and visible bid/ask liquidity. Exit requests begin at 3:15; unfilled exits stay visible. Paper shorts reserve full cash collateral and lock sale proceeds. {report?.costModel??'Execution costs and slippage are modeled, with source timing retained.'}</p></section>
  <section className="panel owner-selection"><div className="owner-section-heading"><div><small>DAILY SELECTION</small><h2>{chosen?.date??'Today’s volume leaders'}</h2></div>{selectedNifty&&<span>{selectedNifty.trend} · {selectedNifty.changePct.toFixed(2)}% Nifty</span>}</div>
   {selection.length?<div className="nse-table-scroll"><table className="nse-trades-table"><thead><tr><th>Rank</th><th>Stock</th><th>Observed volume</th><th>Volume timestamp</th><th>Target allocation</th></tr></thead><tbody>{selection.map(r=><tr key={r.symbol}><td>{r.rank}</td><td>{r.symbol}</td><td>{whole(r.volume)}</td><td>{when(r.volumeAsOf)}</td><td>₹10,000</td></tr>)}</tbody></table></div>:<p className="nse-empty">The ten stocks appear after the timed selection. A missing or incomplete universe never produces a fabricated ranking.</p>}
   {chosen?.decision?.action==='NO_TRADE'&&<p className="owner-footnote">{chosen.decision.reason.replaceAll('_',' ').toLowerCase()}.</p>}
  </section>
  <section className="panel owner-positions"><h2>Open paper positions</h2>{report?.positions.length?<div className="nse-table-scroll"><table className="nse-trades-table"><thead><tr><th>Stock</th><th>Direction</th><th>Shares</th><th>Entry</th><th>Last mark</th><th>Source time</th></tr></thead><tbody>{report.positions.map(p=><tr key={p.symbol}><td>{p.symbol}</td><td>{p.side==='BUY'?'Long':'Short'}</td><td>{p.quantity}</td><td>{money(p.entryPricePaise/100)}</td><td>{money(p.markPaise/100)}</td><td>{when(p.markAt)}</td></tr>)}</tbody></table></div>:<p className="nse-empty">{report?'No open paper positions.':'Positions appear when the verified account is available.'}</p>}</section>
  <section className="panel owner-results"><div className="owner-section-heading"><h2>Daily & monthly results</h2><select aria-label="Results month" value={period} onChange={e=>setPeriod(e.target.value)}><option value="ALL">All recorded sessions</option>{availablePeriods.map(p=><option key={p}>{p}</option>)}</select></div>
   {shownDays.length?<div className="owner-day-list">{shownDays.map(d=><button key={d.date} type="button" aria-pressed={day===d.date} onClick={()=>setDay(day===d.date?'':d.date)}><span>{d.date}</span><strong>{money(d.endingEquityPaise===undefined?null:(d.endingEquityPaise-d.startingEquityPaise)/100)}</strong><small>{d.fills} fills · {d.status.replaceAll('_',' ').toLowerCase()}</small></button>)}</div>:<p className="nse-empty">Completed source-observed sessions will appear here. Unrun months and years have no return figure.</p>}
   <div className="owner-section-heading"><h3>{day?'Recorded fills · '+day:'Latest recorded fills'}</h3>{day&&<button type="button" className="secondary-button" onClick={()=>setDay('')}>Show latest</button>}</div>
   {events.length?<div className="nse-table-scroll"><table className="nse-trades-table"><thead><tr><th>Time</th><th>Stock</th><th>Action</th><th>Shares</th><th>Price</th><th>Costs</th><th>Realized P/L</th></tr></thead><tbody>{events.map((e,i)=><tr key={e.at+'-'+e.symbol+'-'+i}><td>{when(e.at)}</td><td>{e.symbol}</td><td>{e.side==='BUY'?<ArrowUpRight size={13}/>:<ArrowDownRight size={13}/>} {e.side} · {e.phase}</td><td>{e.quantity}</td><td>{money((e.pricePaise??0)/100)}</td><td>{money((e.feePaise??0)/100)}</td><td>{e.phase==='EXIT'?money((e.realizedPaise??0)/100):'—'}</td></tr>)}</tbody></table></div>:<p className="nse-empty">No recorded fills for this selection.</p>}
  </section>
  <section className="panel owner-results"><PeriodResults monthly={report?.monthly} yearly={report?.yearly}/></section>
  <PriceHistory history={history}/>
  {history?.replay&&<section className="panel owner-results"><small>HISTORICAL RESEARCH · UNQUALIFIED</small><h2>ScalpStorm X on source candle history</h2><p>{history.replay.scope}</p>{history.replay.notes.map(n=><p className="owner-footnote" key={n}>{n}</p>)}<PeriodResults monthly={history.replay.monthly} yearly={history.replay.yearly}/><div className="owner-day-list">{history.replay.days.map(d=><div key={d.date}><span>{d.date}</span><strong>{d.status==='OPEN_POSITIONS'?'Open position':d.decision?.action==='NO_TRADE'?'No valid selection':money(d.endingEquityPaise===undefined?null:(d.endingEquityPaise-d.startingEquityPaise)/100)}</strong><small>{d.fills} modeled fills · {d.status.replaceAll('_',' ').toLowerCase()}</small><SessionCoverage day={d.date} coverage={history.replay?.coverageByDay}/></div>)}</div></section>}
  <section className="panel owner-coverage"><h2>Strategy history coverage</h2><p>Market price history and strategy returns have different data requirements. Historical top-ten selection needs every eligible stock’s volume before entry and its dated universe.</p><div className="nse-table-scroll"><table className="nse-trades-table"><thead><tr><th>Requested period</th><th>Verified sessions</th><th>Paper result</th><th>Coverage</th></tr></thead><tbody>{(history?.strategyCoverage??['1M','1Y','5Y','10Y'].map(period=>({period,status:'SOURCE_REVIEW',reason:'Historical source coverage is being checked',completedSessions:null,netPnlINR:null}))).map(c=><tr key={c.period}><td>{c.period}</td><td>{c.completedSessions===null?'—':c.completedSessions}</td><td>{money(c.netPnlINR)}</td><td>{c.reason}</td></tr>)}</tbody></table></div></section>
 </section>;
}
export default function OwnerStrategyPage(){
 if(!['127.0.0.1','localhost'].includes(window.location.hostname))return <section className="panel owner-protocol"><h1>ScalpStorm X · 9:40 a.m.</h1><p>The owner’s paper account and broker-source history stay on the Mac.</p><p>₹1,00,000 virtual capital · ten ₹10,000 allocations · 9:40 entry · 3:15 exit.</p><a href="http://127.0.0.1:4310/#nse-paper">Open owner strategy desk</a></section>;
 return <StrategyContent/>;
}
