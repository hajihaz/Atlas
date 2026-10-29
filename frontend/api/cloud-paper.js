// The old five-strategy CoinDCX virtual ledger has been retired.
// This endpoint never fetches credentials, serves archives, or executes orders.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method&&req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({error:'method_not_allowed'});
 }
 return res.status(410).json({error:'strategy_retired',activeStrategyId:'scalpstorm_x_0940'});
}
