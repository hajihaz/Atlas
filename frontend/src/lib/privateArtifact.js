// Fixed public-research artifacts only. Credentials never leave this server-side module.
export const APPROVED_PREVIEW_REF='haor/atlas-runtime-completion-20261024';
export const RUNTIME_DATA_REF='data/atlas-runtime';
const PATHS=Object.freeze({
 paper:'frontend/public/cloud-paper.json',
 ipo:'frontend/public/ipo-feed.json',
});
export async function getPrivateArtifact({kind,token,ref='main',fetcher=fetch,timeoutMs=6000,maxBytes=500000}={}){
 if(!Object.hasOwn(PATHS,kind)||!['main',APPROVED_PREVIEW_REF,RUNTIME_DATA_REF].includes(ref))
  throw Error('invalid_artifact_source');
 if(typeof token!=='string'||token.trim().length<20)throw Error('artifact_source_not_configured');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetcher('https://api.github.com/repos/hajihaz/Atlas/contents/'+PATHS[kind]+'?ref='+encodeURIComponent(ref),{
   method:'GET',redirect:'error',signal:controller.signal,
   headers:{Accept:'application/vnd.github.raw+json',Authorization:'Bearer '+token,
    'X-GitHub-Api-Version':'2022-11-28','User-Agent':'Atlas-Public-Research-ReadOnly'}});
  if(!response.ok||Number(response.headers?.get?.('content-length')||0)>maxBytes)throw Error('artifact_unavailable');
  const body=await response.text();
  if(Buffer.byteLength(body)>maxBytes)throw Error('artifact_unavailable');
  return JSON.parse(body);
 }finally{clearTimeout(timer);}
}
export function configuredArtifactRef(env=process.env){
 // Only this reviewed preview reads the Mac publisher branch. Production stays on main.
 return env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF===APPROVED_PREVIEW_REF
  ?RUNTIME_DATA_REF:'main';
}
