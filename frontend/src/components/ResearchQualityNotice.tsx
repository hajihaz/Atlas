export type ResearchQuality={
 schema:1;status:'UNCERTIFIED_HYPOTHETICAL_RESEARCH';market:'PUBLIC_CRYPTO_SPOT';
 observedBars:number;observedMissingBars:number;leadingMissingBars:number|null;
 trailingMissingBars:number|null;intervalMs:number;latestCandleAgeMs:number|null;
 sourceRightsStatus:'UNVERIFIED';crossSourceStatus:'NOT_CHECKED';
 certified:false;strategyQualified:false;warnings:string[];
};

export default function ResearchQualityNotice({quality,providerWarning}:{
 quality?:ResearchQuality;providerWarning:string;
}){
 const valid=quality?.schema===1&&quality.certified===false&&quality.strategyQualified===false
   &&Array.isArray(quality.warnings)&&quality.warnings.every(x=>typeof x==='string');
 return <aside className="panel research-status" aria-labelledby="research-quality-title" role="note">
  <h2 id="research-quality-title">Historical data limitations</h2>
  <p><strong>Uncertified research · strategy qualification pending</strong></p>
  {valid?<><p>{quality.observedBars} observed candles · {quality.observedMissingBars} missing intervals inside observed history.
   {quality.latestCandleAgeMs!==null?' Latest candle closed '+Math.floor(quality.latestCandleAgeMs/60000)+' minutes before retrieval.':''}</p>
   <ul>{quality.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>
  </>:<p>Data-quality evidence is unavailable. Results remain uncertified.</p>}
  <p>{providerWarning}</p>
  <p>This crypto replay supplies no NSE stock-data certification or broker trading authority.</p>
 </aside>;
}
