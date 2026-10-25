import {ExternalLink} from 'lucide-react';
import type {IpoIssue} from '../lib/ipoIntelligence';
import {historicalPEScenario} from '../lib/ipoIssuerResearch';

export default function IpoIssuerResearch({issue,stale}:{issue:IpoIssue;stale:boolean}){
 const r=issue.issuerReview;
 if(!r)return null;
 const pe=historicalPEScenario(issue,stale);
 const units={INR_CR:'₹ crore',INR_PER_SHARE:'₹ / share',PCT:'%',RATIO:'×',DAYS:'days'};
 return <section className="ipo-financial-panel ipo-issuer-review" aria-label="Issuer filing research">
  <div className="ipo-eyebrow">{r.stage==='CURRENT_RHP'?'CURRENT OFFER FILING REVIEW':r.stage==='DRAFT_ONLY'?'EARLIER DRAFT · CONTEXT ONLY':'PRIMARY SOURCE GAP'}</div>
  <h3>Issuer facts, risks and valuation context</h3>
  <p>{r.basis} · {r.fiscalPeriod}. Reviewed {r.reviewedAt.slice(0,10)}. Figures are issuer disclosures.</p>
  {r.metrics.length>0&&<div className="ipo-financial-grid">{r.metrics.map(m=><div key={m.key}><span>{m.label} · {m.periodEnd}</span><strong>{m.value.toLocaleString('en-IN',{maximumFractionDigits:4})} {units[m.unit]}</strong><small>Source {m.sourceId}, physical PDF page {m.page}</small></div>)}</div>}
  <div className="ipo-small-notice">{pe?<><strong>Historical earnings P/E scenario: {pe.low.toFixed(2)}–{pe.high.toFixed(2)}×.</strong> Reported calendar price band ÷ FY26 diluted EPS ₹{pe.eps.toFixed(2)} ({pe.basis}). Pre-offer earnings basis; fresh shares can dilute EPS. This arithmetic does not establish fair value or expected returns.</>:'P/E scenario withheld: current annual earnings, current offer evidence or fresh price-band evidence is incomplete.'}</div>
  {r.peerContext&&<div><h4>Issuer-reported peer context · prices dated {r.peerContext.priceAsOf}</h4><ul>{r.peerContext.peers.map(p=><li key={p.company}>{p.company}: disclosed P/E {p.reportedPE.toFixed(2)}×</li>)}</ul><p className="ipo-small-notice">{r.peerContext.note} Source {r.peerContext.sourceId}, physical PDF page {r.peerContext.page}. These prices and ratios have not been independently refreshed by Atlas.</p></div>}
  {r.risks.length>0&&<div><h4>Disclosed risks to review</h4><ul>{r.risks.map(x=><li key={x}>{x}</li>)}</ul></div>}
  <div><h4>Still required before an investment decision</h4><ul>{r.gaps.map(x=><li key={x}>{x}</li>)}</ul></div>
  {r.sources.map(s=><div key={s.id} className="ipo-research-source"><a href={s.url} target="_blank" rel="noopener noreferrer">Source {s.id} · {s.document.replaceAll('_',' ')} · physical PDF pp. {s.pages.join(', ')} <ExternalLink size={13}/></a><details className="ipo-document-audit"><summary>Document fingerprint</summary><small>SHA-256: {s.sha256}</small></details></div>)}
  <p className="ipo-small-notice"><strong>HOLD FOR MANUAL REVIEW.</strong> Filing review does not constitute independent peer valuation or an Apply recommendation.</p>
 </section>;
}
