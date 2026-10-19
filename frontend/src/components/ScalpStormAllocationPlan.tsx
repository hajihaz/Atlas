// ScalpStorm X virtual allocation proposal only.
// Not a market universe, trade ledger, return or broker order.
const VIRTUAL_CAPITAL_INR=100000;
const STOCK_SLOTS=10;
const SLOTS=Array.from({length:STOCK_SLOTS},(_,i)=>i+1);
const format=new Intl.NumberFormat('en-IN',{style:'currency',
 currency:'INR',maximumFractionDigits:0});
export default function ScalpStormAllocationPlan(){
 const perSlot=VIRTUAL_CAPITAL_INR/STOCK_SLOTS;
 return <section className="panel scalpstorm-allocation" aria-label="ScalpStorm X planned virtual capital">
   <div className="research-detail-title">
    <div><div className="premium-kicker">SCALPSTORM X · ALLOCATION PLAN</div>
      <h2>₹1,00,000 virtual capital plan</h2>
      <p>Equal allocation across ten future point-in-time NSE volume leaders.
       The actual ten stock symbols and trading days are NOT verified yet.</p>
    </div>
    <span className="research-tag">Planning · No fills</span>
   </div>
   <div className="scalpstorm-capital-summary">
     <div><small>Virtual starting capital</small><strong>{format.format(VIRTUAL_CAPITAL_INR)}</strong></div>
     <div><small>Planned stock slots</small><strong>{STOCK_SLOTS}</strong></div>
     <div><small>Equal weight per slot</small><strong>{format.format(perSlot)}</strong></div>
   </div>
   <div className="scalpstorm-bars" aria-label="Ten equal 10 percent allocation slots">
     {SLOTS.map(i=><span key={i} title={'Research slot '+i+' · '+format.format(perSlot)}/>)}
   </div>
   <div className="scalpstorm-slot-grid">
     {SLOTS.map(i=><div className="scalpstorm-slot" key={i}>
       <small>Slot {i.toString().padStart(2,'0')} · 10%</small>
       <strong>{format.format(perSlot)}</strong>
       <span>Symbol unverified</span>
     </div>)}
   </div>
   <div className="scalpstorm-capital-note" role="note">
     <strong>No NSE profits have been calculated.</strong>
     <span>This is an allocation formula only, not invested capital, margins,
       entries, exits or a simulated fill. Target historical study: 18 September
       to 16 October 2026; verify the exchange calendar, point-in-time top ten,
       licensed candles and transaction costs before displaying P/L.</span>
   </div>
 </section>;
}
