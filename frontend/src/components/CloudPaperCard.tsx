import {useEffect,useState} from 'react';
import {buildCloudPaperSummary} from '../lib/cloudPaperDaybook.js';
import {assessPaperCadence} from '../lib/paperCadence.js';
import {Activity,Clock3,Cloud,ShieldCheck,TrendingUp} from 'lucide-react';
import {CartesianGrid,LineChart,Line,ResponsiveContainer,XAxis,YAxis,Tooltip} from 'recharts';
type Event={side:'BUY'|'SELL';quoteAt:string;barClosedAt:string;
 modeledPriceINR:number;quantity:number;feeINR:number;realizedPnlINR:number|null;mode:string};
type PaperRow={strategyId:string;strategyName:string;status:'RUNNING'|'HALTED';
 cashINR:number;quantity:number;virtualEquityINR:number;feesINR:number;
 maxDrawdownPct:number;closedTrades:number;wins:number;realizedPnlINR:number;
 lastSignal:string;events:Event[];pausedReason:string|null;
 lastDecisionEvidence?:{schema:1;mode:'SOURCE_VERIFIED_PAPER_DECISION_ONLY';
   code:string;signal:'BUY'|'SELL'|'HOLD'|'NOT_EVALUATED';modeledFills:number;
   checkedAt:string;completedBarAt:string;realOrdersEnabled:false;actualCapitalINR:0};
 equityHistory?:{at:string;equityINR:number}[]};
type CheckpointEvidence={runCount:number;at:string;status:string;classification:string;
 sourceAccepted:boolean;sourceCode:string;completedBarAt:string|null;
 candleAgeMinutes:number|null;newModeledFills:number;haltedStrategies:number;
 skippedIntervals:number;realOrdersEnabled:false;actualCapitalINR:0};
type Report={schema:number;mode:string;currency:'INR';status:string;symbol:string;
 actualCapitalINR:number;realOrdersEnabled:false;interval:string;runCount:number;
 createdAt:string|null;lastRunAt:string|null;lastProviderAt:string|null;
 skippedIntervals:number;scheduledEveryMinutes:number;alert:string|null;
 lastSourceCheck?:{schema:1;status:'PASS'|'BLOCKED';code:string;
   checkedAt:string|null;latestBarClosedAt:string|null;providerQuoteAt:string|null;
   candleAgeMinutes?:number|null;latencyClass?:'DELAYED_PAPER_ONLY'|'RECENT_OR_UNVERIFIED';
   liveOrdersEnabled:false;paperOrdersExecuted:false};
 recentCheckpoints?:CheckpointEvidence[];
 sessions:PaperRow[]};
const decisionExplanation:Record<string,string>={
 SEED_ONLY_NO_BACKFILL:'Portfolio initialized without historical entries.',
 SAME_BAR_REPLAY_BLOCKED:'No new completed candle; repeated observations cannot create another fill.',
 MISSED_BARS_NO_BACKFILL:'One or more market intervals were missed; no historic trade was backfilled.',
 RISK_HALTED:'Virtual risk limit has stopped new modeled trading.',
 NO_ELIGIBLE_SIGNAL:'No qualifying entry or exit signal on the newly completed candle.',
 SELL_SIGNAL_WITHOUT_HOLDINGS:'SELL signal observed, but this virtual account owns no coins to sell.',
 BUY_SIGNAL_ALREADY_HOLDING:'BUY signal observed, but this virtual account already holds a position.',
 MODELED_BUY_RECORDED:'A hypothetical BUY fill was recorded against a separately observed quote.',
 MODELED_SELL_RECORDED:'A hypothetical SELL fill was recorded against a separately observed quote.',
 BUY_SIGNAL_NO_AFFORDABLE_FILL:'BUY signal observed, but the existing model did not create an affordable fill.',
 SELL_SIGNAL_NO_VALID_FILL:'SELL signal observed, but the existing model did not create a valid fill.'
};
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',
 currency:'INR',maximumFractionDigits:2}).format(n);
const ts=(iso:string|null)=>iso?new Intl.DateTimeFormat('en-US',{
 timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',
 hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true,
}).format(new Date(iso))+' IST':'Awaiting first scheduled run';
export default function CloudPaperCard(){
 const [snapshot,setSnapshot]=useState<{report:Report;origin:'repository'|'deployment'}|null>(null);
 const report=snapshot?.report??null;
 const [loading,setLoading]=useState(true);
 const [problem,setProblem]=useState('');
 const [selected,setSelected]=useState('sma_9_21');
 const [selectedDay,setSelectedDay]=useState<string|null>(null);
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{
   let active=true;const controller=new AbortController();
   const refresh=async()=>{
     try{
       // A privately authenticated SERVER route can serve the newest genuine
       // GitHub ledger without triggering Vercel deploys. Never send auth from
       // a browser. A 503 falls back to the older Vercel-embedded read-only copy.
       let r:Response|undefined;
       try{r=await fetch('/api/cloud-paper',{
         cache:'no-store',credentials:'omit',signal:controller.signal,
       });}catch{/* Private source unavailable; try a deployed snapshot. */}
       const origin:'repository'|'deployment'=r?.ok&&
         r.headers.get('content-type')?.includes('application/json')?'repository':'deployment';
       if(origin==='deployment')
         r=await fetch('/cloud-paper.json',{cache:'no-store',credentials:'omit',signal:controller.signal});
       if(!r?.ok)throw Error('Published cloud report unavailable');
       const d=await r.json() as Report;
       if(d.schema!==1||d.mode!=='SCHEDULED_VIRTUAL_PAPER'||d.currency!=='INR'
        ||d.realOrdersEnabled!==false||d.actualCapitalINR!==0||!Array.isArray(d.sessions)
        ||d.sessions.length>5||d.sessions.some(s=>!Number.isFinite(s.virtualEquityINR)
          ||!Array.isArray(s.events)||s.events.length>120))
        throw Error('Untrusted virtual paper report');
       if(d.recentCheckpoints!==undefined&&(
         !Array.isArray(d.recentCheckpoints)||d.recentCheckpoints.length>24||
         (d.recentCheckpoints.length>0&&
           (d.recentCheckpoints.at(-1)?.runCount!==d.runCount||
            d.recentCheckpoints.at(-1)?.at!==d.lastRunAt))||
         d.recentCheckpoints.some(x=>!Number.isSafeInteger(x.runCount)||
           !Number.isSafeInteger(x.newModeledFills)||x.newModeledFills<0||
           x.realOrdersEnabled!==false||x.actualCapitalINR!==0)))
         throw Error('Published virtual checkpoint evidence is inconsistent');
       buildCloudPaperSummary(d); // full source-contract gate before use
       if(active){
         setSnapshot(previous=>{
           // A transient upstream outage may return an older static deployment.
           // Never visually roll a verified forward ledger back to an older run.
           if(previous&&(d.runCount<previous.report.runCount||
             (d.runCount===previous.report.runCount&&
               Date.parse(d.lastRunAt??'')<Date.parse(previous.report.lastRunAt??''))))
             return previous;
           return {report:d,origin};
         });
         setProblem('');
       }
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
 const cadence=assessPaperCadence(report?.lastRunAt??null,now);
 const daybook=report?buildCloudPaperSummary(report):null;
 const selectedSummary=daybook?.strategies.find(s=>s.strategyId===current?.strategyId);
 const dayRows=selectedSummary?.days??[];
 const activeDay=dayRows.find(d=>d.dayIST===selectedDay)??dayRows[0];
 const proof=report?.recentCheckpoints??[];
 const acceptedProof=proof.filter(x=>x.sourceAccepted&&x.status==='RUNNING').length;
 const rejectedProof=proof.filter(x=>x.classification==='SOURCE_REJECTED').length;
 const newModeledInWindow=proof.reduce((n,x)=>n+x.newModeledFills,0);
 const comparison=daybook?.strategies??[];
 const rankReady=report?.runCount!==undefined&&report.runCount>=5
   &&comparison.length===5&&comparison.every(s=>s.closedTrades>=3)
   &&(report?.skippedIntervals??0)===0;
 const shown=rankReady?[...comparison].sort((a,b)=>
   b.totalModeledPnlINR-a.totalModeledPnlINR||a.maxDrawdownPct-b.maxDrawdownPct)
   :comparison;
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
    {problem&&<div className="cloud-paper-notice" role="alert">
      The latest paper snapshot refresh failed. Showing the last successfully
      validated checkpoint, which may now be stale. {problem}.
      No new virtual trades can be inferred from a failed data refresh.
    </div>}
    {snapshot?.origin==='deployment'&&<div className="cloud-paper-notice" role="note">
      This is the last Vercel-deployed research snapshot, not guaranteed to match
      the newest GitHub runner ledger. Private read-only synchronization is not configured
      or temporarily unavailable. Check the saved runner time below.
    </div>}
    <div className="cloud-paper-meta">
      <div><small>Data delivery</small><strong>{snapshot?.origin==='repository'?'Read-only GitHub source':'Last deployed snapshot'}</strong></div>
      <div><small>Runtime</small><strong>{report.sessions.length===0?(report.runCount>0?'First source check unsuccessful':'Awaiting first scheduled run'):
        cadence.overdue?'Publication overdue':stale?'Last snapshot old':report.status==='DEGRADED'?'Source check paused':'Last published checkpoint saved'}</strong></div>
      <div><small>Last runner attempt</small><strong>{ts(report.lastRunAt)}</strong></div>
      <div><small>Model</small><strong>{report.symbol.replace('INR',' / INR')} · {report.interval} candles</strong></div>
      <div><small>Skipped intervals</small><strong>{report.skippedIntervals}</strong></div>
      <div><small>Next nominal runner slot</small><strong>{ts(cadence.nextDueAt)}</strong></div>
      <div><small>Unpublished scheduled slots (48h)</small><strong>{cadence.unpublishedNominalSlots48h===null?'Not verifiable':
        cadence.unpublishedNominalSlots48h}</strong></div>
      <div><small>Completed bar age at attempt</small><strong>
        {report.lastSourceCheck?.candleAgeMinutes!=null
          ?report.lastSourceCheck.candleAgeMinutes+' min':'Not recorded'}
      </strong></div>
      <div><small>Last source check</small><strong>
        {report.lastSourceCheck?.status==='PASS'?'Accepted':
         report.lastSourceCheck?.status==='BLOCKED'?'Blocked':'Not yet recorded'}
      </strong></div>
    </div>
    <div className="cloud-paper-comparison" aria-label="Verified recent paper-run evidence">
      <div className="cloud-paper-comparison-heading">
        <strong>Recent checkpoint evidence</strong>
        <span>Only actual attempts since evidence tracking started · last 24 maximum</span>
      </div>
      {proof.length===0
        ?<p className="cloud-paper-notice">No new recorded checkpoint evidence yet. Older runner attempts are not backfilled.</p>
        :<>
          <div className="cloud-paper-meta">
            <div><small>Recorded attempts</small><strong>{proof.length}</strong></div>
            <div><small>Accepted public source</small><strong>{acceptedProof}</strong></div>
            <div><small>Rejected public source</small><strong>{rejectedProof}</strong></div>
            <div><small>New hypothetical fills</small><strong>{newModeledInWindow}</strong></div>
          </div>
          <div className="cloud-paper-rank-scroll">
            <table><thead><tr><th>Recorded IST</th><th>Check</th><th>Reason</th><th>New virtual fills</th></tr></thead>
              <tbody>{proof.slice(-5).reverse().map(x=><tr key={x.runCount}>
                <td>{ts(x.at)}</td><td>{x.sourceAccepted?'Verified':'Not accepted'}</td>
                <td>{x.sourceCode}</td><td>{x.newModeledFills}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {report.runCount>proof.length&&<small>The earlier {report.runCount-proof.length} attempts have no saved evidence history. No results were reconstructed.</small>}
        </>}
    </div>
    {report.alert&&<p className="cloud-paper-notice">{report.alert}</p>}
    {report.lastSourceCheck?.status==='BLOCKED'&&
      <p className="cloud-paper-notice">
        Market source validation: {report.lastSourceCheck.code}.
        {report.lastSourceCheck.latestBarClosedAt&&
          <> Last received completed bar: {ts(report.lastSourceCheck.latestBarClosedAt)}.</>}
        No simulated orders were permitted for this checkpoint.
      </p>}
    {report.lastSourceCheck?.latencyClass==='DELAYED_PAPER_ONLY'&&
      <p className="cloud-paper-notice">
        Delayed public-candle research only: the most recent completed candle
        was {report.lastSourceCheck.candleAgeMinutes} minutes old.
        Hypothetical entries, if any, use a fresh observed quote, never a historic close.
        This is not second-by-second trading.
      </p>}
    {cadence.overdue&&<div className="cloud-paper-notice" role="status">
      <strong>Scheduled publication overdue.</strong> The last 48 hours contain {' '}
      {cadence.unpublishedNominalSlots48h??'an unverified number of'} nominal publication
      windows without a newer saved ledger. This is <strong>not</strong> a count of confirmed
      failed GitHub jobs, missed source candles or real trades.
      <a className="cloud-paper-runner-link" href="https://github.com/hajihaz/Atlas/actions/workflows/atlas-paper-scheduled.yml"
       target="_blank" rel="noopener noreferrer">Inspect GitHub runner history ↗</a>
    </div>}
    {stale&&report.sessions.length>0&&<p className="cloud-paper-notice">
      No recent scheduled checkpoint. Numbers below are the LAST published observations, not live prices.</p>}
    {report.sessions.length===0?<div className="research-status">
      GitHub Actions has not published an accepted market observation yet. Attempts without eligible source data do not create simulated positions, trades or returns.
    </div>:<>
    <div className="cloud-paper-comparison">
      <div className="cloud-paper-comparison-heading">
        <strong>Five-strategy virtual comparison</strong>
        <span>{rankReady?'Provisional ordering from recorded modeled equity':
          'Ranking withheld until five checkpoints and three closed exits per strategy'}</span>
      </div>
      <div className="cloud-paper-rank-scroll">
        <table><thead><tr><th>Strategy</th><th>Virtual equity</th><th>Modeled net P/L</th><th>Max drawdown</th><th>Modeled exits</th></tr></thead>
          <tbody>{shown.map(s=><tr key={s.strategyId}>
            <td>{s.strategyName}</td><td>{money(s.virtualEquityINR)}</td>
            <td>{money(s.totalModeledPnlINR)}</td><td>{s.maxDrawdownPct.toFixed(2)}%</td>
            <td>{s.closedTrades}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <small>Five independent ₹1,00,000 virtual accounts. Historical and forward simulated outcomes are not real profits; no statistical winner is certified.</small>
    </div>
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
      <div><small>Virtual available cash</small><strong>{money(selectedSummary?.virtualCashINR??current.cashINR)}</strong></div>
      <div><small>Marked virtual exposure</small><strong>{money(selectedSummary?.markedPositionValueINR??0)}</strong></div>
      <div><small>Recorded exit win rate</small><strong>{selectedSummary?.observedWinRatePct===null?'—':
       selectedSummary?.observedWinRatePct?.toFixed(2)+'%'}</strong></div>
      <div><small>Modeled realized P/L</small><strong>{money(current.realizedPnlINR)}</strong></div>
      <div><small>Borrowed margin / leverage</small><strong>₹0 · None modeled</strong></div>
      <div><small>Unrealized residual estimate</small><strong>{money(selectedSummary?.modeledUnrealizedResidualINR??0)}</strong></div>
     </div>
     {current.lastDecisionEvidence&&
       <p className="cloud-paper-notice" aria-label="Explanation for latest modeled trading decision">
        <strong>Last eligible paper decision:</strong> {
          decisionExplanation[current.lastDecisionEvidence.code]??'Model decision could not be classified.'
        } <span>Source candle: {ts(current.lastDecisionEvidence.completedBarAt)}.
          {current.lastDecisionEvidence.checkedAt!==report.lastRunAt
           ?' This explanation is from the last accepted observation, not the current checkpoint.'
           :' Current published checkpoint.'}
          {' '}New hypothetical fills for this strategy: {current.lastDecisionEvidence.modeledFills}.
        </span>
       </p>}
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
