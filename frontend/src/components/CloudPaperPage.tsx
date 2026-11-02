import {useCallback, useEffect, useState} from 'react';
import {CalendarClock, Cloud, Clock3, LockKeyhole, RefreshCcw, ShieldCheck, XCircle} from 'lucide-react';

type PaperOrder={id:string;kind:string;symbol:string;side:string;qty:number;due_at:string;
 status:string;reason:string|null;fill_paise:number|null;fee_paise:number|null};
type PaperState={mode:'PAPER_ONLY';realOrdersEnabled:false;strategy_enabled:boolean;
 strategy:string;cash_paise:number;equity_paise:number|null;
 positions:{symbol:string;qty:number}[];orders:PaperOrder[];
 events:{id:number;observed_at:string;type:string;message:string}[];
 server_time:string;market_session:boolean;last_strategy_phase:{completed_at:string;status:string;reason:string|null}|null};

// Bundled app contains only the configured endpoint, NEVER an owner credential.
const CUSTOM_API=(import.meta.env.VITE_ATLAS_PAPER_API_URL as string|undefined)?.replace(/\/$/,'')||'';
const API=CUSTOM_API?`${CUSTOM_API}/api/cloud-paper`:'/api/cloud-paper';
const inr=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(paise/100);
const displayTime=(date:string)=>new Date(date).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true});

export default function CloudPaperPage({initialToken=''}:{initialToken?:string}){
 const [token,setToken]=useState(initialToken);
 const [connected,setConnected]=useState(false);
 const [state,setState]=useState<PaperState|null>(null);
 const [symbol,setSymbol]=useState('');
 const [side,setSide]=useState<'BUY'|'SELL'>('BUY');
 const [quantity,setQuantity]=useState('1');
 const [schedule,setSchedule]=useState('');
 const [loading,setLoading]=useState(false);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [configured,setConfigured]=useState(Boolean(CUSTOM_API));
 const [backendConnected,setBackendConnected]=useState(false);
 const request=useCallback(async (path:string,method:'GET'|'POST'='GET',body?:object)=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch(CUSTOM_API?`${API}/${path}`:`${API}?action=${encodeURIComponent(path)}`,{
    method,mode:'cors',cache:'no-store',credentials:'omit',signal:controller.signal,
    headers:{'Authorization':`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||`Service error ${response.status}`);
   return data;
  }finally{clearTimeout(timer)}
 },[token]);
 useEffect(()=>{
  if(CUSTOM_API)return;
  let current=true;
  fetch('/api/cloud-paper?action=status',{cache:'no-store',credentials:'omit'})
   .then(async r=>r.ok?await r.json():null)
   .then(data=>{if(current){setConfigured(data?.mode==='PAPER_ONLY' && data?.realOrdersEnabled===false && data?.configured===true);setBackendConnected(data?.backendConnected===true)}})
   .catch(()=>{if(current)setConfigured(false)});
  return ()=>{current=false};
 },[]);
 const refresh=useCallback(async ()=>{
  if(!configured||!connected)return;
  try{
   const result=await request('state');
   if(result.mode!=='PAPER_ONLY'||result.realOrdersEnabled!==false)throw Error('Invalid paper-only service response');
   setState(result);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Cloud service unavailable');}
 },[configured,connected,request]);
 useEffect(()=>{
  if(!connected)return;
  void refresh();
  const timer=setInterval(()=>void refresh(),20000);
  return ()=>clearInterval(timer);
 },[connected,refresh]);
 async function connect(){
  setLoading(true);setError('');
  try{
   const result=await request('state');
   if(result.mode!=='PAPER_ONLY'||result.realOrdersEnabled!==false)throw Error('Paper safety handshake failed');
   setState(result);setConnected(true);setNotice('Private paper service connected. Token remains in browser memory only.');
  }catch(e){setConnected(false);setError(e instanceof Error?e.message:'Unable to connect');}
  finally{setLoading(false)}
 }
 async function update(path:string,payload:object,success:string){
  setLoading(true);setError('');setNotice('');
  try{
   await request(path,'POST',payload);
   const result=await request('state');setState(result);setNotice(success);
  }catch(e){setError(e instanceof Error?e.message:'Cloud operation failed');}
  finally{setLoading(false)}
 }
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!schedule){setError('Select an IST date and time');return;}
  const ts=new Date(`${schedule}:00+05:30`);
  if(Number.isNaN(ts.getTime())){setError('Invalid scheduled time');return;}
  await update('orders',{symbol:symbol.trim().toUpperCase(),side,quantity:Number(quantity),
   scheduled_at:ts.toISOString(),idempotency_key:crypto.randomUUID().replaceAll('-','')},
   'Scheduled paper order saved on the cloud worker. Execution requires a fresh verified quote.');
 }
 return <section className="cloud-paper-screen">
  <div className="sub-page-header"><div className="breadcrumb">ATLAS / CLOUD PAPER DESK</div>
   <h1>Scheduled paper orders<span className="period">.</span></h1>
   <p>Schedule from your phone. The independent worker manages due orders even when this browser is closed.</p></div>
  <div className="panel cloud-paper-safety"><ShieldCheck size={22}/><div>
   <strong>PAPER ONLY · ZERO BROKER ORDERS</strong>
   <p>Automatic simulated fills require fresh, source-timestamped NSE quotes and an authenticated server. Missed schedules are skipped, never backfilled. No fabricated profits.</p>
  </div></div>
  {!configured?<div className="panel cloud-paper-unavailable"><Cloud size={30}/><h2>{backendConnected?'Cloud worker hosted — private activation pending':'Cloud worker not connected to this deployment'}</h2>
   <p>Infrastructure and verified NSE market-data access must be configured. This public dashboard does not pretend to execute unattended orders.</p>
   <span className="cloud-paper-pill">DEPLOYMENT GATE · PRIVATE CLOUD WORKER + VERIFIED NSE FEED</span></div>:
  !connected?<div className="panel cloud-paper-connect"><LockKeyhole size={26}/><h2>Private paper account</h2>
   <p>Authenticate to manage your scheduled virtual orders. Your token is kept only in this browser tab's memory—not in localStorage or source code.</p>
   <form onSubmit={e=>{e.preventDefault();void connect()}}><label htmlFor="cloud-token">Owner access token</label>
    <input id="cloud-token" type="password" autoComplete="off" minLength={32} required value={token} onChange={e=>setToken(e.target.value)} placeholder="Private owner token"/>
    <button type="submit" className="primary-button" disabled={loading||token.length<32}>Connect cloud paper desk</button></form></div>:
  <div className="cloud-paper-content">
   <div className="cloud-paper-stats">
    <div className="panel"><small>Virtual cash</small><strong>{state?inr(state.cash_paise):'—'}</strong><span>Auditable integer-paise ledger</span></div>
    <div className="panel"><small>Virtual equity</small><strong>{state?.equity_paise!=null?inr(state.equity_paise):'Unavailable'}</strong><span>Unpriced when quotes are stale</span></div>
    <div className="panel"><small>Automated 9:40 strategy</small><strong>{state?.strategy_enabled?'Armed':'Disabled'}</strong><span>Exits targeted for 3:15 PM IST</span></div>
   </div>
   <div className="cloud-paper-two">
    <form className="panel cloud-paper-ticket" onSubmit={e=>void submit(e)}>
     <div className="cloud-paper-heading"><CalendarClock size={19}/><h2>Schedule a paper order</h2></div>
     <label htmlFor="cloud-symbol">NSE equity symbol</label><input id="cloud-symbol" value={symbol} onChange={e=>setSymbol(e.target.value)} required maxLength={30} placeholder="e.g. INFY" autoComplete="off"/>
     <div className="cloud-paper-form-row"><div><label htmlFor="cloud-side">Side</label><select id="cloud-side" value={side} onChange={e=>setSide(e.target.value as 'BUY'|'SELL')}><option value="BUY">BUY</option><option value="SELL">SELL</option></select></div>
      <div><label htmlFor="cloud-quantity">Shares</label><input id="cloud-quantity" type="number" min={1} max={100000} step={1} value={quantity} onChange={e=>setQuantity(e.target.value)} required/></div></div>
     <label htmlFor="cloud-schedule">Scheduled date & time (IST)</label><input id="cloud-schedule" type="datetime-local" value={schedule} onChange={e=>setSchedule(e.target.value)} required/>
     <p className="cloud-paper-helper"><Clock3 size={14}/> NSE 9:15 AM–3:30 PM, weekdays. Holiday/feed proof remains mandatory at execution.</p>
     <button type="submit" className="primary-button" disabled={loading||!state}>Schedule virtual order</button>
    </form>
    <div className="panel cloud-paper-strategy">
     <div className="cloud-paper-heading"><Cloud size={19}/><h2>Autonomous intraday runner</h2></div>
     <div className="cloud-paper-strategy-badge">NSE TOP VOLUME · 09:40 → 15:15 IST</div>
     <p>At 9:40 AM, consider the ten highest-volume stocks from the provider-attested full eligible universe. Nifty direction sets simulated BUY or short SELL; neutral means no trade. Model ₹10,000 maximum exposure per stock, 2% protective stop and 3:15 PM exit.</p>
     <p>Activation does not override coverage checks, capital limits, feed availability or market closures.</p>
     <button type="button" className={state?.strategy_enabled?'secondary-button':'primary-button'} disabled={loading||!state} onClick={()=>void update('strategy',{enabled:!state?.strategy_enabled},state?.strategy_enabled?'Cloud strategy disabled.':'Strategy armed; waiting for a certified NSE session.')}>{state?.strategy_enabled?'Disable autonomous paper strategy':'Arm autonomous paper strategy'}</button>
     <button className="cloud-paper-refresh" type="button" onClick={()=>void refresh()}><RefreshCcw size={15}/> Refresh server records</button>
     <button className="cloud-paper-refresh" type="button" disabled={loading} onClick={()=>{
      setLoading(true);setNotice('');setError('');
      void request('feed-check').then(result=>setNotice(result.authenticated&&result.readOnly?
       `Upstox Analytics read-only API verified. Nifty quote ${result.data_current?'current':'not current (market may be closed)'}. Last market trade: ${displayTime(result.last_trade_at)}.`:
       'Read-only feed unavailable.')).catch(e=>setError(e instanceof Error?e.message:'Feed verification failed'))
       .finally(()=>setLoading(false));
     }}><ShieldCheck size={15}/> Verify Upstox read-only feed</button>
    </div>
   </div>
   <div className="panel cloud-paper-table"><h2>Order book</h2>{state?.orders.length?<div className="cloud-paper-scroll"><table><thead><tr><th>Schedule (IST)</th><th>Stock</th><th>Side</th><th>Shares</th><th>Modeled price</th><th>Status</th><th></th></tr></thead>
    <tbody>{state.orders.map(o=><tr key={o.id}><td>{displayTime(o.due_at)}</td><td>{o.symbol}</td><td>{o.side}</td><td>{o.qty}</td><td>{o.fill_paise!=null?inr(o.fill_paise):'—'}</td><td title={o.reason||undefined}>{o.status}{o.reason?` · ${o.reason.replaceAll('_',' ').toLowerCase()}`:''}</td><td>{o.kind==='MANUAL'&&o.status==='QUEUED'?<button type="button" className="cloud-paper-cancel" disabled={loading} aria-label={`Cancel ${o.symbol} scheduled order`} onClick={()=>void update('cancel',{id:o.id},'Queued order cancelled.')}><XCircle size={16}/></button>:null}</td></tr>)}</tbody></table></div>:<p className="cloud-paper-empty">No server-side orders yet. Nothing has been simulated.</p>}</div>
   <div className="panel cloud-paper-table"><h2>Virtual positions & audit events</h2><p>Held positions: {state?.positions.length?state.positions.map(p=>`${p.symbol} ${p.qty} shares`).join(' · '):'None recorded'}</p>
    <div className="cloud-paper-audit">{state?.events.slice(0,12).map(e=><div key={e.id}><span>{displayTime(e.observed_at)}</span><strong>{e.type}</strong><span>{e.message}</span></div>)}</div></div>
   <button type="button" className="cloud-paper-disconnect" onClick={()=>{setConnected(false);setState(null);setToken('');setNotice('');}}>Disconnect & forget token</button>
  </div>}
  {error&&<div className="cloud-paper-message cloud-paper-error" role="alert">{error}</div>}
  {notice&&<div className="cloud-paper-message" role="status">{notice}</div>}
 </section>;
}
