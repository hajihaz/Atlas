type Trade={entryDay:string;exitDay:string|null;symbol?:string;quantity:number;entryPriceINR:number;exitPriceINR?:number;netPnlPaise:number|null;exitReason:string|null};
export type ResearchResult={sourceFirstDay:string;sourceLastDay:string;closedTrades:number;wins:number;winRatePct:number|null;netPnlINR:number;estimatedFeesINR:number;maxDrawdownPct:number;openPositions:number;costModel:string;trades:Trade[]};
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
const shortDay=(s:string)=>new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit',timeZone:'UTC'});

export default function ResearchTradeResults({result,fallbackSymbol='ETF'}:{result:ResearchResult;fallbackSymbol?:string}){
 const closed=result.trades.filter(t=>t.netPnlPaise!=null);
 let running=0;
 const points=closed.map((t,i)=>{running+=(t.netPnlPaise??0)/100;return {x:i+1,value:running,label:t.exitDay??t.entryDay};});
 const values=[0,...points.map(p=>p.value)],low=Math.min(...values),high=Math.max(...values),span=Math.max(1,high-low);
 const width=760,height=190,x=(i:number)=>42+(i/Math.max(1,points.length))*680;
 const y=(v:number)=>20+(high-v)/span*130;
 const path=[`M${x(0)},${y(0)}`,...points.map(p=>`L${x(p.x)},${y(p.value)}`)].join(' ');
 return <div className="atlas-research-results">
  <div className="atlas-research-head"><div><small>Historical research · raw ETF prices</small><h4>{shortDay(result.sourceFirstDay)} – {shortDay(result.sourceLastDay)}</h4></div><span className="atlas-research-flag">Retrospective estimate</span></div>
  <div className="atlas-research-metrics" aria-label="Historical research results">
   <div><small>Modeled result</small><strong className={result.netPnlINR>=0?'atlas-up':'atlas-down'}>{money(result.netPnlINR)}</strong></div>
   <div><small>Closed trades</small><strong>{result.closedTrades}</strong></div>
   <div><small>Winning trades</small><strong>{result.wins} of {result.closedTrades}</strong></div>
   <div><small>Open positions</small><strong>{result.openPositions}</strong></div>
  </div>
  <figure className="atlas-research-chart"><figcaption><strong>Cumulative closed-trade result</strong><span>After modeled fees · rupees · each dot is one exit</span></figcaption>
   {points.length?<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Cumulative modeled closed-trade result from zero to ${money(running)} over ${points.length} exits`}>
    <line x1="42" y1={y(0)} x2="722" y2={y(0)} className="atlas-chart-axis"/>
    <text x="42" y="16" className="atlas-chart-label">{money(high)}</text><text x="42" y="181" className="atlas-chart-label">{money(low)}</text>
    <path d={path} fill="none" className={running>=0?'atlas-research-line atlas-research-positive':'atlas-research-line atlas-research-negative'}/>
    {points.map(p=><circle key={`${p.label}-${p.x}`} cx={x(p.x)} cy={y(p.value)} r="4" className={p.value>=0?'atlas-research-dot-positive':'atlas-research-dot-negative'}><title>{shortDay(p.label)} · {money(p.value)} cumulative</title></circle>)}
   </svg>:<p>No closed trades to chart.</p>}
   <p>This shows closed trades only. It is not a daily account equity curve.</p></figure>
  <div className="atlas-research-detail"><div><small>Win rate</small><strong>{result.winRatePct==null?'Unavailable':`${result.winRatePct}%`}</strong></div><div><small>Estimated fees</small><strong>{money(result.estimatedFeesINR)}</strong></div><div><small>Sampled drawdown</small><strong>{result.maxDrawdownPct}%</strong></div></div>
  <h4 className="atlas-trade-title">Every modeled trade</h4>
  <div className="atlas-research-table-wrap"><table className="atlas-research-table"><thead><tr><th scope="col">Stock</th><th scope="col">Entry</th><th scope="col">Exit</th><th scope="col">Units</th><th scope="col">Price in → out</th><th scope="col">Result</th><th scope="col">Why it closed</th></tr></thead><tbody>
   {result.trades.map((trade,i)=><tr key={`${trade.entryDay}-${trade.symbol??fallbackSymbol}-${i}`}><th scope="row">{trade.symbol??fallbackSymbol}</th><td>{shortDay(trade.entryDay)}</td><td>{trade.exitDay?shortDay(trade.exitDay):'Open'}</td><td>{trade.quantity}</td><td>{money(trade.entryPriceINR)} → {trade.exitPriceINR==null?'—':money(trade.exitPriceINR)}</td><td className={trade.netPnlPaise==null?'':trade.netPnlPaise>=0?'atlas-up':'atlas-down'}>{trade.netPnlPaise==null?'Open':money(trade.netPnlPaise/100)}</td><td>{trade.exitReason?.replaceAll('_',' ').toLowerCase()??'Still open'}</td></tr>)}
  </tbody></table></div>
  <details className="atlas-research-source"><summary>How this estimate was calculated</summary><p>{result.costModel}. Source prices are unadjusted; corporate actions, taxes and market impact are not certified. These results are retrospective research, with zero forward paper fills.</p></details>
 </div>;
}
