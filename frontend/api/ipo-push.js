// Hosted push remains unavailable until a private subscription store and sender are configured.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'method_not_allowed'});}
 return res.status(503).json({error:'background_push_not_configured'});
}
