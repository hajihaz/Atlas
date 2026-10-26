// Owner-local display adapter ONLY for independently generated Atlas research envelopes.
// Uploaded JSON is untrusted and never proves actual market performance or authorizes orders.
// This module has zero network/storage/broker side effects.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v);
const timestamp=v=>Number.isSafeInteger(v)&&v>0;
const safeName=v=>typeof v==='string'&&v.length>0&&v.length<=100;
function deny(message){throw new Error(message);}
export function inspectAdvancedResearchEnvelope(input){
 if(!object(input)||input.schema!=='atlas.advanced-research.v1')
  deny('Unsupported advanced research envelope');
 if(input.currency!=='INR'||input.audience!=='OWNER_ONLY')
  deny('Research file must be an owner-only INR report');
 if(input.realOrdersPlaced!==0||input.liveOrdersEnabled!==false||
    input.paperOrdersExecuted!==false||input.paperLedgerStored!==false||
    input.paperLedgerImportAllowed!==false)
  deny('Import contains unsafe order or paper-ledger authority');
 if(input.externallyAudited!==false||input.executableQuotesVerified!==false)
  deny('Unverified external certification claims are not accepted');
 if(!hash(input.dataHash)||!hash(input.envelopeHash))
  deny('Research evidence hash is missing or malformed');
 if(input.fixtureOnly!==true&&input.fixtureOnly!==false)
  deny('Synthetic market classification is missing');
 const expectedKind=input.fixtureOnly?'SYNTHETIC_FIXTURE':'HISTORICAL_MARKET';
 const expectedMode=input.fixtureOnly?'SYNTHETIC_FIXTURE_REPLAY':'HISTORICAL_HYPOTHETICAL_REPLAY';
 if(input.mode!==expectedMode||!object(input.source)||input.source.kind!==expectedKind)
  deny('Synthetic/market source classification mismatch');
 if(input.source.researchUseAllowed!==true||!safeName(input.source.provider))
  deny('Source provenance or research permissions are unverified');
 if(typeof input.symbol!=='string'||!/^[A-Z0-9_:.-]{2,60}$/.test(input.symbol)
   ||!Number.isSafeInteger(input.barCount)||input.barCount<1||input.barCount>10000000
   ||!timestamp(input.intervalMs)||!Number.isFinite(Date.parse(input.generatedAt)))
  deny('Invalid research instrument, interval or timestamp');
 if(!Array.isArray(input.strategies)||input.strategies.length===0||input.strategies.length>5)
  deny('Expected one to five versioned strategy results');
 const ids=new Set();
 const strategies=input.strategies.map(s=>{
  if(!object(s)||!safeName(s.id)||ids.has(s.id)||!safeName(s.name)||!safeName(s.version)
   ||!hash(s.strategyHash)||!hash(s.resultHash))
   deny('Duplicate or untrusted strategy identity');
  ids.add(s.id);
  if(!finite(s.capitalINR)||s.capitalINR<=0||!finite(s.endingEquityINR)
    ||s.endingEquityINR<0||!finite(s.modeledReturnPct)||
    !finite(s.maxDrawdownPct)||s.maxDrawdownPct<0||s.maxDrawdownPct>100
    ||!finite(s.realizedPnlINR)||!finite(s.modeledNetPnlINR)
    ||!finite(s.feesINR)||s.feesINR<0||!finite(s.openQuantity)||s.openQuantity<0
    ||!Number.isSafeInteger(s.closedTrades)||s.closedTrades<0
    ||!Number.isSafeInteger(s.wins)||s.wins<0||s.wins>s.closedTrades)
   deny('Invalid hypothetical strategy arithmetic');
  if(s.winRatePct!==null&&(!finite(s.winRatePct)||s.winRatePct<0||s.winRatePct>100))
   deny('Invalid modeled win-rate');
  if(!Array.isArray(s.trades)||s.trades.length>3000||
    !Array.isArray(s.equity)||s.equity.length===0||s.equity.length>20000||
    !Array.isArray(s.riskEvents)||s.riskEvents.length>5000)
   deny('Malformed or oversized model trace');
  let lastTrade=-1;
  const trades=s.trades.map(t=>{
   const riskExit=object(t)&&t.side==='SELL'&&
     ['STOP_LOSS','STOP_LOSS_PENDING','MAX_DRAWDOWN','EXPOSURE_LIMIT'].includes(t.reason)&&
     t.signalBarTime===null&&t.signalAvailableAt===null&&
     timestamp(t.liquidityBasisTime)&&t.liquidityBasisTime<t.time;
   const normalSignal=object(t)&&timestamp(t.signalBarTime)&&t.signalBarTime<t.time&&
      timestamp(t.signalAvailableAt)&&t.signalAvailableAt<=t.time;
   if(!object(t)||!timestamp(t.time)||t.time<lastTrade
      ||(!normalSignal&&!riskExit)
      ||!['BUY','SELL'].includes(t.side)||t.executionType!=='HYPOTHETICAL_BAR_FILL'
      ||!finite(t.priceINR)||t.priceINR<=0||!finite(t.quantity)||t.quantity<=0
      ||!finite(t.feeINR)||t.feeINR<0
      ||(t.realizedPnlINR!==null&&!finite(t.realizedPnlINR)))
    deny('Invalid hypothetical trade event or time order');
   lastTrade=t.time;
   return {time:t.time,side:t.side,priceINR:t.priceINR,quantity:t.quantity,
    feeINR:t.feeINR,realizedPnlINR:t.realizedPnlINR};
  });
  let lastEquity=-1;
  const equity=s.equity.map(e=>{
   if(!object(e)||!timestamp(e.time)||e.time<lastEquity
      ||!finite(e.equityINR)||e.equityINR<0)
    deny('Invalid model equity point');
   lastEquity=e.time;
   return {time:e.time,equityINR:e.equityINR};
  });
  return {id:s.id,name:s.name,version:s.version,capitalINR:s.capitalINR,
   endingEquityINR:s.endingEquityINR,modeledReturnPct:s.modeledReturnPct,
   modeledNetPnlINR:s.modeledNetPnlINR,realizedPnlINR:s.realizedPnlINR,
   maxDrawdownPct:s.maxDrawdownPct,closedTrades:s.closedTrades,wins:s.wins,
   winRatePct:s.winRatePct,feesINR:s.feesINR,openQuantity:s.openQuantity,
   trades,equity:equity.slice(-500),riskEventCount:s.riskEvents.length};
 });
 return {symbol:input.symbol,generatedAt:input.generatedAt,
  fixtureOnly:input.fixtureOnly,mode:expectedMode,barCount:input.barCount,
  sourceProvider:input.source.provider,dataHash:input.dataHash,
  envelopeHash:input.envelopeHash,strategies,
  sourceVerifiedByBrowser:false,performanceCertified:false,
  forwardPaperImported:false,realOrdersEnabled:false};
}
