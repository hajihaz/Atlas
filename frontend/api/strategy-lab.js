// Public protocol catalog only. Performance stays in the private owner journal.
export async function getLab(query={}) {
 if(Object.keys(query).length)throw Error('unsupported protocol query');
 return {schema:'atlas.owner-strategy-catalog.v1',realOrdersEnabled:false,
  actualCapitalINR:0,paperOnly:true,
  strategies:[{id:'scalpstorm_x_0940',name:'ScalpStorm X',entryIST:'09:40',
   exitIST:'15:15',virtualCapitalINR:100000,allocationPerStockINR:10000,slots:10,
   selection:'Eligible NSE cash equities ranked by observed pre-entry volume',
   niftySignalIST:'09:30',niftyThresholdPct:0.2,results:null}],
  source:'Owner-approved protocol',performanceSource:'Private owner Mac journal'};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method&&req.method!=='GET'){
  res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});
 }
 try{return res.status(200).json(await getLab(req.query??{}));}
 catch{return res.status(400).json({error:'unsupported_market_or_period'});}
}
