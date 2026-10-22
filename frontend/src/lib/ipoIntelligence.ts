export type Board = 'MAINBOARD' | 'SME';
export type IpoState = 'OPEN' | 'UPCOMING' | 'CLOSED' | 'UNKNOWN';
export type ApplicationState = 'WATCHING' | 'PLANNED' | 'APPLIED' | 'MANDATE_ACCEPTED' | 'ALLOTTED' | 'NOT_ALLOTTED';
export type IpoIssue = {
  id:string;company:string;board:Board;openDate:string;closeDate:string;status:IpoState;
  priceMin:number|null;priceMax:number|null;lotSize:number|null;
  subscription:{qib:number|null;nii:number|null;retail:number|null;individual:number|null;total:number|null};
  gmp:number|null;gmpAsOf:string|null;
  financials:null|{revenueGrowthPct:number|null;profitMarginPct:number|null;debtEquity:number|null;source:string;asOf:string};
  news:{title:string;source:string;url:string;publishedAt:string}[];
  source:string;detailSource:string;bidDeadline:string|null;mandateDeadline:string|null;
};
export type IpoFeed={schemaVersion:1;generatedAt:string|null;sourceName:string;sourceURL:string;coverage:{mainboard:string;sme:string};issues:IpoIssue[];warnings:string[]};
export const EMPTY_FEED:IpoFeed={schemaVersion:1,generatedAt:null,sourceName:'NSE',sourceURL:'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',coverage:{mainboard:'Not verified',sme:'Not verified'},issues:[],warnings:[]};
export function validFeed(value:unknown): value is IpoFeed {
  if(!value||typeof value!=='object')return false;
  const f=value as Record<string,unknown>;
  return f.schemaVersion===1&&typeof f.generatedAt==='string'&&Array.isArray(f.issues)&&
    f.issues.every((x:unknown)=>{
      if(!x||typeof x!=='object')return false;
      const i=x as Record<string,unknown>;
      return typeof i.id==='string'&&typeof i.company==='string'&&
        (i.board==='SME'||i.board==='MAINBOARD')&&typeof i.closeDate==='string'&&
        typeof i.openDate==='string'&&typeof i.detailSource==='string';
    });
}
export function indiaToday(now=new Date()):string{
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function effectiveStatus(i:IpoIssue,now=new Date()):IpoState{
  const today=indiaToday(now);
  if(today<i.openDate)return 'UPCOMING';
  if(today>i.closeDate)return 'CLOSED';
  if(i.status==='CLOSED')return 'CLOSED';
  if(i.mandateDeadline&&Number.isFinite(Date.parse(i.mandateDeadline))&&now.getTime()>=Date.parse(i.mandateDeadline))return 'CLOSED';
  return 'OPEN';
}
export function feedAgeMinutes(feed:IpoFeed,now=new Date()):number{
  if(!feed.generatedAt)return Infinity;
  return Math.max(0,(now.getTime()-Date.parse(feed.generatedAt))/60000);
}
export function recommendation(i:IpoIssue,stale:boolean):{label:string;reason:string;score:number|null;tone:'warning'|'good'|'neutral'}{
  const stage=effectiveStatus(i);
  if(stage==='CLOSED')return {label:'APPLICATION CLOSED',reason:'The bidding period has ended. Allotment and actual listing performance still require registrar/exchange confirmation.',score:null,tone:'neutral'};
  if(stage==='UPCOMING')return {label:'PRE-OPEN WATCH',reason:'The issue is not open for bidding. Read the prospectus and check the final price, valuation and offer risks before applying.',score:null,tone:'neutral'};
  if(stale)return {label:'SOURCE STALE',reason:'Latest verified exchange snapshot is too old to assess current demand.',score:null,tone:'warning'};
  if(i.financials===null)return {label:'HOLD — DO NOT APPLY YET',reason:'Verified issuer financials, valuation and prospectus risk review are missing. Subscription multiples alone cannot support a reliable Apply decision. Wait for a complete risk assessment.',score:null,tone:'warning'};
  const f=i.financials;
  if(!f.source||!f.asOf||f.revenueGrowthPct===null||f.profitMarginPct===null||f.debtEquity===null||i.subscription.total===null){
    return {label:'INSUFFICIENT EVIDENCE',reason:'Reliable fundamentals or exchange subscription observations are incomplete.',score:null,tone:'warning'};
  }
  // Intentionally conservative: no automated APPLY on incomplete qualitative prospectus evidence.
  const basic = (f.revenueGrowthPct>0?18:0)+(f.profitMarginPct>0?18:0)+(f.debtEquity<1?14:0)+(i.subscription.total>=1?10:0);
  return {label:basic<25?'HIGH CAUTION':'MANUAL REVIEW',reason:'A quantified preliminary screen only. Valuation, governance, RHP risks and loss tolerance must be checked before investing.',score:basic,tone:'neutral'};
}
export function minimumApplication(i:IpoIssue):number|null{
  if(!i.priceMax||!i.lotSize||i.lotSize<1)return null;
  return i.priceMax*i.lotSize*(i.board==='SME'?2:1);
}
export function formatInr(n:number|null):string{
  return n===null?'Not verified':'₹'+n.toLocaleString('en-IN',{maximumFractionDigits:2});
}
