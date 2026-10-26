import {useEffect,useState} from 'react';
import {Activity,FlaskConical,ShieldAlert} from 'lucide-react';
import {validateDayTraderDemo,type DayTraderDemo} from '../lib/daytraderResearch';

/**
 * Research-only panel. This is a local static, synthetic fixture; no polling,
 * live quotes, broker APIs, order buttons, trading signals or P/L claims.
 */
const money=(value:number|null)=>{
  if(value===null)return '—';
  return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',
    maximumFractionDigits:2}).format(value);
};
const reasons:Record<string,string>={
  target_first:'Illustrative target',
  stop_first_conservative:'Conservative stop',
  no_closed_breakout:'No closed breakout',
  risk_budget_too_small:'Risk budget blocked',
  session_close:'Synthetic close-out',
};

export default function DayTraderNSEPanel(){
 const [model,setModel]=useState<DayTraderDemo|null>(null);
 const [error,setError]=useState('');
 const [selected,setSelected]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/daytrader-nse-demo.json',{signal:controller.signal,credentials:'omit'})
   .then(async response=>{
     if(!response.ok)throw Error('Local research fixture not published');
     return validateDayTraderDemo(await response.json());
   })
   .then(data=>{if(!controller.signal.aborted)setModel(data)})
   .catch(()=>{if(!controller.signal.aborted)setError('No verified synthetic research snapshot available')});
  return ()=>controller.abort();
 },[]);
 const row=model?.sessions[selected]??null;
 return <section className="panel daytrader-nse" aria-label="Day Trader NSE offline research" data-research-only="true">
  <div className="daytrader-title">
   <span className="premium-kicker"><FlaskConical size={14}/> OFFLINE ATLAS RESEARCH / DAY TRADER</span>
   <h2>Opening Range · Time Machine</h2>
   <p>20 constructed five-minute NSE-style sessions and 10,000 historical-style resamples.
      <strong> No genuine NSE market observations were used.</strong></p>
  </div>
  <p className="daytrader-warning" role="note"><ShieldAlert size={18}/>
   SYNTHETIC FIXTURE — invented outcomes, not real historical performance,
   investment advice, live paper trades, or future win probabilities.
  </p>
  {error?<p role="status" className="research-status">{error}. No values have been invented.</p>:
   !model?<p role="status" className="research-status">Checking packaged synthetic fixture…</p>:
   <>
    <div className="daytrader-metrics">
     <div><span>Constructed sessions</span><strong>{model.sessions.length}</strong></div>
     <div><span>Seeded resamples</span><strong>{model.monteCarlo.trials.toLocaleString('en-IN')}</strong></div>
     <div><span>Invented aggregate net P/L</span><strong>{money(model.totalNet)}</strong></div>
     <div><span>Simulated median P/L</span><strong>{money(model.monteCarlo.median)}</strong></div>
     <div><span>Simulation P/L 5–95% band</span>
      <strong>{money(model.monteCarlo.p05)} – {money(model.monteCarlo.p95)}</strong></div>
    </div>
    <div className="daytrader-detail">
     <label htmlFor="daytrader-session">Inspect an invented session</label>
     <select id="daytrader-session" value={selected} onChange={e=>setSelected(Number(e.target.value))}>
      {model.sessions.map((item,index)=>
       <option key={item.session} value={index}>{item.session} · {reasons[item.reason]}</option>)}
     </select>
     {row&&<div className="daytrader-session-detail">
      <div><small>Research outcome</small><strong>{reasons[row.reason]}</strong></div>
      <div><small>Illustrative shares</small><strong>{row.shares}</strong></div>
      <div><small>Hypothetical entry / exit</small>
       <strong>{money(row.entry)} / {money(row.exit)}</strong></div>
      <div><small>Invented net P/L</small><strong>{money(row.netPnl)}</strong></div>
     </div>}
    </div>
    <p className="daytrader-method"><Activity size={15}/> NSE regular cash hours 9:15 AM–3:30 PM IST;
      signal from completed 9:30 AM candle; earliest simulated fill at 9:40 AM;
      ambiguous same-candle stop/target resolves to stop.
      Capital, taxes and market impact are illustrative, not broker-verified.
    </p>
   </>}
 </section>;
}