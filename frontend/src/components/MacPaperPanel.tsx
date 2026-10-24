import {useEffect,useState} from 'react';

type Day={date:string;buys:number;sells:number;feesINR:number;realizedPnlINR:number};
type Month=Omit<Day,'date'>&{month:string;recordedDays:number;completeMonthCoverageVerified:false};
type Account={id:string;symbol:string;active:boolean;riskHalted:boolean;maxObservedDrawdownPct:number;
 virtualCapitalINR:number;cashINR:number;equityINR:number|null;realizedPnlINR:number;
 unrealizedPnlINR:number|null;netPnlINR:number|null;feesINR:number;paperFills:number;
 markFresh:boolean;lastSourceAt:string|null;accountingVerified:boolean;daily:Day[];monthly:Month[]};
type Report={schema:string;asOf:string;mode:string;realOrdersEnabled:boolean;actualCapitalINR:number;
 independentStrategyAccounts:boolean;accounts:Account[]};
type TradePage={schema:string;strategyId:string;date:string;asOf:string;totalEvents:number;offset:number;
 nextOffset:number|null;accountingVerified:boolean;realOrdersEnabled:boolean;
 events:{sourceAt:string;side:'BUY'|'SELL';quantity:string;priceINR:string;feeINR:number}[]};
type Selection={strategyId:string;date:string;offset:number};
const money=(x:number|null)=>x===null?'Unavailable':'₹'+x.toLocaleString('en-IN',{maximumFractionDigits:2});
const fresh=(s:string)=>Number.isFinite(Date.parse(s))&&Math.abs(Date.now()-Date.parse(s))<=90000;
const ist=(s:string)=>new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});

export default function MacPaperPanel(){
 const [state,setState]=useState<Report|null>(null),[unavailable,setUnavailable]=useState(false);
 const [selected,setSelected]=useState('');
 const [selection,setSelection]=useState<Selection|null>(null);
 const [trades,setTrades]=useState<TradePage|null>(null),[tradeError,setTradeError]=useState(false);
 useEffect(()=>{
  let active=true,busy=false;const stop=new AbortController();
  const load=async()=>{
   if(busy)return;busy=true;
   try{
    const r=await fetch('/api/local-paper',{cache:'no-store',credentials:'omit',signal:stop.signal});
    if(!r.ok)throw Error();
    const d=await r.json() as Report;
    if(d.schema!=='atlas.mac-forward-paper.v1'||d.mode!=='OWNER_LOCAL_RECORDED_PAPER'||
      d.realOrdersEnabled!==false||d.actualCapitalINR!==0||d.independentStrategyAccounts!==true||
      !Array.isArray(d.accounts)||d.accounts.some(a=>a.accountingVerified!==true||
       !Array.isArray(a.daily)||!Array.isArray(a.monthly))||!fresh(d.asOf))throw Error();
    if(active){setState(d);setUnavailable(false);}
   }catch{if(active){setState(null);setUnavailable(true);}}
   finally{busy=false;}
  };
  void load();const timer=setInterval(()=>void load(),15000);
  return()=>{active=false;clearInterval(timer);stop.abort();};
 },[]);
 useEffect(()=>{
  setTrades(null);setTradeError(false);
  if(!selection)return;
  let active=true;const stop=new AbortController();
  const params=new URLSearchParams({strategy:selection.strategyId,date:selection.date,offset:String(selection.offset)});
  void (async()=>{
   try{
    const r=await fetch('/api/local-paper?'+params,{cache:'no-store',credentials:'omit',signal:stop.signal});
    if(!r.ok)throw Error();
    const d=await r.json() as TradePage;
    if(d.schema!=='atlas.mac-forward-paper-day.v1'||d.strategyId!==selection.strategyId||
      d.date!==selection.date||d.offset!==selection.offset||d.accountingVerified!==true||
      d.realOrdersEnabled!==false||!fresh(d.asOf)||!Array.isArray(d.events)||d.events.length>100||
      !Number.isSafeInteger(d.totalEvents)||d.totalEvents<0||
      (d.nextOffset!==null&&d.nextOffset!==d.offset+d.events.length))throw Error();
    if(active)setTrades(d);
   }catch{if(active)setTradeError(true);}
  })();
  return()=>{active=false;stop.abort();};
 },[selection]);
 const current=state?.accounts.find(a=>a.id===selected);
 return <section className="panel live-system" aria-label="Owner Mac forward paper accounts">
  <div className="panel-heading"><div><div className="heading-kicker">OWNER MAC · FORWARD PAPER</div>
   <h2>Recorded paper accounts</h2><p>Independent comparison accounts. Cash, fees and every recorded fill are reconciled before display.</p>
  </div></div>
  {!state?<p role="status">{unavailable?'Secure Mac paper synchronization is unavailable on this connection.':'Checking recorded paper accounts…'}</p>:<>
   <p className="live-chart-evidence">Accounting checked {ist(state.asOf)} IST. Virtual balances only; accounts are not additive.</p>
   {state.accounts.map(a=><div key={a.id} className="cloud-paper-session">
    <h3>{a.id} · {a.symbol} · {a.riskHalted?'Risk halted':a.active?'Running':'Paused'}</h3>
    <p className="live-chart-evidence">Latest recorded quote: {a.lastSourceAt?ist(a.lastSourceAt)+' IST':'unavailable'}. {a.markFresh?'Recent source observation.':'Source stale or missing; live valuation unavailable.'}</p>
    <div className="live-progress-grid">
     <div><small>Virtual starting capital</small><strong>{money(a.virtualCapitalINR)}</strong></div>
     <div><small>Realized paper P/L</small><strong>{money(a.realizedPnlINR)}</strong></div>
     <div><small>Unrealized paper P/L</small><strong>{money(a.markFresh?a.unrealizedPnlINR:null)}</strong></div>
     <div><small>Recorded fees</small><strong>{money(a.feesINR)}</strong></div>
     <div><small>Modeled fills</small><strong>{a.paperFills}</strong></div>
     <div><small>Observed drawdown</small><strong>{a.maxObservedDrawdownPct.toFixed(2)}%</strong></div>
    </div>
    <button type="button" className="secondary-button" onClick={()=>{setSelected(a.id);setSelection(null);}} aria-pressed={selected===a.id}>Daily breakdown</button>
   </div>)}
   {current?<>
    <div className="research-trade-scroll" role="region" tabIndex={0} aria-label="Selected account daily paper results; scroll horizontally">
     <table><caption>{current.id} · realized results after recorded fees</caption>
      <thead><tr><th>Date (IST)</th><th>Buys</th><th>Sells</th><th>Fees</th><th>Realized P/L</th></tr></thead>
      <tbody>{current.daily.length?current.daily.map(d=><tr key={d.date}>
       <td><button type="button" className="secondary-button" aria-label={'View recorded trades for '+d.date} aria-pressed={selection?.date===d.date&&selection.strategyId===current.id}
        onClick={()=>setSelection({strategyId:current.id,date:d.date,offset:0})}>{d.date}</button></td>
       <td>{d.buys}</td><td>{d.sells}</td><td>{money(d.feesINR)}</td><td>{money(d.realizedPnlINR)}</td>
      </tr>):<tr><td colSpan={5}>No recorded observations.</td></tr>}</tbody>
     </table>
    </div>
    <div className="research-trade-scroll" role="region" tabIndex={0} aria-label="Selected account monthly paper totals; scroll horizontally">
     <table><caption>{current.id} · monthly totals from recorded days</caption>
      <thead><tr><th>Month</th><th>Recorded days</th><th>Buys</th><th>Sells</th><th>Fees</th><th>Realized P/L</th></tr></thead>
      <tbody>{current.monthly.map(m=><tr key={m.month}><td>{m.month}</td><td>{m.recordedDays}</td><td>{m.buys}</td><td>{m.sells}</td><td>{money(m.feesINR)}</td><td>{money(m.realizedPnlINR)}</td></tr>)}</tbody>
     </table>
    </div>
    <p className="live-disclaimer">Monthly totals cover recorded days only. Complete calendar-month returns are not verified.</p>
    {selection?<div aria-live="polite">
     <h3>Recorded trades · {selection.date} IST</h3>
     {!trades?<p role="status">{tradeError?'This trade page could not be verified. Select the date to retry.':'Checking recorded trades…'}</p>:<>
      <p>{trades.totalEvents===0?'No recorded fills on this date.':'Events '+(trades.offset+1)+'–'+(trades.offset+trades.events.length)+' of '+trades.totalEvents+'.'}</p>
      {trades.events.length?<div className="research-trade-scroll" role="region" tabIndex={0} aria-label="Recorded trade events; scroll horizontally">
       <table><caption>{trades.strategyId} · actual source records, modeled paper fills</caption>
        <thead><tr><th>Source time (IST)</th><th>Side</th><th>Quantity</th><th>Price</th><th>Fee</th></tr></thead>
        <tbody>{trades.events.map((t,i)=><tr key={trades.offset+i}><td>{ist(t.sourceAt)}</td><td>{t.side}</td><td>{t.quantity}</td><td>{money(Number(t.priceINR))}</td><td>{money(t.feeINR)}</td></tr>)}</tbody>
       </table>
      </div>:null}
      {trades.offset>0?<button className="secondary-button" type="button" onClick={()=>setSelection({...selection,offset:Math.max(0,trades.offset-100)})}>Previous 100 events</button>:null}
      {trades.nextOffset!==null?<button className="secondary-button" type="button" onClick={()=>setSelection({...selection,offset:trades.nextOffset!})}>Next 100 events</button>:null}
     </>}
    </div>:null}
   </>:null}
  </>}
  <p className="live-disclaimer">Paper fills are modeled, not broker executions. Fees are research assumptions. Unrealized values require a fresh recorded quote. Risk halts pause new signals and do not manufacture liquidation fills.</p>
 </section>;
}
