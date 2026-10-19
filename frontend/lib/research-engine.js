// Atlas public research-only deterministic engine. No credentials, real broker, or order routes.
// Market bars must be completed source candles; signals use close(i-1); fill at open(i).
export const MODELED_CAPITAL_INR = 100000;
export const MODELED_FEE_RATE = 0.001; // illustrative 0.10% each side, not actual exchange costs
export const MODELED_SLIPPAGE_RATE = 0.0005; // illustrative 0.05% each side
export const STRATEGIES = Object.freeze([
  {id:'sma_9_21',name:'SMA 9/21 Crossover',category:'Trend following',
   description:'Buy when the 9-bar simple average crosses above the 21-bar average; exit on the opposite cross.',
   lookback:22,logic:'Closed-bar SMA9 crosses SMA21. Orders modeled at next bar open.'},
  {id:'ema_12_26',name:'EMA 12/26 Momentum',category:'Momentum',
   description:'Trade the direction of the 12-bar and 26-bar exponentially weighted moving average crossover.',
   lookback:27,logic:'EMA12 versus EMA26 after a warm-up, filled at next opening bar.'},
  {id:'rsi_14',name:'RSI 14 Mean Reversion',category:'Mean reversion',
   description:'Buy after the 14-bar RSI recovers above 30 from oversold; exit at RSI above 60.',
   lookback:16,logic:'Recovery from oversold RSI <30 crossing 30, exit at RSI >60.'},
  {id:'breakout_20',name:'20-Bar Breakout',category:'Breakout',
   description:'Buy new 20-bar closing highs; exit on a breakdown below the previous 10-bar closing low.',
   lookback:22,logic:'Close exceeds previous 20 closes; exit below previous 10 closes.'},
  {id:'sps_pullback',name:'SPS Swing Pullback',category:'Swing',
   description:'Buy when price recovers above SMA5 while SMA20 rises; exit if close breaks SMA20.',
   lookback:22,logic:'20-bar average uptrend, close crosses back over SMA5; exit under SMA20.'},
]);
export function sma(bars,end,count){
  if(end+1<count)return null;
  let sum=0;
  for(let k=end-count+1;k<=end;k++)sum+=bars[k].close;
  return sum/count;
}
export function ema(bars,end,count){
  if(end+1<count)return null;
  let val=sma(bars,count-1,count);
  for(let k=count;k<=end;k++)val=bars[k].close*(2/(count+1))+val*(1-2/(count+1));
  return val;
}
export function rsi(bars,end,period=14){
  if(end<period)return null;
  let gains=0,losses=0;
  for(let i=end-period+1;i<=end;i++){
    const delta=bars[i].close-bars[i-1].close;
    if(delta>0)gains+=delta;else losses-=delta;
  }
  if(losses===0)return gains===0?50:100;
  return 100-100/(1+gains/losses);
}
function signal(id,bars,end){
  if(end<27)return 'HOLD';
  const c=bars[end].close,p=bars[end-1].close;
  if(id==='sma_9_21'){
    const s=sma(bars,end,9),l=sma(bars,end,21);
    const sp=sma(bars,end-1,9),lp=sma(bars,end-1,21);
    return sp<=lp&&s>l?'BUY':sp>=lp&&s<l?'SELL':'HOLD';
  }
  if(id==='ema_12_26'){
    const s=ema(bars,end,12),l=ema(bars,end,26);
    const sp=ema(bars,end-1,12),lp=ema(bars,end-1,26);
    return sp<=lp&&s>l?'BUY':sp>=lp&&s<l?'SELL':'HOLD';
  }
  if(id==='rsi_14'){
    const current=rsi(bars,end),previous=rsi(bars,end-1);
    return previous<=30&&current>30?'BUY':current>=60?'SELL':'HOLD';
  }
  if(id==='breakout_20'){
    const hi=Math.max(...bars.slice(end-20,end).map(b=>b.close));
    const lo=Math.min(...bars.slice(end-10,end).map(b=>b.close));
    return c>hi?'BUY':c<lo?'SELL':'HOLD';
  }
  if(id==='sps_pullback'){
    const slow=sma(bars,end,20),slowBefore=sma(bars,end-1,20);
    const fast=sma(bars,end,5),fastBefore=sma(bars,end-1,5);
    return slow>slowBefore&&p<=fastBefore&&c>fast&&c>slow?'BUY':c<slow?'SELL':'HOLD';
  }
  throw new RangeError('unsupported strategy');
}
export function decision(id,bars,end){
  if(!STRATEGIES.some(s=>s.id===id))throw new RangeError('unknown strategy');
  if(!Array.isArray(bars)||end<0||end>=bars.length)return 'HOLD';
  return signal(id,bars,end);
}
export function validateResearchBars(bars,intervalMs){
  if(!Array.isArray(bars)||bars.length>9000||!Number.isSafeInteger(intervalMs)||intervalMs<=0)
    throw new Error('invalid source bars');
  let prev=-Infinity;
  for(const b of bars){
    if(!b||!Number.isSafeInteger(b.time)||b.time<=prev
      ||b.time<=0||b.time%intervalMs!==0
      ||![b.open,b.high,b.low,b.close,b.volume].every(v=>typeof v==='number'&&Number.isFinite(v))
      ||b.open<=0||b.high<=0||b.low<=0||b.close<=0||b.volume<0
      ||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))
      throw new Error('invalid, unordered or fabricated source candle');
    prev=b.time;
  }
  return bars;
}
function rounded(v,places=2){return Number(v.toFixed(places));}
export function runSimulation(strategyId,bars,intervalMs){
  if(!STRATEGIES.some(s=>s.id===strategyId))throw new RangeError('unknown strategy');
  validateResearchBars(bars,intervalMs);
  let cash=MODELED_CAPITAL_INR,qty=0,entryCost=0,boughtAt=null;
  let peak=MODELED_CAPITAL_INR,maxDrawdown=0,closedCount=0,wins=0,netRealized=0;
  const trades=[],equity=[];
  for(let i=0;i<bars.length;i++){
    const bar=bars[i];
    if(i>0){
      const action=decision(strategyId,bars,i-1);
      if(action==='BUY'&&qty===0){
        const price=bar.open*(1+MODELED_SLIPPAGE_RATE);
        // Buying power includes buy-side fees; fractional coins only in virtual engine.
        const bought=cash/(price*(1+MODELED_FEE_RATE));
        if(bought>0&&Number.isFinite(bought)){
          const fee=bought*price*MODELED_FEE_RATE;
          const total=bought*price+fee;
          qty=bought;entryCost=total;boughtAt=bar.time;cash=Math.max(0,cash-total);
          trades.push({side:'BUY',barTime:bar.time,signalBarTime:bars[i-1].time,
            price:rounded(price,5),quantity:rounded(qty,8),feeINR:rounded(fee),
            positionPnlINR:null});
        }
      }else if(action==='SELL'&&qty>0){
        const price=bar.open*(1-MODELED_SLIPPAGE_RATE);
        const fee=qty*price*MODELED_FEE_RATE;
        const proceeds=qty*price-fee;
        const profit=proceeds-entryCost;
        cash+=proceeds;
        closedCount++;
        netRealized+=profit;
        if(profit>0)wins++;
        trades.push({side:'SELL',barTime:bar.time,signalBarTime:bars[i-1].time,
          price:rounded(price,5),quantity:rounded(qty,8),feeINR:rounded(fee),
          positionPnlINR:rounded(profit)});
        qty=0;entryCost=0;boughtAt=null;
      }
    }
    const value=cash+qty*bar.close;
    if(!Number.isFinite(value)||value<0)throw Error('nonfinite simulated equity');
    peak=Math.max(peak,value);
    maxDrawdown=Math.max(maxDrawdown,(peak-value)/peak);
    equity.push({time:bar.time,equityINR:rounded(value),closeINR:bar.close});
  }
  const latest=equity.at(-1)?.equityINR??MODELED_CAPITAL_INR;
  return {
    strategyId,capitalINR:MODELED_CAPITAL_INR,endingEquityINR:latest,
    modeledReturnPct:rounded((latest/MODELED_CAPITAL_INR-1)*100),
    maxDrawdownPct:rounded(maxDrawdown*100),closedTrades:closedCount,
    wins,winRatePct:closedCount?rounded(wins/closedCount*100):null,
    realizedPnlINR:rounded(netRealized),openPosition:qty>0,
    openQuantity:qty>0?rounded(qty,8):0,openSince:boughtAt,
    trades:trades.slice(-200),equity:equity.filter((_,i)=>i%Math.max(1,Math.ceil(equity.length/320))===0
      ||i===equity.length-1),
    assumptions:{feePctPerSide:0.10,slippagePctPerSide:0.05,
      nextBarOpenFill:true,fillGuarantee:false,spreadModeled:false,
      capitalINR:MODELED_CAPITAL_INR,
      disclaimer:'Hypothetical replay, no broker orders, no guarantee of executable volume or actual charges.'},
  };
}
export function runAllStrategies(bars,intervalMs){
  return STRATEGIES.map(s=>({...s,...runSimulation(s.id,bars,intervalMs)}));
}
