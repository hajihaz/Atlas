import { useEffect, useState } from 'react';
import { Activity, ArrowRight, CircleAlert, Clock3, LockKeyhole, RefreshCcw, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Quote = {
  symbol: string; currency: 'INR'; price: number|null; bid: number|null; ask: number|null;
  sourceAt: string|null; ageSeconds: number|null; status: string; provider: string;
};
type Feed = {
  schema: number; feedStatus: string; source: string; observedAt: string; mode: string;
  paperExecutionEnabled: false; realOrdersEnabled: false; currency: 'INR'; quotes: Quote[];
};
type Point = { at: string; BTCINR?: number; ETHINR?: number };
type Props = { goStrategies: () => void; goMarkets: () => void; goScalpStorm: () => void };

const formatINR = (value: number|null, digits = 2) =>
  value === null ? 'Unavailable' : '₹' + new Intl.NumberFormat('en-IN',{
    maximumFractionDigits:digits,minimumFractionDigits:digits
  }).format(value);

function clock(date: Date) {
  return new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',hour:'numeric',
    minute:'2-digit',second:'2-digit',hour12:true}).format(date);
}
function quoteFresh(q: Quote, now: number) {
  if(q.price === null || !q.sourceAt) return false;
  const age = (now-Date.parse(q.sourceAt))/1000;
  return age >= -5 && age <= 90;
}
export default function LiveLabPage({ goStrategies, goMarkets, goScalpStorm }: Props) {
  const [now,setNow] = useState(()=>Date.now());
  const [feed,setFeed] = useState<Feed|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [refresh,setRefresh] = useState(0);
  const [history,setHistory] = useState<Point[]>([]);
  useEffect(()=>{
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return ()=>clearInterval(timer);
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    let inFlight=false;
    const load=async()=>{
      if(inFlight || controller.signal.aborted) return;
      inFlight=true;setBusy(true);
      try{
        const response=await fetch('/api/live-feed',{signal:controller.signal,cache:'no-store',credentials:'omit'});
        if(!response.ok) throw new Error('Market-feed endpoint unavailable');
        const body=await response.json() as Feed;
        if(body.schema!==1 || body.currency!=='INR' || body.realOrdersEnabled!==false
          || body.paperExecutionEnabled!==false || !Array.isArray(body.quotes)
          || body.quotes.some(q=>q.currency!=='INR')) throw Error('Untrusted market-data response');
        setFeed(body);setError('');
        const ts=Date.parse(body.observedAt);
        if(Number.isFinite(ts)){
          setHistory(current=>{
            const point:Point={at:new Date(ts).toLocaleTimeString('en-US',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true})};
            for(const q of body.quotes) {
              if(quoteFresh(q,ts) && (q.symbol==='BTCINR' || q.symbol==='ETHINR')) point[q.symbol]=q.price!;
            }
            if(point.BTCINR===undefined && point.ETHINR===undefined) return current;
            return [...current,point].slice(-120);
          });
        }
      } catch(cause){
        if(!controller.signal.aborted){
          setFeed(null);
          setError(cause instanceof Error ? cause.message : 'Market data unavailable');
        }
      } finally {inFlight=false;if(!controller.signal.aborted)setBusy(false);}
    };
    void load();
    const timer=setInterval(()=>void load(),15000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[refresh]);
  const ready=feed?.quotes?.some(q=>quoteFresh(q,now))??false;
  const btc=feed?.quotes?.find(q=>q.symbol==='BTCINR')??null;
  const eth=feed?.quotes?.find(q=>q.symbol==='ETHINR')??null;
  const mark=(q:Quote|null)=>{
    if(!q || !quoteFresh(q,now)) return 'Data unavailable / stale';
    const seconds=Math.max(0,Math.floor((now-Date.parse(q.sourceAt!))/1000));
    return 'Provider snapshot '+seconds+'s ago · '+q.provider;
  };
  const graph=history.filter(h=>h.BTCINR!==undefined);
  return <section className="live-lab" aria-labelledby="live-title">
    <div className="sub-page-header">
      <div className="breadcrumb">ATLAS / LIVE PAPER LAB</div>
      <h1 id="live-title">Live market command center<span className="period">.</span></h1>
      <p>Real provider observations in rupees. Automatic paper-trial results are shown only after independently verified storage sync.</p>
    </div>
    <div className="live-ticker panel">
      <div><small>INDIA STANDARD TIME · LIVE CLOCK</small><strong aria-live="off">{clock(new Date(now))}</strong><span>{new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',weekday:'short'}).format(now)}</span></div>
      <div><small>DATA CONNECTION</small><strong className={ready?'live-good':'live-warning'}>{ready?'RECENT':'UNAVAILABLE'}</strong><span>{ready?'Public INR market observations':'Waiting for current exchange data'}</span></div>
      <div><small>REAL CAPITAL</small><strong>BLOCKED</strong><span>Paper research only · no broker orders</span></div>
      <button className="secondary-button" type="button" onClick={()=>setRefresh(s=>s+1)} disabled={busy}>
        <RefreshCcw size={16}/> {busy?'Checking':'Refresh'}
      </button>
    </div>
    {error && <div className="markets-error" role="alert"><CircleAlert size={16}/>{error}; no synthetic prices substituted.</div>}
    <div className="live-grid">
      {[btc,eth].map((q,i)=><article className="panel live-quote" key={i}>
        <div className="live-quote-header"><span>{i===0?'BITCOIN / INR':'ETHEREUM / INR'}</span>
          {q&&quoteFresh(q,now)?<Wifi size={18}/>:<WifiOff size={18}/>}</div>
        <strong>{formatINR(q&&quoteFresh(q,now)?q.price:null)}</strong>
        <small>{mark(q)}</small>
        <div className="live-bidask"><span>BID {formatINR(q&&quoteFresh(q,now)?q.bid:null)}</span><span>ASK {formatINR(q&&quoteFresh(q,now)?q.ask:null)}</span></div>
      </article>)}
    </div>
    <section className="panel live-chart">
      <div className="panel-heading">
        <div><div className="heading-kicker">RECENT OBSERVATIONS</div><h2>BTC/INR · this dashboard session</h2>
        <p>Samples added only when the provider returns a fresh quote. Not a historical tick feed.</p></div>
        <Activity size={18}/>
      </div>
      {graph.length>1?<div className="live-chart-graphic">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={graph}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.06} vertical={false}/>
            <XAxis dataKey="at" tick={{fill:'#8ca1af',fontSize:10}} minTickGap={35}/>
            <YAxis domain={['dataMin','dataMax']} tick={{fill:'#8ca1af',fontSize:10}} width={86}
              tickFormatter={(v:number)=>'₹'+Math.round(v).toLocaleString('en-IN')}/>
            <Tooltip formatter={(v)=>formatINR(typeof v==='number'?v:null)} />
            <Line type="monotone" dataKey="BTCINR" stroke="#43b792" dot={false}
              connectNulls={false} isAnimationActive={false}/>
          </LineChart>
        </ResponsiveContainer>
      </div>:<div className="live-chart-empty">Waiting for multiple real quotes to plot an intraday chart.</div>}
    </section>
    <section className="panel live-system">
      <div className="panel-heading"><div><div className="heading-kicker">STRATEGY CONTROL</div>
        <h2>Continuous paper-trading lab</h2>
        <p>Strategy engine lives on your private Mac. The hosted dashboard does not have secure paper-account sync connected yet.</p>
      </div><span className="tag tag-gold">SYNC NOT CONNECTED</span></div>
      <div className="live-progress-grid">
        <div><small>ACTIVE STRATEGIES</small><strong>—</strong><span>Not verified on hosted dashboard</span></div>
        <div><small>FORWARD PAPER P&L</small><strong>—</strong><span>Unavailable, not ₹0</span></div>
        <div><small>REAL BROKER FILLS</small><strong>0</strong><span>Live execution disabled by design</span></div>
      </div>
      <div className="live-actions">
        <button className="secondary-button" onClick={goStrategies} type="button"><ShieldCheck size={16}/> Strategy library <ArrowRight size={15}/></button>
        <button className="secondary-button" onClick={goMarkets} type="button"><Clock3 size={16}/> Market sources <ArrowRight size={15}/></button>
        <button className="secondary-button" onClick={goScalpStorm} type="button">ScalpStorm report <ArrowRight size={15}/></button>
      </div>
      <p className="live-disclaimer"><LockKeyhole size={14}/> The seconds clock is live. Public market quotes refresh every 15 seconds when available; they are not a per-second exchange feed. Indian equities/F&O require licensed credentials.</p>
    </section>
  </section>;
}
