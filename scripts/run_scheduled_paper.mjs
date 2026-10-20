// GitHub Actions: public-data-only bounded scheduled paper checkpoint.
// IMPORTANT: no credentials to markets, no real orders, and no hidden
// historical backfill. The state is a public virtual RESEARCH REPORT.
import fs from 'node:fs/promises';
import path from 'node:path';
import {assertNextCloudSnapshot} from './paper_ledger_guard.mjs';
import {auditGeneratedPaperFills} from './paper_generated_fill_audit.mjs';
import {describePaperRun,renderPaperRunHealthMarkdown} from './paper_run_health.mjs';
import {appendPaperCheckpointEvidence} from './paper_checkpoint_evidence.mjs';
import {diagnosePaperSource,unavailablePaperSource} from './paper_source_diagnostics.mjs';
import {getChart} from '../frontend/api/market-history.js';
import {getLiveFeed} from '../frontend/api/live-feed.js';
import {advanceCloud,composeTwoHourCandles,failureState,recordUnverifiedFirstCheckpoint,MODE} from './scheduled_paper_engine.mjs';

const OUTPUT=path.resolve('frontend/public/cloud-paper.json');
const SYMBOL='BTCINR';
const LIMIT_BYTES=100000;
function isSeed(d){return d?.schema===1&&d?.mode===MODE&&
  ['AWAITING_FIRST_RUN','AWAITING_VALID_SOURCE'].includes(d.status)&&
  d.symbol===SYMBOL&&d.actualCapitalINR===0&&
  Array.isArray(d.sessions)&&d.sessions.length===0&&d.realOrdersEnabled===false;}
async function main(){
 const now=Date.now();
 const old=JSON.parse(await fs.readFile(OUTPUT,'utf8'));
 if(!isSeed(old)&&!(old?.schema===1&&old.mode===MODE&&old.realOrdersEnabled===false
   &&old.symbol===SYMBOL&&Array.isArray(old.sessions)&&old.sessions.length===5))
   throw Error('Refusing to mutate unknown paper state');
 const previous=isSeed(old)?null:old;
 let next;
 let diagnostic=unavailablePaperSource(now);
 try{
  const [history,feed]=await Promise.all([
    getChart({symbol:SYMBOL,range:'1W'},fetch,now),
    getLiveFeed(fetch,now),
  ]);
  if(history?.source!=='CoinDCX public INR spot candles'
    ||history.symbol!==SYMBOL||history.currency!=='INR'
    ||history.realOrdersEnabled!==false||history.paperExecutionEnabled!==false
    ||!Array.isArray(history.candles)||feed?.currency!=='INR'
    ||feed.realOrdersEnabled!==false||!Array.isArray(feed.quotes)){
    diagnostic={...diagnostic,code:'SOURCE_CONTRACT_INVALID'};
    throw Error('Provider response contract failed');
  }
  diagnostic=unavailablePaperSource(now,'CANDLE_AGGREGATION_FAILED');
  const hourly=history.candles;
  const bars=composeTwoHourCandles(hourly,now);
  const quote=feed.quotes.find(q=>q.symbol===SYMBOL);
  diagnostic=diagnosePaperSource({symbol:SYMBOL,history,feed,bars,quote,now});
  if(diagnostic.status!=='PASS')
    throw Error('Source gate refused the observation: '+diagnostic.code);
  next=advanceCloud(previous,bars,quote,now);
  // Reject any arithmetic, fill-ID or modeled fee mismatch BEFORE persistence.
  // This independently checks the order/settlement model; no extra trades.
  if(previous) {
    const audit=auditGeneratedPaperFills(previous,next,quote,now);
    console.log('Independent paper fill audit:',JSON.stringify(audit));
  }
  // Even repeated failed first checks keep their real attempt counter.
  if(!previous&&next.sessions.length===5)next.runCount=old.runCount+1;
 }catch(e){
  if(diagnostic.status==='PASS')
    diagnostic=unavailablePaperSource(now,'SIMULATION_VALIDATION_FAILED');
  const reason='Source check '+diagnostic.code+'; no virtual fills processed.';
  if(!previous){
    console.log('First cloud paper source check unavailable:',String(e?.message??e).slice(0,140));
    next=recordUnverifiedFirstCheckpoint(old,now,reason);
  }else{
    console.log('Cloud paper checkpoint degraded:',String(e?.message??e).slice(0,250));
    next=failureState(previous,reason,now);
  }
 }
 next={...next,lastSourceCheck:diagnostic};
 // Record only this genuine forward attempt. Older runCount values are not
 // retroactively fabricated; the retained evidence covers at most 24 runs.
 const health=describePaperRun(old,next);
 next.recentCheckpoints=appendPaperCheckpointEvidence(old,next,health);
 const data=JSON.stringify(next,null,2)+'\n';
 if(Buffer.byteLength(data,'utf8')>LIMIT_BYTES)throw Error('State report exceeded bounded size');
 if(next.realOrdersEnabled!==false||next.actualCapitalINR!==0||next.mode!==MODE)
   throw Error('Unsafe paper output');
 assertNextCloudSnapshot(old,next,now);
 const markdown=renderPaperRunHealthMarkdown(health);
 await fs.writeFile(OUTPUT,data,'utf8');
 // GitHub's job may succeed while the provider is safely DEGRADED; surface
 // this distinction without converting an unverified observation into a fill.
 console.log('ATLAS_MODEL_ONLY_HEALTH',JSON.stringify(health));
 if(health.classification!=='SOURCE_VERIFIED_PAPER_ONLY')
   console.log('::warning title=Atlas virtual paper source::'+health.classification+' — '+health.sourceCode);
 if(process.env.GITHUB_STEP_SUMMARY){
   try{await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,markdown,'utf8');}
   catch(e){console.warn('Read-only run summary could not be written:',String(e?.code??'unavailable'));}
 }
 console.log('Virtual checkpoint:',JSON.stringify({
   status:next.status,source:next.source,checkAt:next.lastRunAt,
   closedBar:next.lastBarClosedAt,simulations:next.sessions?.length,
   syntheticFills:next.sessions?.reduce((n,s)=>n+s.events.length,0),
   skippedIntervals:next.skippedIntervals,
 }));
}
await main();
