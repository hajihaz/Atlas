import {useEffect,useRef,useState} from 'react';
import {ArrowRight,CheckCircle2,Cloud,Database,LockKeyhole,RefreshCcw,ShieldCheck} from 'lucide-react';
import {ATLAS_RULES} from '../data/atlasSeven';
import {cloudPaperRequest,cloudPaperUsesGateway,ownerSession} from '../lib/cloudPaperRead';
import type {Availability} from './DataAvailabilityPage';
type CloudStatus={mode:string;realOrdersEnabled:boolean;backendConnected:boolean;configured:boolean;feedSourceConfigured:boolean};
type Catalog={schema:string;paperOnly:boolean;realOrdersEnabled:boolean;executionStatus:string;strategies:{id:string;name:string}[]};
type Account={strategyId:string;cashINR:number;realizedPnlINR:number;positionCount:number;pendingCount:number;paperFills:number};
type Accounts={paperOnly:boolean;realOrdersEnabled:boolean;executionStatus:string;accounts:Account[]};
type State={mode:string;realOrdersEnabled:boolean;strategy_enabled:boolean;strategy:string;cash_paise:number;positions:{symbol:string;qty:number}[];last_strategy_phase:{status:string;reason:string|null}|null};
type Replay={status:string;sourceDate:string;symbol:string;sourceSha256:string;sourceKnownAt:string;minuteBars:number;required:string[];result:null};
const COHORT=['AXISBANK','BHARTIARTL','HDFCBANK','ICICIBANK','INFY','ITC','NHPC','RELIANCE','SBIN','TCS'];
const inr=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
export default function PaperTestingPage({ownerToken,setOwnerToken,ownerConnected,setOwnerConnected,goMarket,goSchedule}:{
 ownerToken:string;setOwnerToken:(v:string)=>void;ownerConnected:boolean;setOwnerConnected:(v:boolean)=>void;goMarket:()=>void;goSchedule:()=>void;
}){
 const [selected,setSelected]=useState(ATLAS_RULES[0].id);
 const [status,setStatus]=useState<CloudStatus|null>(null);
 const [catalog,setCatalog]=useState<Catalog|null>(null);
 const [accounts,setAccounts]=useState<Accounts|null>(null);
 const [state,setState]=useState<State|null>(null);
 const [availability,setAvailability]=useState<Availability|null>(null);
 const [sampleDay,setSampleDay]=useState('');
 const [sampleSymbol,setSampleSymbol]=useState('RELIANCE');
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
  if(!sampleDay){setReplayError('No dated minute receipt is available.');return;}
  try{const result=await cloudPaperRequest<Replay>(cloudPaperUsesGateway?'':ownerToken,'strategy-replay',{day:sampleDay,symbol:sampleSymbol,strategy:selected});
   if(serial===replaySerial.current)setReplay(result);
  }catch(e){if(serial===replaySerial.current)setReplayError(e instanceof Error?e.message:'Replay unavailable');}
 }
 useEffect(()=>{
  replaySerial.current++;
  setReplay(null);setReplayError('');
  if(rule.cadence==='Intraday'&&sampleDay&&(ownerConnected||ownerToken.length>=32)&&availability)void loadReplay();
 },[selected,sampleDay,sampleSymbol,ownerToken,ownerConnected,availability]);
 useEffect(()=>{if(ownerConnected&&!catalog)void refresh();},[ownerConnected]);
 return <section className="atlas-paper-home">
  <div className="sub-page-header"><div className="breadcrumb">ATLAS / PAPER TRADING</div>
   <h1>Test seven strategies<span className="period">.</span></h1>
   <p>One place to see the rule, data needed and verified paper result. All money shown here is virtual.</p></div>
  <div className="panel atlas-simple-status"><ShieldCheck size={22}/><div>
   <strong>Paper only · real broker orders disabled</strong>
   <p>The cloud can run while your Mac and phone are off. Each strategy needs its own verified feed and forward paper test before Atlas can call it automatic.</p>
  </div></div>
  <div className="atlas-simple-grid">
   <div className="panel atlas-simple-card"><small>Cloud service</small><strong>{status?.configured?'Connected':status?.backendConnected?'Hosted · setup incomplete':'Unavailable'}</strong>
    <span>{status?.feedSourceConfigured?'Upstox read-only feed configured':'Market feed not verified here'}</span></div>
   <div className="panel atlas-simple-card"><small>New strategy set</small><strong>7 defined</strong><span>5 intraday · 1 swing · 1 monthly</span></div>
   <div className="panel atlas-simple-card"><small>Automatic paper testing</small><strong>{catalog?.executionStatus==='SIGNAL_ONLY_UNARMED'?'Not armed':'Not verified'}</strong><span>Missing feeds and risk settings cause a skip</span></div>
  </div>
  <div className="panel atlas-data-home"><Database size={20}/><div><strong>Available market data</strong><p>{availability?`${availability.minute.days} minute dates · ${availability.daily.days} daily-bar dates · ${availability.nse_reference.days} NSE reference dates · ${availability.full_0940.days} full 9:40 dates`:'Connect to see exact cloud archive counts.'}</p></div><a href="#data">See every date</a></div>
  <div className="panel atlas-owner-connect">
   <div><h2>Private paper results</h2><p>{ownerConnected?'Connected securely. This browser will reconnect on return.':'Enter your owner token once. Atlas keeps a protected browser session; the token is not saved in browser storage.'}</p></div>
   <div className="atlas-owner-row">{!ownerConnected&&<><label htmlFor="atlas-owner-token">Owner token</label>
    <input id="atlas-owner-token" type="password" autoComplete="off" value={ownerToken} onChange={e=>setOwnerToken(e.target.value)} placeholder="Private owner token"/></>}
    <button className="primary-button" type="button" disabled={busy||(!ownerConnected&&ownerToken.length<32)} onClick={()=>void refresh()}><RefreshCcw size={16}/>{ownerConnected?'Refresh':'Connect'}</button>
    {ownerConnected&&<button type="button" className="secondary-button" onClick={()=>{void ownerSession('DELETE').then(()=>{setOwnerConnected(false);setOwnerToken('');setCatalog(null);setState(null);setAccounts(null);setAvailability(null);}).catch(()=>setError('Unable to disconnect. Try again.'));}}>Disconnect</button>}
   </div>
   {error&&<p role="alert" className="atlas-simple-error">{error}</p>}
   {accountNotice&&<p role="status" className="atlas-simple-note">{accountNotice}</p>}
  </div>
  <div className="atlas-strategy-layout">
   <div className="atlas-strategy-list" aria-label="Seven Atlas strategies">
    {ATLAS_RULES.map(x=><button key={x.id} type="button" aria-pressed={selected===x.id}
     className={'panel atlas-strategy-button '+(selected===x.id?'selected':'')} onClick={()=>setSelected(x.id)}>
     <span><strong>{x.name}</strong><small>{x.cadence}</small></span><ArrowRight size={17}/></button>)}
   </div>
   <article className="panel atlas-strategy-detail">
    <div className="atlas-rule-heading"><div><span className="premium-kicker">{rule.cadence.toUpperCase()} RULE</span><h2>{rule.name}</h2></div>
     <span className="atlas-rule-badge"><LockKeyhole size={13}/> Signal only</span></div>
    <p className="atlas-rule-summary">{rule.summary}</p>
    <dl className="atlas-rule-steps">
     <div><dt>Pick</dt><dd>{rule.selection}</dd></div>
     <div><dt>Enter</dt><dd>{rule.entry}</dd></div>
     <div><dt>Exit</dt><dd>{rule.exit}</dd></div>
     <div><dt>Needs</dt><dd>{rule.needs}</dd></div>
    </dl>
    <p className="atlas-simple-note"><strong>Testing note:</strong> {rule.trial}</p>
    <div className="atlas-result-line"><span>Forward paper fills</span><strong>{account?account.paperFills:'Not verified'}</strong></div>
    <div className="atlas-result-line"><span>Virtual cash</span><strong>{account?inr(account.cashINR):'Not available'}</strong></div>
    <div className="atlas-result-line"><span>Realized paper P&amp;L</span><strong>{account?inr(account.realizedPnlINR):'Not available'}</strong></div>
    <div className="atlas-rule-evidence"><h3>Historical evidence</h3><p>{rule.cadence==='Intraday'?`${availability?.minute.days??0} dated minute cohorts available. These ten-stock samples are not a full top-volume history.`:`${availability?.daily.days??0} ten-stock daily sample dates available. Required adjusted ETF history is missing.`}</p>
     {rule.cadence==='Intraday'&&<div className="atlas-replay-controls"><label>Session<select value={sampleDay} onChange={e=>setSampleDay(e.target.value)}>{availability?.minute.dates.map(x=><option key={x.day} value={x.day}>{x.day} · {x.symbols} stocks</option>)}</select></label>
      <label>Stock<select value={sampleSymbol} onChange={e=>setSampleSymbol(e.target.value)}>{COHORT.map(x=><option key={x}>{x}</option>)}</select></label>
      <button type="button" className="secondary-button" disabled={!sampleDay||(!ownerConnected&&ownerToken.length<32)} onClick={()=>void loadReplay()}>Inspect source</button></div>}
     {replayError&&<p role="alert" className="atlas-simple-error">{replayError}</p>}
     {replay&&<div className="atlas-replay-proof"><strong>{replay.status.replaceAll('_',' ')}</strong><span>{replay.symbol} · {replay.sourceDate} · {replay.minuteBars} minute bars</span><span>Published {new Date(replay.sourceKnownAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</span><code title={replay.sourceSha256}>SHA-256 {replay.sourceSha256.slice(0,16)}…</code><p>Profit and win rate: unavailable until all rule inputs and entry/exit settings are qualified.</p></div>}
    </div>
   </article>
  </div>
  {state&&<div className="panel atlas-existing-ledger"><Cloud size={19}/><div><strong>Existing cloud paper ledger</strong>
    <p>{state.strategy}: {state.strategy_enabled?'armed':'disabled'} · {state.positions.length} open virtual positions · Last phase {state.last_strategy_phase?.status??'none'}.
    This ledger is kept separate from the seven new accounts.</p></div></div>}
  <div className="atlas-simple-actions">
   <button className="secondary-button" type="button" onClick={goMarket}>View market evidence <ArrowRight size={16}/></button>
   <button className="secondary-button" type="button" onClick={goSchedule}>Schedule a paper order <ArrowRight size={16}/></button>
  </div>
  <p className="atlas-simple-footnote"><CheckCircle2 size={15}/> Strategy definitions are implemented for deterministic signal research. Profits and win rates appear only after source-qualified fills.</p>
 </section>;
}
