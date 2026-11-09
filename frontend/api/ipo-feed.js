import {getPrivateArtifact,configuredArtifactRef} from '../src/lib/privateArtifact.js';
import {validatePublisherIpoSnapshot} from '../src/lib/publisherIpoValidation.js';
export async function getPrivateIpoSnapshot(options={}){
 return validatePublisherIpoSnapshot(await getPrivateArtifact({...options,kind:'ipo'}),options.now??Date.now());
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
 try{
  const data=await getPrivateIpoSnapshot({token:process.env.ATLAS_PAPER_READ_TOKEN,ref:configuredArtifactRef()});
  if(Date.now()-Date.parse(data.generatedAt)<=180*60000)
   res.setHeader('Cache-Control','public, s-maxage=90, stale-while-revalidate=120');
  return res.status(200).json(data);
 }catch{return res.status(503).json({error:'publisher_ipo_source_unavailable'});}
}
