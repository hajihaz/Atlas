// Owner token stays in React memory. No token is sent in a URL or stored in the browser.
const custom=(import.meta.env.VITE_ATLAS_PAPER_API_URL as string|undefined)?.replace(/\/$/,'')||'';
const local='/api/cloud-paper';
export async function cloudPaperRequest<T>(token:string,path:string,query?:Record<string,string>):Promise<T>{
 if(!/^[a-z-]+$/.test(path))throw Error('Invalid cloud endpoint');
 const params=new URLSearchParams(query||{});
 const url=custom?custom+'/api/cloud-paper/'+path+(params.size?'?'+params:''):
   local+'?'+new URLSearchParams({action:path,...(query||{})});
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const res=await fetch(url,{method:'GET',mode:'cors',cache:'no-store',credentials:'omit',signal:controller.signal,
   headers:token?{Authorization:'Bearer '+token}:{}});
  const body=await res.json();
  if(!res.ok)throw Error(typeof body?.diagnostic==='string'?body.diagnostic:
   typeof body?.error==='string'?body.error:'Cloud request failed');
  return body as T;
 }finally{clearTimeout(timer);}
}
