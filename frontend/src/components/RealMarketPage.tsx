import type {PaperGroup} from '../lib/paperEngine.js';
import { useEffect, useState } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, CalendarClock, CircleAlert, Clock3,
  Coins, IndianRupee, LockKeyhole, RefreshCcw, ShieldCheck, TrendingUp,
  Wallet,
} from 'lucide-react';

type MarketRow = {
  symbol: string; label?: string; market: 'crypto'|'equity'; currency: 'INR';
  price: number|null; provider: string; retrievedAt?: string; observedAt: string|null;
  status: string; paperEligible: false;
};
type MarketSnapshot = {
  schema: 1; quoteCurrency: 'INR'; source: string; retrievedAt: string;
  crypto: MarketRow[]; equities: MarketRow[]; providerStatus: string;
  nse: {date:string; timeIST:string; phase:string; regularHoursIST:string; exchangeVerifiedOpen:false};
  realPortfolio: { valueINR:null; pnlINR:null; status:string };
  paperExecutionEnabled:false; liveOrdersEnabled:false;
};
const inr = (value: number|null) => value === null ? 'Not available'
  : new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',maximumFractionDigits:2}).format(value);
const time = (iso: string) => new Date(iso).toLocaleString('en-US', {
  timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',second:'2-digit',
  hour12:true,day:'2-digit',month:'short',year:'numeric',
})+' IST';
function nseDisplayTime(date: string, timeIST: string) {
  // The private market session API retains 24-hour times for machine use.
  // Always format user-visible timestamps with explicit 12-hour AM/PM.
  const match = /^([01]\d|2[0-3]):([0-5]\d) IST$/.exec(timeIST);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !match) return 'Time unavailable';
  const stamp = new Date(date+'T'+match[1]+':'+match[2]+':00+05:30');
  if (Number.isNaN(stamp.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',hour12:true,
  }).format(stamp)+' IST';
}
function sessionText(phase:string) {
  switch(phase){
    case 'before_preopen':return 'Before NSE pre-open';
    case 'preopen':return 'NSE scheduled pre-open';
    case 'scheduled_regular_hours':return 'NSE scheduled regular hours';
    case 'scheduled_holiday':return 'NSE scheduled holiday';
    case 'weekend':return 'NSE weekend';
    case 'closed':return 'NSE outside regular hours';
    default:return 'Session calendar not verified';
  }
}
export default function RealMarketPage({variant='overview',paperGroup,onNavigate}:{
  variant?:'overview'|'markets';paperGroup?:PaperGroup|null;onNavigate?:(page:'markets'|'risk'|'scalpstorm'|'strategies'|'orders'|'live')=>void;
}) {
  const [data,setData]=useState<MarketSnapshot|null>(null);
  const [error,setError]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [loading,setLoading]=useState(true);
  const [clock,setClock]=useState(Date.now());
  useEffect(()=>{
    const timer=setInterval(()=>setRefresh(v=>v+1),60000);
    const ticker=setInterval(()=>setClock(Date.now()),15000);
    return ()=>{clearInterval(timer);clearInterval(ticker);};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/market-inr',{method:'GET',credentials:'omit',signal:controller.signal})
      .then(async response=>{
        if(!response.ok)throw Error('Provider response unavailable');
        return response.json() as Promise<MarketSnapshot>;
      }).then(next=>{
        if(next.schema!==1||next.quoteCurrency!=='INR'||next.liveOrdersEnabled!==false
          ||next.paperExecutionEnabled!==false||!Array.isArray(next.crypto)||!Array.isArray(next.equities)
          ||next.crypto.some(v=>v.currency!=='INR'||v.paperEligible!==false)
          ||next.equities.some(v=>v.currency!=='INR'||v.paperEligible!==false)){
          throw Error('Invalid market response');
        }
        setData(next);setClock(Date.now());
      }).catch(e=>{if(!controller.signal.aborted){setData(null);setError(e instanceof Error?e.message:'Data unavailable');}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[refresh]);
  const stale=!data||clock-Date.parse(data.retrievedAt)>90000
    ||clock<Date.parse(data.retrievedAt)-5000;
  const hasCrypto=data?.crypto.some(v=>v.price!==null&&!stale)??false;
  const quote=(row:MarketRow)=>row.price!==null&&!stale?inr(row.price):'Not available';
  const rows=data?[...data.crypto,...data.equities]:[];
  return <section className="real-market-root" aria-label="Real market status in rupees">
    <div className="real-hero">
      <div className="real-hero-main">
        <span className="real-eyebrow"><span/> ATLAS / INDIA MARKET INTELLIGENCE</span>
        <h1>{variant==='overview'?'Your markets. Real data.':'Market watch.'}</h1>
        <p>All money values in Indian rupees. Provider-backed crypto references, honest NSE connectivity and no fictional profits.</p>
        <div className="real-hero-buttons">
          <button className="primary-button" type="button" onClick={()=>onNavigate?.('strategies')}>
            Explore ScalpStorm X <ArrowRight size={16}/>
          </button>
          {variant==='overview'&&<button className="premium-outline-button" onClick={()=>onNavigate?.('markets')} type="button">
            Live crypto charts <ArrowRight size={15}/>
          </button>}
        </div>
        <div className="real-hero-trust"><span><LockKeyhole size={15}/> Real-money trading disabled</span>
          <span><ShieldCheck size={15}/> Unverified values hidden</span></div>
      </div>
      <div className="real-hero-art" aria-hidden="true">
        <IndianRupee size={73}/>
        <span>₹</span>
      </div>
    </div>
    <div className="real-market-note"><Activity size={16}/>
      <span>Free public INR observations, live crypto charts and ScalpStorm X paper research.
        NSE stock charts use TradingView; real-capital orders remain disabled.</span>
    </div>
    <div className="real-section-title"><div><span className="premium-kicker">SOURCE-VERIFIED DISPLAY</span>
      <h2>Market status <span className={hasCrypto?'real-dot ok':'real-dot'}/></h2></div>
      <div className="real-refresh-state" aria-live="polite">
        <Clock3 size={15}/>{data&&!stale?'Retrieved '+time(data.retrievedAt):'Feed missing or stale'}
      </div></div>
    {error&&<p className="real-error" role="alert">{error}. Real values are hidden until the source reconnects.</p>}
    <div className="real-stats-grid">
      <button type="button" className="panel real-stat real-stat-action" onClick={()=>onNavigate?.('strategies')}>
        <span className="real-stat-label">ScalpStorm X <TrendingUp size={18}/></span>
        <strong>1 strategy</strong>
        <small>NSE top-volume intraday plan; unverified stock P&amp;L stays unavailable</small>
      </button>
      <button type="button" className="panel real-stat real-stat-action" onClick={()=>onNavigate?.('orders')}>
        <span className="real-stat-label">Paper journal <Wallet size={18}/></span>
        <strong>ScalpStorm X only</strong>
        <small>Retired comparisons no longer execute; account history is preserved</small>
      </button>
      <button type="button" className="panel real-stat real-stat-action" onClick={()=>onNavigate?.('markets')}>
        <span className="real-stat-label">Indian stock viewing <CalendarClock size={18}/></span>
        <strong>{data?sessionText(data.nse.phase):'Checking calendar…'}</strong>
        <small>Free BSE end-of-day charts · NSE session reference</small>
      </button>
      <button type="button" className="panel real-stat real-stat-action" onClick={()=>onNavigate?.('live')}>
        <span className="real-stat-label">Crypto data <Activity size={18}/></span>
        <strong>{hasCrypto?'INR quotes available':'Checking source…'}</strong>
        <small>Public CoinDCX streaming in Live Paper Lab</small>
      </button>
    </div>
    <div className="real-section-title"><div><span className="premium-kicker">INDICATIVE PUBLIC SPOT REFERENCES</span>
      <h2>Crypto prices in ₹</h2></div><span className="real-source-label">Source: Coinbase public spot</span></div>
    <div className="real-crypto-grid">
      {(data?.crypto??[
        {symbol:'BTC/INR',label:'Bitcoin',price:null,market:'crypto',currency:'INR',provider:'Coinbase public spot reference',status:'unavailable',paperEligible:false,observedAt:null},
        {symbol:'ETH/INR',label:'Ethereum',price:null,market:'crypto',currency:'INR',provider:'Coinbase public spot reference',status:'unavailable',paperEligible:false,observedAt:null},
      ] as MarketRow[]).map(item=><article className="panel real-crypto-card" key={item.symbol}>
        <div className="real-crypto-top"><div className="real-coin-icon"><Coins size={21}/></div>
          <span className={item.price!==null&&!stale?'real-data-tag':'real-data-tag missing'}>{item.price!==null&&!stale?'REFERENCE':'UNAVAILABLE'}</span></div>
        <h3>{item.label} <small>{item.symbol}</small></h3>
        <strong>{quote(item)}</strong>
        <p>{item.price!==null&&!stale?'Indicative price · last trade time not provided':'Provider unavailable or observation too old'}</p>
        <div className="real-crypto-footer">{data&&!stale?'Fetched '+time(data.retrievedAt):'No fresh observation'}</div>
      </article>)}
    </div>
    <div className="panel real-stock-discovery">
      <div><span className="premium-kicker">FREE STOCK CHARTS</span>
        <h2>BSE stock charts on TradingView</h2>
        <p>View Reliance, TCS, Infosys, HDFC Bank, SBI and SENSEX on official BSE end-of-day widgets. These are not live NSE quotes.</p>
      </div>
      <button className="secondary-button" type="button" onClick={()=>onNavigate?.('markets')}>Explore NSE charts <ArrowRight size={16}/></button>
    </div>
    <div className="real-bottom-note"><ShieldCheck size={17}/>
      <p>Prices are indicative public observations. Backtests use modeled fills; paper experiments are browser-local. Real-money execution is separately disabled.</p>
      {variant==='overview'&&<button type="button" onClick={()=>onNavigate?.('risk')}>Risk controls <ArrowUpRight size={15}/></button>}
    </div>
  </section>;
}
