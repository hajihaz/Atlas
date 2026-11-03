import {useEffect,useRef,useState} from 'react';
import {cloudPaperRequest} from '../lib/cloudPaperRead';
type Result={sourceDate:string;symbol:string;status:string;minuteBars:number;sourceSha256:string;result:null|{status:string;signal:{status:string;side?:string;reason?:string}}};
type Row={symbol:string;result?:Result;error?:string};
export default function DayStrategyReview({day,strategy,stocks,onPick}:{day:string;strategy:string;stocks:string[];onPick:(symbol:string)=>void}){
 const [rows,setRows]=useState<Row[]>([]),[busy,setBusy]=useState(false);
 const serial=useRef(0);
 const key=stocks.join('|');
 useEffect(()=>{serial.current++;setRows([]);setBusy(false);},[day,strategy,key]);
 async function run(){
  if(!day||busy)return;
  const id=++serial.current;
  setBusy(true);setRows([]);
  const next:Row[]=[];
  for(let i=0;i<stocks.length;i+=3){
   const batch=await Promise.all(stocks.slice(i,i+3).map(async symbol=>{
    try{const value=await cloudPaperRequest<Result>('','strategy-replay',{day,symbol,strategy});
     if(value.sourceDate!==day||value.symbol!==symbol||!/^[a-f0-9]{64}$/.test(value.sourceSha256))throw Error('Source proof mismatch');
     return {symbol,result:value};
    }catch(e){return {symbol,error:e instanceof Error?e.message:'Source unavailable'};}
   }));
   if(id!==serial.current)return;
   next.push(...batch);setRows([...next]);
  }
  if(id===serial.current)setBusy(false);
 }
 const signals=rows.filter(x=>x.result?.status==='RETROSPECTIVE_SIGNAL').length;
 const noTrade=rows.filter(x=>x.result?.status==='RETROSPECTIVE_NO_TRADE').length;
 const waiting=rows.filter(x=>x.result?.status==='WAITING_REQUIRED_CONTEXT').length;
 return <section className="atlas-day-review" aria-label="Dated strategy review"><div className="atlas-day-review-head"><div><h4>{day} · stock-by-stock review</h4><p>Runs the selected rule on each archived stock for this date. Results are historical research, never forward paper fills.</p></div>
  <button className="secondary-button" type="button" disabled={busy||!day||!stocks.length} onClick={()=>void run()}>{busy?`Checking ${rows.length} of ${stocks.length}…`: `Review ${stocks.length} stocks`}</button></div>
  {rows.length>0&&<><div className="atlas-day-review-summary"><span><strong>{signals}</strong> past signals</span><span><strong>{noTrade}</strong> no trade</span><span><strong>{waiting}</strong> missing inputs</span><span><strong>{rows.filter(x=>x.error).length}</strong> unavailable</span></div>
   <div className="atlas-day-review-rows">{rows.map(row=><button key={row.symbol} type="button" onClick={()=>onPick(row.symbol)}><strong>{row.symbol}</strong><span>{row.error?'Source unavailable':row.result?.status==='RETROSPECTIVE_SIGNAL'?'Past signal':row.result?.status==='RETROSPECTIVE_NO_TRADE'?'No trade':'Missing required inputs'}</span><small>{row.result?`${row.result.minuteBars} bars · inspect →`:row.error}</small></button>)}</div></>}
  <p className="atlas-day-review-note">Older dates may have only a fixed ten-stock sample. This cannot prove the whole-market 09:40 top ten or a profit ratio.</p></section>;
}
