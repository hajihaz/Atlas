import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowRight, CircleAlert, Clock3, LockKeyhole,
  ShieldCheck, Wifi, WifiOff,
} from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { startPublicStream } from '../lib/publicStream.js';
import { isRecentQuote, connectionDescription } from '../lib/quoteFreshness.js';

type Quote = {
  symbol: string; currency:'INR'; price:number|null; bid:number|null; ask:number|null;
  sourceAt:string|null; ageSeconds:number|null; status:string; provider:string;
};
type Feed={
  schema:number; feedStatus:string; source:string; observedAt:string;
  paperExecutionEnabled:false; realOrdersEnabled:false; currency:'INR'; quotes:Quote[];
};
type Candle={time:number;open:number;high:number;low:number;close:number;volume:number};
type History={
  schema:number;symbol:string;range:string;currency:'INR';candles:Candle[];
  source:string;coverage:string;latestClosedAt:string|null;
  completeHistoryVerified:false;warning:string;paperExecutionEnabled:false;realOrdersEnabled:false;
};
type Point={time:number;close:number;source:'candle'|'stream';label:string};
type Props={goStrategies:()=>void;goMarkets:()=>void;goScalpStorm:()=>void};
type Range='1H'|'1D'|'1W'|'1M'|'1Y'|'5Y'|'ALL';
const RANGES:Range[]=['1H','1D','1W','1M','1Y','5Y','ALL'];
const COINS=[
  {symbol:'BTCINR',name:'Bitcoin'},
  {symbol:'ETHINR',name:'Ethereum'},
  {symbol:'SOLINR',name:'Solana'},
  {symbol:'XRPINR',name:'XRP'},
  {symbol:'DOGEINR',name:'Dogecoin'},
] as const;
const STOCKS=[
  {symbol:'NSE:RELIANCE',name:'Reliance · NSE quote unavailable'},
  {symbol:'NSE:TCS',name:'TCS · NSE quote unavailable'},
  {symbol:'NSE:INFY',name:'Infosys · NSE quote unavailable'},
];
const shortName=(symbol:string)=>COINS.find(c=>c.symbol===symbol)?.name??symbol;
const INR=(value:number|null,digits=2)=>value===null?'Unavailable':
  '₹'+new Intl.NumberFormat('en-IN',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
const CLOCK=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',
  hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});
const formatStamp=(ts:number,range:Range)=>{
  const opts:Intl.DateTimeFormatOptions=range==='1H'||range==='1D'
    ? {hour:'numeric',minute:'2-digit',hour12:true}
    : range==='1W'||range==='1M'
    ? {day:'2-digit',month:'short',hour:'numeric',hour12:true}
    : {day:'2-digit',month:'short',year:'2-digit'};
  return new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',...opts}).format(ts);
};
export default function LiveLabPage({goStrategies,goMarkets,goScalpStorm}:Props){
  const [now,setNow]=useState(()=>Date.now());
  const [quotes,setQuotes]=useState<Record<string,Quote>>({});
  const [connection,setConnection]=useState('CONNECTING');
  const [apiError,setApiError]=useState('');
  const [selection,setSelection]=useState('BTCINR');
  const [range,setRange]=useState<Range>('1H');
  const [history,setHistory]=useState<History|null>(null);
  const [historyBusy,setHistoryBusy]=useState(false);
  const [historyError,setHistoryError]=useState('');
  const [streamPoints,setStreamPoints]=useState<Record<string,Point[]>>({});
  const lastStreamRef=useRef(0);

  useEffect(()=>{
    const clock=setInterval(()=>setNow(Date.now()),1000);
    return ()=>clearInterval(clock);
  },[]);
  useEffect(()=>{
    const stop=startPublicStream({
      onStatus:(next:string)=>setConnection(next),
      onQuote:(q:Quote)=>{
        const timestamp=Date.parse(q.sourceAt??'');
        if(!Number.isFinite(timestamp))return;
        lastStreamRef.current=Date.now();
        setQuotes(old=>{
          const previous=old[q.symbol];
          return previous?.sourceAt&&Date.parse(previous.sourceAt)>timestamp
            ? old:{...old,[q.symbol]:q};
        });
        setStreamPoints(old=>{
          const previous=old[q.symbol]??[];
          const latest=previous.at(-1);
          if(latest&&(timestamp<latest.time
            ||(timestamp===latest.time&&latest.close===q.price)))return old;
          if(q.price===null)return old;
          const record:Point={time:timestamp,close:q.price,source:'stream',label:''};
          return {...old,[q.symbol]:[...previous,record].slice(-600)};
        });
      },
    });
    return stop;
  },[]);

  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    const load=async()=>{
      if(!active||controller.signal.aborted)return;
      // A functioning public stream is primary. Use the documented REST
      // ticker as a slower recovery path only if no stream events are arriving.
      if(Date.now()-lastStreamRef.current<7000)return;
      try{
        const res=await fetch('/api/live-feed',{credentials:'omit',cache:'no-store',
          signal:controller.signal});
        if(!res.ok)throw Error('Public INR fallback unavailable');
        const data=await res.json() as Feed;
        if(data.schema!==1||data.currency!=='INR'||data.paperExecutionEnabled!==false
          ||data.realOrdersEnabled!==false||!Array.isArray(data.quotes)
          ||data.quotes.some(q=>q.currency!=='INR'))throw Error('Untrusted market feed');
        if(!active)return;
        setQuotes(old=>{
          const merged={...old};
          for(const q of data.quotes){
            if(!q.sourceAt||!isRecentQuote(q,Date.now()))continue;
            const p=merged[q.symbol];
            if(!p?.sourceAt||Date.parse(p.sourceAt)<Date.parse(q.sourceAt))merged[q.symbol]=q;
          }
          return merged;
        });
        setApiError('');
      }catch(e){
        if(active&&!controller.signal.aborted)
          setApiError(e instanceof Error?e.message:'Provider unavailable');
      }
    };
    void load();
    const timer=setInterval(()=>void load(),15000);
    return ()=>{active=false;clearInterval(timer);controller.abort();};
  },[]);

  const stock=selection.startsWith('NSE:');
  useEffect(()=>{
    if(stock){setHistory(null);setHistoryError('An authorized NSE historical feed is not connected.');setHistoryBusy(false);return;}
    const controller=new AbortController();
    let active=true;
    const load=async()=>{
      setHistoryBusy(true);setHistoryError('');setHistory(null);
      try{
        const qs=new URLSearchParams({symbol:selection,range});
        const resp=await fetch('/api/market-history?'+qs,{signal:controller.signal,credentials:'omit'});
        if(!resp.ok)throw Error('Historical provider unavailable');
        const body=await resp.json() as History;
        if(body.schema!==1||body.currency!=='INR'||body.symbol!==selection
          ||body.range!==range||body.realOrdersEnabled!==false
          ||body.paperExecutionEnabled!==false||!Array.isArray(body.candles))
          throw Error('Invalid historical response');
        if(active)setHistory(body);
      }catch(e){if(active&&!controller.signal.aborted)setHistoryError(e instanceof Error?e.message:'History unavailable');}
      finally{if(active)setHistoryBusy(false);}
    };
    void load();
    const timer=setInterval(()=>void load(),60000);
    return ()=>{active=false;controller.abort();clearInterval(timer);};
  },[selection,range,stock]);

  const selected=quotes[selection];
  const currentPrice=isRecentQuote(selected,now)?selected:undefined;
  const connected=Object.values(quotes).some(q=>isRecentQuote(q,now));
  const recentStream=lastStreamRef.current>0&&now-lastStreamRef.current<7000;
  const bars=useMemo(()=>{
    if(!history?.candles.length)return [] as Point[];
    const mapped=history.candles.map(c=>({time:c.time,close:c.close,
      source:'candle' as const,label:formatStamp(c.time,range)}));
    // Extend with actual public socket events, never interpolate new ticks.
    const last=history.candles.at(-1)!.time;
    const recent=(streamPoints[selection]??[])
      .filter(p=>p.time>last)
      .map(p=>({...p,label:formatStamp(p.time,range)}));
    const all=[...mapped,...recent].sort((a,b)=>a.time-b.time);
    // Display only actual sampled provider observations for long history,
    // never generated points; full source rows remain in response.
    if(all.length<=1400)return all;
    const stride=Math.ceil(all.length/1400);
    const sampled=all.filter((_,i)=>i%stride===0);
    if(sampled.at(-1)?.time!==all.at(-1)?.time)sampled.push(all.at(-1)!);
    return sampled;
  },[history,selection,range,streamPoints]);

  return <section className="live-lab" aria-labelledby="live-title">
    <div className="sub-page-header"><div className="breadcrumb">ATLAS / LIVE PAPER LAB</div>
      <h1 id="live-title">Live market command center<span className="period">.</span></h1>
      <p>Automatic public INR crypto observations, selectable source-backed charts and clear connection status. No fabricated trades.</p></div>
    <div className="live-ticker panel">
      <div><small>INDIA STANDARD TIME · LIVE CLOCK</small>
        <strong aria-live="off">{CLOCK.format(now)}</strong>
        <span>{new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',
          month:'short',year:'numeric',weekday:'short'}).format(now)}</span>
      </div>
      <div><small>DATA CONNECTION</small>
        <strong className={connected?'live-good':'live-warning'}>{connected?'RECENT':'WAITING'}</strong>
        <span>{connectionDescription(connection,recentStream)}</span>
      </div>
      <div><small>REAL CAPITAL</small><strong>BLOCKED</strong>
        <span>Paper research only · no broker orders</span></div>
    </div>
    {apiError&&!connected&&<div className="markets-error" role="status">
      <CircleAlert size={16}/>{apiError} · No synthetic prices substituted.</div>}

    <div className="live-grid live-coin-grid">
      {COINS.map(({symbol,name})=>{
        const q=quotes[symbol],ok=isRecentQuote(q,now);
        return <button type="button" key={symbol} className={'panel live-quote live-quote-button '+(selection===symbol?'live-selected':'')}
          onClick={()=>setSelection(symbol)} aria-pressed={selection===symbol}>
          <div className="live-quote-header"><span>{name.toUpperCase()} / INR</span>{ok?<Wifi size={17}/>:<WifiOff size={17}/>}</div>
          <strong>{INR(ok?q.price:null)}</strong>
          <small>{ok&&q.sourceAt?'Provider event '+Math.max(0,Math.floor((now-Date.parse(q.sourceAt))/1000))+'s ago · '+q.provider:
            'No fresh provider price'}</small>
          <div className="live-bidask"><span>BID {INR(ok?q.bid:null)}</span>
            <span>ASK {INR(ok?q.ask:null)}</span></div>
        </button>;
      })}
    </div>

    <section className="panel live-chart">
      <div className="live-chart-heading">
        <div className="panel-heading">
          <div><div className="heading-kicker">HISTORICAL + PUBLIC REAL-TIME OBSERVATIONS</div>
            <h2>{stock?selection.replace('NSE:','')+'/INR':shortName(selection)+' / INR'}</h2>
            <p>Historical completed CoinDCX spot candles; live points only when a real stream event arrives.</p></div>
          <Activity size={18}/>
        </div>
        <div className="live-chart-controls">
          <label htmlFor="atlas-asset">Asset</label>
          <select id="atlas-asset" value={selection} onChange={e=>setSelection(e.target.value)}>
            <optgroup label="Crypto · INR">
              {COINS.map(q=><option value={q.symbol} key={q.symbol}>{q.name} / INR</option>)}
            </optgroup>
            <optgroup label="Stocks · Requires licensed NSE data">
              {STOCKS.map(q=><option value={q.symbol} key={q.symbol}>{q.name}</option>)}
            </optgroup>
          </select>
        </div>
      </div>
      <div className="live-chart-ranges" role="group" aria-label="Chart time range">
        {RANGES.map(option=><button key={option} type="button"
          className={range===option?'selected':''} aria-pressed={range===option}
          onClick={()=>setRange(option)}>{option}</button>)}
      </div>
      {historyBusy?<div className="live-chart-empty" role="status">Loading provider history…</div>:
       stock||historyError||!bars.length?<div className="live-chart-empty" role="status">
         {stock?'NSE stock data not connected. Licensed market-data access is required.':
           historyError||'No verified INR candle history returned for this asset and range.'}
       </div>:<div className="live-chart-graphic live-history-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={bars}>
              <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false}/>
              <XAxis dataKey="label" tick={{fill:'#8ca1af',fontSize:10}} minTickGap={48}/>
              <YAxis domain={['auto','auto']} tick={{fill:'#8ca1af',fontSize:10}} width={100}
                tickFormatter={(v:number)=>'₹'+Math.round(v).toLocaleString('en-IN')}/>
              <Tooltip formatter={v=>INR(typeof v==='number'?v:null)}
                labelFormatter={(_,payload)=>{
                  const time=payload?.[0]?.payload?.time;
                  return typeof time==='number'
                    ?new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium'}).format(time)+' IST':'';
                }}/>
              <Line type="linear" dataKey="close" stroke="#40b78c" dot={false}
                connectNulls={false} isAnimationActive={false} strokeWidth={2}/>
            </LineChart>
          </ResponsiveContainer>
        </div>}
      <div className="live-chart-evidence" aria-live="polite">
        <span>{history?.candles.length??0} provider-returned completed candles ·
          {history?.coverage==='partial'?' Partial coverage':history?.coverage==='unavailable'?' Unavailable':' Source observations'}</span>
        <span>{history?.latestClosedAt?'Latest closed bar '+CLOCK.format(Date.parse(history.latestClosedAt))+' IST':'No verified closed bar'}</span>
      </div>
      <p className="live-disclaimer"><LockKeyhole size={14}/>
        {history?.warning??'All range selections use read-only provider history. Unavailable periods are never synthesized.'}
        {' '}Provider history may not cover the full selected period; ALL means available data, not guaranteed lifetime coverage.
      </p>
    </section>

    <section className="panel live-system">
      <div className="panel-heading"><div><div className="heading-kicker">STRATEGY CONTROL</div>
        <h2>Continuous paper-trading lab</h2>
        <p>Live market observations do not establish authenticated broker execution or a reconciled paper ledger.</p>
      </div><span className="tag tag-gold">PAPER SYNC NOT CONNECTED</span></div>
      <div className="live-progress-grid">
        <div><small>ACTIVE STRATEGIES</small><strong>—</strong><span>Not verified on hosted dashboard</span></div>
        <div><small>FORWARD PAPER P&amp;L</small><strong>—</strong><span>Unavailable, not ₹0</span></div>
        <div><small>REAL BROKER FILLS</small><strong>0</strong><span>Live execution blocked</span></div>
      </div>
      <div className="live-actions">
        <button className="secondary-button" onClick={goStrategies} type="button"><ShieldCheck size={16}/> Strategy library <ArrowRight size={15}/></button>
        <button className="secondary-button" onClick={goMarkets} type="button"><Clock3 size={16}/> Market sources <ArrowRight size={15}/></button>
        <button className="secondary-button" onClick={goScalpStorm} type="button">ScalpStorm report <ArrowRight size={15}/></button>
      </div>
      <p className="live-disclaimer"><LockKeyhole size={14}/>
        The clock updates every second; CoinDCX public stream delivers up to 1-second updates when the source publishes changes.
        Stream failure falls back to slower REST observations; no artificial ticks or 1-second REST request storm.
        Stocks require authenticated, licensed NSE market data.</p>
    </section>
  </section>;
}
