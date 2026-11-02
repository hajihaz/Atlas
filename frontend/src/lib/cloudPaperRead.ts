// Owner token stays in React memory. No token is sent in a URL or stored in the browser.
const custom=(import.meta.env.VITE_ATLAS_PAPER_API_URL as string|undefined)?.replace(/\/$/,'')||'';
const local='/api/cloud-paper';
export const cloudPaperUsesGateway=!custom;
export async function ownerSession(method:'GET'|'POST'|'DELETE',token=''):Promise<boolean>{
 if(custom)return false;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(local+'?action=session',{method,cache:'no-store',credentials:'same-origin',signal:controller.signal,
   headers:method==='POST'?{'Authorization':'Bearer '+token,'Content-Type':'application/json'}:{},
   ...(method==='POST'?{body:'{}'}:{})});
  if(response.status===401)return false;
  if(!response.ok)throw Error('Private session unavailable');
  const body=await response.json();
  return method==='DELETE'?false:body.connected===true&&body.mode==='PAPER_ONLY'&&body.realOrdersEnabled===false;
 }finally{clearTimeout(timer);}
}
export async function cloudPaperRequest<T>(token:string,path:string,query?:Record<string,string>):Promise<T>{
 if(!/^[a-z-]+$/.test(path))throw Error('Invalid cloud endpoint');
 const params=new URLSearchParams(query||{});
 const url=custom?custom+'/api/cloud-paper/'+path+(params.size?'?'+params:''):
   local+'?'+new URLSearchParams({action:path,...(query||{})});
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const res=await fetch(url,{method:'GET',mode:'cors',cache:'no-store',credentials:custom?'omit':'same-origin',signal:controller.signal,
   headers:token?{Authorization:'Bearer '+token}:{}});
  const body=await res.json();
  if(!res.ok)throw Error(typeof body?.diagnostic==='string'?body.diagnostic:
   typeof body?.error==='string'?body.error:'Cloud request failed');
  return body as T;
 }finally{clearTimeout(timer);}
}
