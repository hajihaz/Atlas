/** The existing fixed-ten equity archive is not an ETF source for the owner's swing/monthly rules. */
import {SEVEN_STRATEGIES} from './seven-strategy-replay.js';
const valid=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
export async function readFastPeriodRank(env,{sourceDay,asOfDay,strategyId}){
 const spec=SEVEN_STRATEGIES.find(x=>x.id===strategyId);
 if(!env.HISTORY_DB||!spec||!['SWING','MONTHLY'].includes(spec.cadence)||
    !valid(sourceDay)||!valid(asOfDay)||sourceDay>=asOfDay)
  throw Error('FAST_PERIOD_BLOCKED: invalid ETF period request');
 return {schema:'atlas.period-paper-signal.v2',strategyId,sourceDay,asOfDay,
  status:'WAITING_ETF_HISTORY',selected:[],required:spec.requires,
  reason:'No time-qualified adjusted NIFTYBEES and GOLDBEES daily archive is connected to this cloud strategy.',
  executionStatus:'SIGNAL_ONLY_UNARMED',paperOnly:true,realOrdersEnabled:false};
}
