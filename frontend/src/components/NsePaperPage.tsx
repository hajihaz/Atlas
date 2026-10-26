import {useEffect,useState} from 'react';
import {ArrowDownRight,ArrowUpRight,Clock3,ShieldCheck} from 'lucide-react';
import {validateNsePaperReport,type NsePaperReport,type NsePaperEvent} from '../lib/nsePaperReport.js';
import NseMarketPanel from './NseMarketPanel';
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',
  minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const time=(v:string|number|null|undefined)=>v?new Date(v).toLocaleString('en-IN',{
  timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',
  second:'2-digit',hour12:true})+' IST':'—';
function FillRows({events}:{events:NsePaperEvent[]}){
  if(!events.length)return <p className="nse-empty">No simulated fills recorded for this selection.</p>;
  return <div className="nse-table-scroll"><table className="nse-trades-table">
    <caption>Simulated entries and exits · whole shares · modeled costs</caption>
    <thead><tr><th>Time IST</th><th>Stock</th><th>Side</th><th>Shares</th><th>Price</th><th>Costs</th><th>Realized P/L</th><th>Reason</th></tr></thead>
    <tbody>{events.map(e=><tr key={e.id}><td>{time(e.at)}</td><td>{e.symbol}</td>
      <td>{e.side==='BUY'?<ArrowUpRight size={13}/>:<ArrowDownRight size={13}/>} {e.side}</td>
      <td>{e.quantity}</td><td>{money((e.pricePaise??0)/100)}</td><td>{money((e.feePaise??0)/100)}</td>
      <td>{e.side==='SELL'?money((e.realizedPaise??0)/100):'—'}</td><td>{e.reason.replaceAll('_',' ')}</td></tr>)}</tbody>
  </table></div>;
}
function LocalNsePaper(){
  const [mode,setMode]=useState<'forward'|'historical'|'validation'>('forward');
  const [report,setReport]=useState<NsePaperReport|null>(null);
  const [selected,setSelected]=useState('sma_9_21');
  const [error,setError]=useState('');
  const [selectedDay,setSelectedDay]=useState('');
  const [detail,setDetail]=useState<NsePaperReport|null>(null);
  const [offset,setOffset]=useState(0);
  const [detailError,setDetailError]=useState('');
  useEffect(()=>{
    let active=true,busy=false,controller:AbortController|null=null;
    setReport(null);setError('');setSelectedDay('');setDetail(null);setOffset(0);
    const refresh=async()=>{
      if(busy)return;
      busy=true;controller=new AbortController();const own=controller;
      const timeout=setTimeout(()=>own.abort(),8000);
      try{
        const response=await fetch('/api/nse-paper?mode='+mode,{cache:'no-store',credentials:'omit',signal:own.signal});
        if(!response.ok)throw Error();
        const accepted=validateNsePaperReport(await response.json(),Date.now(),mode==='forward'?'FORWARD':'HISTORICAL_REPLAY');
        if(active){setReport(accepted);setError('');}
      }catch{if(active){setReport(null);setError('Private NSE accounting is temporarily unavailable.');}}
      finally{clearTimeout(timeout);busy=false;}
    };
    void refresh();const timer=setInterval(()=>void refresh(),mode==='forward'?2000:60000);
    return ()=>{active=false;clearInterval(timer);controller?.abort();};
  },[mode]);
  useEffect(()=>{
    if(!selectedDay){setDetail(null);return;}
    let active=true;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    setDetail(null);setDetailError('');
    const load=async()=>{
      try{
        const query=new URLSearchParams({mode,strategy:selected,date:selectedDay,offset:String(offset)});
        const response=await fetch('/api/nse-paper?'+query,{cache:'no-store',credentials:'omit',signal:controller.signal});
        if(!response.ok)throw Error();
        const data=validateNsePaperReport(await response.json(),Date.now(),mode==='forward'?'FORWARD':'HISTORICAL_REPLAY');
        if(active)setDetail(data);
      }catch{if(active)setDetailError('This day could not be loaded. The ledger is preserved.');}
      finally{clearTimeout(timeout);}
    };
    void load();return ()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[mode,selected,selectedDay,offset]);
  const session=report?.sessions.find(s=>s.strategyId===selected);
  const rows=(detail??report)?.events.filter(e=>e.type==='FILL'&&e.strategyId===selected)??[];
  const days=report?.days.filter(d=>d.strategyId===selected)??[];
  const status=report?.status==='MARKET_CLOSED'?'Armed · market closed':
    report?.status==='REPLAY_COMPLETE'?(mode==='validation'?'Validation simulation complete':'Historical simulation complete'):
    report?.status==='OBSERVING'?'Observing NSE · paper only':
    report?.status==='SOURCE_UNAVAILABLE'?'Source paused · accounts preserved':'Preparing private ledger';
  return <section className="nse-paper-page">
    <div className="sub-page-header"><div className="breadcrumb">ATLAS / PRIVATE NSE PAPER TRADING</div>
      <h1>NSE strategy desk<span className="period">.</span></h1>
      <p>Five independent strategy comparisons. Real Upstox source data, virtual capital, zero broker orders.</p></div>
    <div className="market-switch" aria-label="NSE result type">
      <button type="button" aria-pressed={mode==='forward'} className={mode==='forward'?'active':''} onClick={()=>setMode('forward')}>Forward paper</button>
      <button type="button" aria-pressed={mode==='historical'} className={mode==='historical'?'active':''} onClick={()=>setMode('historical')}>Historical simulations</button>
      <button type="button" aria-pressed={mode==='validation'} className={mode==='validation'?'active':''} onClick={()=>setMode('validation')}>Validation window</button>
    </div>
    <div className="nse-paper-status panel" role="status"><Clock3 size={17}/><strong>{status}</strong>
      <span>{report?'Checked '+time(report.observedAt):error||'Reading the owner ledger…'}</span></div>
    <div className="nse-paper-explanation panel"><ShieldCheck size={18}/><div>
      <strong>{mode==='validation'?'Separate validation window · modeled execution':mode==='historical'?'Historical source candles · assumed execution':'Automated virtual orders · owner Mac only'}</strong>
      <p>Each strategy has ₹1,00,000 split into ten ₹10,000 stock allocations. These comparison accounts are not additive.
      Whole shares, cash only, no leverage. Costs are modeled at 0.10% plus 0.05% slippage each side.</p>
      <p>{mode!=='forward'?'Historical results are hypothetical and were not earned by the forward accounts. Execution assumes a following-minute opening price, 0.02% spread per side and liquidity from a previous completed minute.':
        'Orders require a new, fresh exchange trade after the signal was observed. Stale, missing or repeated quotes cannot fill an order.'}
        {' '}This fixed basket does not certify ScalpStorm’s historical market-wide top ten.</p>
    </div></div>
    {mode==='validation'&&report?<p className="nse-observation-note" role="note">{report.note}</p>:null}
    {report?<div className="nse-strategy-grid">{report.sessions.map(s=>
      <button type="button" key={s.strategyId} onClick={()=>{setSelected(s.strategyId);setSelectedDay('');setOffset(0);}}
        className={'panel nse-strategy-card '+(selected===s.strategyId?'active':'')} aria-pressed={selected===s.strategyId}>
        <span>{s.name}</span><strong>{money(s.netPnlINR)}</strong>
        <small>{s.fills} modeled fills · {s.positions.length} open positions</small>
        <small>{s.halted?'Risk halt · exits remain eligible':'Separate virtual comparison account'}</small>
      </button>)}</div>:null}
    {session?<section className="panel nse-account" aria-label="Selected NSE strategy">
      <div className="nse-account-heading"><div><h2>{session.name}</h2><p>{session.description}</p></div>
        <span>{mode==='validation'?'Unqualified temporal validation':mode==='historical'?'Unqualified historical simulation':'Forward observation · unqualified'}</span></div>
      <dl className="nse-account-grid">
        {[['Starting virtual capital',session.initialCapitalINR],['Cash',session.cashINR],['Marked equity',session.equityINR],
          ['Realized P/L',session.realizedPnlINR],['Unrealized P/L',session.unrealizedPnlINR],['Modeled costs',session.feesINR]].map(([label,value])=>
          <div key={String(label)}><dt>{label}</dt><dd>{money(Number(value))}</dd></div>)}
      </dl>
      <p className="nse-observation-note">{session.decisions} recorded decisions · {session.pendingCount} pending virtual orders · {session.gaps} observed candle gaps.
        Marked values use the last admitted source trade and may be stale after disconnection.</p>
      <h3>Open virtual positions</h3>
      {session.positions.length?<div className="nse-table-scroll"><table className="nse-trades-table">
        <thead><tr><th>Stock</th><th>Shares</th><th>Entry</th><th>Last mark</th><th>Unrealized</th><th>Source trade</th></tr></thead>
        <tbody>{session.positions.map(p=><tr key={p.symbol}><td>{p.symbol}</td><td>{p.quantity}</td><td>{money(p.averageEntryINR)}</td>
          <td>{money(p.lastMarkINR)}</td><td>{money(p.unrealizedPnlINR)}</td><td>{time(p.lastTradeAt)}</td></tr>)}</tbody>
      </table></div>:<p className="nse-empty">No open virtual positions.</p>}
      <h3>Daily realized results</h3>
      {days.length?<div className="nse-day-list">{days.map(d=><button type="button" key={d.date}
        className={selectedDay===d.date?'active':''} aria-pressed={selectedDay===d.date}
        onClick={()=>{setSelectedDay(d.date);setOffset(0);}}>
        <span>{d.date}</span><strong>{money(d.realizedPnlINR)}</strong><small>{d.fills} fills · costs {money(d.feesINR)}</small>
      </button>)}</div>:<p className="nse-empty">Daily results will appear after simulated fills occur.</p>}
      <div className="nse-fill-heading"><h3>{selectedDay?'Recorded fills · '+selectedDay:'Latest simulated fills'}</h3>
        {selectedDay?<button type="button" className="secondary-button" onClick={()=>{setSelectedDay('');setOffset(0);}}>Show latest</button>:null}</div>
      {selectedDay&&!detail?<p role="status">{detailError||'Loading selected day…'}</p>:<FillRows events={rows}/>}
      {selectedDay&&detail?<div className="nse-pagination">
        <button type="button" disabled={offset===0} onClick={()=>setOffset(v=>Math.max(0,v-200))}>Previous</button>
        <span>{rows.length?'Fills '+(offset+1)+'–'+(offset+rows.length):'0 fills'}</span>
        <button type="button" disabled={!detail.hasMore} onClick={()=>setOffset(v=>v+200)}>Next</button>
      </div>:null}
    </section>:null}
    {report?<p className="nse-pilot-universe">Fixed pilot basket: {report.universe.map(x=>x.symbol).join(' · ')}.</p>:null}
    <NseMarketPanel/>
  </section>;
}
export default function NsePaperPage(){
  if(!['127.0.0.1','localhost'].includes(window.location.hostname))return <section className="panel">
    <h1>Private NSE strategy desk</h1><p>This owner workspace is available on your Mac.</p>
    <a href="http://127.0.0.1:4310/#nse-paper">Open the private NSE workspace</a>
  </section>;
  return <LocalNsePaper/>;
}
