/** Private, immutable instrument identity sidecar for a dated MIS roster. */
const PREFIX='ATLAS_MIS_IDENTITY/';
const KEY=/^NSE_EQ\|[A-Z0-9]{8,20}$/;
const HEX=/^[a-f0-9]{64}$/;
const fail=reason=>{throw Error('MIS_IDENTITY_BLOCKED: '+reason)};
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const dayValid=day=>typeof day==='string'&&/^\d{4}-\d\d-\d\d$/.test(day)&&!Number.isNaN(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
function validEntries(entries,expected){
 if(!Array.isArray(entries)||entries.length!==expected||expected<500||expected>4000)return false;
 let prior='';const keys=new Set();
 for(const pair of entries){if(!Array.isArray(pair)||pair.length!==2||typeof pair[0]!=='string'||pair[0]<=prior||
  typeof pair[1]!=='string'||!KEY.test(pair[1])||keys.has(pair[1]))return false;
  prior=pair[0];keys.add(pair[1]);}
 return true;
}
export async function archiveLiveMisIdentity(env,day,full,clock=()=>Date.now()){
 if(!env.NSE_REFERENCE_ARCHIVE||!dayValid(day)||!Array.isArray(full?.quotes))fail('archive unavailable');
 const entries=full.quotes.map(q=>[q.symbol,q.instrument_key]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 if(!validEntries(entries,full.coverage?.eligible_count))fail('invalid live identity map');
 const record={schema:'atlas.mis-identity.v1',day,source_class:'LIVE_0940_MIS',
  known_at_utc:new Date(clock()).toISOString(),source_sha256:null,
  map_sha256:await digest(JSON.stringify(entries)),entries};
 const key=PREFIX+day,old=await env.NSE_REFERENCE_ARCHIVE.get(key);
 if(old){const prior=JSON.parse(old);if(prior.map_sha256!==record.map_sha256||prior.source_class!==record.source_class)fail('immutable identity conflict');return prior;}
 await env.NSE_REFERENCE_ARCHIVE.put(key,JSON.stringify(record));
 return record;
}
export async function readMisIdentity(env,day,eligible,coverageObserved){
 if(!env.NSE_REFERENCE_ARCHIVE||!dayValid(day))fail('archive unavailable');
 const raw=await env.NSE_REFERENCE_ARCHIVE.get(PREFIX+day);
 if(!raw)return null;
 let record;try{record=JSON.parse(raw)}catch{fail('invalid identity JSON')}
 if(record?.schema!=='atlas.mis-identity.v1'||record.day!==day||
  !['LIVE_0940_MIS','PREMARKET_MIS_MATCHED'].includes(record.source_class)||
  !HEX.test(record.map_sha256)||!validEntries(record.entries,eligible)||
  await digest(JSON.stringify(record.entries))!==record.map_sha256)fail('identity integrity mismatch');
 const known=Date.parse(record.known_at_utc);
 if(!Number.isFinite(known)||known>Date.parse(day+'T04:11:59Z')||
  (record.source_class==='LIVE_0940_MIS'&&Math.abs(known-coverageObserved)>60_000)||
  (record.source_class==='PREMARKET_MIS_MATCHED'&&
   (!HEX.test(record.source_sha256)||known>=Date.parse(day+'T03:45:00Z'))))fail('identity publication time');
 return record;
}
