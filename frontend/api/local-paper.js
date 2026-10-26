// The Mac ledger is private. Vercel never reads arbitrary local files or proxies a supplied URL.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
 return res.status(503).json({error:'owner_local_paper_not_connected'});
}
