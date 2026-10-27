// Explicit historical candle simulation. Never seeds the forward database or pretends these are ticks.
import fs from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NsePaperStore} from './nse_paper_store.mjs';
import {validateUniverse,digest} from './nse_paper_engine.mjs';
import {validateResearchBars} from '../frontend/lib/research-engine.js';
import {readPrivateJson,writePrivateJson} from './run_nse_paper.mjs';
import {validateNsePaperReport} from '../frontend/src/lib/nsePaperReport.js';

export function historicalInput(dataset,date,index){
  const universe=dataset.universe;
  const first=dataset.history[universe[0].symbol][date][index];
  const now=first.time+1000;
  const stamp=new Date(now).toISOString();
  const history={},quotes=[];
  for(const row of universe){
    const bars=dataset.history[row.symbol][date],current=bars[index],past=bars.slice(0,index);
    if(current.time!==first.time)throw Error('Historical cross-stock minute mismatch');
    history[row.symbol]={bars:past,observedAt:stamp};
    // Only the current OPEN is available. Current high/low/close/volume are not used.
    const previousVolume=index?bars[index-1].volume:0;
    const price=current.open,bid=Math.floor(price*(1-.0002)*100)/100,
      ask=Math.ceil(price*(1+.0002)*100)/100;
    quotes.push({...row,priceUnit:'INR',lastPrice:price,lastTradeAt:stamp,quoteTimestamp:stamp,
      depth:{buy:{price:bid,quantity:previousVolume},sell:{price:ask,quantity:previousVolume}}});
  }
  return {now,input:{schema:'atlas.nse-paper-input.v1',source:'Upstox Analytics',
    dataClass:'HISTORICAL_CANDLE_SIMULATION',realOrdersEnabled:false,observedAt:stamp,
    market:{exchange:'NSE',status:'NORMAL_OPEN',marketOpen:true},marketObservedAt:stamp,
    universe,quotes,history}};
}
export function validateHistoricalDataset(dataset){
  if(dataset?.schema!=='atlas.nse-fixed-history.v1'||!Array.isArray(dataset.dates)||
    !dataset.dates.length||dataset.dates.length>30)throw Error('Historical dataset contract invalid');
  validateUniverse(dataset.universe);
  if(new Set(dataset.dates).size!==dataset.dates.length||
    [...dataset.dates].sort().join()!==dataset.dates.join())throw Error('Historical dates invalid');
  for(const date of dataset.dates){
    const start=Date.parse(date+'T09:15:00+05:30');
    if(!Number.isFinite(start))throw Error('Invalid NSE historical date');
    for(const row of dataset.universe){
      const bars=dataset.history[row.symbol]?.[date];
      validateResearchBars(bars,60000);
      if(bars.length!==375||bars.some((bar,i)=>bar.time!==start+i*60000))
        throw Error('Complete exact fixed-basket historical minute grid required');
    }
  }
  return dataset;
}
export async function runNseHistory(inputFile,directory){
  process.umask(0o077);
  const dataset=validateHistoricalDataset(await readPrivateJson(inputFile,20000000));
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const database=join(directory,'nse-replay.sqlite3');
  try{await fs.lstat(database);throw Error('Historical output already exists; do not repeat or overwrite');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const store=new NsePaperStore(database,{universe:dataset.universe,
    startedAt:Date.parse(dataset.dates[0]+'T09:15:00+05:30'),mode:'HISTORICAL_REPLAY'});
  const daily=[],start=Date.now();
  try{
    for(const date of dataset.dates){
      for(let index=0;index<375;index++){
        const frame=historicalInput(dataset,date,index);
        store.advance(frame.input,frame.now);
      }
      const state=store.load().state;
      daily.push({date,sessions:state.sessions.map(s=>({strategyId:s.strategyId,cashPaise:s.cashPaise,
        realizedPaise:s.realizedPaise,feesPaise:s.feesPaise,positions:s.positions,fills:s.fills}))});
      console.log(JSON.stringify({date,completed:daily.length,of:dataset.dates.length,
        totalFills:state.sessions.reduce((n,s)=>n+s.fills,0)}));
      await writePrivateJson(join(directory,'nse-replay-progress.json'),
        {datesComplete:daily.length,totalDates:dataset.dates.length,at:new Date().toISOString()});
    }
    store.verify();
    const generatedAt=Date.now();
    const report={...store.report(generatedAt),status:'REPLAY_COMPLETE',
      note:'Historical fixed current basket; 2bps assumed spread each side; next-minute-open proxy after decision. Quote times/liquidity are modeled. No tuning, no certified ScalpStorm or forward performance.'};
    const filledDays=new Map(report.days.map(d=>[d.strategyId+'_'+d.date,d]));
    report.days=dataset.dates.flatMap(date=>report.sessions.map(s=>filledDays.get(s.strategyId+'_'+date)??
      {strategyId:s.strategyId,date,fills:0,realizedPnlINR:0,feesINR:0}));
    validateNsePaperReport(report,generatedAt,'HISTORICAL_REPLAY');
    await writePrivateJson(join(directory,'nse-history-report.json'),report);
    const folder=join(directory,'nse-history-days');await fs.mkdir(folder,{recursive:true,mode:0o700});
    // Materialize every read-only day/page once; the UI never reruns the historical simulator.
    const groups=new Map();
    for(const row of store.db.prepare("SELECT payload_json FROM paper_events WHERE json_extract(payload_json,'$.type')='FILL' ORDER BY seq DESC").all()){
      const event=JSON.parse(row.payload_json);
      const key=event.strategyId+'_'+new Date(event.at+19800000).toISOString().slice(0,10);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(event);
    }
    for(const day of report.days){
      const rows=groups.get(day.strategyId+'_'+day.date)??[];
      for(let offset=0;offset<Math.max(1,rows.length);offset+=200){
        const page={...report,events:rows.slice(offset,offset+200).reverse(),
          hasMore:offset+200<rows.length};
        validateNsePaperReport(page,generatedAt,'HISTORICAL_REPLAY');
        await writePrivateJson(join(folder,day.strategyId+'_'+day.date+'_'+offset+'.json'),page);
      }
    }
    await writePrivateJson(join(directory,'nse-history-daily-checkpoints.json'),{daily});
    const proof={generatedAt:new Date(generatedAt).toISOString(),elapsedSeconds:(Date.now()-start)/1000,
      dataHash:digest(dataset),dates:dataset.dates.length,bars:dataset.dates.length*375*10,
      sourceClass:'AUTHENTIC_BROKER_CANDLES_WITH_EXPLICIT_EXECUTION_ASSUMPTIONS',
      currentBasketSelectionDate:'2026-10-26',historicalUniverseVerified:false,
      nativeReplayVerified:store.verify(),realOrdersSubmitted:0,forwardLedgerModified:false,
      parameterTuning:false,strategyQualified:false,
      results:report.sessions.map(s=>({strategy:s.strategyId,equityINR:s.equityINR,
        realizedPnlINR:s.realizedPnlINR,unrealizedPnlINR:s.unrealizedPnlINR,feesINR:s.feesINR,fills:s.fills}))};
    await writePrivateJson(join(directory,'nse-history-acceptance.json'),proof);
    console.log(JSON.stringify(proof));
    return report;
  }finally{store.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==4)throw Error('Usage: nse_history_replay.mjs PRIVATE_HISTORY_JSON PRIVATE_OUTPUT_DIR');
  await runNseHistory(resolve(process.argv[2]),resolve(process.argv[3]));
}
