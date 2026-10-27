// Shared validation for publisher snapshots served locally and in the preview.
const date=s=>typeof s==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e9;
const optional=n=>n===null||number(n);
const time=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
const PROVIDERS=Object.freeze({'Xflot':'https://www.xflot.com/api-docs','GMP Today':'https://gmptoday.in'});
export function validatePublisherIpoSnapshot(f,now=Date.now()){
 if(!f||f.schemaVersion!==1||f.sourceKind!=='PUBLISHER_AGGREGATE'||
  !time(f.generatedAt)||Date.parse(f.generatedAt)>now+60000||
  f.sourceURL!=='https://www.xflot.com/api-docs'||typeof f.sourceName!=='string'||
  typeof f.disclaimer!=='string'||f.disclaimer.length<10||f.disclaimer.length>4000||
  !f.coverage||typeof f.coverage.mainboard!=='string'||typeof f.coverage.sme!=='string'||
  !Array.isArray(f.attributions)||!f.attributions.some(a=>a?.url==='https://www.xflot.com/api-docs')||
  f.attributions.some(a=>!a||typeof a.name!=='string'||!Object.values(PROVIDERS).includes(a.url))||
  !Array.isArray(f.warnings)||f.warnings.length>20||!f.warnings.every(x=>typeof x==='string'&&x.length<=5000)||
  !Array.isArray(f.issues)||!f.issues.length||f.issues.length>200)throw Error('invalid_publisher_snapshot');
 const ids=new Set();
 for(const i of f.issues){
  if(!i||typeof i.id!=='string'||!i.id.length||i.id.length>160||ids.has(i.id)||
   typeof i.company!=='string'||i.company.length<2||i.company.length>200||
   !['MAINBOARD','SME'].includes(i.board)||!['OPEN','UPCOMING','CLOSED','UNKNOWN'].includes(i.status)||
   !date(i.openDate)||!date(i.closeDate)||i.openDate>i.closeDate||
   i.sourceKind!=='PUBLISHER_AGGREGATE'||i.bidDeadline!==null||i.mandateDeadline!==null||
   i.detailSource!=='https://www.xflot.com/api-docs'||i.financials!==null||
   ![i.priceMin,i.priceMax,i.lotSize,...Object.values(i.subscription??{})].every(optional)||
   !i.subscription||!['qib','nii','retail','individual','total'].every(k=>Object.hasOwn(i.subscription,k))||
   i.priceMin!==null&&i.priceMin<1||i.priceMax!==null&&i.priceMax<1||
   i.priceMin!==null&&i.priceMax!==null&&i.priceMin>i.priceMax||
   i.lotSize!==null&&(!Number.isSafeInteger(i.lotSize)||i.lotSize<=0)||
   !Array.isArray(i.news)||i.news.length>5||
   i.news.some(n=>!n||typeof n.title!=='string'||n.title.length>220||typeof n.source!=='string'||
    !time(n.publishedAt)||Date.parse(n.publishedAt)>now+60000||
    typeof n.url!=='string'||n.url.length>2048||!n.url.startsWith('https://news.google.com/rss/articles/'))||
   !Array.isArray(i.gmpReadings)||i.gmpReadings.length>2||
   i.gmpReadings.some(r=>!r||!Object.hasOwn(PROVIDERS,r.provider)||r.url!==PROVIDERS[r.provider]||
    typeof r.gmp!=='number'||!Number.isFinite(r.gmp)||Math.abs(r.gmp)>100000||
    !time(r.asOf)||Date.parse(r.asOf)>now+60000||!Number.isSafeInteger(r.sources)||r.sources<0||r.sources>1000||
    typeof r.disputed!=='boolean'||typeof r.attribution!=='string'||
    r.range!==null&&(!Array.isArray(r.range)||r.range.length!==2||
     !r.range.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000)))||
   i.gmp!==null&&(typeof i.gmp!=='number'||!Number.isFinite(i.gmp)||Math.abs(i.gmp)>100000||
    !time(i.gmpAsOf)||Date.parse(i.gmpAsOf)>now+60000)||
   i.sourceObservedAt!==f.generatedAt||i.sourceStale!==false)
   throw Error('invalid_publisher_issue');
  ids.add(i.id);
 }
 return f;
}
