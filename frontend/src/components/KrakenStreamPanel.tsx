import {useEffect,useRef,useState} from 'react';
import FinancialChart from './FinancialChart';
import {KRAKEN_ASSETS,startKrakenStream,type KrakenQuote} from '../lib/krakenStream.js';
const EMPTY_CANDLES:[]=[];
const USD=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:5});
type Point={time:number;close:number};
export default function KrakenStreamPanel(){
 const [now,setNow]=useState(Date.now),[status,setStatus]=useState('CONNECTING');
 const [quotes,setQuotes]=useState<Record<string,KrakenQuote>>({});
 const [points,setPoints]=useState<Record<string,Point[]>>({});
 const [selection,setSelection]=useState('BTC/USD');
 const pending=useRef<Record<string,KrakenQuote>>({});
 useEffect(()=>{
  const stop=startKrakenStream({onStatus:setStatus,onQuote:quote=>{pending.current[quote.symbol]=quote;}});
  // Render the latest actual trade once per second. The timer never creates a price.
  const clock=setInterval(()=>{
   setNow(Date.now());
   const observed=pending.current;pending.current={};
   if(!Object.keys(observed).length)return;
   setQuotes(old=>({...old,...observed}));
   setPoints(old=>{
    const next={...old};
    for(const quote of Object.values(observed)){
     const point={time:Date.parse(quote.sourceAt),close:quote.price};
     next[quote.symbol]=[...(old[quote.symbol]??[]),point].slice(-600);
    }
    return next;
   });
  },1000);
  return()=>{stop();clearInterval(clock);pending.current={};};
 },[]);
 const quote=quotes[selection],age=quote?Math.max(0,Math.floor((now-Date.parse(quote.sourceAt))/1000)):null;
 const fresh=age!==null&&age<=90;
 return <section className="panel live-chart" aria-labelledby="kraken-stream-title">
  <div className="panel-heading"><div><div className="heading-kicker">PUBLIC WEBSOCKET · USD</div>
   <h2 id="kraken-stream-title">Live crypto stream</h2>
   <p>Kraken trades in US dollars. The display refreshes every second when new trades arrive.</p>
  </div><span className="tag">{status==='STREAMING'?(fresh?'STREAMING':'NO RECENT TRADE'):status.replaceAll('_',' ')}</span></div>
  <div className="live-grid live-coin-grid">
   {KRAKEN_ASSETS.map(symbol=>{
    const q=quotes[symbol],seconds=q?Math.max(0,Math.floor((now-Date.parse(q.sourceAt))/1000)):null;
    const recent=seconds!==null&&seconds<=90;
    return <button type="button" key={symbol} className={'live-quote live-quote-button '+(selection===symbol?'live-selected':'')}
      onClick={()=>setSelection(symbol)} aria-pressed={selection===symbol}>
      <div className="live-quote-header"><span>{symbol}</span></div>
      <strong>{recent&&q?USD.format(q.price):'Waiting for trade'}</strong>
      <small>{seconds===null?'No observed trade':seconds+'s since provider trade'}</small>
    </button>;
   })}
  </div>
  {(points[selection]?.length??0)>0
   ?<FinancialChart symbol={selection} currency="USD" candles={EMPTY_CANDLES} observations={points[selection]}/>
   :<p className="research-status" role="status">Waiting for a timestamped {selection} trade.</p>}
  <p className="live-disclaimer">Public reference prices only. USD observations do not enter the INR paper accounts.
   Old prices expire after 90 seconds. Disconnections retry automatically; unavailable intervals remain gaps.</p>
 </section>;
}
