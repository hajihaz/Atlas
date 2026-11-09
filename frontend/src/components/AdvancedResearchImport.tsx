import {useState,type ChangeEvent} from 'react';
import {FileJson,ShieldAlert,ShieldCheck,Upload,Trash2} from 'lucide-react';
import {CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {inspectAdvancedResearchEnvelope,type AdvancedResearchPreview} from '../lib/advancedResearchPreview.js';

const inr=(v:number)=>new Intl.NumberFormat('en-IN',
 {style:'currency',currency:'INR',maximumFractionDigits:2}).format(v);
const pct=(v:number)=>v.toFixed(2)+'%';
const ist=(t:number)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',
 day:'2-digit',month:'short',hour:'numeric',minute:'2-digit',hour12:true}).format(t)+' IST';

export default function AdvancedResearchImport(){
 const [report,setReport]=useState<AdvancedResearchPreview|null>(null);
 const [choice,setChoice]=useState('');
 const [error,setError]=useState('');
 const [filename,setFilename]=useState('');
 async function openFile(event:ChangeEvent<HTMLInputElement>){
  const file=event.currentTarget.files?.[0];
  event.currentTarget.value='';
  if(!file)return;
  setReport(null);setFilename('');setError('');
  if(file.size>8_000_000||file.size===0){
    setError('Choose an Atlas research JSON file between 1 byte and 8 MB.');return;
  }
  try{
   const raw=JSON.parse(await file.text()) as unknown;
   const safe=inspectAdvancedResearchEnvelope(raw);
   setReport(safe);setChoice(safe.strategies[0].id);setFilename(file.name.slice(0,100));
  }catch(e){setError(e instanceof Error?e.message:'Invalid research report');}
 }
 const strategy=report?.strategies.find(s=>s.id===choice)??report?.strategies[0];
 return <section className="panel advanced-import" aria-label="Advanced quantitative research file viewer">
  <div className="advanced-import-heading">
   <div><span className="premium-kicker">ADVANCED QUANT RESEARCH</span>
    <h2>Inspect a reproducible research report</h2>
    <p>Read a locally generated Atlas research envelope from your device. It stays in this browser session;
      it is never uploaded, saved to a cloud ledger or interpreted as an executed trade.</p>
   </div>
   <span className="research-tag"><ShieldCheck size={14}/> Research only</span>
  </div>
  <div className="advanced-file-controls">
   <label className="secondary-button advanced-file-label" htmlFor="atlas-advanced-json">
    <Upload size={15}/> Choose research JSON
   </label>
   <input id="atlas-advanced-json" type="file" accept=".json,application/json"
    onChange={e=>void openFile(e)}/>
   {filename&&<span className="advanced-file-name"><FileJson size={14}/>{filename}</span>}
   {report&&<button type="button" className="secondary-button" onClick={()=>{setReport(null);setChoice('');setFilename('');setError('')}}>
    <Trash2 size={14}/> Clear local preview
   </button>}
  </div>
  {error&&<p role="alert" className="advanced-import-warning"><ShieldAlert size={16}/>{error}. No financial results were imported.</p>}
  {!report&&<div className="advanced-import-empty">
   <strong>Independent replay available in the repository</strong>
   <p>Use `node research/advanced/cli.mjs replay` with an authorized source manifest and
      raw-candle file, then select the resulting JSON here. Results remain unavailable until a file is supplied.
      No example trades will appear as historic market performance.</p>
  </div>}
  {report&&strategy&&<>
   <div className="advanced-import-warning" role="note"><ShieldAlert size={18}/>
    <div><strong>{report.fixtureOnly?'ARTIFICIAL TEST FIXTURE — NOT MARKET PERFORMANCE':
      'OWNER-IMPORTED HISTORICAL SIMULATION — NOT INDEPENDENTLY CERTIFIED'}</strong>
     <p>These are file-supplied hypothetical calculations. The browser checks structure and
       safety flags but cannot independently authenticate the data source or replay its raw candles.
       No live broker, paper account, trading authorization or earnings are imported.</p>
    </div>
   </div>
   <div className="advanced-import-provenance">
    <span>Instrument <strong>{report.symbol}</strong></span>
    <span>Source <strong>{report.sourceProvider}</strong></span>
    <span>Input bars <strong>{report.barCount.toLocaleString('en-IN')}</strong></span>
    <span>Data fingerprint <code>{report.dataHash.slice(0,12)}…</code></span>
   </div>
   <div className="advanced-import-selector" aria-label="Select imported versioned strategy">
    {report.strategies.map(s=><button key={s.id} type="button" aria-pressed={strategy.id===s.id}
      className={'advanced-import-choice '+(strategy.id===s.id?'selected':'')}
      onClick={()=>setChoice(s.id)}>{s.name}<small>{s.version}</small></button>)}
   </div>
   <h3>{strategy.name} — hypothetical model</h3>
   <div className="research-metric-grid">
    <div><small>Virtual initial balance</small><strong>{inr(strategy.capitalINR)}</strong></div>
    <div><small>Modeled equity</small><strong>{inr(strategy.endingEquityINR)}</strong></div>
    <div><small>Modeled net P/L</small><strong>{inr(strategy.modeledNetPnlINR)}</strong></div>
    <div><small>Modeled return</small><strong>{pct(strategy.modeledReturnPct)}</strong></div>
    <div><small>Maximum drawdown</small><strong>{pct(strategy.maxDrawdownPct)}</strong></div>
    <div><small>Closed model trades</small><strong>{strategy.closedTrades}</strong></div>
    <div><small>Model fees</small><strong>{inr(strategy.feesINR)}</strong></div>
    <div><small>Recorded model win rate</small><strong>{strategy.winRatePct===null?'Insufficient exits':pct(strategy.winRatePct)}</strong></div>
    <div><small>Risk events</small><strong>{strategy.riskEventCount}</strong></div>
   </div>
   <div className="research-chart-caption">Uploaded file equity trace · hypothetical only</div>
   <div className="research-chart"><ResponsiveContainer width="100%" height="100%">
    <LineChart data={strategy.equity}>
     <CartesianGrid strokeOpacity={0.1} vertical={false}/>
     <XAxis dataKey="time" type="number" domain={['dataMin','dataMax']} minTickGap={35}
      tickFormatter={n=>ist(Number(n)).slice(0,11)} tick={{fontSize:10}}/>
     <YAxis width={82} tickFormatter={n=>'₹'+Math.round(n).toLocaleString('en-IN')}
      tick={{fontSize:10}}/>
     <Tooltip formatter={n=>inr(Number(n))} labelFormatter={n=>ist(Number(n))}/>
     <Line dataKey="equityINR" dot={false} stroke="#279d72" strokeWidth={2} isAnimationActive={false}/>
    </LineChart>
   </ResponsiveContainer></div>
   <div className="research-trades">
    <h3>Source-file modeled event details</h3>
    {strategy.trades.length===0?<p>No hypothetical fills were recorded in this imported report.</p>:
     <div className="research-trade-scroll" role="region" aria-label="Imported modeled trades; scroll horizontally" tabIndex={0}><table>
      <thead><tr><th>Model time</th><th>Side</th><th>Modeled price</th>
       <th>Quantity</th><th>Fees</th><th>Exit P/L</th></tr></thead>
      <tbody>{strategy.trades.slice(-30).reverse().map((t,i)=><tr key={i}>
       <td>{ist(t.time)}</td><td>{t.side}</td><td>{inr(t.priceINR)}</td>
       <td>{t.quantity.toFixed(8)}</td><td>{inr(t.feeINR)}</td>
       <td>{t.realizedPnlINR===null?'—':inr(t.realizedPnlINR)}</td>
      </tr>)}</tbody>
     </table></div>}
   </div>
  </>}
 </section>;
}
