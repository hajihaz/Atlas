import {useEffect,useState} from 'react';
import {Activity,ArrowRight,BookOpenText,Clock3,ShieldCheck,TrendingUp,TrendingDown,FlaskConical,Layers3} from 'lucide-react';
import {LineChart,Line,ResponsiveContainer,CartesianGrid,XAxis,YAxis,Tooltip} from 'recharts';
type T={side:string;barTime:number;signalBarTime:number;price:number;quantity:number;feeINR:number;positionPnlINR:number|null};
type S={
 id:string;name:string;category:string;description:string;logic:string;
 status?:string;capitalINR?:number;endingEquityINR?:number;modeledReturnPct?:number;
 maxDrawdownPct?:number;closedTrades?:number;wins?:number;winRatePct?:number|null;
 realizedPnlINR?:number;openPosition?:boolean;
 trades?:T[];equity?:{time:number;equityINR:number;closeINR:number}[];
 assumptions?:{feePctPerSide:number;slippagePctPerSide:number;nextBarOpenFill:boolean;disclaimer:string};
};
type Lab={schema:number;mode:string;currency:'INR';symbol:string;range:string;
 generatedAt:string;source:string;barCount:number;historyCoverage:string;earliestBarAt:string|null;
 latestClosedAt:string|null;providerWarning:string;strategies:S[];
 simulatedCapitalINR:number;liveOrdersEnabled:false;paperOrdersExecuted:false;paperLedgerStored:false;warning:string};
const symbolOptions=['BTCINR','ETHINR','SOLINR','XRPINR','DOGEINR'];
const money=(n:number|undefined)=>n===undefined?'—':new Intl.NumberFormat('en-IN',
  {style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
const percent=(n:number|undefined)=>n===undefined?'—':(n>0?'+':'')+n.toFixed(2)+'%';
const date=(n:number)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',
 day:'2-digit',month:'short',hour:'numeric',minute:'2-digit',hour12:true}).format(n)+' IST';
export default function StrategyLabPage({mode='strategies',goRisk}:{
 mode?:'strategies'|'research'|'scalpstorm';goRisk?:()=>void;
}){
 const [symbol,setSymbol]=useState('BTCINR');
 const [range,setRange]=useState('1M');
 const [lab,setLab]=useState<Lab|null>(null);
 const [selected,setSelected]=useState('sma_9_21');
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
   const controller=new AbortController();
   setBusy(true);setError('');setLab(null);
   fetch('/api/strategy-lab?'+new URLSearchParams({symbol,range}),
      {signal:controller.signal,credentials:'omit'})
     .then(async x=>{if(!x.ok)throw Error('Source-backed research unavailable');return x.json() as Promise<Lab>})
     .then(x=>{
       if(x.schema!==1||x.currency!=='INR'||x.mode!=='HISTORICAL_HYPOTHETICAL_REPLAY'
         ||x.paperOrdersExecuted!==false||x.liveOrdersEnabled!==false
         ||!Array.isArray(x.strategies))throw Error('Untrusted research response');
       setLab(x);
     }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Unavailable')})
     .finally(()=>{if(!controller.signal.aborted)setBusy(false)});
   return ()=>controller.abort();
 },[symbol,range]);
 const item=lab?.strategies.find(x=>x.id===selected)??lab?.strategies[0]??null;
 const heading=mode==='scalpstorm'?'ScalpStorm X / Research':mode==='research'?'Research Lab':'Strategy Library';
 const desc=mode==='scalpstorm'
   ?'ScalpStorm NSE intraday validation is a separate workstream. This research workbench uses real INR crypto data while authorized NSE execution-quality data is pending.'
   :'Compare five documented strategies on provider-returned historical INR candles. Click any strategy to inspect its hypothetical output and audited trades.';
 return <section className="research-workbench">
  <div className="sub-page-header"><div className="breadcrumb">ATLAS / {heading.toUpperCase()}</div>
    <h1>{heading}<span className="period">.</span></h1><p>{desc}</p></div>
  <div className="research-topnote" role="note"><FlaskConical size={20}/>
    <span><strong>Real historical prices · simulated results.</strong> ₹1,00,000 is explicitly virtual starting capital, not a real portfolio. Results model fees/slippage and are not earnings or forward paper fills.</span>
  </div>
  <div className="panel research-workbench-controls">
   <div><label htmlFor="research-symbol">Market / INR</label>
    <select id="research-symbol" value={symbol} onChange={e=>setSymbol(e.target.value)}>
      {symbolOptions.map(s=><option value={s} key={s}>{s.replace('INR',' / INR')}</option>)}
    </select></div>
   <div><label htmlFor="research-period">Historical interval</label>
    <select id="research-period" value={range} onChange={e=>setRange(e.target.value)}>
      <option value="1W">1 week · 1-hour bars</option>
      <option value="1M">1 month · 1-hour bars</option>
      <option value="1Y">1 year · daily bars</option>
    </select></div>
   <div className="research-provider-stat"><span>Historical source</span>
      <strong>{lab?.source??'CoinDCX INR spot candles'}</strong>
      <small>{lab?lab.barCount+' completed provider candles':'Awaiting source'}</small>
   </div>
  </div>
  {busy&&<div className="panel research-status" role="status">Calculating strategy results from real completed candles…</div>}
  {error&&<div className="panel research-status" role="alert">{error}. No results have been fabricated.</div>}
  {lab&&<div className="research-scope"><Clock3 size={16}/>
    <span>{lab.barCount} completed bars · {lab.historyCoverage.replaceAll('_',' ')} ·
    {lab.earliestBarAt?' Since '+date(Date.parse(lab.earliestBarAt)):''}</span>
    <span>Updated {date(Date.parse(lab.generatedAt))}</span></div>}
  {lab&&<div className="research-layout">
    <div className="research-strategy-list">
      <div className="research-list-heading"><Layers3 size={16}/> Choose strategy</div>
      {lab.strategies.map(s=><button type="button" key={s.id}
        className={'panel research-strategy-choice '+(item?.id===s.id?'active':'')}
        onClick={()=>setSelected(s.id)} aria-pressed={item?.id===s.id}>
        <span className="research-choice-row"><strong>{s.name}</strong><ArrowRight size={15}/></span>
        <small>{s.category}</small>
        <span className={'research-choice-return '+((s.modeledReturnPct??0)<0?'negative':'')}>
          {s.status?'Insufficient history':percent(s.modeledReturnPct)}
        </span>
        <small>{s.status?'Provider has too few completed candles':'Modeled return · historical only'}</small>
      </button>)}
    </div>
    <div className="research-detail-area">
      {item&&<><div className="panel research-detail">
        <div className="research-detail-title"><div><span className="premium-kicker">STRATEGY DETAILS</span>
          <h2>{item.name}</h2><p>{item.description}</p></div>
          <span className="research-tag"><BookOpenText size={14}/> Historical replay</span></div>
        <div className="research-model-description"><strong>Entry / exit model</strong>
          <p>{item.logic}</p><p>Signals use a completed candle. Model fills are at the next candle's opening price with illustrative fees and slippage.</p></div>
        {item.status?<div className="research-status">Insufficient source history for this setup. Select another asset or interval.</div>:
        <><div className="research-metric-grid">
          <div><small>Modeled closing equity</small><strong>{money(item.endingEquityINR)}</strong></div>
          <div><small>Modeled return</small><strong className={(item.modeledReturnPct??0)<0?'negative':'positive'}>{percent(item.modeledReturnPct)}</strong></div>
          <div><small>Maximum drawdown</small><strong>{percent(item.maxDrawdownPct)}</strong></div>
          <div><small>Closed round trips</small><strong>{item.closedTrades??'—'}</strong></div>
          <div><small>Win rate</small><strong>{percent(item.winRatePct??undefined)}</strong></div>
          <div><small>Realized model P&amp;L</small><strong>{money(item.realizedPnlINR)}</strong></div>
        </div>
        <div className="research-chart-caption">Hypothetical portfolio value (₹) · source-based historical replay</div>
        <div className="research-chart"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={item.equity??[]}>
            <CartesianGrid strokeOpacity={0.10} vertical={false}/>
            <XAxis dataKey="time" type="number" domain={['dataMin','dataMax']}
              tickFormatter={n=>new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',timeZone:'Asia/Kolkata'}).format(n)}
              tick={{fontSize:10,fill:'#8a9ca9'}} minTickGap={28}/>
            <YAxis domain={['auto','auto']} width={88}
              tickFormatter={n=>'₹'+Math.round(n).toLocaleString('en-IN')}
              tick={{fontSize:10,fill:'#8a9ca9'}}/>
            <Tooltip formatter={n=>money(typeof n==='number'?n:undefined)}
              labelFormatter={n=>date(Number(n))}/>
            <Line dataKey="equityINR" dot={false} type="linear" stroke="#279d72"
              strokeWidth={2.4} isAnimationActive={false}/>
          </LineChart>
        </ResponsiveContainer></div>
        </>}
      </div>
      <div className="panel research-trades">
       <h3>Modeled transaction ledger</h3>
       <p>Trade timestamps and signals are derived from provider candles, not from an authenticated broker.</p>
       {item.trades?.length?<div className="research-trade-scroll"><table>
        <thead><tr><th>Model fill</th><th>Side</th><th>Price</th><th>Fee</th><th>Closed P/L</th></tr></thead>
        <tbody>{item.trades.slice().reverse().map((t,i)=><tr key={i}>
          <td>{date(t.barTime)}</td><td>{t.side}</td><td>{money(t.price)}</td>
          <td>{money(t.feeINR)}</td><td>{t.positionPnlINR===null?'—':money(t.positionPnlINR)}</td>
        </tr>)}</tbody>
       </table></div>:<div className="research-status">No model transactions occurred for this strategy in the selected interval.</div>}
      </div></>}
    </div>
  </div>}
  <div className="panel research-bottom">
    <ShieldCheck size={19}/>
    <div><strong>Free research now; forward paper and NSE feeds remain separate.</strong>
      <p>Public CoinDCX historical data powers these models. Fee 0.10% and slippage 0.05% per side are illustrative assumptions, not venue-confirmed costs. Real trades and paper-forward fills are not created by a backtest.</p></div>
    <button className="secondary-button" type="button" onClick={goRisk}>Risk controls <ArrowRight size={15}/></button>
  </div>
 </section>;
}
