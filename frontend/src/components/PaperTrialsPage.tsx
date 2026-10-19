import {useState} from 'react';
import {Activity,ArrowRight,BookOpenText,Clock3,Play,Pause,RotateCcw,ShieldCheck,Wallet} from 'lucide-react';
import {summarizePaperGroup} from '../lib/paperEngine.js';
import type {PaperGroup} from '../lib/paperEngine.js';
type Props={group:PaperGroup|null;statusMessage:string;
 start:(s:string)=>void;pause:()=>void;resume:()=>void;clear:()=>void;goStrategies:()=>void};
const currency=(v:number)=>new Intl.NumberFormat('en-IN',
 {style:'currency',currency:'INR',maximumFractionDigits:2}).format(v);
const names={
 sma_9_21:'SMA 9/21 Crossover',ema_12_26:'EMA 12/26 Momentum',
 rsi_14:'RSI 14 Mean Reversion',breakout_20:'20-Bar Breakout',sps_pullback:'SPS Swing Pullback',
};
export default function PaperTrialsPage({group,statusMessage,start,pause,resume,clear,goStrategies}:Props){
 const [symbol,setSymbol]=useState('BTCINR');
 const [active,setActive]=useState('sma_9_21');
 const rows=summarizePaperGroup(group);
 const selected=group?.sessions.find(s=>s.strategyId===active);
 const running=group?.sessions.some(s=>s.status==='running')??false;
 const resumeReady=group?.sessions.some(s=>s.status!=='running')??false;
 return <section className="paper-forward">
  <div className="sub-page-header"><div className="breadcrumb">ATLAS / FORWARD PAPER SIMULATION</div>
   <h1>Paper-trading workspace<span className="period">.</span></h1>
   <p>Track virtual strategy positions from new provider observations, with no real-money trading.</p>
  </div>
  <div className="research-topnote"><ShieldCheck size={19}/>
   <span><strong>Zero real money. No broker connection.</strong> Five independent ₹1,00,000 virtual accounts.
     Source-candle signals are evaluated only after the bar closes. Orders use the subsequently received public quote as a hypothetical fill.
     This local paper experiment is not externally reconciled.</span></div>
  <div className="panel paper-forward-controls">
    {!group?<><label htmlFor="paper-source">Choose INR market</label>
     <select id="paper-source" value={symbol} onChange={e=>setSymbol(e.target.value)}>
       {['BTCINR','ETHINR','SOLINR','XRPINR','DOGEINR'].map(s=>
        <option value={s} key={s}>{s.replace('INR',' / INR')}</option>)}
     </select>
     <button type="button" className="primary-button" onClick={()=>start(symbol)}>
       <Play size={17}/> Start 5 forward paper trials
     </button></>:
     <><div className="paper-current-market"><small>Source market</small><strong>{group.symbol.replace('INR',' / INR')}</strong>
       <span>Started {new Date(group.createdAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</span></div>
       {running?<button type="button" className="secondary-button" onClick={pause}><Pause size={16}/> Pause paper trials</button>:
        <button type="button" className="primary-button" disabled={!resumeReady} onClick={resume}>
         <Play size={16}/> Resume from current prices</button>}
       <button type="button" className="secondary-button" onClick={()=>{
         if(window.confirm('Clear all five local virtual paper accounts and their modeled records?'))clear();
       }}><RotateCcw size={16}/> Reset virtual accounts</button></>}
  </div>
  <p className="paper-statusline" role="status"><Clock3 size={14}/>
   {group?statusMessage||'Waiting for the next completed source candle.': 'Start to begin tracking the next real completed candle.'}
  </p>
  {group&&<><div className="paper-forward-grid">
    {rows.map(row=><button type="button" className={'panel paper-forward-card '+(active===row.strategyId?'selected':'')}
       onClick={()=>setActive(row.strategyId)} key={row.strategyId}
       aria-pressed={active===row.strategyId}>
      <strong>{names[row.strategyId as keyof typeof names]??row.strategyId}</strong>
      <span className="paper-forward-card-equity">{currency(row.virtualEquityINR)}</span>
      <span className={row.modeledPnlINR<0?'negative':'positive'}>Virtual change {currency(row.modeledPnlINR)}</span>
      <small>{row.status==='running'?'Running locally':'Paused'} · {row.events} simulated fills</small>
    </button>)}
  </div>
  <div className="panel paper-forward-ledger">
    <div className="research-detail-title"><div><span className="premium-kicker">BROWSER-LOCAL VIRTUAL LEDGER</span>
      <h2>{names[active as keyof typeof names]}</h2>
      <p>Modeled trades are never sent to an exchange or a broker.</p></div>
      <span className="research-tag"><Wallet size={14}/> No real funds</span></div>
    {selected?.pausedReason&&<div className="research-status">Paused: {selected.pausedReason.replaceAll('_',' ')}. Resume starts from current data, not missed bars.</div>}
    <div className="paper-forward-summary">
      <div><small>Virtual cash</small><strong>{currency(selected?.cash??0)}</strong></div>
      <div><small>Virtual coins</small><strong>{(selected?.quantity??0).toFixed(8)}</strong></div>
      <div><small>Modeled fees paid</small><strong>{currency(selected?.feesINR??0)}</strong></div>
      <div><small>Quote received</small><strong>{selected?.lastQuoteAt?
        new Date(selected.lastQuoteAt).toLocaleTimeString('en-US',{timeZone:'Asia/Kolkata',hour12:true}):'Waiting'}</strong></div>
    </div>
    {selected?.events.length?<div className="research-trade-scroll"><table><thead>
      <tr><th>Observation time</th><th>Virtual side</th><th>Indicative fill</th><th>Modeled fee</th><th>Virtual realized P/L</th></tr>
    </thead><tbody>{selected.events.slice().reverse().map((event,i)=><tr key={i}>
      <td>{new Date(event.observedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</td>
      <td>{event.side}</td><td>{currency(event.priceINR)}</td>
      <td>{currency(event.feeINR)}</td><td>{event.realizedPnlINR===null?'—':currency(event.realizedPnlINR)}</td>
    </tr>)}</tbody></table></div>:
    <div className="research-status">No source-triggered virtual trades yet. This is a genuine empty paper ledger, not demo records.</div>}
  </div></>}
  <div className="panel research-bottom"><Activity size={19}/><div>
    <strong>Runtime and data safeguards</strong>
    <p>Runs only while Atlas is open in this browser. LocalStorage preserves the virtual ledger across reloads; it is not a secure cloud backup.
      Missing bars, stale quotes and a 5% virtual drawdown automatically pause execution. Model fees and slippage are estimates.</p>
   </div><button type="button" className="secondary-button" onClick={goStrategies}>Explore strategies <BookOpenText size={16}/><ArrowRight size={14}/></button>
  </div>
 </section>;
}
