import {useEffect,useState} from 'react';
import {RefreshCcw} from 'lucide-react';
type Quote={symbol:string;price:number|null;bid:number|null;ask:number|null;sourceAt:string|null;status:string;provider:string};
type Feed={feedStatus:string;observedAt:string;quotes:Quote[];realOrdersEnabled:boolean};
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
export default function CryptoPricesPage(){
 const [feed,setFeed]=useState<Feed|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){setBusy(true);try{const r=await fetch('/api/live-feed',{cache:'no-store'});if(!r.ok)throw Error('Crypto prices unavailable');const d=await r.json() as Feed;
  if(d.realOrdersEnabled!==false||!Array.isArray(d.quotes))throw Error('Invalid public price feed');setFeed(d);setError('');
 }catch(e){setError(e instanceof Error?e.message:'Price feed unavailable');}finally{setBusy(false);}}
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),30000);return ()=>clearInterval(timer);},[]);
 return <section className="atlas-crypto-page"><div className="sub-page-header"><div className="breadcrumb">ATLAS / CRYPTO</div><h1>Crypto prices<span className="period">.</span></h1>
  <p>Public INR quotes for observation. Crypto strategies and orders are not enabled.</p></div>
  <div className="panel atlas-crypto-toolbar"><span>Source: CoinDCX public ticker · {feed?.feedStatus??'Loading'}</span><button type="button" className="secondary-button" disabled={busy} onClick={()=>void refresh()}><RefreshCcw size={16}/> Refresh</button></div>
  {error&&<p role="alert" className="atlas-simple-error">{error}</p>}
  <div className="atlas-data-grid">{feed?.quotes.map(q=><div className="panel atlas-data-card" key={q.symbol}><small>{q.symbol.replace('INR',' / INR')}</small><strong>{q.price!==null?money(q.price):'Unavailable'}</strong>
   <span>{q.price!==null&&q.bid!==null&&q.ask!==null?`Bid ${money(q.bid)} · Ask ${money(q.ask)}`:q.status}</span>
   <span>{q.sourceAt?`Provider time ${new Date(q.sourceAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'})} IST`:'No current provider time'}</span></div>)}</div>
 </section>;
}
