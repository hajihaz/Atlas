// Strategy Lab API (ADR-0070): Atlas is a multi-strategy PAPER_ONLY platform.
//  - No query  -> public strategy catalog: ScalpStorm X (flagship) first, then the five approved
//                 strategies. Definitions only; performance stays in the private owner journal.
//  - symbol/range only -> source-backed HYPOTHETICAL replay of the five strategies.
//  - anything else -> refused. No broker or paper-order writes exist here.
import {getChart,RANGES,ASSETS} from './market-history.js';
import {STRATEGIES,runAllStrategies} from '../lib/research-engine.js';

const ACCEPTED_RANGES=Object.freeze(['1W','1M','1Y']);
const REPLAY_KEYS=Object.freeze(['symbol','range']);

function catalog(){
  return {schema:'atlas.owner-strategy-catalog.v1',realOrdersEnabled:false,
    actualCapitalINR:0,paperOnly:true,
    strategies:[
      {id:'scalpstorm_x_0940',name:'ScalpStorm X',flagship:true,entryIST:'09:40',
        exitIST:'15:15',virtualCapitalINR:100000,allocationPerStockINR:10000,slots:10,
        selection:'Eligible NSE cash equities ranked by observed pre-entry volume',
        niftySignalIST:'09:30',niftyThresholdPct:0.2,results:null},
      ...STRATEGIES.map(({id,name,category,description,logic})=>
        ({id,name,flagship:false,category,description,logic,results:null})),
    ],
    source:'Owner-approved protocol',performanceSource:'Private owner Mac journal'};
}

async function replay({symbol='BTCINR',range='1M'},getter,now){
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
    warning:'Results are hypothetical model calculations based on source candles. They are not paper-forward fills, live positions, actual account equity, or verified exchange fills.',
  };
}

export async function getLab(query={},getter=getChart,now=Date.now()){
  const keys=Object.keys(query);
  if(keys.length===0)return catalog();
  if(!keys.every(key=>REPLAY_KEYS.includes(key)))throw new RangeError('unsupported protocol query');
  return replay(query,getter,now);
}

export default async function handler(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method&&req.method!=='GET'){
    res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});
  }
  const query=req.query??{};
  res.setHeader('Cache-Control',Object.keys(query).length?'public, max-age=0, s-maxage=60':'no-store');
  try{return res.status(200).json(await getLab(query));}
  catch(error){
    if(error instanceof RangeError)return res.status(400).json({error:'unsupported_market_or_period'});
    return res.status(503).json({error:'research_provider_unavailable'});
  }
}
