import type {IpoIssue} from './ipoIntelligence';
import {effectiveStatus,issueDataFresh} from './ipoIntelligence.ts';

export type ResearchSource={id:string;kind:'REGULATOR'|'ISSUER'|'LEAD_MANAGER'|'EXCHANGE';document:string;url:string;sha256:string;pages:number[]};
export type ResearchMetric={key:string;label:string;value:number;unit:'INR_CR'|'INR_PER_SHARE'|'PCT'|'RATIO'|'DAYS';periodEnd:string;sourceId:string;page:number};
export type IndependentPeer={
 company:string;ticker:string;price:number;currency:'INR';priceAsOf:string;
 annualEPS:{value:number;periodEnd:'2026-03-31';sourceId:string;page:number;
  basis:'COMPANY_DILUTED_FY26'|'CONSOLIDATED_DILUTED_FY26'};
 basisNote:string;
};
export type IndependentPeerAudit={
 auditedAt:string;quoteSource:'Bigdata.com / FMP connected research snapshot';
 fairValueVerified:false;sources:ResearchSource[];peers:IndependentPeer[];notes:string[];
};
export type IssuerReview={
 id:string;company:string;board:'MAINBOARD'|'SME';openDate:string;closeDate:string;reviewedAt:string;
 stage:'CURRENT_RHP'|'DRAFT_ONLY'|'SOURCE_GAP';basis:string;fiscalPeriod:string;
 sources:ResearchSource[];metrics:ResearchMetric[];risks:string[];gaps:string[];
 peerContext:null|{priceAsOf:string;sourceId:string;page:number;note:string;peers:{company:string;reportedPE:number}[]};
 independentPeerAudit?:IndependentPeerAudit;
 decision:'HOLD_FOR_MANUAL_REVIEW';
};
const date=(x:unknown):x is string=>typeof x==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const words=(x:unknown,max=400):x is string=>typeof x==='string'&&x.length>0&&x.length<=max;
const pages=(x:unknown):x is number=>Number.isSafeInteger(x)&&Number(x)>0&&Number(x)<=1500;
const number=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
function sourceOK(s:ResearchSource):boolean{
 if(!s||!words(s.id,60)||!words(s.document,120)||!Array.isArray(s.pages)||!s.pages.length||s.pages.length>60||!s.pages.every(pages)||!/^[a-f0-9]{64}$/.test(s.sha256))return false;
 try{
  const u=new URL(s.url);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||!u.pathname.toLowerCase().endsWith('.pdf'))return false;
  return s.kind==='REGULATOR'&&u.hostname==='www.sebi.gov.in'&&u.pathname.startsWith('/sebi_data/')||
   s.kind==='LEAD_MANAGER'&&(u.hostname==='shcapl.com'&&u.pathname.startsWith('/wp-content/uploads/2026/10/')||u.hostname==='www.afsl.co.in'&&u.pathname.startsWith('/pdfnew/')||["https://www.axiscapital.co.in/contents/EAAA%20India%20Alternatives%20Limited%20-%20Addendum%20to%20DRHP-1786642854-1786687133.pdf","https://www.axiscapital.co.in/contents/EAAA%20India%20Alternatives%20Ltd%20-%20Red%20Herring%20Prospectus-1792429309.pdf","https://www.axiscapital.co.in/contents/EAAA%20India%20Alternatives%20Ltd%20-%20Basis%20for%20Offer%20Price-1792575650.pdf","https://www.axiscapital.co.in/contents/EAAA%20India%20Alternatives%20Ltd%20-%20Abridged%20Prospectus-1792429422.pdf","https://www.axiscapital.co.in/contents/EAAA%20India%20Alternatives%20Ltd%20-%20Pre-offer%20and%20Price%20Band%20Advertisement-1792559256.pdf"].includes(s.url))||
   s.kind==='ISSUER'&&(u.hostname==='core4engineers.com'&&u.pathname.startsWith('/pdf/ipo/')||
    u.hostname==='www.mkjewels.in'&&u.pathname.startsWith('/uploads/mkjewels/pdf/')||
    u.hostname==='www.anandrathiwealth.in'&&u.pathname.startsWith('/wealthpdf/')||
    u.hostname==='www.nuvama.com'&&u.pathname.startsWith('/wp-content/uploads/2026/05/')||
    u.hostname==='gajacapital.com'&&u.pathname.startsWith('/assets/pdf/'))||
   s.kind==='EXCHANGE'&&(u.hostname==='nsearchives.nseindia.com'&&
    (u.pathname.startsWith('/corporate/')||u.pathname.startsWith('/annual_reports/'))||
    u.hostname==='www.bseindia.com'&&u.pathname.startsWith('/xml-data/corpfiling/AttachHis/'));
 }catch{return false;}
}
const instant=(x:unknown):x is string=>typeof x==='string'&&x.length<=40&&
 /^20\d{2}-.+Z$/.test(x)&&Number.isFinite(Date.parse(x));
export function independentPeerAuditOK(a:IndependentPeerAudit,now=new Date()):boolean{
 if(!a||!instant(a.auditedAt)||Date.parse(a.auditedAt)>now.getTime()+60000||
  a.quoteSource!=='Bigdata.com / FMP connected research snapshot'||a.fairValueVerified!==false||
  !Array.isArray(a.sources)||!a.sources.length||a.sources.length>10||!a.sources.every(sourceOK)||
  new Set(a.sources.map(s=>s.id)).size!==a.sources.length||
  !Array.isArray(a.peers)||!a.peers.length||a.peers.length>10||
  new Set(a.peers.map(p=>p?.ticker)).size!==a.peers.length||
  !Array.isArray(a.notes)||!a.notes.length||a.notes.length>8||!a.notes.every(n=>words(n)))return false;
 return a.peers.every(p=>{
  const eps=p?.annualEPS;
  return p&&words(p.company,200)&&words(p.ticker,40)&&number(p.price)&&p.price>0&&p.currency==='INR'&&
   instant(p.priceAsOf)&&Date.parse(p.priceAsOf)<=Date.parse(a.auditedAt)&&
   Date.parse(a.auditedAt)-Date.parse(p.priceAsOf)<=7*86400000&&words(p.basisNote,240)&&
   eps&&number(eps.value)&&eps.value>0&&eps.periodEnd==='2026-03-31'&&
   ['COMPANY_DILUTED_FY26','CONSOLIDATED_DILUTED_FY26'].includes(eps.basis)&&
   pages(eps.page)&&a.sources.some(s=>s.id===eps.sourceId&&s.pages.includes(eps.page))&&
   Number.isFinite(p.price/eps.value);
 });
}
export function independentPeerPE(peer:IndependentPeer):number{
 return peer.price/peer.annualEPS.value;
}
export function validatedReviews(input:unknown,now=new Date()):IssuerReview[]{
 if(!input||typeof input!=='object')return [];
 const file=input as {schemaVersion?:number;records?:IssuerReview[]};
 if(file.schemaVersion!==1||!Array.isArray(file.records)||file.records.length>100)return [];
 const counts=new Map<string,number>();
 for(const row of file.records)if(row&&typeof row.id==='string')counts.set(row.id,(counts.get(row.id)||0)+1);
 return file.records.filter(r=>{
  if(!r||!words(r.id,100)||counts.get(r.id)!==1||!words(r.company,200)||!['MAINBOARD','SME'].includes(r.board)||
   !date(r.openDate)||!date(r.closeDate)||r.openDate>r.closeDate||typeof r.reviewedAt!=='string'||
   !Number.isFinite(Date.parse(r.reviewedAt))||Date.parse(r.reviewedAt)>now.getTime()+60000||
   !['CURRENT_RHP','DRAFT_ONLY','SOURCE_GAP'].includes(r.stage)||!words(r.basis,150)||!words(r.fiscalPeriod,180)||
   r.decision!=='HOLD_FOR_MANUAL_REVIEW'||!Array.isArray(r.sources)||r.sources.length>10||!r.sources.every(sourceOK)||
   new Set(r.sources.map(s=>s.id)).size!==r.sources.length||
   !Array.isArray(r.metrics)||r.metrics.length>30||new Set(r.metrics.map(m=>m?.key)).size!==r.metrics.length||
   !Array.isArray(r.risks)||r.risks.length>12||!r.risks.every(x=>words(x))||
   !Array.isArray(r.gaps)||!r.gaps.length||r.gaps.length>12||!r.gaps.every(x=>words(x)))return false;
  if(r.stage==='CURRENT_RHP'&&(!r.sources.some(s=>['RHP','ABRIDGED_RHP'].includes(s.document))||!r.risks.length))return false;
  if(r.stage==='SOURCE_GAP'&&(r.sources.length||r.metrics.length||r.peerContext!==null))return false;
  const source=(id:string,page:number)=>r.sources.some(s=>s.id===id&&s.pages.includes(page));
  if(!r.metrics.every(m=>m&&words(m.key,60)&&words(m.label,100)&&number(m.value)&&date(m.periodEnd)&&
   ['INR_CR','INR_PER_SHARE','PCT','RATIO','DAYS'].includes(m.unit)&&pages(m.page)&&source(m.sourceId,m.page)))return false;
  const p=r.peerContext;
  if(p!==null&&(!p||!date(p.priceAsOf)||!pages(p.page)||!source(p.sourceId,p.page)||!words(p.note)||
   !Array.isArray(p.peers)||!p.peers.length||p.peers.length>10||
   !p.peers.every(x=>x&&words(x.company,200)&&number(x.reportedPE)&&x.reportedPE>0)))return false;
  if(r.independentPeerAudit!==undefined&&!independentPeerAuditOK(r.independentPeerAudit,now))return false;
  return true;
 });
}
export function mergeIssuerReviews(issues:IpoIssue[],input:unknown,now=new Date()):IpoIssue[]{
 const reviews=validatedReviews(input,now);
 return issues.map(issue=>{
  const review=reviews.find(r=>r.id===issue.id&&r.company===issue.company&&r.board===issue.board&&
   r.openDate===issue.openDate&&r.closeDate===issue.closeDate);
  const {issuerReview:_untrusted,...clean}=issue;
  return review?{...clean,issuerReview:review}:clean;
 });
}
export function historicalPEScenario(issue:IpoIssue,feedStale:boolean,now=new Date()):{low:number;high:number;eps:number;basis:string}|null{
 const review=issue.issuerReview;
 // Annual historical EPS is pre-offer. Draft and quarterly numbers never become a current valuation.
 if(!review||review.stage!=='CURRENT_RHP'||!issueDataFresh(issue,feedStale,now)||effectiveStatus(issue,now)==='CLOSED')return null;
 const eps=review.metrics.find(m=>m.key==='dilutedEPS'&&m.unit==='INR_PER_SHARE'&&m.periodEnd==='2026-03-31');
 if(!eps||eps.value<=0||!number(issue.priceMin)||!number(issue.priceMax)||issue.priceMin<=0||issue.priceMax<issue.priceMin)return null;
 const low=issue.priceMin/eps.value,high=issue.priceMax/eps.value;
 return Number.isFinite(low)&&Number.isFinite(high)?{low,high,eps:eps.value,basis:review.basis}:null;
}
