import {useEffect,useState} from 'react';
import {Database,RefreshCcw} from 'lucide-react';
import {cloudPaperRequest} from '../lib/cloudPaperRead';
type Day={day:string;symbols?:number;min_bars?:number;max_bars?:number;files?:number;eligible?:number;captured?:number;keyed?:number;bars?:number;minutes?:number;seeds?:number};
type Group={days:number;dates:Day[]};
type EodStock={rank:number;symbol:string;isin:string;volumeShares:number;open:number;high:number;low:number;close:number;turnoverRupees:number;tradeCount:number};
type EodTop={schema:string;mode:string;realOrdersEnabled:boolean;sourceDate:string;evidenceClass:string;sourceSha256:string;sourcePublishedAt:string;totalEqStocks:number;top:EodStock[]};
export type Availability={mode:string;realOrdersEnabled:boolean;as_of:string;minute:Group;daily:Group;etf_raw:Group;nse_reference:Group;full_0940:Group;nifty_open:Group;live_minute:Group;opening_seed:Group;note:string};
const groups:[keyof Pick<Availability,'minute'|'daily'|'etf_raw'|'nse_reference'|'full_0940'|'nifty_open'|'live_minute'|'opening_seed'>,string,string][]=[
 ['live_minute','Live minute capture','Completed top-ten bars recorded during the market session'],
 ['opening_seed','Opening range','09:15–09:39 bars for the actual 09:40 top ten'],
 ['minute','Minute bars','Ten-stock dated OHLCV samples'],
 ['daily','Daily stock bars','Ten-stock history samples'],
 ['etf_raw','ETF daily history','NIFTYBEES and GOLDBEES raw bars; adjustment not certified'],
 ['nse_reference','NSE daily files','Official EOD and security master receipts'],
 ['full_0940','9:40 universe','Captured rankings; only keyed rosters qualify for replay'],
 ['nifty_open','Nifty opening','Pre-9:40 source receipts']
];
export default function DataAvailabilityPage({ownerConnected,goPaper}:{ownerConnected:boolean;goPaper:()=>void}){
 const [data,setData]=useState<Availability|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [eodTop,setEodTop]=useState<EodTop|null>(null),[eodBusy,setEodBusy]=useState(false),[eodError,setEodError]=useState('');
 async function refresh(){
  if(!ownerConnected){setError('Restore owner access from Paper Trading to view your private archive.');return;}
  setBusy(true);setError('');
  try{const result=await cloudPaperRequest<Availability>('','data-availability');
   if(result.mode!=='PAPER_ONLY'||result.realOrdersEnabled!==false)throw Error('Invalid cloud data response');
   setData(result);
  }catch(e){setError(e instanceof Error?e.message:'Data unavailable');}finally{setBusy(false);}
 }
 async function loadEodTop(day:string){
  setEodBusy(true);setEodError('');setEodTop(null);
  try{const result=await cloudPaperRequest<EodTop>('','nse-eod-top',{day});
   if(result.schema!=='atlas.nse-eod-top.v1'||result.mode!=='PAPER_ONLY'||result.realOrdersEnabled!==false||
    result.sourceDate!==day||result.evidenceClass!=='OFFICIAL_NSE_END_OF_DAY_EQ_SERIES_NOT_0940_AND_NOT_NORMAL_MASTER_QUALIFIED'||
    !/^[a-f0-9]{64}$/.test(result.sourceSha256)||result.top.length!==20)throw Error('Invalid whole-day source result');
   setEodTop(result);
  }catch(e){setEodError(e instanceof Error?e.message:'Whole-day ranking unavailable');}finally{setEodBusy(false);}
 }
 useEffect(()=>{if(ownerConnected)void refresh();else {setData(null);setEodTop(null);}},[ownerConnected]);
 const completeSampleDays=data?.minute.dates.filter(x=>x.symbols===10&&x.min_bars===375&&x.max_bars===375).length??0;
 const completeSampleBars=completeSampleDays*3750;
 return <section className="atlas-data-page"><div className="sub-page-header"><div className="breadcrumb">ATLAS / DATA</div><h1>Available market data<span className="period">.</span></h1>
  <p>Counted from private cloud receipts. Historical samples, daily files and 9:40 universes are separate evidence.</p></div>
  <div className="panel atlas-owner-connect"><div><h2>Captured dates</h2><p>Open a category below to inspect its dates and coverage.</p></div>
   <div className="atlas-owner-row">{!ownerConnected&&<button type="button" className="secondary-button" onClick={goPaper}>Restore owner view</button>}
    <button type="button" className="primary-button" disabled={busy||!ownerConnected} onClick={()=>void refresh()}><RefreshCcw size={16}/> Refresh</button></div>
   {error&&<p className="atlas-simple-error" role="alert">{error}</p>}</div>
  {data&&<><div className="panel atlas-data-detail"><h2>{completeSampleDays} complete sample days · {completeSampleBars.toLocaleString('en-IN')} one-minute bars</h2>
   <p>These are dated receipts for ten selected stocks per day. They do not prove a historical whole-market 09:40 ranking or an automatic paper trade.</p></div>
   <div className="panel atlas-data-detail"><h2>What Atlas has recorded</h2><p>Each bar shows the number of dated cloud receipts. It measures data coverage, not strategy profit.</p>
    <div className="atlas-data-coverage">{groups.map(([key,title])=><div key={key}><span>{title}</span><div role="img" aria-label={`${title}: ${data[key].days} dates`}><i style={{width:`${Math.max(2,100*data[key].days/Math.max(1,...groups.map(([k])=>data[k].days)))}%`}}/></div><strong>{data[key].days}</strong></div>)}</div></div>
   <div className="atlas-data-grid">{groups.map(([key,title,description])=><div className="panel atlas-data-card" key={key}><Database size={21}/><small>{title}</small><strong>{data[key].days} dates</strong><span>{description}</span></div>)}</div>
   {groups.map(([key,title])=><details className="panel atlas-data-detail" key={key}><summary>{title} · {data[key].days} dates</summary>
    {key==='nse_reference'&&<p>Choose a date to view the 20 highest-volume EQ stocks from the complete official end-of-day file. These are whole-day rankings, not stocks known at 09:40.</p>}
    <div className="atlas-data-dates">{data[key].dates.map(x=><div key={x.day}><strong>{x.day}</strong><span>{x.minutes!=null?`${x.minutes} completed minutes · 10 stocks each`:x.seeds!=null?`${x.seeds}/10 opening stock seeds`:x.bars!=null?`${x.bars} source candles`:x.symbols!=null?`${x.symbols} symbols · ${x.min_bars}–${x.max_bars} bars`:x.files!=null?`${x.files} source files`:`${x.captured}/${x.eligible} symbols · ${x.keyed??0} stored IDs`}</span>
     {key==='nse_reference'&&x.files===2&&<button type="button" className="secondary-button" disabled={eodBusy} onClick={()=>void loadEodTop(x.day)}>View top volume</button>}</div>)}</div></details>)}
   {eodBusy&&<p role="status">Checking official whole-day source…</p>}{eodError&&<p className="atlas-simple-error" role="alert">{eodError}</p>}
   {eodTop&&<div className="panel atlas-data-detail"><h2>{eodTop.sourceDate} · Whole-day top volume</h2>
    <p>Official NSE EQ series: {eodTop.totalEqStocks.toLocaleString('en-IN')} stocks in the verified file. Selection uses the full trading day and must not be used as a 09:40 signal.</p>
    <div className="atlas-eod-table-wrap"><table className="atlas-eod-table"><thead><tr><th>Rank</th><th>Stock</th><th>Shares traded</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Trades</th></tr></thead><tbody>
     {eodTop.top.map(stock=><tr key={stock.isin}><td>{stock.rank}</td><th scope="row">{stock.symbol}</th><td>{stock.volumeShares.toLocaleString('en-IN')}</td><td>₹{stock.open.toFixed(2)}</td><td>₹{stock.high.toFixed(2)}</td><td>₹{stock.low.toFixed(2)}</td><td>₹{stock.close.toFixed(2)}</td><td>{stock.tradeCount.toLocaleString('en-IN')}</td></tr>)}
    </tbody></table></div><p className="atlas-simple-note">Official file published: {new Date(eodTop.sourcePublishedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST · SHA-256: <code>{eodTop.sourceSha256}</code></p></div>}
   <p className="atlas-simple-note">{data.note}</p></>}
 </section>;
}
