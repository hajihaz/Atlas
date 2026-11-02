import {useEffect,useState} from 'react';
import {Database,RefreshCcw} from 'lucide-react';
import {cloudPaperRequest} from '../lib/cloudPaperRead';
type Day={day:string;symbols?:number;min_bars?:number;max_bars?:number;files?:number;eligible?:number;captured?:number};
type Group={days:number;dates:Day[]};
export type Availability={mode:string;realOrdersEnabled:boolean;as_of:string;minute:Group;daily:Group;nse_reference:Group;full_0940:Group;note:string};
const groups:[keyof Pick<Availability,'minute'|'daily'|'nse_reference'|'full_0940'>,string,string][]=[
 ['minute','Minute bars','Ten-stock dated OHLCV samples'],
 ['daily','Daily stock bars','Ten-stock history samples'],
 ['nse_reference','NSE daily files','Official EOD and security master receipts'],
 ['full_0940','9:40 universe','Captured full-universe ranking sessions']
];
export default function DataAvailabilityPage({ownerConnected,goPaper}:{ownerConnected:boolean;goPaper:()=>void}){
 const [data,setData]=useState<Availability|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function refresh(){
  if(!ownerConnected){setError('Connect on the Paper Trading page first.');return;}
  setBusy(true);setError('');
  try{const result=await cloudPaperRequest<Availability>('','data-availability');
   if(result.mode!=='PAPER_ONLY'||result.realOrdersEnabled!==false)throw Error('Invalid cloud data response');
   setData(result);
  }catch(e){setError(e instanceof Error?e.message:'Data unavailable');}finally{setBusy(false);}
 }
 useEffect(()=>{if(ownerConnected)void refresh();else setData(null);},[ownerConnected]);
 return <section className="atlas-data-page"><div className="sub-page-header"><div className="breadcrumb">ATLAS / DATA</div><h1>Available market data<span className="period">.</span></h1>
  <p>Counted from private cloud receipts. Historical samples, daily files and 9:40 universes are separate evidence.</p></div>
  <div className="panel atlas-owner-connect"><div><h2>Private data inventory</h2><p>Choose a category below to see every captured date and its coverage.</p></div>
   <div className="atlas-owner-row">{!ownerConnected&&<button type="button" className="secondary-button" onClick={goPaper}>Connect private account</button>}
    <button type="button" className="primary-button" disabled={busy||!ownerConnected} onClick={()=>void refresh()}><RefreshCcw size={16}/> Refresh</button></div>
   {error&&<p className="atlas-simple-error" role="alert">{error}</p>}</div>
  {data&&<><div className="atlas-data-grid">{groups.map(([key,title,description])=><div className="panel atlas-data-card" key={key}><Database size={21}/><small>{title}</small><strong>{data[key].days} dates</strong><span>{description}</span></div>)}</div>
   {groups.map(([key,title])=><details className="panel atlas-data-detail" key={key}><summary>{title} · {data[key].days} dates</summary>
    <div className="atlas-data-dates">{data[key].dates.map(x=><div key={x.day}><strong>{x.day}</strong><span>{x.symbols!=null?`${x.symbols} symbols · ${x.min_bars}–${x.max_bars} bars`:x.files!=null?`${x.files} source files`:`${x.captured}/${x.eligible} symbols`}</span></div>)}</div></details>)}
   <p className="atlas-simple-note">{data.note}</p></>}
 </section>;
}
