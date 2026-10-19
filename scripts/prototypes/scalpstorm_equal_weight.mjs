// FinRL-X-style weight allocation contract, independently implemented for Atlas.
// No copied upstream package/code and no broker orders or source prices.
// This is a hypothetical allocation PLAN, not a position, fill, signal or P/L.
const CAP=100000;
const COUNT=10;
export function planScalpStormEqualWeights(symbols,capitalINR=CAP){
 if(!Array.isArray(symbols)||symbols.length!==COUNT||
   symbols.some(s=>typeof s!=='string'||!/^NSE:[A-Z0-9&._-]{1,30}$/.test(s))||
   new Set(symbols).size!==COUNT)
   throw new RangeError('Ten distinct qualified NSE symbols required for this research plan');
 if(!Number.isSafeInteger(capitalINR)||capitalINR<=0||capitalINR>100000000)
   throw new RangeError('Invalid virtual capital');
 // Calculate integer paise, never pretend fractional rupees are execution fills.
 const paise=capitalINR*100;
 const allocationPaise=Math.floor(paise/COUNT);
 const unallocatedPaise=paise-allocationPaise*COUNT;
 const weights=symbols.map(symbol=>Object.freeze({
   symbol,weight:1/COUNT,plannedCapitalINR:allocationPaise/100,
   quantityPurchased:0,tradesExecuted:0,
 }));
 return Object.freeze({
   schema:1,mode:'RESEARCH_ALLOCATION_PLAN_ONLY',currency:'INR',
   capitalINR,positionsPlanned:COUNT,allocationType:'EQUAL_WEIGHT',
   allocations:weights,unallocatedINR:unallocatedPaise/100,
   realOrdersEnabled:false,paperOrdersExecuted:false,
   marketDataVerified:false,
   note:'Equal-weight hypothetical allocation only; no authorized NSE quotes, fills, broker activity or profits.',
 });
}
