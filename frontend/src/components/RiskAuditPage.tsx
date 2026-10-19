import {Activity,ArrowRight,BookOpenText,CheckCircle2,Clock3,LockKeyhole,ShieldCheck,Wallet} from 'lucide-react';
import type {PaperGroup} from '../lib/paperEngine.js';
export default function RiskAuditPage({mode,group,openPaper,openResearch}:{
 mode:'risk'|'audit';group:PaperGroup|null;
 openPaper:()=>void;openResearch:()=>void;
}){
 const running=group?.sessions.filter(s=>s.status==='running').length??0;
 const fills=group?.sessions.reduce((n,s)=>n+s.events.length,0)??0;
 const modeRisk=mode==='risk';
 return <section className="research-workbench">
  <div className="sub-page-header"><div className="breadcrumb">ATLAS / {modeRisk?'RISK OPERATIONS':'EVIDENCE CENTER'}</div>
   <h1>{modeRisk?'Risk controls':'Audit & evidence'}<span className="period">.</span></h1>
   <p>{modeRisk?'Practical safeguards for source-backed virtual paper trading.':
    'Review the exact source, model assumptions, ledger provenance and test history.'}</p></div>
  <div className="research-topnote"><ShieldCheck size={19}/>
   <span><strong>{modeRisk?'Independent safety by design.':'Traceable research evidence.'}</strong>
    {modeRisk?' Virtual strategies cannot place real orders. Missing candles, late quotes and a virtual drawdown pause the local model.':
      ' Historical replays use completed CoinDCX candles; forward virtual fills use provider quote timestamps. The local ledger is not independently certified.'}</span>
  </div>
  <div className="paper-forward-grid">
   <article className="panel paper-forward-card"><strong>Virtual paper engines</strong>
    <span className="paper-forward-card-equity">{running} / 5</span>
    <small>Running in this browser; no unattended cloud bot</small>
   </article>
   <article className="panel paper-forward-card"><strong>Virtual fill events</strong>
    <span className="paper-forward-card-equity">{fills}</span>
    <small>Browser-local modeled snapshots, not brokerage trades</small>
   </article>
   <article className="panel paper-forward-card"><strong>Virtual loss circuit-breaker</strong>
    <span className="paper-forward-card-equity">5%</span>
    <small>Automatic halt at modeled 5% equity loss</small>
   </article>
  </div>
  <div className="panel real-readiness">
    <h2>{modeRisk?'Operational risk checks':'Data and computation provenance'}</h2>
    {[
      {label:'Feed validation',detail:'Provider timestamps, finite source prices, completed and ordered market candles.',ok:true},
      {label:'Paper trial exposure',detail:'Independent ₹1,00,000 virtual capital per selected strategy; no leverage in the model.',ok:true},
      {label:'Costs and slippage',detail:'Model assumptions: 0.10% per-side fees + 0.05% price slippage; not broker-confirmed.',ok:true},
      {label:'Missing bars and stale data',detail:'No interpolation or pretend fills. Virtual execution pauses after a gap.',ok:true},
      {label:'Research look-ahead prevention',detail:'Backtest signals formed from prior closed bar; fills modeled at next bar open.',ok:true},
      {label:'Live capital',detail:'Real-money order routing is deliberately disabled; owner-compliance gate remains separate.',ok:false},
    ].map(item=><div className="real-readiness-row" key={item.label}>
      <div><strong>{item.label}</strong><p>{item.detail}</p></div>
      <span style={{display:'inline-flex',gap:6,alignItems:'center'}}>
       {item.ok?<CheckCircle2 size={15} color="#229a73"/>:<LockKeyhole size={15}/>}
       {item.ok?'Modeled control':'Owner gate'}
      </span>
    </div>)}
  </div>
  <div className="panel research-bottom"><Activity size={19}/>
   <div><strong>{modeRisk?'Risk controls are practical and independently separated.':'Audit sources remain visible.'}</strong>
    <p>{modeRisk?'Real market-data and brokerage trading rights remain independent from virtual paper testing.':
      'Test results and code review are available from GitHub. Browser-local paper ledgers can be reset and are not signed or server-backed.'}</p>
    {mode==='audit'&&<a href="https://github.com/hajihaz/Atlas/actions" rel="noopener noreferrer"
      target="_blank" className="text-link">GitHub CI history <ArrowRight size={13}/></a>}
   </div>
   <button type="button" className="secondary-button" onClick={openPaper}><Wallet size={16}/> Paper trials</button>
   <button type="button" className="secondary-button" onClick={openResearch}><BookOpenText size={16}/> Strategy lab</button>
  </div>
  <p className="paper-statusline"><Clock3 size={14}/> All financial strategy numbers in INR. Operational status is based on this browser and the selected provider's responses.</p>
 </section>;
}
