import {useEffect,useState} from 'react';
import {ArrowRight,Bitcoin,ChartNoAxesCombined,Clapperboard,Database,RefreshCcw} from 'lucide-react';
import {ATLAS_RULES} from '../data/atlasSeven';
import {cloudPaperRequest} from '../lib/cloudPaperRead';
import type {Availability} from './DataAvailabilityPage';

type MarketQuote={symbol:string;kind:string;price:number|null;previousClose:number|null;sourceAt:string|null;status:string};
type Market={schema:string;mode:string;realOrdersEnabled:boolean;receivedAt:string;source:string;quotes:MarketQuote[]};
type Crypto={realOrdersEnabled:boolean;quotes:{symbol:string;price:number|null;sourceAt:string|null;status:string}[]};
type Accounts={paperOnly:boolean;realOrdersEnabled:boolean;accounts:{strategyId:string;paperFills:number;realizedPnlINR:number;positionCount:number}[]};
const colors=['#138a6a','#675cdf','#e28b32','#2879bd','#c85c79','#38a1a0','#9b6dcb'];
const inr=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
const number=(n:number)=>new Intl.NumberFormat('en-IN').format(n);
export default function HomePage({ownerConnected,go}:{ownerConnected:boolean;go:(page:'paper'|'markets'|'data'|'replay'|'crypto')=>void}){
 const [market,setMarket]=useState<Market|null>(null),[crypto,setCrypto]=useState<Crypto|null>(null);
 const [accounts,setAccounts]=useState<Accounts|null>(null),[availability,setAvailability]=useState<Availability|null>(null);
 const [marketError,setMarketError]=useState(''),[cryptoError,setCryptoError]=useState('');
 async function refresh(){
  try{const r=await fetch('/api/live-feed',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json() as Crypto;
   if(d.realOrdersEnabled!==false||!Array.isArray(d.quotes))throw Error();setCrypto(d);setCryptoError('');
  }catch{setCryptoError('Crypto source unavailable');}
  if(!ownerConnected){setMarket(null);setAccounts(null);setAvailability(null);return;}
  const results=await Promise.allSettled([
   cloudPaperRequest<Market>('','home-market'),cloudPaperRequest<Accounts>('','seven-accounts'),cloudPaperRequest<Availability>('','data-availability')]);
  const m=results[0];if(m.status==='fulfilled'&&m.value.schema==='atlas.home-market.v1'&&m.value.mode==='PAPER_ONLY'&&m.value.realOrdersEnabled===false){setMarket(m.value);setMarketError('');}
  else{setMarket(null);setMarketError('Market quotes unavailable');}
  const a=results[1];if(a.status==='fulfilled'&&a.value.paperOnly&&a.value.realOrdersEnabled===false)setAccounts(a.value);
  const d=results[2];if(d.status==='fulfilled'&&d.value.mode==='PAPER_ONLY'&&d.value.realOrdersEnabled===false)setAvailability(d.value);
 }
 useEffect(()=>{void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);return()=>clearInterval(timer);},[ownerConnected]);
 const btc=crypto?.quotes.find(x=>x.symbol==='BTCINR');
 const knownFills=accounts?.accounts.reduce((n,a)=>n+a.paperFills,0)??0;
 return <section className="atlas-home-page">
  <div className="atlas-home-hero"><div><small>ATLAS / YOUR MARKET DESK</small><h1>Markets, history and paper tests<span className="period">.</span></h1>
   <p>One clear view of what Atlas has captured and what it has actually tested. Real broker orders remain disabled.</p></div>
   <button type="button" className="secondary-button" onClick={()=>void refresh()}><RefreshCcw size={16}/> Refresh</button></div>
  <div className="atlas-home-tickers" aria-label="Market prices">
   {['NIFTY 50','SENSEX','GOLDBEES','SILVERBEES'].map(symbol=>{
    const q=market?.quotes.find(x=>x.symbol===symbol);const change=q?.price!=null&&q.previousClose?100*(q.price/q.previousClose-1):null;
    return <button type="button" className="panel atlas-home-ticker" key={symbol} onClick={()=>go('markets')}><small>{symbol==='GOLDBEES'?'Gold ETF':symbol==='SILVERBEES'?'Silver ETF':symbol}</small>
     <strong>{q?.price!=null?(q.kind==='INDEX'?number(q.price):inr(q.price)):'—'}</strong><span className={change===null?'':change>=0?'atlas-up':'atlas-down'}>{change===null?'No change data':`${change>=0?'+':''}${change.toFixed(2)}%`}</span>
     <em>{q?.status==='RECENT_QUOTE'?'Recent provider quote':q?.status==='MARKET_CLOSED'?'Market closed · last quote':q?.status==='STALE_QUOTE'?'Quote stale':ownerConnected?marketError||'Unavailable':'Connect owner view'}{q?.sourceAt?` · ${new Date(q.sourceAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} IST`:''}</em></button>})}
   <button type="button" className="panel atlas-home-ticker atlas-home-crypto" onClick={()=>go('crypto')}><small>Bitcoin / INR</small><strong>{btc?.price!=null?inr(btc.price):'—'}</strong><span>{btc?.sourceAt?'CoinDCX public ticker':'Crypto source'}</span><em>{cryptoError||'View crypto prices'} <ArrowRight size={13}/></em></button>
  </div>
  <p className="atlas-home-source">NSE and BSE indices: Upstox read-only quotes · Gold and silver: exchange traded funds, not spot metal prices. Source time and availability are checked; closed or stale quotes are labeled. Crypto: CoinDCX public ticker.</p>
  <div className="atlas-home-quick">
   <button type="button" className="panel" onClick={()=>go('markets')}><ChartNoAxesCombined/><strong>Stocks & market watch</strong><span>See the dated 9:40 volume leaders</span><ArrowRight/></button>
   <button type="button" className="panel" onClick={()=>go('data')}><Database/><strong>Available history</strong><span>{availability?`${availability.minute.days} minute sessions · ${availability.daily.days} daily sample dates`:'Inspect every captured date'}</span><ArrowRight/></button>
   <button type="button" className="panel" onClick={()=>go('replay')}><Clapperboard/><strong>Market replay</strong><span>Choose a stock, time and buy or sell comparison</span><ArrowRight/></button>
   <button type="button" className="panel" onClick={()=>go('crypto')}><Bitcoin/><strong>Crypto prices</strong><span>Public INR prices · research only</span><ArrowRight/></button>
  </div>
  <div className="panel atlas-home-performance"><div className="atlas-home-section-head"><div><small>SEVEN STRATEGIES</small><h2>Forward paper performance</h2></div><button type="button" className="secondary-button" onClick={()=>go('paper')}>Open strategies <ArrowRight size={16}/></button></div>
   <div className="atlas-home-chart" role="img" aria-label={knownFills===0?'No verified forward fills yet for the seven strategies':'Seven strategy activity summary; dated equity curves unavailable'}>
    <div className="atlas-home-gridlines"><span>Profit</span><span>₹0</span><span>Loss</span></div><div className="atlas-home-chart-empty"><strong>{knownFills===0?'No verified performance curve yet':'Dated equity curves unavailable'}</strong><span>{knownFills===0?'The seven accounts have no forward fills. Atlas will draw price changes only from verified paper results.':'Open a strategy for its dated fills and result.'}</span></div>
   </div>
   <div className="atlas-home-legend">{ATLAS_RULES.map((rule,i)=>{const a=accounts?.accounts.find(x=>x.strategyId===rule.id);return <button type="button" key={rule.id} onClick={()=>go('paper')}><i style={{background:colors[i]}}/><span>{rule.name}</span><small>{a?`${a.paperFills} fills`:'Unverified'}</small></button>})}</div>
   <p className="atlas-home-source">A colored line appears only when Atlas has dated, verified account values. Historical research is shown separately from forward paper trading.</p>
  </div>
 </section>;
}
