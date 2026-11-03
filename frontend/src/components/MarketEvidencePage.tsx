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
type Ranked={schema:string;mode:string;realOrdersEnabled:boolean;sourceDate:string;identityEvidence:string;stocks:{rank:number;symbol:string;volumeAt0940:number;archived:boolean;minuteBars:number}[]};
function todayIST(){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=(type:string)=>p.find(x=>x.type===type)?.value??'';
 return get('year')+'-'+get('month')+'-'+get('day');
}
function previousIST(){return new Date(Date.now()+19800000-86400000).toISOString().slice(0,10);}
const time=(value:string)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date(value))+' IST';
const number=(value:number)=>new Intl.NumberFormat('en-IN').format(value);
export default function MarketEvidencePage({ownerConnected,goPaper}:{ownerConnected:boolean;goPaper:()=>void}){
 const [day,setDay]=useState(todayIST);
 const [book,setBook]=useState<Daybook|null>(null);
 const [ranked,setRanked]=useState<Ranked|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{setBook(null);setRanked(null);},[day]);
 async function refresh(){
  if(!ownerConnected){setError('Restore owner access from Paper Trading to view market evidence.');return;}
  setBusy(true);setError('');
  try{
   const next=await cloudPaperRequest<Daybook>('','daybook',{day});
   if(next.mode!=='PAPER_ONLY'||next.realOrdersEnabled!==false||next.session!==day||!Array.isArray(next.top_volume))
    throw Error('Untrusted daybook response');
   setBook(next);
   try{const top=await cloudPaperRequest<Ranked>('','top-volume-history',{day});
    if(top.schema==='atlas.top-volume-history.v1'&&top.mode==='PAPER_ONLY'&&top.realOrdersEnabled===false&&top.sourceDate===day&&top.stocks.length===10)setRanked(top);
   }catch{setRanked(null);}
  }catch(e){setBook(null);setError(e instanceof Error?e.message:'Market evidence unavailable');}
  finally{setBusy(false);}
 }
 useEffect(()=>{if(ownerConnected)void refresh();else setBook(null);},[ownerConnected,day]);
 return <section className="atlas-market-evidence">
  <div className="sub-page-header"><div className="breadcrumb">ATLAS / NSE MARKET WATCH</div>
   <h1>Market watch<span className="period">.</span></h1>
   <p>See the dated 9:40 stock roster, Nifty bias and paper phases captured by the cloud. This is a receipt view, not a live quote screen.</p></div>
  <div className="panel atlas-simple-status"><ShieldCheck size={21}/><div><strong>Private source evidence</strong>
   <p>Atlas marks a session incomplete when the full eligible universe or source time is missing. A missing price is never guessed.</p></div></div>
  <div className="panel atlas-evidence-controls"><label htmlFor="atlas-market-day">NSE session</label>
   <input id="atlas-market-day" type="date" value={day} max={todayIST()} onChange={e=>setDay(e.target.value)}/>
   <button className="secondary-button" type="button" onClick={()=>setDay(todayIST())}>Today</button><button className="secondary-button" type="button" onClick={()=>setDay(previousIST())}>Previous day</button>
   <button className="primary-button" type="button" disabled={busy||!ownerConnected} onClick={()=>void refresh()}><RefreshCcw size={16}/>{busy?'Checking…':'Check cloud receipt'}</button>
   {!ownerConnected&&<button className="secondary-button" type="button" onClick={goPaper}>Restore owner view <ArrowRight size={16}/></button>}
  </div>
  {error&&<div className="panel atlas-simple-error" role="alert">{error}</div>}
  {!book?<div className="panel atlas-evidence-empty" role="status">
   <Clock3 size={21}/><div><strong>No session receipt loaded</strong><p>Choose a date and check the cloud. Connect your private account first.</p></div>
  </div>:<>
   <div className="atlas-simple-grid">
    <div className="panel atlas-simple-card"><small>9:40 universe</small><strong>{book.complete_0940_snapshot||ranked?'Qualified ranking':'Unqualified'}</strong>
     <span>{number(book.entry_snapshot_count)} / {number(book.coverage?.eligible_count??0)} dated NSE equities</span></div>
    <div className="panel atlas-simple-card"><small>Nifty morning move</small><strong>{book.coverage?(book.coverage.nifty_change_bps/100).toFixed(2)+'%':'Unavailable'}</strong>
     <span>{book.coverage?'Source received '+time(book.coverage.received_at):'No source receipt'}</span></div>
    <div className="panel atlas-simple-card"><small>Paper positions</small><strong>{book.current_virtual_ledger.positions.length}</strong>
     <span>Open positions in the existing cloud ledger</span></div>
   </div>
   <div className="panel atlas-evidence-table"><h2>Highest-volume stocks at 9:40</h2>
    {!book.complete_0940_snapshot&&!ranked?<p role="status">A complete ranked universe is not verified for this session.</p>:
    <div className="atlas-table-scroll"><table><thead><tr><th scope="col">Rank</th><th scope="col">NSE symbol</th><th scope="col">Volume by 9:40</th><th scope="col">9:40 price</th></tr></thead>
     <tbody>{(ranked?.stocks??book.top_volume.map((x,i)=>({rank:i+1,symbol:x.symbol,volumeAt0940:x.cumulative_volume,archived:false,minuteBars:0}))).map(x=>{
      const datedPrice=book.top_volume.find(v=>v.symbol===x.symbol)?.price_paise;
      return <tr key={x.symbol}><td>{x.rank}</td><td><strong>{x.symbol}</strong></td><td><div className="atlas-volume-cell"><span>{number(x.volumeAt0940)}</span><i style={{width:`${Math.max(2,100*x.volumeAt0940/Math.max(1,ranked?.stocks[0]?.volumeAt0940??book.top_volume[0]?.cumulative_volume??1))}%`}}/></div></td><td>{datedPrice!=null?`₹${(datedPrice/100).toFixed(2)}`:'—'}</td></tr>})}</tbody></table></div>}
    {ranked&&<p className="atlas-simple-note">Qualified by {ranked.identityEvidence.replaceAll('_',' ').toLowerCase()}. {ranked.stocks.filter(x=>x.archived).length}/10 stocks have complete recorded minute bars. A blank 9:40 price means this view has no qualified price field.</p>}
   </div>
   <div className="panel atlas-evidence-table"><h2>Cloud paper phases</h2>
    {book.phases.length===0?<p>No entry or exit phase recorded for this date.</p>:
     <div className="atlas-table-scroll"><table><thead><tr><th scope="col">Phase</th><th scope="col">Result</th><th scope="col">Reason</th><th scope="col">Recorded</th></tr></thead>
      <tbody>{book.phases.map((x,i)=><tr key={x.phase+i}><td>{x.phase}</td><td>{x.status}</td><td>{x.reason??'—'}</td><td>{time(x.completed_at)}</td></tr>)}</tbody></table></div>}
   </div>
  </>}
 </section>;
}
