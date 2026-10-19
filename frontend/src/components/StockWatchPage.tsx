import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowUpRight,BookOpenText,ChartNoAxesCombined,Clock3,ShieldCheck} from 'lucide-react';
type Asset={key:string,label:string};
const BSE:Asset[]=[
 {key:'BSE:RELIANCE',label:'Reliance Industries'},
 {key:'BSE:TCS',label:'TCS'},
 {key:'BSE:INFY',label:'Infosys'},
 {key:'BSE:HDFCBANK',label:'HDFC Bank'},
 {key:'BSE:SBIN',label:'SBI'},
 {key:'BSE:ICICIBANK',label:'ICICI Bank'},
 {key:'BSE:SENSEX',label:'SENSEX · BSE EOD'},
];
const watch=['BTCINR','ETHINR','SOLINR','XRPINR','DOGEINR'];
type Spot={symbol:string;price:number|null;sourceAt:string|null;currency:'INR';status:string};
const money=(x:number|null)=>x===null?'Awaiting quote':new Intl.NumberFormat('en-IN',
 {style:'currency',currency:'INR',maximumFractionDigits:2}).format(x);
function TradingViewChart({symbol,theme}:{symbol:string;theme:'light'|'dark'}){
 const container=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const target=container.current;if(!target)return;
  const inner=document.createElement('div');
  inner.className='tradingview-widget-container__widget';
  inner.style.height='calc(100% - 24px)';inner.style.width='100%';
  target.replaceChildren(inner);
  const script=document.createElement('script');
  script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async=true;script.type='text/javascript';
  script.textContent=JSON.stringify({
    autosize:true,symbol,interval:'D',timezone:'Asia/Kolkata',
    theme,style:'1',locale:'en',allow_symbol_change:true,
    hide_side_toolbar:true,save_image:false,calendar:false,
    support_host:'https://www.tradingview.com',
  });
  target.appendChild(script);
  return ()=>target.replaceChildren();
 },[symbol,theme]);
 return <div className="stock-tv-frame" ref={container}
   aria-label={'TradingView chart for '+symbol}/>;
}
export default function StockWatchPage({theme,goResearch}:{
 theme:'light'|'dark';goResearch:()=>void;
}){
 const [symbol,setSymbol]=useState('BSE:RELIANCE');
 const [quotes,setQuotes]=useState<Spot[]>([]);
 const [updated,setUpdated]=useState('');
 const [section,setSection]=useState<'stocks'|'crypto'>('stocks');
 const [sourceError,setSourceError]=useState('');
 useEffect(()=>{
  let active=true;const controller=new AbortController();
  const fetchSpot=async()=>{
   try{
    const result=await fetch('/api/live-feed',{cache:'no-store',credentials:'omit',signal:controller.signal});
    if(!result.ok)throw Error('Crypto feed unavailable');
    const v=await result.json();
    if(v.currency!=='INR'||v.realOrdersEnabled!==false||!Array.isArray(v.quotes))
      throw Error('Untrusted public quotes');
    if(active){setQuotes(v.quotes);setUpdated(v.observedAt);setSourceError('');}
   }catch{if(active)setSourceError('CoinDCX feed temporarily unavailable');}
  };
  void fetchSpot();const timer=setInterval(()=>void fetchSpot(),15000);
  return ()=>{active=false;controller.abort();clearInterval(timer)};
 },[]);
 return <section className="stock-watch">
  <div className="sub-page-header"><div className="breadcrumb">ATLAS / FREE MARKET TERMINAL</div>
   <h1>Market watch<span className="period">.</span></h1>
   <p>Official third-party BSE end-of-day equity charts and public INR crypto quotes. No paid data keys.</p>
  </div>
  <div className="market-switch">
   <button type="button" className={section==='stocks'?'active':''} onClick={()=>setSection('stocks')}
    aria-pressed={section==='stocks'}><ChartNoAxesCombined size={16}/> BSE stock charts · EOD</button>
   <button type="button" className={section==='crypto'?'active':''} onClick={()=>setSection('crypto')}
    aria-pressed={section==='crypto'}><Activity size={16}/> INR crypto quotes</button>
  </div>
  {section==='stocks'?<>
   <div className="stock-tv-toolbar panel"><label htmlFor="stock-symbol">Stock / index</label>
    <select id="stock-symbol" value={symbol} onChange={e=>setSymbol(e.target.value)}>
      {BSE.map(s=><option value={s.key} key={s.key}>{s.label}</option>)}
    </select><a href={'https://www.tradingview.com/symbols/'+symbol.replace(':','-')+'/'}
    target="_blank" rel="noreferrer noopener">View at source <ArrowUpRight size={14}/></a>
   </div>
   <div className="panel stock-tv-panel">
     <TradingViewChart symbol={symbol} theme={theme}/>
     <div className="stock-tv-attribution">
      <span>Stock charts and any price delays are controlled by <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a>.
       BSE stock widgets are end-of-day, not live trading quotes.</span>
      <span>This embedded chart is not an Atlas broker/trading-data API.</span>
     </div>
   </div>
   <div className="panel market-info-row"><ShieldCheck size={17}/>
     <span>Free BSE EOD stock charts are available for independent analysis. Intraday NSE quotes and strategy backtests still require a lawful machine-readable source.</span>
   </div>
  </>:<>
   <div className="stock-quote-grid">{watch.map(sym=>{
    const quote=quotes.find(q=>q.symbol===sym);
    const sourceTime=Date.parse(quote?.sourceAt??'');
    const fresh=quote&&Number.isFinite(sourceTime)&&Date.now()-sourceTime<90000;
    return <article className="panel stock-quote" key={sym}>
       <small>{sym.replace('INR',' / INR')}</small>
       <strong>{money(fresh?quote.price:null)}</strong>
       <span>{fresh?'CoinDCX public ticker · latest provider observation':'Quote unavailable or stale'}</span>
    </article>;
   })}</div>
   <div className="market-info-row panel"><Clock3 size={16}/>
    <span>{sourceError||'Latest feed check: '+(updated?new Date(updated).toLocaleTimeString('en-US',{timeZone:'Asia/Kolkata',hour12:true}):'Waiting')+' IST'} · Automatic 15-second REST checks while this page is open.</span>
   </div>
   <button type="button" className="secondary-button" onClick={goResearch}><BookOpenText size={16}/> Test INR crypto strategies <ArrowUpRight size={14}/></button>
  </>}
 </section>;
}
