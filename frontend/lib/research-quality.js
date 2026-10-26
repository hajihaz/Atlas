// Observed limitations for public crypto history. No NSE or execution certification.
import {validateResearchBars} from './research-engine.js';

export function researchQuality(source,intervalMs,lookbackMs,now){
  validateResearchBars(source.candles,intervalMs);
  if(!Number.isSafeInteger(now)||now<=0||!Number.isSafeInteger(lookbackMs)||lookbackMs<=0)
    throw Error('invalid research audit window');
  const bars=source.candles;
  if(bars.some(b=>b.time+intervalMs>now))throw Error('unfinished research candle');
  let observedMissingBars=0;
  for(let i=1;i<bars.length;i++)
    observedMissingBars+=(bars[i].time-bars[i-1].time)/intervalMs-1;
  const firstExpected=Math.ceil((now-lookbackMs)/intervalMs)*intervalMs;
  const lastExpected=Math.floor(now/intervalMs)*intervalMs-intervalMs;
  const leadingMissingBars=bars.length?Math.max(0,(bars[0].time-firstExpected)/intervalMs):null;
  const trailingMissingBars=bars.length?Math.max(0,(lastExpected-bars.at(-1).time)/intervalMs):null;
  const latestCandleAgeMs=bars.length?now-(bars.at(-1).time+intervalMs):null;
  const warnings=[
    'Historical replay is uncertified; modeled returns do not qualify a strategy.',
    'Source rights and execution quality are unverified.',
    'Cross-source price and volume discrepancies have not been checked.',
  ];
  if(!bars.length)warnings.push('No completed source candles are available.');
  if(source.coverage==='partial')warnings.push('Provider reported partial history.');
  if(observedMissingBars)warnings.push(observedMissingBars+' missing intervals inside observed history; replay spans gaps.');
  if(leadingMissingBars)warnings.push(leadingMissingBars+' intervals missing at the start of the requested window.');
  if(latestCandleAgeMs!==null&&latestCandleAgeMs>2*intervalMs)
    warnings.push('Latest completed candle is more than two intervals old.');
  return {
    schema:1,status:'UNCERTIFIED_HYPOTHETICAL_RESEARCH',market:'PUBLIC_CRYPTO_SPOT',
    observedBars:bars.length,observedMissingBars,leadingMissingBars,trailingMissingBars,
    intervalMs,latestCandleAgeMs,sourceRightsStatus:'UNVERIFIED',
    crossSourceStatus:'NOT_CHECKED',certified:false,strategyQualified:false,warnings,
  };
}
