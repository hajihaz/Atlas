import {useEffect,useRef,useState} from 'react';
import {LockKeyhole,RefreshCcw,ShieldCheck} from 'lucide-react';
import {ATLAS_RULES} from '../data/atlasSeven';
import {cloudPaperRequest,cloudPaperUsesGateway,ownerSession} from '../lib/cloudPaperRead';
import type {Availability} from './DataAvailabilityPage';
import ResearchTradeResults from './ResearchTradeResults';
import HistoryCoverageTimeline from './HistoryCoverageTimeline';
import DayStrategyReview from './DayStrategyReview';
import PaperExperimentReport from './PaperExperimentReport';
import type {Experiment} from './PaperExperimentReport';
import PaperChartWorkspace from './PaperChartWorkspace';
type CloudStatus={mode:string;realOrdersEnabled:boolean;backendConnected:boolean;configured:boolean;feedSourceConfigured:boolean};
type Catalog={schema:string;paperOnly:boolean;realOrdersEnabled:boolean;executionStatus:string;strategies:{id:string;name:string;executionStatus:string}[]};
type Account={strategyId:string;cashINR:number;realizedPnlINR:number;positionCount:number;pendingCount:number;paperFills:number;experiment?:Experiment};
type Accounts={paperOnly:boolean;realOrdersEnabled:boolean;executionStatus:string;accounts:Account[]};
type State={mode:string;realOrdersEnabled:boolean;strategy_enabled:boolean;strategy:string;cash_paise:number;positions:{symbol:string;qty:number}[];last_strategy_phase:{status:string;reason:string|null}|null};
type Replay={status:string;sourceDate:string;symbol:string;sourceSha256:string;sourceKnownAt:string;minuteBars:number;required:string[];
 result:null|{status:string;fills:unknown[];realizedPaise:null;signal:{status:string;side?:string;reason?:string;nextOpenTime?:number}}};
type TopVolume={sourceDate:string;stocks:{rank:number;symbol:string;archived:boolean}[]};
type StrategyJournal={schema:string;sourceDate:string;strategyId:string;mode:string;realOrdersEnabled:boolean;executionStatus:string;
 account:{cashINR:number;realizedPnlINR:number;pending:number;positions:number;fills:number};
 events:{at:string;kind:string;symbol:string|null;side:string|null;reason:string;quantity:number|null;priceINR:number|null;feeINR?:number;realizedPnlINR?:number;sourceHashes:string[]}[]};
type RawEtfResult={strategyId:string;status:string;sourceFirstDay:string;sourceLastDay:string;closedTrades:number;wins:number;winRatePct:number|null;netPnlINR:number;estimatedFeesINR:number;maxDrawdownPct:number;openPositions:number;costModel:string;adjustmentCertified:boolean;forwardPaperFills:number;trades:{entryDay:string;exitDay:string|null;symbol?:string;quantity:number;entryPriceINR:number;exitPriceINR?:number;netPnlPaise:number|null;exitReason:string|null}[]};
type RawEtfReport={status:string;schema?:string;sourceDay:string;evidenceClass?:string;realOrdersEnabled:boolean;results?:RawEtfResult[]};
const COHORT=['AXISBANK','BHARTIARTL','HDFCBANK','ICICIBANK','INFY','ITC','NHPC','RELIANCE','SBIN','TCS'];
const inr=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
export default function PaperTestingPage({ownerToken,setOwnerToken,ownerConnected,setOwnerConnected,goMarket,goData,goReplay,goSchedule}:{
 ownerToken:string;setOwnerToken:(v:string)=>void;ownerConnected:boolean;setOwnerConnected:(v:boolean)=>void;goMarket:()=>void;goData:()=>void;goReplay:()=>void;goSchedule:()=>void;
}){
 const [selected,setSelected]=useState(ATLAS_RULES[0].id);
 const strategyStrip=useRef<HTMLDivElement>(null);
 const drag=useRef<{x:number;left:number;moved:boolean}|null>(null);
 useEffect(()=>{const strip=strategyStrip.current,tab=strip?.querySelector<HTMLElement>('[aria-pressed="true"]');if(strip&&tab){const a=strip.getBoundingClientRect(),b=tab.getBoundingClientRect();if(b.left<a.left)strip.scrollLeft+=b.left-a.left;else if(b.right>a.right)strip.scrollLeft+=b.right-a.right;}},[selected]);
 const [status,setStatus]=useState<CloudStatus|null>(null);
 const [catalog,setCatalog]=useState<Catalog|null>(null);
 const [accounts,setAccounts]=useState<Accounts|null>(null);
 const [state,setState]=useState<State|null>(null);
 const [availability,setAvailability]=useState<Availability|null>(null);
 const [sampleDay,setSampleDay]=useState('');
 const [sampleSymbol,setSampleSymbol]=useState('');
 const [topVolume,setTopVolume]=useState<TopVolume|null>(null);
 const [journal,setJournal]=useState<StrategyJournal|null>(null);
 const [journalDay,setJournalDay]=useState(()=>new Date(Date.now()+19800000).toISOString().slice(0,10));
 const [journalError,setJournalError]=useState('');
 const [rawEtfReport,setRawEtfReport]=useState<RawEtfReport|null>(null);
 const [rawEtfError,setRawEtfError]=useState('');
 const [rawEtfDay,setRawEtfDay]=useState('');
 const [replay,setReplay]=useState<Replay|null>(null);
 const [replayError,setReplayError]=useState('');
 const replaySerial=useRef(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [accountNotice,setAccountNotice]=useState('');
 const rule=ATLAS_RULES.find(x=>x.id===selected)??ATLAS_RULES[0];
 const account=accounts?.accounts.find(x=>x.strategyId===selected);
 useEffect(()=>{
  let current=true;
  cloudPaperRequest<CloudStatus>('','status').then(x=>{if(current)setStatus(x);})
   .catch(()=>{if(current)setStatus(null);});
  return ()=>{current=false;};
 },[]);
 async function refresh(){
  if(!ownerConnected&&ownerToken.length<32){setError('Enter the private owner token once to connect.');return;}
  setBusy(true);setError('');setAccountNotice('');
  try{
   if(!ownerConnected&&cloudPaperUsesGateway){
    if(!await ownerSession('POST',ownerToken))throw Error('Owner token was not accepted.');
    setOwnerConnected(true);setOwnerToken('');
   }
   const auth=cloudPaperUsesGateway?'':ownerToken;
   const [nextCatalog,nextState,nextAvailability]=await Promise.all([
    cloudPaperRequest<Catalog>(auth,'seven-strategies'),
    cloudPaperRequest<State>(auth,'state'),
    cloudPaperRequest<Availability>(auth,'data-availability')
   ]);
   const expected=ATLAS_RULES.map(x=>x.id).join('|');
   if(nextCatalog.paperOnly!==true||nextCatalog.realOrdersEnabled!==false||
      nextCatalog.strategies.map(x=>x.id).join('|')!==expected||
      nextState.mode!=='PAPER_ONLY'||nextState.realOrdersEnabled!==false)
      throw Error('Cloud strategy version does not match this paper-only screen.');
   setCatalog(nextCatalog);setState(nextState);setAvailability(nextAvailability);
   setSampleDay(v=>v||nextAvailability.minute.dates[0]?.day||'');
   setRawEtfDay(v=>v||nextAvailability.etf_raw.dates[0]?.day||'');
   try{
    const nextAccounts=await cloudPaperRequest<Accounts>(auth,'seven-accounts');
    if(nextAccounts.paperOnly!==true||nextAccounts.realOrdersEnabled!==false)throw Error('Invalid account response');
    setAccounts(nextAccounts);
    if(ATLAS_RULES.some(x=>!nextAccounts.accounts.some(a=>a.strategyId===x.id)))
      setAccountNotice('Seven new paper accounts are awaiting safe migration from the old empty research accounts.');
   }catch{
    setAccounts(null);setAccountNotice('New strategy account status is unavailable. No result is assumed.');
   }
  }catch(cause){
   setCatalog(null);setState(null);setAccounts(null);setAvailability(null);
   setError(cause instanceof Error?cause.message:'Unable to connect');
  }finally{setBusy(false);}
 }
 async function loadReplay(){
  const serial=++replaySerial.current;
  setReplay(null);setReplayError('');
  if(!sampleDay||!sampleSymbol){setReplayError('Choose a dated stock receipt.');return;}
  try{const result=await cloudPaperRequest<Replay>(cloudPaperUsesGateway?'':ownerToken,'strategy-replay',{day:sampleDay,symbol:sampleSymbol,strategy:selected});
   if(!result||typeof result.status!=='string'||result.sourceDate!==sampleDay||result.symbol!==sampleSymbol||typeof result.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(result.sourceSha256)||!Number.isFinite(Date.parse(result.sourceKnownAt))||!Number.isSafeInteger(result.minuteBars))throw Error('Historical strategy receipt could not be verified.');
   if(serial===replaySerial.current)setReplay(result);
  }catch(e){if(serial===replaySerial.current)setReplayError(e instanceof Error?e.message:'Replay unavailable');}
 }
 useEffect(()=>{
  replaySerial.current++;
  setReplay(null);setReplayError('');
  if(rule.cadence==='Intraday'&&sampleDay&&sampleSymbol&&(ownerConnected||ownerToken.length>=32)&&availability)void loadReplay();
 },[selected,sampleDay,sampleSymbol,ownerToken,ownerConnected,availability]);
 useEffect(()=>{
  setTopVolume(null);setSampleSymbol('');if(!sampleDay||!ownerConnected)return;
  let active=true;
  cloudPaperRequest<TopVolume>('','top-volume-history',{day:sampleDay}).then(value=>{if(active&&value.sourceDate===sampleDay){setTopVolume(value);setSampleSymbol(value.stocks.find(x=>x.archived)?.symbol??COHORT[0]);}}).catch(()=>{if(active)setSampleSymbol(COHORT[0]);});
  return ()=>{active=false;};
 },[sampleDay,ownerConnected]);
 useEffect(()=>{if(ownerConnected&&!catalog)void refresh();},[ownerConnected]);
 useEffect(()=>{
  setJournal(null);setJournalError('');
  const day=journalDay;
  if(!ownerConnected||!day)return;
  let active=true;
  cloudPaperRequest<StrategyJournal>('','strategy-journal',{day,strategy:selected}).then(value=>{
   if(active){if(value.schema==='atlas.strategy-journal.v1'&&value.mode==='PAPER_ONLY'&&value.realOrdersEnabled===false&&
    value.sourceDate===day&&value.strategyId===selected)setJournal(value);
    else setJournalError('Invalid strategy journal response');}
  }).catch(e=>{if(active)setJournalError(e instanceof Error?e.message:'Journal unavailable');});
  return ()=>{active=false;};
 },[ownerConnected,selected,journalDay]);
 useEffect(()=>{
  setRawEtfReport(null);setRawEtfError('');
  if(!ownerConnected||!rawEtfDay||rule.cadence==='Intraday')return;
  let active=true;
  cloudPaperRequest<RawEtfReport>('','etf-raw-research',{day:rawEtfDay}).then(value=>{
   if(!active)return;
   if(value.status==='MISSING'){setRawEtfError('Raw ETF research has not completed for this date.');return;}
   if(value.schema!=='atlas.raw-etf-research.v1'||value.sourceDay!==rawEtfDay||
    value.evidenceClass!=='RETROSPECTIVE_RAW_UNADJUSTED_NOT_FORWARD_OR_STRATEGY_CERTIFIED'||
    value.realOrdersEnabled!==false||!value.results?.some(x=>x.strategyId===selected&&x.adjustmentCertified===false&&x.forwardPaperFills===0))
    {setRawEtfError('ETF report proof did not match this strategy.');return;}
   setRawEtfReport(value);
  }).catch(e=>{if(active)setRawEtfError(e instanceof Error?e.message:'ETF research unavailable');});
  return ()=>{active=false;};
 },[ownerConnected,rawEtfDay,selected,rule.cadence]);
 // Refresh visible owner results quietly; retain the last verified view during transient failures.
 useEffect(()=>{
  if(!ownerConnected)return;
  let active=true,inFlight=false;
  const poll=async()=>{
   if(document.visibilityState!=='visible'||inFlight)return;
   inFlight=true;
   try{
    const auth=cloudPaperUsesGateway?'':ownerToken;
    const results=await Promise.allSettled([
     cloudPaperRequest<Accounts>(auth,'seven-accounts'),
     cloudPaperRequest<StrategyJournal>(auth,'strategy-journal',{day:journalDay,strategy:selected})
    ]);
    if(!active)return;
    const a=results[0];
    if(a.status==='fulfilled'&&a.value.paperOnly===true&&a.value.realOrdersEnabled===false&&
     Array.isArray(a.value.accounts)&&a.value.accounts.length===7&&ATLAS_RULES.every(rule=>a.value.accounts.some(x=>x.strategyId===rule.id)))setAccounts(a.value);
    const j=results[1];
    if(j.status==='fulfilled'&&j.value.schema==='atlas.strategy-journal.v1'&&j.value.mode==='PAPER_ONLY'&&
     j.value.realOrdersEnabled===false&&j.value.strategyId===selected&&j.value.sourceDate===journalDay)setJournal(j.value);
   }finally{inFlight=false;}
  };
  const timer=setInterval(()=>void poll(),15000),visible=()=>void poll();
  document.addEventListener('visibilitychange',visible);
  return ()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[ownerConnected,ownerToken,selected,journalDay]);
 const rawResult=rawEtfReport?.results?.find(x=>x.strategyId===selected);
 return <section className="atlas-paper-home atlas-chart-page">
  <div className="atlas-workspace-header"><div><div className="breadcrumb">ATLAS / PAPER TRADING</div><h1>Trading workspace<span className="period">.</span></h1><p>Strategies, stock charts and recorded paper results.</p></div><div className="atlas-workspace-actions"><span className="atlas-rule-badge"><ShieldCheck size={14}/> Paper only</span>{ownerConnected&&<button className="secondary-button" type="button" disabled={busy} onClick={()=>void refresh()}><RefreshCcw size={15}/>{busy?'Refreshing…':'Refresh'}</button>}</div></div>
  {!ownerConnected&&<div className="panel atlas-owner-connect"><h2>Connect your private results</h2><p>Restore owner access once in this browser to see recorded balances and charts.</p><details><summary>Restore owner access</summary><div className="atlas-owner-row"><label htmlFor="atlas-owner-token">Recovery key</label><input id="atlas-owner-token" type="password" autoComplete="off" value={ownerToken} onChange={e=>setOwnerToken(e.target.value)} placeholder="Owner recovery key"/><button className="primary-button" type="button" disabled={busy||ownerToken.length<32} onClick={()=>void refresh()}>Restore</button></div></details></div>}
  {error&&<p role="alert" className="atlas-simple-error">{error}</p>}{accountNotice&&<p role="status" className="atlas-simple-note">{accountNotice}</p>}
  <div className="atlas-strategy-top"><div className="atlas-strategy-label"><strong>Strategies</strong><span>Swipe or drag to explore</span><select aria-label="Select strategy" value={selected} onChange={e=>setSelected(e.target.value)}>{ATLAS_RULES.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
   <div ref={strategyStrip} className="atlas-strategy-strip" aria-label="Seven Atlas strategies"
    onPointerDown={e=>{if(e.pointerType==='mouse'&&e.button===0)drag.current={x:e.clientX,left:e.currentTarget.scrollLeft,moved:false};}}
    onPointerMove={e=>{if(!drag.current||!e.buttons)return;const delta=e.clientX-drag.current.x;if(Math.abs(delta)>8){drag.current.moved=true;e.currentTarget.scrollLeft=drag.current.left-delta;}}}
    onPointerUp={()=>{if(drag.current&&!drag.current.moved)drag.current=null;}}
    onPointerLeave={()=>{drag.current=null;}}
    onClickCapture={e=>{if(drag.current?.moved){e.preventDefault();e.stopPropagation();drag.current=null;}}}>
    {ATLAS_RULES.map(x=><button key={x.id} type="button" aria-pressed={selected===x.id} className={'atlas-strategy-chip '+(selected===x.id?'selected':'')} onClick={()=>setSelected(x.id)}><strong>{x.name}</strong><small>{x.cadence}</small></button>)}
   </div>
  </div>
  <article id="atlas-strategy-detail" className="atlas-strategy-detail atlas-workspace-detail">
   <div className="atlas-rule-heading"><div><span className="premium-kicker">{rule.cadence.toUpperCase()} STRATEGY</span><h2>{rule.name}</h2><p>{rule.summary}</p></div><span className="atlas-rule-badge"><LockKeyhole size={13}/>{catalog?.strategies.find(x=>x.id===selected)?.executionStatus==='PAPER_PILOT_ARMED'?'Paper pilot active':ownerConnected?'Waiting for qualified inputs':'Owner view needed'}</span></div>
   <div className="atlas-account-overview" aria-label="Forward paper account">
    <div><small>Realized paper P&amp;L</small><strong className={account&&account.realizedPnlINR<0?'atlas-down':'atlas-up'}>{account?inr(account.realizedPnlINR):'—'}</strong><span>Recorded closed results</span></div>
    <div><small>Virtual cash</small><strong>{account?inr(account.cashINR):'—'}</strong><span>Available paper balance</span></div>
    <div><small>Current equity</small><strong>{account?.experiment?.equityINR!=null?inr(account.experiment.equityINR):'—'}</strong><span>{account?.positionCount?'Fresh open-position marks required':'Cash plus marked positions'}</span></div>
    <div><small>Open positions / paper fills</small><strong>{account?account.positionCount:'—'} <span className="atlas-metric-divider">/</span> {account?account.paperFills:'—'}</strong><span>{account?account.pendingCount+' pending':'No result is assumed'}</span></div>
   </div>
   <PaperChartWorkspace report={account?.experiment} strategy={selected} ownerConnected={ownerConnected} ownerToken={ownerToken} day={sampleDay} symbol={sampleSymbol} onDay={setSampleDay} onSymbol={setSampleSymbol} dates={availability?.minute.dates??[]} stocks={[...(topVolume?.stocks.filter(x=>x.archived).map(x=>x.symbol)??[]),...COHORT]} onJournalDay={setJournalDay}/>
   {account?.experiment?<PaperExperimentReport report={account.experiment} strategy={selected}/>:<div className="panel atlas-analysis-panel"><h3>Trade results</h3><p>{ownerConnected?'No verified experiment report for this strategy yet.':'Connect the owner view to see recorded trade results.'}</p></div>}
   <details className="panel atlas-workspace-fold"><summary>Strategy rules and readiness</summary><dl className="atlas-rule-steps"><div><dt>Pick</dt><dd>{rule.selection}</dd></div><div><dt>Enter</dt><dd>{rule.entry}</dd></div><div><dt>Exit</dt><dd>{rule.exit}</dd></div><div><dt>Needs</dt><dd>{rule.needs}</dd></div></dl><p>{rule.trial}</p><p>{catalog?.executionStatus==='X_VWAP_PAPER_PILOTS_ARMED_OTHER_FIVE_UNARMED'?'ScalpStorm X and VWAP Precision are configured as forward paper pilots. Other five rules await qualified inputs and execution validation. New pilots need a genuine market session before unattended operation is certified.':'Only source-qualified forward fills count as recorded performance.'}</p></details>
   <section className="panel atlas-activity-panel" aria-label="Dated paper activity"><div className="atlas-section-heading"><div><h3>Day activity</h3><p>Choose a market date to inspect actual fills and decisions.</p></div><label>Market date<input aria-label="Activity market date" type="date" value={journalDay} max={new Date(Date.now()+19800000).toISOString().slice(0,10)} onChange={e=>setJournalDay(e.target.value)}/></label></div>
    {journalError&&<p role="alert" className="atlas-simple-error">{journalError}</p>}{journal&&<><p>{journal.sourceDate} · {journal.account.fills} paper fills · {journal.account.positions} positions · {journal.account.pending} pending</p><PaperActivity events={journal.events}/></>}
   </section>
   <details id="atlas-history" className="panel atlas-workspace-fold"><summary>Historical research and data coverage</summary><p>Historical research is separate from forward paper performance. Full top-volume history needs the exact 09:40 roster and matching stock receipts.</p>
    {rule.cadence==='Intraday'?<><HistoryCoverageTimeline dates={availability?.minute.dates??[]} selected={sampleDay} onSelect={setSampleDay}/><div className="atlas-replay-controls"><label>Research session<select value={sampleDay} onChange={e=>setSampleDay(e.target.value)}>{availability?.minute.dates.map(x=><option key={x.day} value={x.day}>{x.day} · {x.symbols} stocks</option>)}</select></label><label>Research stock<select value={sampleSymbol} onChange={e=>setSampleSymbol(e.target.value)}>{[...new Set([sampleSymbol,...(topVolume?.stocks.filter(x=>x.archived).map(x=>x.symbol)??[]),...COHORT].filter(Boolean))].map(s=><option key={s}>{s}</option>)}</select></label><button type="button" className="secondary-button" disabled={!sampleDay||!ownerConnected} onClick={()=>void loadReplay()}>Inspect dated result</button></div>
     {ownerConnected&&sampleDay&&<DayStrategyReview day={sampleDay} strategy={selected} stocks={topVolume?.stocks.filter(x=>x.archived).map(x=>x.symbol)??COHORT} onPick={setSampleSymbol}/>}
    </>:<><label>Research date <select value={rawEtfDay} onChange={e=>setRawEtfDay(e.target.value)}>{availability?.etf_raw.dates.map(x=><option key={x.day} value={x.day}>{x.day}</option>)}</select></label>{rawEtfError&&<p role="status">{rawEtfError}</p>}{rawResult&&<ResearchTradeResults result={rawResult} fallbackSymbol={selected==='rsi2_snapback'?'NIFTYBEES':'ETF'}/>}</>}
    {replayError&&<p role="alert">{replayError}</p>}{replay&&<div className="atlas-replay-proof"><strong>{replay.status.replaceAll('_',' ')}</strong><span>{replay.symbol} · {replay.sourceDate} · {replay.minuteBars} minute bars</span>{replay.result&&<p>Source-qualified retrospective {replay.result.signal.status.toLowerCase().replaceAll('_',' ')}{replay.result.signal.side?' · '+replay.result.signal.side:''}. No paper fill was created.</p>}<p>Profit and win rate: unavailable until entry, exit and risk settings are qualified.</p><details><summary>Receipt source</summary><code>{replay.sourceSha256}</code><p>Published {new Date(replay.sourceKnownAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</p></details></div>}
   </details>
   <details className="panel atlas-workspace-fold"><summary>Cloud service and archive details</summary><p>Owner view {ownerConnected?'connected':'locked'} · {status?.configured?'Cloud connected':'Cloud status unverified'}. Results refresh every 15 seconds while this page is visible.</p><p>{availability?`${availability.live_minute.days} live minute dates · ${availability.minute.days} completed minute dates · ${availability.daily.days} daily-stock dates · ${availability.etf_raw.days} raw ETF dates`:'Archive inventory unavailable.'}</p>{state&&<p>Separate legacy ledger: {state.strategy} · {state.positions.length} open virtual positions · {state.last_strategy_phase?.status??'No recorded phase'}</p>}<div className="atlas-simple-actions"><button className="secondary-button" type="button" onClick={goMarket}>Market evidence</button><button className="secondary-button" type="button" onClick={goData}>Captured dates</button><button className="secondary-button" type="button" onClick={goReplay}>Market replay</button><button className="secondary-button" type="button" onClick={goSchedule}>Scheduled paper orders</button></div></details>
  </article>
 </section>;
}
type ActivityEvent=StrategyJournal['events'][number];
function PaperActivity({events}:{events:ActivityEvent[]}){
 const [all,setAll]=useState(false),[limit,setLimit]=useState(20);
 useEffect(()=>{setLimit(20);},[events,all]);
 const visible=all?events:events.filter(e=>e.quantity!=null||/FILL|EXIT|ENTRY/.test(e.kind));
 return <><div className="atlas-view-tabs"><button type="button" aria-pressed={!all} onClick={()=>setAll(false)}>Trades &amp; orders</button><button type="button" aria-pressed={all} onClick={()=>setAll(true)}>All decisions ({events.length})</button></div>{visible.length===0?<p role="status">{all?'No recorded event on this date.':'No trade or order event on this date. Open All decisions for evaluated signals.'}</p>:<><div className="atlas-table-scroll"><table className="atlas-workspace-table"><thead><tr><th>Time · IST</th><th>Stock</th><th>Activity</th><th>Shares</th><th>Price</th><th>Details</th></tr></thead><tbody>{visible.slice(0,limit).map((e,i)=><tr key={e.at+'-'+i}><td>{new Date(e.at).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'})}</td><th scope="row">{e.symbol??'Session'}</th><td>{e.kind.replaceAll('_',' ')}{e.side?' · '+e.side:''}</td><td>{e.quantity??'—'}</td><td>{e.priceINR!=null?inr(e.priceINR):'—'}</td><td><details><summary>Why / source</summary><p>{e.reason.replaceAll('_',' ').toLowerCase()}</p>{e.sourceHashes.map(h=><code key={h}>{h}</code>)}</details></td></tr>)}</tbody></table></div>{visible.length>limit&&<button className="secondary-button" type="button" onClick={()=>setLimit(v=>v+20)}>Show 20 more ({visible.length-limit} remaining)</button>}</>}</>;
}
