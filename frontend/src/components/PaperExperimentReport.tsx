export type Experiment={schema:string;decisionEngine:string;settingsLocked:boolean;currentRiskPolicy:{version:string};recordedPolicyVersions:string[];historyComplete:boolean;feesPaidINR:number;costModel:string;equityINR:number|null;unrealizedPnlINR:number|null;closedTrades:number|null;wins:number|null;losses:number|null;breakeven:number|null;winRatePct:number|null;profitFactor:number|null;maxClosedPnlDrawdownINR:number|null;daily:{day:string;fills:number;feesINR:number;realizedPnlINR:number}[];closedTradesJournal:{symbol:string;entryAt:string;exitAt:string;quantity:number;netPnlINR:number;feesINR:number;exitReason:string}[];openPositions:{symbol:string;quantity:number;direction:string;entryPriceINR:number;openedAt:string;riskPolicyVersion:string}[];pending:{symbol:string;side:string;reason:string;createdAt:string}[];note:string};
const inr=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
const stamp=(s:string)=>new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
function download(name:string,text:string,type:string){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
export default function PaperExperimentReport({report:r,strategy}:{report:Experiment;strategy:string}){
 if(r.schema!=='atlas.paper-experiment.v1')return null;
 const csv=()=>{const cells=(v:unknown)=>{const s=String(v??'');return '"'+(typeof v==='string'&&/^[=+@-]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';};
  const rows=[['stock','entry_utc','exit_utc','shares','net_pnl_inr','modeled_fees_inr','exit_reason'],...r.closedTradesJournal.map(t=>[t.symbol,t.entryAt,t.exitAt,t.quantity,t.netPnlINR,t.feesINR,t.exitReason])];
  download(`${strategy}-closed-paper-trades.csv`,rows.map(row=>row.map(cells).join(',')).join('\n'),'text/csv');};
 return <div className="atlas-rule-evidence" aria-label="Paper experiment report">
  <h3>Forward experiment report</h3><p>Decision engine: deterministic rules · settings locked · current policy {r.currentRiskPolicy.version}</p>
  <div className="atlas-strategy-portfolio">
   <div><small>Closed trades</small><strong>{r.closedTrades??'Unavailable'}</strong></div>
   <div><small>Win rate · closed trades</small><strong>{r.winRatePct==null?'—':r.winRatePct.toFixed(1)+'%'}</strong></div>
   <div><small>Recorded modeled fees</small><strong>{inr(r.feesPaidINR)}</strong></div>
   <div><small>Closed P&amp;L drawdown</small><strong>{r.maxClosedPnlDrawdownINR==null?'—':inr(r.maxClosedPnlDrawdownINR)}</strong></div>
  </div>
  <p className="atlas-simple-note">{r.costModel} Closed P&amp;L already includes its fees. Open positions need fresh prices before equity or unrealized P&amp;L can be shown.</p>
  {r.recordedPolicyVersions.length>0&&<p>Policies used by recorded fills: {r.recordedPolicyVersions.join(', ')}. Results across policy changes are not a fixed-policy challenge.</p>}
  {!r.historyComplete&&<p role="status">Retained fill history is incomplete. Aggregate trade statistics are withheld.</p>}
  {r.openPositions.length>0&&<><h4>Open virtual positions</h4><div className="atlas-data-dates">{r.openPositions.map(p=><div key={p.symbol}><strong>{p.symbol} · {p.quantity} shares · {p.direction}</strong><span>Entry {inr(p.entryPriceINR)} · {stamp(p.openedAt)} IST · {p.riskPolicyVersion}</span></div>)}</div></>}
  {r.pending.length>0&&<p>Pending: {r.pending.map(p=>`${p.symbol} ${p.side} · ${p.reason.replaceAll('_',' ')}`).join('; ')}</p>}
  {r.daily.length>0&&<><h4>Daily recorded activity</h4><div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Date · IST</th><th>Fills</th><th>Realized P&amp;L</th><th>Modeled fees</th></tr></thead><tbody>{r.daily.map(d=><tr key={d.day}><td>{d.day}</td><td>{d.fills}</td><td>{inr(d.realizedPnlINR)}</td><td>{inr(d.feesINR)}</td></tr>)}</tbody></table></div></>}
  {r.closedTradesJournal.length>0?<details><summary>Closed trade journal · {r.closedTradesJournal.length}</summary><div className="atlas-data-dates">{r.closedTradesJournal.map((t,i)=><div key={`${t.exitAt}-${t.symbol}-${i}`}><strong>{t.symbol} · {t.quantity} shares · net {inr(t.netPnlINR)}</strong><span>{stamp(t.entryAt)} → {stamp(t.exitAt)} IST · {t.exitReason.replaceAll('_',' ')} · fees {inr(t.feesINR)}</span></div>)}</div></details>:<p>No matched closed trades yet. A profit curve and win rate require verified exits.</p>}
  <div className="atlas-simple-actions"><button type="button" className="secondary-button" onClick={()=>download(`${strategy}-paper-experiment.json`,JSON.stringify({strategy,exportedAt:new Date().toISOString(),...r},null,2),'application/json')}>Download experiment audit</button><button type="button" className="secondary-button" disabled={!r.historyComplete||!r.closedTradesJournal.length} onClick={csv}>Export closed trades CSV</button></div>
 </div>;
}
