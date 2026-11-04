import {useEffect,useState} from 'react';
import {ArrowRight,Bitcoin,ChartNoAxesCombined,Clapperboard,Database,RefreshCcw} from 'lucide-react';
import {ATLAS_RULES} from '../data/atlasSeven';
import {cloudPaperRequest} from '../lib/cloudPaperRead';
import type {Availability} from './DataAvailabilityPage';

type MarketQuote={symbol:string;kind:string;price:number|null;previousClose:number|null;sourceAt:string|null;status:string};
type Market={schema:string;mode:string;realOrdersEnabled:boolean;receivedAt:string;source:string;quotes:MarketQuote[]};
type Crypto={realOrdersEnabled:boolean;quotes:{symbol:string;price:number|null;sourceAt:string|null;status:string}[]};
type Account={strategyId:string;paperFills:number;realizedPnlINR:number;positionCount:number;closedPnlSeries?:{at:string;realizedPnlINR:number}[];historyTruncated?:boolean};
type Accounts={paperOnly:boolean;realOrdersEnabled:boolean;accounts:Account[]};
const colors=['#138a6a','#675cdf','#e28b32','#2879bd','#c85c79','#38a1a0','#9b6dcb'];
const inr=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
const number=(n:number)=>new Intl.NumberFormat('en-IN').format(n);
function PaperPerformancePlot({accounts}:{accounts:Account[]}){
 const series=ATLAS_RULES.map((rule,i)=>({name:rule.name,color:colors[i],points:accounts.find(a=>a.strategyId===rule.id)?.closedPnlSeries??[]})).filter(x=>x.points.length);
 const values=series.flatMap(x=>x.points.map(p=>p.realizedPnlINR));
 const times=series.flatMap(x=>x.points.map(p=>Date.parse(p.at))).filter(Number.isFinite);
 if(!values.length||!times.length)return null;
 const low=Math.min(0,...values),high=Math.max(0,...values),range=high-low||2;
 const first=Math.min(...times),last=Math.max(...times),duration=last-first||1;
 const x=(at:string)=>50+900*(Date.parse(at)-first)/duration;
 const y=(value:number)=>205-170*(value-low)/range;
 return <div className="atlas-home-chart atlas-home-realized-chart" role="img" aria-label="Dated realized paper profit and loss by strategy; open positions excluded">
  <span className="atlas-home-chart-top">{inr(high)} realized</span><span className="atlas-home-chart-bottom">{inr(low)} realized</span>
  <svg viewBox="0 0 1000 230" preserveAspectRatio="none" aria-hidden="true"><line x1="50" x2="950" y1={y(0)} y2={y(0)} stroke="currentColor" strokeDasharray="5 5" opacity=".45"/>
   {series.map(s=><g key={s.name}><polyline points={s.points.map(p=>`${x(p.at)},${y(p.realizedPnlINR)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    {s.points.map((p,i)=><circle key={`${p.at}-${i}`} cx={x(p.at)} cy={y(p.realizedPnlINR)} r="4" fill={s.color}><title>{`${s.name} · ${new Date(p.at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} · ${inr(p.realizedPnlINR)} realized`}</title></circle>)}
   </g>)}
  </svg><div className="atlas-home-chart-dates"><span>{new Date(first).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})}</span><span>{new Date(last).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})}</span></div>
 </div>;
}
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
 const chartReady=accounts?.accounts.some(a=>a.closedPnlSeries?.length)??false;
 const stockSymbols=['RELIANCE','HDFCBANK','TCS'].filter(symbol=>market?.quotes.some(q=>q.symbol===symbol));
 return <section className="atlas-home-page">
  <div className="atlas-home-hero"><div><small>ATLAS / YOUR MARKET DESK</small><h1>Markets, history and paper tests<span className="period">.</span></h1>
   <p>One clear view of what Atlas has captured and what it has actually tested. Real broker orders remain disabled.</p></div>
   <button type="button" className="secondary-button" onClick={()=>void refresh()}><RefreshCcw size={16}/> Refresh</button></div>
  <div className="atlas-home-tickers" aria-label="Market prices">
   {['NIFTY 50','SENSEX','GOLDBEES','SILVERBEES',...stockSymbols].map(symbol=>{
    const q=market?.quotes.find(x=>x.symbol===symbol);const change=q?.price!=null&&q.previousClose?100*(q.price/q.previousClose-1):null;
    return <button type="button" className="panel atlas-home-ticker" key={symbol} onClick={()=>go('markets')}><small>{symbol==='GOLDBEES'?'Gold ETF':symbol==='SILVERBEES'?'Silver ETF':symbol}</small>
     <strong>{q?.price!=null?(q.kind==='INDEX'?number(q.price):inr(q.price)):'—'}</strong><span className={change===null?'':change>=0?'atlas-up':'atlas-down'}>{change===null?'No change data':`${change>=0?'+':''}${change.toFixed(2)}%`}</span>
     <em>{q?.status==='RECENT_QUOTE'?'Recent provider quote':q?.status==='MARKET_CLOSED'?'Market closed · last quote':q?.status==='STALE_QUOTE'?'Quote stale':ownerConnected?marketError||'Unavailable':'Connect owner view'}{q?.sourceAt?` · ${new Date(q.sourceAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} IST`:''}</em></button>})}
   <button type="button" className="panel atlas-home-ticker atlas-home-crypto" onClick={()=>go('crypto')}><small>Bitcoin / INR</small><strong>{btc?.price!=null?inr(btc.price):'—'}</strong><span>{btc?.sourceAt?'CoinDCX public ticker':'Crypto source'}</span><em>{cryptoError||'View crypto prices'} <ArrowRight size={13}/></em></button>
  </div>
  <p className="atlas-home-source">NSE and BSE indices and shown stocks: Upstox read-only quotes · Gold and silver: exchange traded funds, not spot metal prices. Source time and availability are checked; closed or stale quotes are labeled. Crypto: CoinDCX public ticker.</p>
  <div className="atlas-home-quick">
   <button type="button" className="panel" onClick={()=>go('markets')}><ChartNoAxesCombined/><strong>Stocks & market watch</strong><span>See the dated 9:40 volume leaders</span><ArrowRight/></button>
   <button type="button" className="panel" onClick={()=>go('data')}><Database/><strong>Available history</strong><span>{availability?`${availability.minute.days} minute sessions · ${availability.daily.days} daily sample dates`:'Inspect every captured date'}</span><ArrowRight/></button>
   <button type="button" className="panel" onClick={()=>go('replay')}><Clapperboard/><strong>Market replay</strong><span>Choose a stock, time and buy or sell comparison</span><ArrowRight/></button>
   <button type="button" className="panel" onClick={()=>go('crypto')}><Bitcoin/><strong>Crypto prices</strong><span>Public INR prices · research only</span><ArrowRight/></button>
  </div>
  <div className="panel atlas-home-performance"><div className="atlas-home-section-head"><div><small>SEVEN STRATEGIES</small><h2>Forward paper performance</h2></div><button type="button" className="secondary-button" onClick={()=>go('paper')}>Open strategies <ArrowRight size={16}/></button></div>
   {chartReady&&accounts?<PaperPerformancePlot accounts={accounts.accounts}/>:<div className="atlas-home-chart" role="img" aria-label={knownFills===0?'No verified forward fills yet for the seven strategies':'Seven strategy activity summary; dated realized results unavailable'}>
    <div className="atlas-home-gridlines"><span>Profit</span><span>₹0</span><span>Loss</span></div><div className="atlas-home-chart-empty"><strong>{knownFills===0?'No verified performance curve yet':'Dated equity curves unavailable'}</strong><span>{knownFills===0?'The seven accounts have no forward fills. Atlas will draw price changes only from verified paper results.':'Open a strategy for its dated fills and result.'}</span></div>
   </div>}
   <div className="atlas-home-legend">{ATLAS_RULES.map((rule,i)=>{const a=accounts?.accounts.find(x=>x.strategyId===rule.id);return <button type="button" key={rule.id} onClick={()=>go('paper')}><i style={{background:colors[i]}}/><span>{rule.name}</span><small>{a?`${a.paperFills} fills`:'Unverified'}</small></button>})}</div>
   <p className="atlas-home-source">Colored lines use dated, verified forward paper fills and show realized P/L after each fill. Open positions are excluded. Historical research is shown separately. {accounts?.accounts.some(a=>a.historyTruncated)?'Older fill history is truncated.':''}</p>
  </div>
 </section>;
}
