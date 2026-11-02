import {useEffect,useState} from 'react';
import {ArrowRight,Clock3,RefreshCcw,ShieldCheck} from 'lucide-react';
import {cloudPaperRequest} from '../lib/cloudPaperRead';
type Daybook={mode:string;realOrdersEnabled:boolean;session:string;
 coverage:{eligible_count:number;nifty_change_bps:number;received_at:string;source:string}|null;
 entry_snapshot_count:number;complete_0940_snapshot:boolean;
 top_volume:{symbol:string;cumulative_volume:number;price_paise:number;received_at:string}[];
 phases:{phase:string;status:string;reason:string|null;completed_at:string}[];
 strategy_orders:{kind:string;status:string;count:number}[];
 current_virtual_ledger:{cash_paise:number;positions:{symbol:string;qty:number}[];as_of:string}};
function todayIST(){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=(type:string)=>p.find(x=>x.type===type)?.value??'';
 return get('year')+'-'+get('month')+'-'+get('day');
}
const time=(value:string)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date(value))+' IST';
const number=(value:number)=>new Intl.NumberFormat('en-IN').format(value);
export default function MarketEvidencePage({ownerToken,goPaper}:{ownerToken:string;goPaper:()=>void}){
 const [day,setDay]=useState(todayIST);
 const [book,setBook]=useState<Daybook|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{setBook(null);},[day]);
 async function refresh(){
  if(ownerToken.length<32){setError('Connect your private paper account on the Paper Trading page.');return;}
  setBusy(true);setError('');
  try{
   const next=await cloudPaperRequest<Daybook>(ownerToken,'daybook',{day});
   if(next.mode!=='PAPER_ONLY'||next.realOrdersEnabled!==false||next.session!==day||!Array.isArray(next.top_volume))
    throw Error('Untrusted daybook response');
   setBook(next);
  }catch(e){setBook(null);setError(e instanceof Error?e.message:'Market evidence unavailable');}
  finally{setBusy(false);}
 }
 return <section className="atlas-market-evidence">
  <div className="sub-page-header"><div className="breadcrumb">ATLAS / NSE MARKET WATCH</div>
   <h1>Market watch<span className="period">.</span></h1>
   <p>See the dated 9:40 stock roster, Nifty bias and paper phases captured by the cloud. This is a receipt view, not a live quote screen.</p></div>
  <div className="panel atlas-simple-status"><ShieldCheck size={21}/><div><strong>Private source evidence</strong>
   <p>Atlas marks a session incomplete when the full eligible universe or source time is missing. A missing price is never guessed.</p></div></div>
  <div className="panel atlas-evidence-controls"><label htmlFor="atlas-market-day">NSE session</label>
   <input id="atlas-market-day" type="date" value={day} max={todayIST()} onChange={e=>setDay(e.target.value)}/>
   <button className="primary-button" type="button" disabled={busy||ownerToken.length<32} onClick={()=>void refresh()}><RefreshCcw size={16}/>{busy?'Checking…':'Check cloud receipt'}</button>
   {ownerToken.length<32&&<button className="secondary-button" type="button" onClick={goPaper}>Connect owner account <ArrowRight size={16}/></button>}
  </div>
  {error&&<div className="panel atlas-simple-error" role="alert">{error}</div>}
  {!book?<div className="panel atlas-evidence-empty" role="status">
   <Clock3 size={21}/><div><strong>No session receipt loaded</strong><p>Choose a date and check the cloud. Market watch needs the private owner token.</p></div>
  </div>:<>
   <div className="atlas-simple-grid">
    <div className="panel atlas-simple-card"><small>9:40 universe</small><strong>{book.complete_0940_snapshot?'Complete':'Incomplete'}</strong>
     <span>{number(book.entry_snapshot_count)} / {number(book.coverage?.eligible_count??0)} dated NSE equities</span></div>
    <div className="panel atlas-simple-card"><small>Nifty morning move</small><strong>{book.coverage?(book.coverage.nifty_change_bps/100).toFixed(2)+'%':'Unavailable'}</strong>
     <span>{book.coverage?'Source received '+time(book.coverage.received_at):'No source receipt'}</span></div>
    <div className="panel atlas-simple-card"><small>Paper positions</small><strong>{book.current_virtual_ledger.positions.length}</strong>
     <span>Open positions in the existing cloud ledger</span></div>
   </div>
   <div className="panel atlas-evidence-table"><h2>Highest-volume stocks at 9:40</h2>
    {!book.complete_0940_snapshot?<p role="status">A complete ranked universe is not verified for this session.</p>:
    <div className="atlas-table-scroll"><table><thead><tr><th scope="col">Rank</th><th scope="col">NSE symbol</th><th scope="col">Cumulative volume</th><th scope="col">9:40 price</th></tr></thead>
     <tbody>{book.top_volume.map((x,i)=><tr key={x.symbol}><td>{i+1}</td><td><strong>{x.symbol}</strong></td><td>{number(x.cumulative_volume)}</td><td>₹{(x.price_paise/100).toFixed(2)}</td></tr>)}</tbody></table></div>}
   </div>
   <div className="panel atlas-evidence-table"><h2>Cloud paper phases</h2>
    {book.phases.length===0?<p>No entry or exit phase recorded for this date.</p>:
     <div className="atlas-table-scroll"><table><thead><tr><th scope="col">Phase</th><th scope="col">Result</th><th scope="col">Reason</th><th scope="col">Recorded</th></tr></thead>
      <tbody>{book.phases.map((x,i)=><tr key={x.phase+i}><td>{x.phase}</td><td>{x.status}</td><td>{x.reason??'—'}</td><td>{time(x.completed_at)}</td></tr>)}</tbody></table></div>}
   </div>
  </>}
 </section>;
}
