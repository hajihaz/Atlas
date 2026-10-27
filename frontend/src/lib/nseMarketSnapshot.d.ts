export type NseQuote = {instrumentKey:string; symbol:string; priceUnit:'POINTS'|'INR';
  lastPrice:number; volume:number|null; lastTradeAt:string|null; quoteTimestamp:string|null};
export type NseMarketSnapshot = {schema:1; mode:'OWNER_NSE_OBSERVATION'; status:'OK';
  source:'Upstox Analytics'; observedAt:string;
  market:{exchange:'NSE'; status:string; marketOpen:boolean}; quotes:NseQuote[];
  sourcePayloadSHA256:string; audience:'OWNER_ONLY'; realOrdersEnabled:false;
  paperOrdersEnabled:false; actualCapitalINR:0; executionFreshnessCertified:false};
export function validateNseMarketSnapshot(input:unknown,now?:number):NseMarketSnapshot;
