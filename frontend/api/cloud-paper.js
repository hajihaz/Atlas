// Same-origin authenticated owner gateway. No broker routes; no stored tokens.
// Upstream must be a separately hosted, persistent cloud paper worker.
const allowed = Object.freeze({status: ['GET'], state: ['GET'], orders: ['POST'], cancel: ['POST'], strategy: ['POST']});
function baseURL() {
  try {
    const raw=process.env.ATLAS_PAPER_BACKEND_URL || '';
    const u=new URL(raw);
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!u.hostname)
      return null;
    return u.origin;
  }catch{return null;}
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  // Static Vite projects on Vercel use /api/cloud-paper.js as the Function;
  // subpath wildcard functions are not registered in this deployment layout.
  const path=req.query?.action;
  if(!Object.hasOwn(allowed,path))return res.status(404).json({error:'not_found'});
  if(!allowed[path].includes(req.method)){
    res.setHeader('Allow',allowed[path].join(', '));
    return res.status(405).json({error:'method_not_allowed'});
  }
  const base=baseURL();
  if(path==='status'){
    const safe={configured:false,backendConnected:false,feedSourceConfigured:false,
      mode:'PAPER_ONLY',realOrdersEnabled:false};
    if(base===null)return res.status(200).json(safe);
    try{
      const health=await fetch(base+'/healthz',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!health.ok||!health.headers.get('content-type')?.startsWith('application/json'))return res.status(200).json(safe);
      const data=await health.json();
      if(data.mode!=='PAPER_ONLY'||data.realOrdersEnabled!==false)return res.status(200).json(safe);
      return res.status(200).json({...safe,backendConnected:data.backendConnected===true,
        feedSourceConfigured:data.feedSourceConfigured===true,configured:data.configured===true&&data.backendConnected===true});
    }catch{return res.status(200).json(safe)}
  }
  if(base===null)return res.status(503).json({error:'cloud_paper_not_configured'});
  if(typeof req.headers.authorization!=='string'||!/^Bearer [^\s]{32,256}$/.test(req.headers.authorization))
    return res.status(401).json({error:'unauthorized'});
  let body;
  if(req.method==='POST'){
    if(req.headers['content-type']?.split(';')[0]!=='application/json')
      return res.status(415).json({error:'JSON required'});
    body=JSON.stringify(req.body);
    if(body.length>20_000)return res.status(413).json({error:'request_too_large'});
  }
  try{
    const upstream=await fetch(base+'/api/cloud-paper/'+path,{
      method:req.method,
      headers:{Authorization:req.headers.authorization,...(body?{'Content-Type':'application/json'}:{})},
      body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)
    });
    const contentType=upstream.headers.get('content-type')||'';
    if(!contentType.startsWith('application/json'))throw Error('invalid upstream');
    const response=await upstream.json();
    // Never trust the upstream to return executable strings/HTML to users.
    return res.status(upstream.status).json(response);
  }catch{
    return res.status(503).json({error:'cloud_paper_unreachable'});
  }
}
