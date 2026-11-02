/** Owner-only, read-only reachability of fixed official NSE dated archives. */
const BASE='https://nsearchives.nseindia.com/content/cm/';
const SOURCES=Object.freeze({
 eod:'BhavCopy_NSE_CM_0_0_0_20261029_F_0000.csv.zip',
 master:'NSE_CM_security_29102026.csv.gz',
});
export async function verifyNseSourceReachability(kind,fetcher=fetch){
 if(!Object.hasOwn(SOURCES,kind))throw Error('invalid NSE probe kind');
 const name=SOURCES[kind],url=BASE+name;
 const res=await fetcher(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),
  headers:{Accept:kind==='eod'?'application/zip':'application/gzip','User-Agent':'AtlasPrivateResearch/1.0'}});
 const result={source:'NSE_OFFICIAL_DATED_REFERENCE',kind,source_date:'2026-10-29',http_status:res.status,
  content_type:res.headers.get('content-type'),content_length:res.headers.get('content-length'),
  last_modified:res.headers.get('last-modified')};
 await res.body?.cancel();
 return result;
}
