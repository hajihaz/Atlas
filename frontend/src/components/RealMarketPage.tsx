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
const time = (iso: string) => new Date(iso).toLocaleString('en-IN', {
  timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit',
  day:'2-digit',month:'short',year:'numeric',
})+' IST';
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
export default function RealMarketPage({variant='overview',onNavigate}:{
  variant?:'overview'|'markets';onNavigate?:(page:'markets'|'risk'|'scalpstorm')=>void;
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
          <button className="primary-button" type="button" disabled={loading} onClick={()=>setRefresh(v=>v+1)}>
            <RefreshCcw size={16}/>{loading?'Checking sources…':'Refresh market data'}
          </button>
          {variant==='overview'&&<button className="premium-outline-button" onClick={()=>onNavigate?.('markets')} type="button">
            Full market watch <ArrowRight size={15}/>
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
    <div className="real-message" role="note"><CircleAlert size={19}/>
      <span><strong>Real account not connected.</strong> No account value, trade profit or stock price is shown until independently verified. Cryptocurrency references are indicative, not order-book executions.</span>
    </div>
    <div className="real-section-title"><div><span className="premium-kicker">SOURCE-VERIFIED DISPLAY</span>
      <h2>Market status <span className={hasCrypto?'real-dot ok':'real-dot'}/></h2></div>
      <div className="real-refresh-state" aria-live="polite">
        <Clock3 size={15}/>{data&&!stale?'Retrieved '+time(data.retrievedAt):'Feed missing or stale'}
      </div></div>
    {error&&<p className="real-error" role="alert">{error}. Real values are hidden until the source reconnects.</p>}
    <div className="real-stats-grid">
      <article className="panel real-stat">
        <span className="real-stat-label">Real portfolio value <Wallet size={18}/></span>
        <strong>Not connected</strong>
        <small>No authenticated holdings or account balance</small>
      </article>
      <article className="panel real-stat">
        <span className="real-stat-label">Verified trading P&amp;L <TrendingUp size={18}/></span>
        <strong>Not available</strong>
        <small>No verified stock trades or reconciled paper ledger</small>
      </article>
      <article className="panel real-stat">
        <span className="real-stat-label">NSE cash market <CalendarClock size={18}/></span>
        <strong>{data?sessionText(data.nse.phase):'Checking calendar…'}</strong>
        <small>{data?data.nse.date+' · '+data.nse.timeIST:'Calendar pending'} · 09:15–15:30 IST</small>
      </article>
      <article className="panel real-stat">
        <span className="real-stat-label">Market connection <Activity size={18}/></span>
        <strong>{hasCrypto?'Crypto reference available':'Data unavailable'}</strong>
        <small>NSE authenticated quote feed: not connected</small>
      </article>
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
    <div className="real-section-title"><div><span className="premium-kicker">AUTHORIZED NSE DATA NEEDED</span>
      <h2>Indian stocks</h2></div></div>
    <div className="panel real-stock-list">
      {(rows.filter(row=>row.market==='equity').length?rows.filter(row=>row.market==='equity'):
        ['RELIANCE','TCS','INFY'].map(symbol=>({symbol:symbol+'/INR',market:'equity',currency:'INR',price:null,
          provider:'NSE authenticated provider not connected',observedAt:null,status:'unavailable',paperEligible:false} as MarketRow)))
      .map(row=><div className="real-stock-row" key={row.symbol}>
        <div><strong>{row.symbol.replace('/INR','')}</strong><small>NSE equity · quote not connected</small></div>
        <span>Not available</span><span className="real-stock-lock"><LockKeyhole size={14}/> Private source required</span>
      </div>)}
      <div className="real-stock-note">NSE prices cannot be claimed real-time until a permitted, authenticated market-data source supplies timestamps. Market-session schedule does not confirm the exchange is open.</div>
    </div>
    <div className="real-bottom-note"><LockKeyhole size={17}/>
      <p>Read-only research interface. No fake portfolio, estimated P&amp;L, fabricated stock prices, order placement, automated fills, or live-capital authorization. For actual stocks and paper trading, connect an authorized source and verified ledger first.</p>
      {variant==='overview'&&<button type="button" onClick={()=>onNavigate?.('risk')}>Risk controls <ArrowUpRight size={15}/></button>}
    </div>
  </section>;
}
