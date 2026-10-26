import {PILOT_SYMBOLS} from '../../scripts/nse_paper_engine.mjs';
export const NOW=Date.parse('2026-10-26T10:00:02+05:30');
export const START=Date.parse('2026-10-26T09:00:00+05:30');
export const universe=PILOT_SYMBOLS.map((symbol,i)=>({symbol,
  instrumentKey:'NSE_EQ|INE'+String(i+1).padStart(9,'0'),lotSize:1}));
export function input(at=NOW,{mode='SYNTHETIC_FIXTURE'}={}){
  const last=Math.floor(at/60000)*60000-60000;
  const bars=Array.from({length:30},(_,i)=>{
    const p=i===28?90:i===29?120:100;
    return{time:last-(29-i)*60000,open:p,high:p,low:p,close:p,volume:100000};
  });
  return{schema:'atlas.nse-paper-input.v1',source:'Upstox Analytics',dataClass:mode,
    realOrdersEnabled:false,observedAt:new Date(at).toISOString(),
    market:{exchange:'NSE',status:'NORMAL_OPEN',marketOpen:true},
    marketObservedAt:new Date(at).toISOString(),universe:structuredClone(universe),
    quotes:universe.map(row=>({...row,priceUnit:'INR',lastPrice:120,
      lastTradeAt:new Date(at).toISOString(),quoteTimestamp:new Date(at).toISOString(),
      depth:{buy:{price:119.95,quantity:10000},sell:{price:120.05,quantity:10000}}})),
    history:Object.fromEntries(universe.map(row=>[row.symbol,{bars:structuredClone(bars),
      observedAt:new Date(at).toISOString()}]))};
}
export function refresh(old,at,price=120){
  const value=structuredClone(old);
  value.observedAt=value.marketObservedAt=new Date(at).toISOString();
  for(const q of value.quotes){
    q.lastTradeAt=q.quoteTimestamp=new Date(at).toISOString();q.lastPrice=price;
    q.depth={buy:{price:price-.05,quantity:10000},sell:{price:price+.05,quantity:10000}};
  }
  return value;
}
