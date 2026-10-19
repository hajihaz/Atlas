// Source-backed hypothetical replay only. No real or paper broker writes.
import {getChart,RANGES,ASSETS} from './market-history.js';
import {STRATEGIES,runAllStrategies} from '../lib/research-engine.js';

const ACCEPTED_RANGES=Object.freeze(['1W','1M','1Y']);
export async function getLab({symbol='BTCINR',range='1M'}={},getter=getChart,now=Date.now()){
  if(!Object.hasOwn(ASSETS,symbol)||!ACCEPTED_RANGES.includes(range))
    throw new RangeError('unsupported research input');
  const source=await getter({symbol,range},fetch,now);
  if(source.schema!==1||source.currency!=='INR'||source.symbol!==symbol
    ||source.range!==range||source.realOrdersEnabled!==false
    ||source.paperExecutionEnabled!==false||!Array.isArray(source.candles))
    throw Error('source contract invalid');
  const interval=RANGES[range].unit;
  // Upstream missing/partial data is never substituted with synthetic bars.
  const strategies=source.candles.length>=55
    ?runAllStrategies(source.candles,interval)
    :STRATEGIES.map(st=>({...st,status:'insufficient_history'}));
  return {
    schema:1,mode:'HISTORICAL_HYPOTHETICAL_REPLAY',symbol,range,currency:'INR',
    source:source.source,generatedAt:source.generatedAt,
    barCount:source.candles.length,historyCoverage:source.coverage,
    earliestBarAt:source.earliestAvailable,latestClosedAt:source.latestClosedAt,
    dataCompleteVerified:source.completeHistoryVerified,
    providerWarning:source.warning,
    strategies,
    simulatedCapitalINR:100000,realBrokerOrders:0,liveOrdersEnabled:false,
    paperOrdersExecuted:false,paperLedgerStored:false,
    warning:'Results are hypothetical model calculations based on source candles. They are not paper-forward fills, live positions, actual account equity, or verified executable quotations.',
  };
}
export default async function handler(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=60');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
  const symbol=typeof req.query?.symbol==='string'?req.query.symbol:'BTCINR';
  const range=typeof req.query?.range==='string'?req.query.range:'1M';
  if(!Object.hasOwn(ASSETS,symbol)||!ACCEPTED_RANGES.includes(range))
    return res.status(400).json({error:'unsupported_market_or_period'});
  try{return res.status(200).json(await getLab({symbol,range}));}
  catch{return res.status(503).json({error:'research_provider_unavailable'});}
}
