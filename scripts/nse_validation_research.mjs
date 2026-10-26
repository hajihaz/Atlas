// Separate frozen temporal validation. No network, credentials, broker orders or account resets.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CODE_HASH} from './nse_paper_store.mjs';
import {createNsePaper,advanceNsePaper,summarizeNsePaper,digest,POLICY} from './nse_paper_engine.mjs';
import {historicalInput,validateHistoricalDataset} from './nse_history_replay.mjs';
import {readPrivateJson,writePrivateJson} from './run_nse_paper.mjs';
import {validateNsePaperReport} from '../frontend/src/lib/nsePaperReport.js';
const STRATEGIES=['sma_9_21','ema_12_26','rsi_14','breakout_20','sps_pullback'];
const validDay=d=>typeof d==='string'&&/^\d{4}-\d\d-\d\d$/.test(d)&&
 Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
export function validateTemporalProtocol(protocol,dataset){
 if(protocol?.schema!=='atlas.nse-validation-protocol.v1'||protocol.codeHash!==CODE_HASH||
  protocol.parameterTuning!==false||protocol.capitalINREach!==100000||protocol.perStockINR!==10000||
  protocol.feeBpsEachSide!==POLICY.feeBps||protocol.slippageBpsEachSide!==POLICY.slippageBps||
  protocol.spreadBpsEachSide!==2||JSON.stringify(protocol.strategies)!==JSON.stringify(STRATEGIES))
  throw Error('Frozen validation protocol mismatch');
 for(const dates of [protocol.trainingDates,protocol.validationDates]){
  if(!Array.isArray(dates)||!dates.length||dates.length>30||dates.some(d=>!validDay(d))||
   new Set(dates).size!==dates.length||[...dates].sort().join()!==dates.join())
   throw Error('Invalid chronological validation dates');
 }
 if(protocol.trainingDates.at(-1)>=protocol.validationDates[0]||
  protocol.trainingDates.some(d=>protocol.validationDates.includes(d))||
  JSON.stringify(protocol.validationDates)!==JSON.stringify(dataset.dates))
  throw Error('Training and validation windows overlap or mismatch');
 if(dataset.classification!=='TEMPORAL_VALIDATION_OF_FIXED_CURRENT_BASKET_NOT_BLIND_OR_MARKET_WIDE')
  throw Error('Authentic-source temporal validation classification required');
 validateHistoricalDataset(dataset);return protocol;
}
export function conditionalCostSensitivity(fills,sessions,scenarios){
 if(!Array.isArray(scenarios)||!scenarios.length||scenarios.length>10)throw Error('Bounded cost scenarios required');
 const ids=new Set(sessions.map(s=>s.strategyId));
 if(ids.size!==sessions.length||sessions.some(s=>!STRATEGIES.includes(s.strategyId)||!Number.isFinite(s.netPnlINR)))
  throw Error('Invalid cost accounts');
 for(const e of fills){
  if(e.type!=='FILL'||!ids.has(e.strategyId)||!['BUY','SELL'].includes(e.side)||
   !Number.isSafeInteger(e.quantity)||e.quantity<=0||!Number.isSafeInteger(e.pricePaise)||e.pricePaise<=0||
   !Number.isSafeInteger(e.quantity*e.pricePaise)||
   e.feePaise!==Math.ceil(e.quantity*e.pricePaise*POLICY.feeBps/10000))throw Error('Invalid fixed-path fill');
 }
 return scenarios.map(s=>{
  if(!Number.isInteger(s.feeBps)||s.feeBps<0||s.feeBps>100||
   !Number.isInteger(s.extraSlippageBps)||s.extraSlippageBps<0||s.extraSlippageBps>100)
   throw Error('Invalid friction scenario');
  return{...s,method:'CONDITIONAL_FIXED_FILL_PATH_NOT_FULL_REEXECUTION',sessions:sessions.map(account=>{
   let delta=0;
   for(const e of fills.filter(e=>e.strategyId===account.strategyId)){
    const gross=e.quantity*e.pricePaise;
    delta+=Math.ceil(gross*s.feeBps/10000)-e.feePaise+Math.ceil(gross*s.extraSlippageBps/10000);
   }
   return{strategyId:account.strategyId,netPnlINR:(Math.round(account.netPnlINR*100)-delta)/100,
    incrementalCostINR:delta/100};
  })};
 });
}
async function privateHash(file){
 const h=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const s=await h.stat();
  if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>20000000)throw Error('Unsafe validation evidence');
  const b=Buffer.alloc(20000001),{bytesRead}=await h.read(b,0,b.length,0);
  if(bytesRead>20000000)throw Error('Oversized validation evidence');
  return createHash('sha256').update(b.subarray(0,bytesRead)).digest('hex');
 }finally{await h.close();}
}
export async function runNseValidation(inputFile,protocolFile,proofFile,directory){
 process.umask(0o077);
 const dataset=await readPrivateJson(inputFile,20000000),protocol=await readPrivateJson(protocolFile,65536),
  source=await readPrivateJson(proofFile,65536);
 validateTemporalProtocol(protocol,dataset);
 const dataHash=await privateHash(inputFile),protocolHash=await privateHash(protocolFile),
  driverHash=createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex');
 if(source.protocolSHA256!==protocolHash||source.dataSHA256!==dataHash||
  source.totalBars!==dataset.dates.length*375*10||source.sourceMode!=='AUTHENTIC_BROKER_CANDLES'||
  source.oldSourceUnchanged!==true||source.allNewHistoricalReceiptsVerified!==true)
  throw Error('Source and frozen validation proof mismatch');
 try{await fs.lstat(directory);throw Error('Validation output already exists; inspect instead of repeating');}
 catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.mkdir(directory,{mode:0o700});
 await writePrivateJson(join(directory,'validation-run-start.json'),{startedAt:new Date().toISOString(),
  dataHash,protocolHash,driverHash,codeHash:CODE_HASH});
 const eventFile=join(directory,'validation-events.jsonl'),handle=await fs.open(eventFile,'wx',0o600);
 const fills=[],daily=[],dayGroups=new Map();
 let state=createNsePaper(dataset.universe,Date.parse(dataset.dates[0]+'T09:15:00+05:30'),'HISTORICAL_REPLAY');
 let chain='0'.repeat(64),sequence=0;
 try{
  for(const date of dataset.dates){
   for(let index=0;index<375;index++){
    const frame=historicalInput(dataset,date,index),result=advanceNsePaper(state,frame.input,frame.now);
    state=result.state;
    const lines=[];
    for(const event of result.events){
     const previous=chain;chain=digest([chain,event]);
     lines.push(JSON.stringify({seq:++sequence,previous,hash:chain,event})+'\n');
     if(event.type==='FILL'){
      fills.push(event);
      const key=event.strategyId+'_'+date;
      if(!dayGroups.has(key))dayGroups.set(key,[]);
      dayGroups.get(key).push(event);
     }
    }
    if(lines.length)await handle.writeFile(lines.join(''));
   }
   daily.push({date,sessions:summarizeNsePaper(state,[],Date.now()).sessions});
   await writePrivateJson(join(directory,'validation-progress.json'),{datesComplete:daily.length,totalDates:dataset.dates.length,events:sequence});
   console.log(JSON.stringify({completedDate:date,events:sequence,fills:fills.length}));
  }
  await handle.sync();
 }finally{await handle.close();}
 const observedAt=Date.now(),report={...summarizeNsePaper(state,fills,observedAt),status:'REPLAY_COMPLETE',
  note:'Separate five-session temporal validation; current26Oct basket bias remains. Execution and liquidity modeled. Protocol frozen before evaluation;20Oct holiday excluded. Not a blind holdout or qualified strategy. Original historical and forward ledgers unchanged.'};
 report.days=dataset.dates.flatMap(date=>report.sessions.map(s=>{
  const events=dayGroups.get(s.strategyId+'_'+date)??[];
  return{strategyId:s.strategyId,date,fills:events.length,
   realizedPnlINR:events.reduce((n,e)=>n+e.realizedPaise,0)/100,feesINR:events.reduce((n,e)=>n+e.feePaise,0)/100};
 }));
 validateNsePaperReport(report,observedAt,'HISTORICAL_REPLAY');
 await writePrivateJson(join(directory,'nse-validation-report.json'),report);
 const days=join(directory,'nse-validation-days');await fs.mkdir(days,{mode:0o700});
 for(const day of report.days){
  const rows=dayGroups.get(day.strategyId+'_'+day.date)??[];
  for(let offset=0;offset<Math.max(1,rows.length);offset+=200){
   const page={...report,events:rows.slice(offset,offset+200),hasMore:offset+200<rows.length};
   validateNsePaperReport(page,observedAt,'HISTORICAL_REPLAY');
   await writePrivateJson(join(days,day.strategyId+'_'+day.date+'_'+offset+'.json'),page);
  }
 }
 const costs=conditionalCostSensitivity(fills,report.sessions,protocol.costScenarios);
 const qualification={schema:'atlas.nse-temporal-validation.v1',observedAt:new Date(observedAt).toISOString(),
  source:'Upstox Analytics',protocolHash,dataHash,driverHash,codeHash:CODE_HASH,trainingDates:protocol.trainingDates,
  validationDates:dataset.dates,trainingAndValidationDisjoint:true,parameterTuning:false,
  financialJournalRepeated:false,forwardLedgerModified:false,realOrdersSubmitted:0,
  events:sequence,eventChainHead:chain,fills:fills.length,dayReports:report.days.length,
  method:'POST_HOC_TEMPORAL_VALIDATION_WITH_CURRENT_BASKET_SELECTION_BIAS',
  qualified:false,certifiedScalpStormSessions:0,limitations:protocol.limitations,
  sessions:report.sessions.map(s=>({strategyId:s.strategyId,netPnlINR:s.netPnlINR,equityINR:s.equityINR,
   feesINR:s.feesINR,fills:s.fills,halted:s.halted,positions:s.positions.length})),costSensitivity:costs,
  unresolvedGates:['Genuine forward evidence','Untouched prospective evaluation','Statistical breadth and authentic historical universe']};
 await writePrivateJson(join(directory,'validation-qualification.json'),qualification);
 await writePrivateJson(join(directory,'validation-daily-checkpoints.json'),{daily});
 console.log(JSON.stringify({complete:true,dates:dataset.dates.length,events:sequence,fills:fills.length,qualified:false}));
 return qualification;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==6)throw Error('Usage: nse_validation_research.mjs PRIVATE_DATA PRIVATE_PROTOCOL PRIVATE_SOURCE_PROOF NEW_PRIVATE_OUTPUT');
 await runNseValidation(...process.argv.slice(2).map(p=>resolve(p)));
}
