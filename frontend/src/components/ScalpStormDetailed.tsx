import { useState } from 'react';
import { Check, Copy, Download, ExternalLink, LockKeyhole } from 'lucide-react';
import scalpstorm from '../data/scalpstorm-campaign.json';
import ScalpStormAllocationPlan from './ScalpStormAllocationPlan';
import ScalpStormLedgerPanels from './ScalpStormLedgerPanels';

function exportText(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], {type:'text/plain'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ScalpStormDetailed() {
  type Filter = 'ALL' | 'BUY' | 'SELL' | 'NO_TRADE';
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selectedDay, setSelectedDay] = useState(scalpstorm.days[0].date);
  const [copied, setCopied] = useState(false);
  const days = scalpstorm.days.filter(d => filter === 'ALL' || d.indexSignal === filter);
  const day = scalpstorm.days.find(d => d.date === selectedDay) ?? scalpstorm.days[0];
  function selectFilter(next: Filter) {
    setFilter(next);
    if (next !== 'ALL' && day.indexSignal !== next) {
      const first = scalpstorm.days.find(d => d.indexSignal === next);
      if (first) setSelectedDay(first.date);
    }
  }
  const publicUrl = window.location.origin + '/scalpstorm-report.json';
  const digest = [
    'ATLAS / SCALPSTORM X — historical report',
    'Period: 18 September–16 October 2026 | Virtual ₹1,00,000',
    'NSE calendar dates: 20 verified; Nifty community one-minute 20/20 validated.',
    'Nifty provisional 09:30 signals: BUY ' + scalpstorm.signalCounts.BUY +
      ', SELL ' + scalpstorm.signalCounts.SELL +
      ', NO TRADE ' + scalpstorm.signalCounts.NO_TRADE,
    'Capital allocation: 10 equal slots of ₹10,000 each at the 1x baseline.',
    'Stress comparison only: 2x ₹20,000 per slot, 5x ₹50,000 per slot. Not real leverage.',
    'Actual stocks, entries, exits, charges, wins and losses: NOT VERIFIED.',
    'Exact top-ten stock trades verified: 0/20. Net trading profit: UNAVAILABLE (not zero).',
    'Broker order placement BLOCKED. Source-of-truth report: ' + publicUrl,
    'Signals are NOT profitable trades. Community index source is not independently NSE-attested.',
  ].join('\n');
  function copyForChat() {
    if (!navigator.clipboard?.writeText) { exportText('scalpstorm-chat-summary.txt',digest); return; }
    void navigator.clipboard.writeText(digest)
      .then(() => setCopied(true))
      .catch(() => exportText('scalpstorm-chat-summary.txt',digest));
  }
  return <section className="scx-root">
    <div className="sub-page-header">
      <div className="breadcrumb">ATLAS / PAPER TRADING LAB</div>
      <h1>ScalpStorm X.</h1>
      <p>20 historical Nifty opening signals, separately labelled from unverified stock trades.</p>
    </div>
    <div className="section-warning"><LockKeyhole size={19}/><span>
      <strong>Real money blocked; no simulated stock positions executed.</strong> Signals were
      reconstructed from a third-party community index archive, not authenticated Groww rankings.
      This view has no brokerage trading controls.
    </span></div>
    <ScalpStormAllocationPlan/>
    <div className="scalp-summary">
      <div className="panel"><small>VIRTUAL CAPITAL</small><strong>₹{scalpstorm.capitalINR.toLocaleString('en-IN')}</strong><span>Paper only · 1x gross cap</span></div>
      <div className="panel"><small>NIFTY SOURCE BARS</small><strong>{scalpstorm.indexSignalSessionsValidated} / 20</strong><span>375 minute candles / day</span></div>
      <div className="panel"><small>TOP-TEN STOCK REPLAY</small><strong>{scalpstorm.verifiedSessions} / 20</strong><span>Historical stock data missing</span></div>
      <div className="panel"><small>NET STOCK TRADING P&L</small><strong>—</strong><span>Unavailable; not ₹0</span></div>
    </div>
    <div className="scalp-signal-grid">
      {(['BUY','SELL','NO_TRADE'] as const).map(direction=>
        <button type="button" key={direction} className={'panel scalp-signal-card '+(filter===direction?'scalp-active':'')}
          onClick={()=>selectFilter(filter===direction?'ALL':direction)}>
          <small>{direction==='NO_TRADE'?'NO TRADE':direction}</small><strong>{scalpstorm.signalCounts[direction]}</strong>
          <span>Index classifications</span>
        </button>
      )}
    </div>
    <div className="panel scalp-panel">
      <div className="panel-heading"><div>
        <div className="heading-kicker">SOURCE VALIDATED · COMMUNITY DATA</div>
        <h2>Historical 9:30 AM direction</h2>
        <p>Nifty 09:15 open vs 09:29 close. ±0.15% direction threshold is a research assumption.</p>
      </div><span className="tag tag-gold">NOT EXCHANGE ATTESTED</span></div>
      <div className="scalp-controls">
        {(['ALL','BUY','SELL','NO_TRADE'] as const).map(d=>
          <button key={d} type="button" className={filter===d?'active':''} onClick={()=>selectFilter(d)}>
            {d==='ALL'?'All 20':d==='NO_TRADE'?'No trade':d}
          </button>
        )}
      </div>
      <div className="scalp-session-grid">{days.map(d=>
        <button type="button" onClick={()=>setSelectedDay(d.date)}
          className={'scalp-session scalp-day-button '+(selectedDay===d.date?'scalp-day-selected':'')} key={d.date}>
          <span>{new Date(d.date+'T12:00:00Z').toLocaleDateString('en-IN',{day:'2-digit',month:'short',timeZone:'UTC'})}</span>
          <strong className={'scalp-day-'+d.indexSignal.toLowerCase()}>
            {d.indexSignal==='NO_TRADE'?'NO TRADE':d.indexSignal}
          </strong>
          <small>{Number(d.niftyOpeningChangePct)>=0?'+':''}{Number(d.niftyOpeningChangePct).toFixed(4)}%</small>
        </button>
      )}</div>
      <div className="scalp-detail" aria-live="polite">
        <div><small>SELECTED DAY</small><strong>{day.date}</strong></div>
        <div><small>NIFTY 09:15 OPEN</small><strong>{Number(day.niftyOpen).toLocaleString('en-IN')}</strong></div>
        <div><small>NIFTY 09:29 CLOSE</small><strong>{Number(day.nifty929Close).toLocaleString('en-IN')}</strong></div>
        <div><small>10 STOCKS / P&L</small><strong>UNVERIFIED / —</strong></div>
      </div>
    </div>
    <ScalpStormLedgerPanels day={day as Parameters<typeof ScalpStormLedgerPanels>[0]["day"]}
      days={scalpstorm.days as Parameters<typeof ScalpStormLedgerPanels>[0]["days"]}
      verifiedSessions={scalpstorm.verifiedSessions} onSelectDay={setSelectedDay}/>
    <div className="panel scalp-panel">
      <div className="panel-heading"><div>
        <div className="heading-kicker">CHATGPT + ATLAS</div>
        <h2>Same results, accessible from both</h2>
        <p>Public read-only JSON and a plain-text transcript come from the exact same validated dataset.</p>
      </div><span className="tag tag-mint">REPORTS READY</span></div>
      <div className="scalp-export-actions">
        <a className="secondary-button" href="/scalpstorm-breakdown.json" target="_blank" rel="noopener noreferrer">
          <Download size={16}/> Ten-slot evidence JSON
        </a>
        <a className="secondary-button" href="/scalpstorm-report.json" target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16}/> JSON evidence
        </a>
        <a className="secondary-button" href="/scalpstorm-chat-report.txt" target="_blank" rel="noopener noreferrer">
          <Download size={16}/> 20-day ChatGPT report
        </a>
        <button className="secondary-button" type="button" onClick={copyForChat}>
          {copied?<Check size={16}/>:<Copy size={16}/>} {copied?'Copied':'Copy ChatGPT summary'}
        </button>
      </div>
      <p className="scalp-footnote">
        <strong>Source:</strong> <a href={scalpstorm.indexSource.repository} rel="noopener noreferrer" target="_blank">
          technovusin NIFTY50 one-minute archive</a>, revision {scalpstorm.indexSource.commit.slice(0,12)}.
        375 complete source candles for every session; structural checks passed.
        NSE/broker attestation is outstanding. Full-stock point-in-time minute-volume coverage
        remains missing, so stock selection, fills, exit prices, brokerage and net P&L are not reported.
      </p>
    </div>
  </section>;
}
