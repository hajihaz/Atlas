import {useEffect,useRef,useState} from 'react';
import {ArrowRight,CheckCircle2,Cloud,Database,LockKeyhole,RefreshCcw,ShieldCheck} from 'lucide-react';
import {ATLAS_RULES} from '../data/atlasSeven';
import {cloudPaperRequest,cloudPaperUsesGateway,ownerSession} from '../lib/cloudPaperRead';
import type {Availability} from './DataAvailabilityPage';
import ResearchTradeResults from './ResearchTradeResults';
import HistoryCoverageTimeline from './HistoryCoverageTimeline';
import DayStrategyReview from './DayStrategyReview';
type CloudStatus={mode:string;realOrdersEnabled:boolean;backendConnected:boolean;configured:boolean;feedSourceConfigured:boolean};
type Catalog={schema:string;paperOnly:boolean;realOrdersEnabled:boolean;executionStatus:string;strategies:{id:string;name:string;executionStatus:string}[]};
type Account={strategyId:string;cashINR:number;realizedPnlINR:number;positionCount:number;pendingCount:number;paperFills:number};
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
 const rawResult=rawEtfReport?.results?.find(x=>x.strategyId===selected);
 return <section className="atlas-paper-home">
  <div className="sub-page-header"><div className="breadcrumb">ATLAS / PAPER TRADING</div>
   <h1>Test seven strategies<span className="period">.</span></h1>
   <p>One place to see the rule, data needed and verified paper result. All money shown here is virtual.</p></div>
  <div className="panel atlas-simple-status"><ShieldCheck size={22}/><div>
   <strong>Paper only · real broker orders disabled</strong>
   <p>The cloud can run while your Mac and phone are off. Each strategy needs its own verified feed and forward paper test before Atlas can call it automatic.</p>
  </div></div>
  <div className="atlas-simple-actions" aria-label="Start with Atlas">
   <button className="primary-button" type="button" onClick={()=>document.getElementById('atlas-strategy-detail')?.scrollIntoView({behavior:'smooth',block:'start'})}>Explore seven strategies <ArrowRight size={16}/></button>
   <button className="secondary-button" type="button" onClick={goReplay}>Replay market history <ArrowRight size={16}/></button>
   <button className="secondary-button" type="button" onClick={goData}>See captured dates <ArrowRight size={16}/></button>
  </div>
  <div className="atlas-simple-grid">
   <div className="panel atlas-simple-card"><small>Cloud service</small><strong>{status===null?'Checking cloud…':status.configured?'Connected':status.backendConnected?'Hosted · setup incomplete':'Unavailable'}</strong>
    <span>{status?.feedSourceConfigured?'Upstox read-only feed configured':'Market feed not verified here'}</span></div>
   <div className="panel atlas-simple-card"><small>New strategy set</small><strong>7 defined</strong><span>5 intraday · 1 swing · 1 monthly</span></div>
   <div className="panel atlas-simple-card"><small>Automatic paper testing</small><strong>{catalog?.executionStatus==='X_PAPER_PILOT_ARMED_OTHER_SIX_UNARMED'?'X pilot armed':ownerConnected?'Checking paper status':'Owner view needed'}</strong><span>Other six rules await qualified feeds and risk tests</span></div>
  </div>
  <div className="panel atlas-data-home"><Database size={20}/><div><strong>Available market data</strong><p>{availability?`${availability.live_minute.days} live minute dates · ${availability.opening_seed.days} opening-range dates · ${availability.minute.days} completed minute dates · ${availability.daily.days} daily-stock dates · ${availability.etf_raw.days} raw ETF history dates · ${availability.nse_reference.days} NSE reference dates · ${availability.full_0940.days} 9:40 dates`:'Connect to see exact cloud archive counts.'}</p></div><a href="#data">See every date</a></div>
  {ownerConnected?<div className="atlas-owner-tools"><span>Owner view connected</span><button className="secondary-button" type="button" disabled={busy} onClick={()=>void refresh()}><RefreshCcw size={16}/> Refresh results</button></div>:
   <div className="panel atlas-owner-connect"><h2>Owner view is locked in this browser</h2><p>Atlas cloud jobs keep running. Restore browser access once to see private results and schedule paper orders.</p>
    <details><summary>Restore owner access</summary><div className="atlas-owner-row"><label htmlFor="atlas-owner-token">Recovery key</label>
     <input id="atlas-owner-token" type="password" autoComplete="off" value={ownerToken} onChange={e=>setOwnerToken(e.target.value)} placeholder="Owner recovery key"/>
     <button className="primary-button" type="button" disabled={busy||ownerToken.length<32} onClick={()=>void refresh()}>Restore</button></div></details>
    {error&&<p role="alert" className="atlas-simple-error">{error}</p>}</div>}
  {accountNotice&&<p role="status" className="atlas-simple-note">{accountNotice}</p>}
  <div className="atlas-strategy-layout">
   <div className="atlas-strategy-list" aria-label="Seven Atlas strategies">
    {ATLAS_RULES.map(x=><button key={x.id} type="button" aria-pressed={selected===x.id}
     className={'panel atlas-strategy-button '+(selected===x.id?'selected':'')} onClick={()=>{setSelected(x.id);document.getElementById('atlas-strategy-detail')?.scrollIntoView({behavior:'smooth',block:'start'});}}>
     <span><strong>{x.name}</strong><small>{x.cadence}</small></span><ArrowRight size={17}/></button>)}
   </div>
   <article id="atlas-strategy-detail" className="panel atlas-strategy-detail">
    <div className="atlas-rule-heading"><div><span className="premium-kicker">{rule.cadence.toUpperCase()} RULE</span><h2>{rule.name}</h2></div>
     <span className="atlas-rule-badge"><LockKeyhole size={13}/> {catalog?.strategies.find(x=>x.id===selected)?.executionStatus==='PAPER_PILOT_ARMED'?'Paper pilot':'Signal only'}</span></div>
    <p className="atlas-rule-summary">{rule.summary}</p>
    <details className="atlas-rule-explainer"><summary>How this strategy works</summary><dl className="atlas-rule-steps">
     <div><dt>Pick</dt><dd>{rule.selection}</dd></div>
     <div><dt>Enter</dt><dd>{rule.entry}</dd></div>
     <div><dt>Exit</dt><dd>{rule.exit}</dd></div>
     <div><dt>Needs</dt><dd>{rule.needs}</dd></div>
    </dl>
    <p className="atlas-simple-note"><strong>Testing note:</strong> {rule.trial}</p></details>
    <div className="atlas-strategy-portfolio" aria-label="Forward paper account">
     <div><small>Open positions</small><strong>{account?account.positionCount:'—'}</strong></div>
     <div><small>Paper fills</small><strong>{account?account.paperFills:'—'}</strong></div>
     <div><small>Virtual cash</small><strong>{account?inr(account.cashINR):'—'}</strong></div>
     <div><small>Realized paper P&amp;L</small><strong>{account?inr(account.realizedPnlINR):'—'}</strong></div>
    </div>
    <div className="atlas-rule-evidence"><h3>Forward paper activity</h3>
     <p>{catalog?.strategies.find(x=>x.id===selected)?.executionStatus==='PAPER_PILOT_ARMED'?'Paper pilot active. A trade appears here only after a verified live signal and later fresh quote.':'Paper testing is waiting for the data this strategy needs.'}</p>
     <label>Market date <input type="date" value={journalDay} max={new Date(Date.now()+19800000).toISOString().slice(0,10)} onChange={e=>setJournalDay(e.target.value)}/></label>
     {journalError&&<p role="alert" className="atlas-simple-error">{journalError}</p>}
     {journal&&<><p className="atlas-simple-note">{journal.sourceDate} · {journal.account.pending} pending · {journal.account.positions} positions · {journal.account.fills} paper fills</p>
      {journal.events.length===0?<p role="status">No verified forward event for this rule on this date.</p>:
       <div className="atlas-data-dates">{journal.events.map((event,i)=><div key={`${event.at}-${event.symbol??'session'}-${i}`}>
        <strong>{event.symbol??'Session'} · {event.kind.replaceAll('_',' ')}</strong>
        <span>{new Date(event.at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST · {event.side?`${event.side} · `:''}{event.reason.replaceAll('_',' ').toLowerCase()}{event.quantity!=null?` · ${event.quantity} shares at ${inr(event.priceINR??0)} · fee ${inr(event.feeINR??0)} · realized ${inr(event.realizedPnlINR??0)}`:''}</span>
        {event.sourceHashes.length>0&&<small title={event.sourceHashes.join(', ')}>Source SHA-256: {event.sourceHashes[0].slice(0,16)}… · {event.sourceHashes.length} completed bars</small>}
       </div>)}</div>}
     </>}
    </div>
    <div id="atlas-history" className="atlas-rule-evidence"><h3>Historical evidence</h3><p>{rule.cadence==='Intraday'?`${availability?.minute.days??0} dated minute sessions available. Full top-volume history begins only on dates with a verified 09:40 roster and matching after-close stock bars.`:`${availability?.etf_raw.days??0} dated raw ETF history receipts available. Adjustment and faithful weekly/monthly backtests remain unverified.`}</p>
     {rule.cadence!=='Intraday'&&<><label>Research date <select value={rawEtfDay} onChange={e=>setRawEtfDay(e.target.value)}>{availability?.etf_raw.dates.map(x=><option key={x.day} value={x.day}>{x.day}</option>)}</select></label>
      {rawEtfError&&<p role="status" className="atlas-simple-note">{rawEtfError}</p>}
      {rawResult&&<ResearchTradeResults result={rawResult} fallbackSymbol={selected==='rsi2_snapback'?'NIFTYBEES':'ETF'}/>}
     </>}
     {rule.cadence==='Intraday'&&<><div className="atlas-intraday-performance"><strong>Paper performance chart</strong><p>{account?.paperFills?`${account.paperFills} fills are recorded. Open the dated activity above to inspect verified prices and results.`:'No verified fills yet, so there is no profit curve to draw. The chart below shows recorded market data only.'}</p></div><HistoryCoverageTimeline dates={availability?.minute.dates??[]} selected={sampleDay} onSelect={setSampleDay}/><div className="atlas-replay-controls"><label>Session<select value={sampleDay} onChange={e=>setSampleDay(e.target.value)}>{availability?.minute.dates.map(x=><option key={x.day} value={x.day}>{x.day} · {x.symbols} stocks</option>)}</select></label>
      <label>Stock<select value={sampleSymbol} onChange={e=>setSampleSymbol(e.target.value)}>{!sampleSymbol&&<option value="">Loading archived stocks…</option>}{topVolume?.stocks.map(x=><option key={x.symbol} value={x.symbol} disabled={!x.archived}>{x.rank}. {x.symbol} · {x.archived?'archived':'pending'}</option>)}
       {COHORT.filter(x=>!topVolume?.stocks.some(v=>v.symbol===x)).map(x=><option key={x} value={x}>{x} · fixed sample</option>)}</select></label>
      <button type="button" className="secondary-button" disabled={!sampleDay||!ownerConnected} onClick={()=>void loadReplay()}>Inspect dated result</button></div>
      {ownerConnected&&sampleDay&&<DayStrategyReview day={sampleDay} strategy={selected} stocks={topVolume?.stocks.filter(x=>x.archived).map(x=>x.symbol)??COHORT} onPick={setSampleSymbol}/>}
     </>}
     {replayError&&<p role="alert" className="atlas-simple-error">{replayError}</p>}
     {replay&&<div className="atlas-replay-proof"><strong>{replay.status.replaceAll('_',' ')}</strong><span>{replay.symbol} · {replay.sourceDate} · {replay.minuteBars} minute bars</span><span>Published {new Date(replay.sourceKnownAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</span><code title={replay.sourceSha256}>SHA-256 {replay.sourceSha256.slice(0,16)}…</code>
      {replay.result?<p>Source-qualified retrospective {replay.result.signal.status.toLowerCase().replace('_',' ')}{replay.result.signal.side?` · ${replay.result.signal.side}`:''}{replay.result.signal.reason?` · ${replay.result.signal.reason.replaceAll('_',' ').toLowerCase()}`:''}. No paper fill was created.</p>:null}
      <p>Profit and win rate: unavailable until entry, exit and risk settings are qualified.</p></div>}
    </div>
   </article>
  </div>
  {state&&<div className="panel atlas-existing-ledger"><Cloud size={19}/><div><strong>Existing cloud paper ledger</strong>
    <p>{state.strategy}: {state.strategy_enabled?'armed':'disabled'} · {state.positions.length} open virtual positions · Last phase {state.last_strategy_phase?.status??'none'}.
    This ledger is kept separate from the seven new accounts.</p></div></div>}
  <div className="atlas-simple-actions">
   <button className="secondary-button" type="button" onClick={goMarket}>View market evidence <ArrowRight size={16}/></button>
   <button className="secondary-button" type="button" onClick={goReplay}>Play market history <ArrowRight size={16}/></button>
   <button className="secondary-button" type="button" onClick={goSchedule}>Schedule a paper order <ArrowRight size={16}/></button>
  </div>
  <p className="atlas-simple-footnote"><CheckCircle2 size={15}/> Strategy definitions are implemented for deterministic signal research. Profits and win rates appear only after source-qualified fills.</p>
 </section>;
}
