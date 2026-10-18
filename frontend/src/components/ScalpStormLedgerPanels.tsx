import { useMemo, useState } from 'react';
import { Activity, Calculator, ChartColumn, CircleAlert, Download, LockKeyhole } from 'lucide-react';
import {
  allocation, estimateWhatIf, verifiedTrades,
  type LeverageScenario, type ReportDay
} from '../lib/scalpstormLedger';

type IndexDay = ReportDay & {
  niftyOpen:string; nifty929Close:string; niftyMinutesChecked:number;
};
interface Props {
  day: IndexDay;
  days: IndexDay[];
  verifiedSessions: number;
  onSelectDay: (date:string)=>void;
}
const rupees = (v:number, fractionDigits=2) => new Intl.NumberFormat('en-IN',{
  style:'currency',currency:'INR', minimumFractionDigits:fractionDigits,
  maximumFractionDigits:fractionDigits
}).format(v);
const percentage = (v:number) => (v>=0?'+':'')+v.toFixed(4)+'%';
const directions = [
  {name:'9:15',desc:'Market opens'},
  {name:'9:30',desc:'Rank ten stocks'},
  {name:'9:40',desc:'Virtual entry'},
  {name:'3:00',desc:'Exit all positions'},
];

export default function ScalpStormLedgerPanels({ day, days, verifiedSessions, onSelectDay }: Props) {
  const [margin,setMargin] = useState<LeverageScenario>(1);
  const [movement,setMovement] = useState(1);
  const [assumedDirection,setAssumedDirection] = useState<'BUY'|'SELL'>('BUY');
  const alloc = allocation(margin);
  const scenario = useMemo(()=>estimateWhatIf(margin,movement,assumedDirection),[margin,movement,assumedDirection]);
  const verified = verifiedTrades(day,verifiedSessions);
  const wouldTrade = day.indexSignal !== 'NO_TRADE';
  const counts = {
    BUY:days.filter(d=>d.indexSignal==='BUY').length,
    SELL:days.filter(d=>d.indexSignal==='SELL').length,
    NO_TRADE:days.filter(d=>d.indexSignal==='NO_TRADE').length,
  };
  const sourceOnly = verifiedSessions === 0;
  function downloadBreakdown() {
    const blob = new Blob([JSON.stringify({
      campaign:'ScalpStorm X', date:day.date, virtualCapital:alloc.capital,
      allocationPerSlot:alloc.capitalPerSlot, marginScenario:margin,
      exposurePerSlot:alloc.exposurePerSlot, actualStockTrades:verified,
      stockTradePnl:verified?day.netPnl:null,
      status:verified?'STOCK_BACKTEST_VERIFIED':'STOCK_DATA_NOT_VERIFIED',
      illustrativeScenario:scenario,
      warning:'What-if math is hypothetical, not actual historical performance.',
    },null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='scalpstorm-'+day.date+'-detail.json';a.click();
    URL.revokeObjectURL(url);
  }
  return <>
    <section className="panel scx-section" aria-label="Selected day breakdown">
      <div className="scx-heading">
        <div><div className="heading-kicker">SELECTED DAY / COMPLETE TRADE LEDGER</div>
          <h2>{day.date} — 10-position breakdown</h2>
          <p>{wouldTrade
            ? 'A direction signal exists. Actual eligible stock names, quantities, entry and exit prices still require minute-by-minute stock-market data.'
            : 'The reconstructed opening rule says NO TRADE. Positions would remain unused; there is no executed trade to report.'}</p>
        </div>
        <button className="secondary-button" type="button" onClick={downloadBreakdown}><Download size={16}/> Day JSON</button>
      </div>
      <div className="scx-allocation-grid">
        <div><small>INITIAL VIRTUAL CAPITAL</small><strong>{rupees(alloc.capital,0)}</strong></div>
        <div><small>ONE OF 10 CAPITAL SLOTS</small><strong>{rupees(alloc.capitalPerSlot,0)}</strong></div>
        <div><small>HYPOTHETICAL MARGIN NOTIONAL</small><strong>{rupees(alloc.exposurePerSlot,0)} / slot</strong></div>
        <div><small>TOTAL HYPOTHETICAL EXPOSURE</small><strong>{rupees(alloc.totalExposure,0)}</strong></div>
      </div>
      <div className="scx-timeline" aria-label="Intraday procedure">
        {directions.map(t=><div key={t.name}><strong>{t.name}</strong><span>{t.desc}</span></div>)}
      </div>
      <div className="scx-table-scroll">
        <table className="scx-ledger-table">
          <thead><tr><th>Slot</th><th>Stock / reason</th><th>Cash allocation</th><th>What-if exposure</th><th>Shares</th><th>Entry / Exit</th><th>Gross P&L</th><th>Fees</th><th>Net P&L</th></tr></thead>
          <tbody>{Array.from({length:alloc.slots},(_,i)=>{
            const trade=verified?.[i];
            return <tr key={i}><td>{String(i+1).padStart(2,'0')}</td>
              <td><strong>{trade?.symbol ?? (wouldTrade?'Awaiting ranked stock':'No entry')}</strong>
                <small>{trade ? trade.side+' · '+trade.exit_reason
                  : wouldTrade ? '9:30 volume rank unverified' : 'Market filter: NO TRADE'}</small>
              </td>
              <td>{rupees(alloc.capitalPerSlot,0)}</td>
              <td>{wouldTrade?rupees(alloc.exposurePerSlot,0):'Not deployed'}</td>
              <td>{trade?.shares ?? '—'}</td>
              <td>{trade ? '₹'+trade.entry+' / ₹'+trade.exit : '— / —'}</td>
              <td>{trade?rupees(Number(trade.gross_pnl)):'—'}</td>
              <td>{trade?rupees(Number(trade.estimated_charges)):'—'}</td>
              <td className={trade && Number(trade.net_pnl)>=0?'scx-positive':'scx-negative'}>
                {trade?rupees(Number(trade.net_pnl)):'—'}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="scx-table-note"><CircleAlert size={15}/>
        {verified
          ? 'Source-attested stock-trade rows are displayed. Validate brokerage and corporate actions before using for decisions.'
          : 'There are no verified selected stock names or historical executions for this day. Dashes mean unknown—not zero profit, loss or fees.'}
      </div>
      <div className="scx-day-result">
        <div><small>SESSION DIRECTION</small><strong>{day.indexSignal}</strong></div>
        <div><small>TRADES VERIFIED</small><strong>{verified?.length ?? 0} / 10</strong></div>
        <div><small>DAY NET P&L</small><strong>{verified ? rupees(Number(day.netPnl)):'— / UNAVAILABLE'}</strong></div>
        <div><small>DAY INVESTMENT STATE</small><strong>{verified?'SIMULATED':'UNVERIFIED'}</strong></div>
      </div>
    </section>

    <section className="panel scx-section" aria-label="Hypothetical margin and profit calculator">
      <div className="scx-heading">
        <div><div className="heading-kicker">SEPARATE DEMONSTRATION / NOT A REAL TRADE</div>
          <h2><Calculator size={19}/> Margin and profit/loss calculator</h2>
          <p>Assume all ten positions move by the same selected percentage. Real stock returns are unknown. Includes published Groww-style estimated fees and 5 bps adverse slippage per side.</p>
        </div>
        <span className="tag tag-gold">HYPOTHETICAL ONLY</span>
      </div>
      <div className="scx-controls">
        <div><label>Market exposure (not enabled for live trading)</label>
          <div className="scx-options">{([1,2,5] as const).map(n=>
            <button type="button" className={margin===n?'selected':''} onClick={()=>setMargin(n)} key={n}>
              {n}× {n===1?'Baseline':'Stress only'}
            </button>)}</div>
        </div>
        <div><label>Example position side</label>
          <div className="scx-options">{(['BUY','SELL'] as const).map(d=>
            <button type="button" className={assumedDirection===d?'selected':''} onClick={()=>setAssumedDirection(d)} key={d}>{d}</button>)}</div>
        </div>
        <div><label>Assumed move in the position's favor (signed)</label>
          <div className="scx-options">{([-2,-1,0,0.5,1,2] as const).map(v=>
            <button type="button" className={movement===v?'selected':''} onClick={()=>setMovement(v)} key={v}>{v>0?'+':''}{v}%</button>)}</div>
        </div>
      </div>
      <div className="scx-scenario-summary">
        <div><small>GROSS P&L / TEN SLOTS</small><strong className={scenario.grossTotal>=0?'scx-positive':'scx-negative'}>{rupees(scenario.grossTotal)}</strong></div>
        <div><small>ESTIMATED BROKERAGE + TAX</small><strong>{rupees(scenario.estimatedFeeTotal)}</strong></div>
        <div><small>ASSUMED ADVERSE SLIPPAGE</small><strong>{rupees(scenario.estimatedSlippageTotal)}</strong></div>
        <div><small>ILLUSTRATIVE NET RESULT</small><strong className={scenario.estimatedNetTotal>=0?'scx-positive':'scx-negative'}>{rupees(scenario.estimatedNetTotal)}</strong></div>
      </div>
      <div className="scx-fee-detail">
        {([['Brokerage',scenario.costs.brokerage],['STT (sell)',scenario.costs.stt],['Stamp (buy)',scenario.costs.stamp],
          ['Exchange',scenario.costs.exchange],['SEBI',scenario.costs.sebi],['IPFT',scenario.costs.ipft],
          ['GST',scenario.costs.gst]] as const).map(([name,value])=>
          <div key={name}><small>{name}</small><strong>{rupees(value)}</strong></div>)}
      </div>
      <p className="scx-disclaimer"><LockKeyhole size={15}/> Margin 2× and 5× are educational comparisons only, not available trade execution settings.
        Costs and slippage are estimates, not a Groww contract note. Actual stop-loss fills can be worse during gaps.
        Trading 10 stocks means up to 20 completed-order legs before cancellations/partial fills.</p>
    </section>

    <section className="panel scx-section" aria-label="Month-end research dashboard">
      <div className="scx-heading">
        <div><div className="heading-kicker">SEPTEMBER 18 – OCTOBER 16, 2026</div>
          <h2><ChartColumn size={19}/> End-of-month dashboard</h2>
          <p>Source-supported opening-market signals are graphed below. Performance figures require verified ten-stock fills—not just the Nifty direction.</p>
        </div><span className="tag tag-gold">STOCK P&L PENDING</span>
      </div>
      <div className="scx-month-stats">
        <div><small>NSE TRADING DAYS</small><strong>{days.length}</strong></div>
        <div><small>DIRECTIONAL SIGNAL DAYS</small><strong>{counts.BUY+counts.SELL}</strong></div>
        <div><small>FILTER SKIPS</small><strong>{counts.NO_TRADE}</strong></div>
        <div><small>STOCK DAYS VERIFIED</small><strong>{verifiedSessions} / 20</strong></div>
        <div><small>MONTHLY GROSS P&L</small><strong>—</strong></div>
        <div><small>MONTHLY NET P&L</small><strong>—</strong></div>
        <div><small>WIN RATE / MAX DRAWDOWN</small><strong>— / —</strong></div>
        <div><small>FREQUENTLY SELECTED STOCKS</small><strong>{'Unknown'}</strong></div>
      </div>
      <div className="scx-month-graph">
        <div className="scx-graph-heading"><strong><Activity size={16}/> Actual source opening direction</strong>
          <span>09:15 to 09:29 Nifty change · click a day</span></div>
        <div className="scx-legend">
          <span><i className="buy"/> BUY {counts.BUY}</span>
          <span><i className="sell"/> SELL {counts.SELL}</span>
          <span><i className="flat"/> NO TRADE {counts.NO_TRADE}</span>
        </div>
        <div className="scx-signal-track">
          {days.map(d=><button key={d.date} type="button"
            title={d.date+': '+d.indexSignal+' '+percentage(Number(d.niftyOpeningChangePct))}
            aria-label={d.date+' '+d.indexSignal} onClick={()=>onSelectDay(d.date)}
            className={d.indexSignal.toLowerCase().replace('_','-')}/>)}
        </div>
        <div className="scx-movement-chart">{days.map(d=>{
          const move=Number(d.niftyOpeningChangePct);
          const width=Math.min(48,Math.max(1,Math.abs(move)/0.7*48));
          return <button type="button" key={d.date} onClick={()=>onSelectDay(d.date)}
            className={'scx-movement-row '+(d.date===day.date?'active':'')}
            title={d.date+' '+percentage(move)}>
            <span>{d.date.slice(5)}</span>
            <div className="scx-movement-axis"><i className="scx-zero"/>
              <i className={move>=0?'up':'down'} style={{left:(move>=0?50:50-width)+'%',width:width+'%'}}/></div>
            <strong className={move>=0?'scx-positive':'scx-negative'}>{percentage(move)}</strong>
          </button>;
        })}</div>
        <p className="scx-disclaimer">These bars show only the Nifty opening price movement, not return on our ten stocks. A positive opening move is NOT a verified winning trading day.</p>
      </div>
      <div className="scx-equity-empty"><LockKeyhole size={23}/>
        <div><strong>Monthly equity curve not available</strong><p>₹1,00,000 remains a virtual starting assumption. Without genuine stock selections, fills, fees and stops, end balance, cumulative profits, losses, returns and best/worst stocks cannot be computed.</p></div>
      </div>
      {sourceOnly&&<div className="scx-need-data">
        <strong>Required to populate real 20-session results</strong>
        <p>Authorized complete NSE equity-universe one-minute OHLCV for each opening, point-in-time stock eligibility, 09:40–15:00 selected-stock candles, and independently checked charges. Only then will Atlas replace dashes with trade names and verified numbers.</p>
      </div>}
    </section>
  </>;
}
