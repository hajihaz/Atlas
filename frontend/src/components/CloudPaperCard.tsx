import {useEffect,useState} from 'react';
import {buildCloudPaperSummary} from '../lib/cloudPaperDaybook.js';
import {Activity,Clock3,Cloud,ShieldCheck,TrendingUp} from 'lucide-react';
import {CartesianGrid,LineChart,Line,ResponsiveContainer,XAxis,YAxis,Tooltip} from 'recharts';
type Event={side:'BUY'|'SELL';quoteAt:string;barClosedAt:string;
 modeledPriceINR:number;quantity:number;feeINR:number;realizedPnlINR:number|null;mode:string};
type PaperRow={strategyId:string;strategyName:string;status:'RUNNING'|'HALTED';
 cashINR:number;quantity:number;virtualEquityINR:number;feesINR:number;
 maxDrawdownPct:number;closedTrades:number;wins:number;realizedPnlINR:number;
 lastSignal:string;events:Event[];pausedReason:string|null;
 equityHistory?:{at:string;equityINR:number}[]};
type Report={schema:number;mode:string;currency:'INR';status:string;symbol:string;
 actualCapitalINR:number;realOrdersEnabled:false;interval:string;runCount:number;
 createdAt:string|null;lastRunAt:string|null;lastProviderAt:string|null;
 skippedIntervals:number;scheduledEveryMinutes:number;alert:string|null;
 sessions:PaperRow[]};
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',
 currency:'INR',maximumFractionDigits:2}).format(n);
const ts=(iso:string|null)=>iso?new Intl.DateTimeFormat('en-US',{
 timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',
 hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true,
}).format(new Date(iso))+' IST':'Awaiting first scheduled run';
export default function CloudPaperCard(){
 const [report,setReport]=useState<Report|null>(null);
 const [loading,setLoading]=useState(true);
 const [problem,setProblem]=useState('');
 const [selected,setSelected]=useState('sma_9_21');
 const [selectedDay,setSelectedDay]=useState<string|null>(null);
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{
   let active=true;const controller=new AbortController();
   const refresh=async()=>{
     try{
       const r=await fetch('/cloud-paper.json',{cache:'no-store',credentials:'omit',signal:controller.signal});
       if(!r.ok)throw Error('Published cloud report unavailable');
       const d=await r.json() as Report;
       if(d.schema!==1||d.mode!=='SCHEDULED_VIRTUAL_PAPER'||d.currency!=='INR'
        ||d.realOrdersEnabled!==false||d.actualCapitalINR!==0||!Array.isArray(d.sessions)
        ||d.sessions.length>5||d.sessions.some(s=>!Number.isFinite(s.virtualEquityINR)
          ||!Array.isArray(s.events)||s.events.length>120))
        throw Error('Untrusted virtual paper report');
       buildCloudPaperSummary(d); // full source-contract gate before use
       if(active){setReport(d);setProblem('');}
     }catch(e){if(active&&!controller.signal.aborted)
       setProblem(e instanceof Error?e.message:'Unavailable');}
     finally{if(active)setLoading(false);}
   };
   void refresh();const t=setInterval(()=>void refresh(),60000);
   const clock=setInterval(()=>setNow(Date.now()),15000);
   return ()=>{active=false;clearInterval(t);clearInterval(clock);controller.abort()};
 },[]);
 const age=report?.lastRunAt?now-Date.parse(report.lastRunAt):null;
 const current=report?.sessions.find(s=>s.strategyId===selected)??report?.sessions[0];
 const stale=age===null||age>5*3600000||age<0;
 const daybook=report?buildCloudPaperSummary(report):null;
 const dayRows=daybook?.strategies.find(s=>s.strategyId===current?.strategyId)?.days??[];
 const activeDay=dayRows.find(d=>d.dayIST===selectedDay)??dayRows[0];
 return <section className="panel cloud-paper-card" aria-label="Scheduled server-side virtual paper trading">
  <div className="research-detail-title">
   <div><div className="heading-kicker"><Cloud size={15}/> SCHEDULED GITHUB PAPER RUNNER</div>
    <h2>Cloud paper monitor</h2>
    <p>Designed for best-effort GitHub checkpoints while Atlas and your Mac are closed.
      Runs can be delayed or skipped; not tick-by-tick trading.</p></div>
    <span className="research-tag"><ShieldCheck size={14}/> Virtual only</span>
  </div>
  {loading?<div className="research-status">Checking published paper state…</div>:
   !report?<div className="research-status">{problem||'No scheduled report published.'}</div>:
   <>
    <div className="cloud-paper-meta">
      <div><small>Runtime</small><strong>{report.sessions.length===0?(report.runCount>0?'First source check unsuccessful':'Awaiting first scheduled run'):
        stale?'Last snapshot old':report.status==='DEGRADED'?'Source check paused':'Scheduled checkpoints'}</strong></div>
      <div><small>Last runner attempt</small><strong>{ts(report.lastRunAt)}</strong></div>
      <div><small>Model</small><strong>{report.symbol.replace('INR',' / INR')} · {report.interval} candles</strong></div>
      <div><small>Skipped intervals</small><strong>{report.skippedIntervals}</strong></div>
    </div>
    {report.alert&&<p className="cloud-paper-notice">{report.alert}</p>}
    {stale&&report.sessions.length>0&&<p className="cloud-paper-notice">
      No recent scheduled checkpoint. Numbers below are the LAST published observations, not live prices.</p>}
    {report.sessions.length===0?<div className="research-status">
      GitHub Actions has not published an accepted market observation yet. Attempts without eligible source data do not create simulated positions, trades or returns.
    </div>:<>
    <div className="cloud-paper-choices">
      {report.sessions.map(s=><button type="button" key={s.strategyId} aria-pressed={selected===s.strategyId}
       className={'cloud-strategy-button '+(selected===s.strategyId?'selected':'')}
       onClick={()=>setSelected(s.strategyId)}>
        <span>{s.strategyName}</span>
        <strong>{money(s.virtualEquityINR)}</strong>
        <small>Virtual P/L {money(s.virtualEquityINR-100000)}</small>
      </button>)}
    </div>
    {current&&<div className="cloud-paper-detail">
     <h3>{current.strategyName}</h3>
     <div className="research-metric-grid">
      <div><small>Virtual equity</small><strong>{money(current.virtualEquityINR)}</strong></div>
      <div><small>Model P/L</small><strong>{money(current.virtualEquityINR-100000)}</strong></div>
      <div><small>Max drawdown</small><strong>{current.maxDrawdownPct.toFixed(2)}%</strong></div>
      <div><small>Completed exits</small><strong>{current.closedTrades}</strong></div>
      <div><small>Model fees</small><strong>{money(current.feesINR)}</strong></div>
      <div><small>Open virtual coins</small><strong>{current.quantity.toFixed(8)}</strong></div>
     </div>
     {(current.equityHistory?.length??0)>1&&<div className="cloud-equity-chart">
      <ResponsiveContainer width="100%" height="100%">
       <LineChart data={current.equityHistory}>
        <CartesianGrid strokeOpacity={0.09} vertical={false}/>
        <XAxis dataKey="at" tick={{fontSize:10}} minTickGap={48}
         tickFormatter={v=>new Date(v).toLocaleDateString('en-IN',{month:'short',day:'2-digit',timeZone:'Asia/Kolkata'})}/>
        <YAxis width={90} domain={['auto','auto']} tick={{fontSize:10}}
         tickFormatter={(v:number)=>'₹'+Math.round(v).toLocaleString('en-IN')}/>
        <Tooltip formatter={n=>typeof n==='number'?money(n):'—'}/>
        <Line type="linear" dot={false} stroke="#269d75" strokeWidth={2.2}
         isAnimationActive={false} dataKey="equityINR"/>
       </LineChart>
      </ResponsiveContainer>
     </div>}
     <section className="cloud-daybook" aria-label="Day-by-day verified virtual paper results">
      <div className="cloud-daybook-title">
       <h3>Daily checkpoint breakdown</h3>
       <p>Choose an IST date. Day changes are only calculated from actual retained,
       consecutive observations. Figures and fills are hypothetical, not realized brokerage profits.</p>
      </div>
      {dayRows.length===0?<p className="research-status">No dated virtual source observations yet.</p>:<>
       <div className="cloud-daybook-dates">
        {dayRows.map(d=><button key={d.dayIST} type="button"
         className={'cloud-daybook-date '+(activeDay?.dayIST===d.dayIST?'selected':'')}
         aria-pressed={activeDay?.dayIST===d.dayIST}
         onClick={()=>setSelectedDay(d.dayIST)}>
          <strong>{d.dayIST}</strong>
          <span>{d.dayChangeINR===null?'No comparable day':money(d.dayChangeINR)}</span>
          <small>{d.checkpoints} observations · {d.modeledBuys+d.modeledSells} modeled fills</small>
        </button>)}
       </div>
       {activeDay&&<div className="cloud-daybook-details">
        <div className="cloud-daybook-detail-heading">
         <strong>{activeDay.dayIST} · India time</strong>
         <span>{activeDay.changeBasis==='INITIAL_VIRTUAL_BALANCE'?'Seed-day virtual baseline':
          activeDay.changeBasis==='PREVIOUS_CALENDAR_DAY_LAST_SNAPSHOT'?'Compared with previous calendar day':
          'No adjacent daily closing observations — change not available'}</span>
        </div>
        <div className="research-metric-grid">
         <div><small>Observed day change</small><strong>{activeDay.dayChangeINR===null?'—':money(activeDay.dayChangeINR)}</strong></div>
         <div><small>Closing virtual equity</small><strong>{activeDay.lastEquityINR===null?'—':money(activeDay.lastEquityINR)}</strong></div>
         <div><small>Modeled entries / exits</small><strong>{activeDay.modeledBuys} / {activeDay.modeledSells}</strong></div>
         <div><small>Modeled fees in retained fills</small><strong>{money(activeDay.modeledFeesINR)}</strong></div>
         <div><small>Realized P/L on modeled exits</small><strong>{activeDay.modeledSells?money(activeDay.realizedExitPnlINR):'—'}</strong></div>
         <div><small>Checkpoint observations</small><strong>{activeDay.checkpoints}</strong></div>
        </div>
        {activeDay.events.length>0?<div className="research-trade-scroll">
         <table><thead><tr><th>Event (IST)</th><th>Modeled side</th><th>Price</th><th>Fee</th><th>Exit P/L</th></tr></thead>
          <tbody>{activeDay.events.map((e,i)=><tr key={e.at+'-'+i}>
           <td>{ts(e.at)}</td><td>{e.side}</td><td>{money(e.priceINR)}</td>
           <td>{money(e.feeINR)}</td>
           <td>{e.realizedPnlINR===null?'—':money(e.realizedPnlINR)}</td>
          </tr>)}</tbody>
         </table>
        </div>:<p className="research-status">No modeled trades recorded on this day.</p>}
       </div>}
      </>}
      <a className="cloud-daybook-export" href="/cloud-paper-daybook.json"
       target="_blank" rel="noopener noreferrer">Read-only paper daybook JSON — same saved evidence for ChatGPT</a>
     </section>
     <div className="research-trade-scroll">
      <table><thead><tr><th>Observed</th><th>Modeled side</th><th>Price</th><th>Virtual fee</th><th>Modeled P/L</th></tr></thead>
       <tbody>{current.events.slice().reverse().slice(0,30).map((e,i)=><tr key={i}>
        <td>{ts(e.quoteAt)}</td><td>{e.side}</td><td>{money(e.modeledPriceINR)}</td>
        <td>{money(e.feeINR)}</td><td>{e.realizedPnlINR===null?'—':money(e.realizedPnlINR)}</td>
       </tr>)}</tbody>
      </table>
      {current.events.length===0&&<p className="research-status">No source-triggered modeled trade yet.</p>}
     </div>
     {current.pausedReason&&<p className="cloud-paper-notice">Guard halted this strategy: {current.pausedReason}</p>}
    </div>}
   </>}
   </>
  }
  <div className="cloud-paper-footer"><Clock3 size={15}/>
    <span>Free-tier best-effort 2-hour GitHub schedule · late or missing observations never create pretend trades.
      These are public, synthetic research balances, not an authenticated account.</span>
    <a href="https://github.com/hajihaz/Atlas/actions/workflows/atlas-paper-scheduled.yml"
      target="_blank" rel="noopener noreferrer">Runner history <TrendingUp size={14}/></a>
  </div>
 </section>;
}
