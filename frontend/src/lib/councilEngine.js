// Atlas six-role advisory council. Deterministic, source-gated, never a broker.
// These are explainable roles, NOT six connected LLMs or independently trained bots.
// Historical simulation is not a current trading signal.
const ROLES=Object.freeze(['scout','news','sentiment','charts','risk','decision']);
function row(id,status,detail){return {id,status,detail};}
function validTime(value,now){
  if(typeof value!=='string')return false;
  const t=Date.parse(value);
  return Number.isFinite(t)&&t>0&&t<=now+5000;
}
export function evaluateCouncil(lab,strategyId,now=Date.now()){
  if(!Number.isFinite(now)||now<=0)throw new RangeError('invalid council time');
  const historical=!!lab&&lab.schema===1&&lab.mode==='HISTORICAL_HYPOTHETICAL_REPLAY'
    &&lab.currency==='INR'&&lab.liveOrdersEnabled===false
    &&lab.paperOrdersExecuted===false&&lab.paperLedgerStored===false
    &&Number.isInteger(lab.barCount)&&lab.barCount>=55
    &&typeof lab.source==='string'&&lab.source.length>0
    &&validTime(lab.generatedAt,now)&&validTime(lab.latestClosedAt,now)
    &&Array.isArray(lab.strategies)&&typeof strategyId==='string';
  const strategy=historical?lab.strategies.find(s=>s.id===strategyId):null;
  const measured=!!strategy&&!strategy.status&&Number.isFinite(strategy.modeledReturnPct)
    &&Number.isFinite(strategy.maxDrawdownPct)
    &&strategy.maxDrawdownPct>=0&&strategy.maxDrawdownPct<=100
    &&Number.isFinite(strategy.endingEquityINR)
    &&strategy.endingEquityINR>=0;
  const overLimit=measured&&strategy.maxDrawdownPct>5;
  const agents=[
    historical
      ?row('scout','OBSERVED',lab.barCount+' completed INR candles · '+lab.source+'. Last completed bar: '+lab.latestClosedAt)
      :row('scout','NO DATA','No validated, timestamped historical source.'),
    row('news','NOT CONNECTED','No independently sourced, timestamped market-news feed is wired to this council.'),
    row('sentiment','NOT CONNECTED','No verified social-media sentiment feed or licensed attribution is connected.'),
    measured
      ?row('charts','HISTORICAL ONLY',strategy.name+': modeled return '+strategy.modeledReturnPct.toFixed(2)+'%; historical drawdown '+strategy.maxDrawdownPct.toFixed(2)+'%. No current entry signal.')
      :row('charts','NO SIGNAL','A valid completed-candle strategy replay is required.'),
    !measured
      ?row('risk','VETO','Insufficient reliable model evidence. No candidate trade.')
      :overLimit
      ?row('risk','VETO','Historical drawdown '+strategy.maxDrawdownPct.toFixed(2)+'% exceeds the 5% research screening limit. Not a live risk authorization.')
      :row('risk','SCREEN ONLY','Historical drawdown within 5% research screen; no broker exposure or real-time risk certification.'),
  ];
  // A hypothetical historical replay can never produce an executable BUY.
  // Separate live point-in-time evidence, independent risk approval and human
  // capital authorization would be required by the execution system.
  const outcome=!measured||overLimit?'SKIP':'WAIT';
  agents.push(row('decision',outcome,
    outcome==='SKIP'?'Insufficient data or historical drawdown screen failed. No order.':
    'Historical research only. News, sentiment, current setup and independent live risk gate are missing. No order.'));
  return Object.freeze({
    schema:1,mode:'ADVISORY_RESEARCH_ONLY',symbol:historical?lab.symbol:null,
    strategyId,generatedAt:new Date(now).toISOString(),
    outcome,agents,roles:ROLES,liveOrdersEnabled:false,realOrdersPlaced:0,
    rationale:'A research classification, not AI consensus, real-time trade advice, paper execution or investment returns.',
  });
}
