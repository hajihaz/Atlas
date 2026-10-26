import {useEffect,useState} from 'react';
import {Clock3,ShieldCheck} from 'lucide-react';
import {validateNseMarketSnapshot,type NseMarketSnapshot} from '../lib/nseMarketSnapshot.js';

const time=(value:string|null)=>value?new Date(value).toLocaleString('en-IN',{
  timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',
  second:'2-digit',hour12:true})+' IST':'Unavailable from source';

function OwnerNseObservation(){
  const [snapshot,setSnapshot]=useState<NseMarketSnapshot|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true,busy=false,request:AbortController|null=null;
    const refresh=async()=>{
      if(busy)return;
      busy=true;request=new AbortController();
      const timeout=setTimeout(()=>request?.abort(),5000);
      try{
        const response=await fetch('/api/nse-market',{cache:'no-store',credentials:'omit',
          signal:request.signal});
        if(!response.ok)throw Error();
        const accepted=validateNseMarketSnapshot(await response.json());
        if(active){setSnapshot(accepted);setError('');}
      }catch{
        if(active){setSnapshot(null);setError('NSE source unavailable or observation expired.');}
      }finally{clearTimeout(timeout);busy=false;}
    };
    void refresh();
    const timer=setInterval(()=>void refresh(),1000);
    return ()=>{active=false;clearInterval(timer);request?.abort();};
  },[]);
  return <section aria-label="Private NSE observations" className="panel nse-owner-panel">
    <div className="nse-owner-heading"><div>
      <div className="breadcrumb">PRIVATE MAC FEED · UPSTOX ANALYTICS</div>
      <h2>NSE market observations</h2>
    </div><span className="nse-market-state">{snapshot?
      (snapshot.market.marketOpen?'Normal market session open':'Market closed · last traded prices'):
      'Waiting for source'}</span></div>
    {error?<p role="status">{error}</p>:null}
    <div className="stock-quote-grid">{snapshot?.quotes.map(quote=>
      <article className="stock-quote" key={quote.instrumentKey}>
        <small>{quote.symbol} · {quote.priceUnit==='POINTS'?'index points':'NSE equity'}</small>
        <strong>{new Intl.NumberFormat('en-IN',quote.priceUnit==='INR'?
          {style:'currency',currency:'INR',maximumFractionDigits:2}:
          {maximumFractionDigits:2}).format(quote.lastPrice)}
          {quote.priceUnit==='POINTS'?' pts':''}</strong>
        <span>Last trade: {time(quote.lastTradeAt)}</span>
        <span>Provider quote: {time(quote.quoteTimestamp)}</span>
      </article>)}</div>
    <p className="nse-observation-note"><Clock3 size={15}/>
      {snapshot?'Feed checked '+time(snapshot.observedAt)+'. ':'Awaiting a verified local snapshot. '}
      Source polling is once per second during the normal session and once per minute after hours.
    </p>
    <p className="nse-observation-note"><ShieldCheck size={15}/>
      Read-only prices on this Mac. Broker orders and paper orders are disabled.
      Observation does not certify a strategy or execution freshness.
    </p>
  </section>;
}

export default function NseMarketPanel(){
  return ['127.0.0.1','localhost'].includes(window.location.hostname)?<OwnerNseObservation/>:null;
}
