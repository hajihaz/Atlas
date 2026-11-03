import {useEffect,useMemo,useRef,useState} from 'react';
import {Pause,Play,RotateCcw,ShieldCheck} from 'lucide-react';
import {ATLAS_RULES} from '../data/atlasSeven';
import {cloudPaperRequest} from '../lib/cloudPaperRead';
import type {Availability} from './DataAvailabilityPage';

type Bar={time:number;open:number;high:number;low:number;close:number;volume:number};
type Replay={schema:string;sourceDate:string;symbol:string;sourceSha256:string;sourceKnownAt:string;
 coverage:string;bars:Bar[];mode:string;realOrdersEnabled:boolean};
type TopVolume={sourceDate:string;identityEvidence?:string;stocks:{rank:number;symbol:string;archived:boolean;minuteBars:number;volumeAt0940:number}[];realOrdersEnabled:boolean};
const STOCKS=['AXISBANK','BHARTIARTL','HDFCBANK','ICICIBANK','INFY','ITC','NHPC','RELIANCE','SBIN','TCS'];
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
const amount=(n:number)=>new Intl.NumberFormat('en-IN').format(n);
const clock=(n:number)=>new Date(n).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true});
const marker=(n:number)=>new Date(n).toLocaleTimeString('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false});

export default function MarketReplayPage({ownerConnected,goPaper}:{ownerConnected:boolean;goPaper:()=>void}){
 const [inventory,setInventory]=useState<Availability|null>(null),[day,setDay]=useState(''),[symbol,setSymbol]=useState('');
 const [replay,setReplay]=useState<Replay|null>(null),[cursor,setCursor]=useState(0),[playing,setPlaying]=useState(false);
 const [topVolume,setTopVolume]=useState<TopVolume|null>(null);
 const [speed,setSpeed]=useState(1),[ruleId,setRuleId]=useState(ATLAS_RULES[0].id),[error,setError]=useState('');
 const [entryTime,setEntryTime]=useState('09:40'),[exitTime,setExitTime]=useState('15:15'),[side,setSide]=useState<'BUY'|'SELL'>('BUY'),[quantity,setQuantity]=useState(1);
 const serial=useRef(0);
 const rule=ATLAS_RULES.find(x=>x.id===ruleId)??ATLAS_RULES[0];
 useEffect(()=>{
  if(!ownerConnected){setInventory(null);setReplay(null);return;}
  let live=true;
  cloudPaperRequest<Availability>('','data-availability').then(value=>{
   if(!live)return;
   if(value.mode!=='PAPER_ONLY'||value.realOrdersEnabled!==false)throw Error('Invalid private inventory');
   setInventory(value);setDay(previous=>previous||value.minute.dates[0]?.day||'');
  }).catch(e=>{if(live)setError(e instanceof Error?e.message:'History unavailable');});
  return ()=>{live=false;};
 },[ownerConnected]);
 useEffect(()=>{
  setTopVolume(null);setSymbol('');if(!ownerConnected||!day)return;
  let active=true;
  cloudPaperRequest<TopVolume>('','top-volume-history',{day}).then(value=>{
   if(active&&value.realOrdersEnabled===false&&value.sourceDate===day){setTopVolume(value);setSymbol(value.stocks.find(x=>x.archived)?.symbol??STOCKS[0]);}
  }).catch(()=>{if(active)setSymbol(STOCKS[0]); /* Older dates retain the fixed sample. */ });
  return ()=>{active=false;};
 },[ownerConnected,day]);
 useEffect(()=>{
  const id=++serial.current;setReplay(null);setPlaying(false);setCursor(0);setError('');
  if(!ownerConnected||!day||!symbol)return;
  cloudPaperRequest<Replay>('','market-replay',{day,symbol}).then(value=>{
   if(id!==serial.current)return;
   if(value.mode!=='PAPER_ONLY'||value.realOrdersEnabled!==false||value.sourceDate!==day||value.symbol!==symbol||!Array.isArray(value.bars))throw Error('Invalid replay source');
   setReplay(value);setCursor(Math.max(0,value.bars.length-1));
  }).catch(e=>{if(id===serial.current)setError(e instanceof Error?e.message:'Replay unavailable');});
 },[ownerConnected,day,symbol]);
 useEffect(()=>{
  if(!playing||!replay)return;
  const timer=setInterval(()=>setCursor(current=>{
   if(current>=replay.bars.length-1){setPlaying(false);return current;}
   return current+1;
  }),Math.max(35,140/speed));
  return ()=>clearInterval(timer);
 },[playing,replay,speed]);
 const current=replay?.bars[cursor];
 const entryIndex=replay?.bars.findIndex(x=>marker(x.time)===entryTime)??-1;
 const exitIndex=replay?.bars.findIndex(x=>marker(x.time)===exitTime)??-1;
 const entry=entryIndex>=0?replay?.bars[entryIndex]:null,exit=exitIndex>=0?replay?.bars[exitIndex]:null;
 const validComparison=!!entry&&!!exit&&exitIndex>entryIndex&&Number.isInteger(quantity)&&quantity>0&&quantity<=100000;
 const gross=validComparison?(side==='BUY'?exit!.close-entry!.close:entry!.close-exit!.close)*quantity:null;
 const chart=useMemo(()=>{
  if(!replay?.bars.length)return null;
  const shown=replay.bars.slice(0,cursor+1),low=Math.min(...shown.map(x=>x.low)),high=Math.max(...shown.map(x=>x.high));
  const range=Math.max(.01,high-low),width=940,height=260;
  const x=(i:number)=>35+(i/Math.max(1,replay.bars.length-1))*870;
  const y=(price:number)=>20+(1-(price-low)/range)*170;
  const path=shown.map((bar,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(bar.close).toFixed(1)}`).join(' ');
  const maxVolume=Math.max(1,...shown.map(x=>x.volume));
  return {path,x,y,low,high,width,height,maxVolume,shown};
 },[replay,cursor]);
 return <section className="atlas-replay-page"><div className="sub-page-header"><div className="breadcrumb">ATLAS / MARKET HISTORY</div>
  <h1>Market replay<span className="period">.</span></h1>
  <p>Play recorded one-minute candles in order. The chart reveals only bars reached by the playhead.</p></div>
  <div className="panel atlas-simple-status"><ShieldCheck size={21}/><div><strong>Private, source-verified history</strong>
   <p>Replay recorded minute bars. Where a complete 09:40 ranking exists, the actual top-volume stocks appear below. Older dates retain the fixed ten-stock sample. This is not a certified seven-strategy backtest.</p></div></div>
  {!ownerConnected?<div className="panel atlas-replay-empty"><h2>History is locked in this browser</h2><p>Restore owner access from Paper Trading. Cloud capture continues meanwhile.</p><button className="primary-button" onClick={goPaper}>Restore owner view</button></div>:
  <><div className="panel atlas-replay-toolbar"><label>Session<select value={day} onChange={e=>setDay(e.target.value)}>{inventory?.minute.dates.map(x=><option key={x.day} value={x.day}>{x.day} · {x.symbols} stocks</option>)}</select></label>
    <label>Stock<select value={symbol} onChange={e=>setSymbol(e.target.value)}>{!symbol&&<option value="">Loading archived stocks…</option>}{topVolume?.stocks.map(x=><option key={x.symbol} value={x.symbol} disabled={!x.archived}>{x.rank}. {x.symbol} · {x.archived?`${x.minuteBars} bars`:'capture pending'}</option>)}
     {STOCKS.filter(x=>!topVolume?.stocks.some(v=>v.symbol===x)).map(x=><option key={x} value={x}>{x} · fixed sample</option>)}</select></label>
    <span>{inventory?.minute.days??0} recorded dates</span></div>
   {topVolume&&<div className="panel atlas-simple-status"><strong>09:40 top volume:</strong> {topVolume.stocks.filter(x=>x.archived).length}/10 archived for {day}. {topVolume.identityEvidence==='PREMARKET_MIS_MATCHED'?'Instrument IDs were matched to the exact premarket MIS file; the 09:40 prices and volumes remain unchanged. ':''}The fixed sample is a separate ten-stock archive. Reliance was only the old default, never the only recorded stock.</div>}
   {error&&<div className="panel atlas-simple-error" role="alert">{error}</div>}
   {!replay&&!error?<div className="panel atlas-replay-empty" role="status">Loading verified minute history…</div>:null}
   {replay&&current&&chart&&<div className="panel atlas-replay-player">
    <div className="atlas-replay-head"><div><small>{symbol} · {day} · {clock(current.time)} IST</small><strong>{money(current.close)}</strong><span className={current.close>=current.open?'atlas-up':'atlas-down'}>{current.close>=current.open?'▲':'▼'} {money(Math.abs(current.close-current.open))} this minute</span></div>
     <div className="atlas-replay-source"><span>{cursor+1} / {replay.bars.length} minutes</span><span>Archived {new Date(replay.sourceKnownAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</span></div></div>
    <svg className="atlas-replay-chart" viewBox="0 0 940 260" role="img" aria-label={`${symbol} price and volume through ${clock(current.time)} IST`}>
     <line x1="35" y1="20" x2="35" y2="232" className="atlas-chart-axis"/><line x1="35" y1="232" x2="905" y2="232" className="atlas-chart-axis"/>
     {chart.shown.map((bar,i)=>({i,at:marker(bar.time)})).filter(x=>[entryTime,exitTime].includes(x.at)).map(x=><g key={x.i}><line x1={chart.x(x.i)} y1="20" x2={chart.x(x.i)} y2="232" className={x.at===entryTime?'atlas-chart-entry':'atlas-chart-exit'}/><text x={chart.x(x.i)+4} y={x.at===entryTime?'34':'50'} className="atlas-chart-label">{x.at===entryTime?'ENTRY':'EXIT'} {x.at}</text></g>)}
     {chart.shown.map((bar,i)=><rect key={bar.time} x={chart.x(i)-1} y={232-(bar.volume/chart.maxVolume)*32} width="2" height={(bar.volume/chart.maxVolume)*32} className="atlas-chart-volume"/>)}
     <path d={chart.path} fill="none" className="atlas-chart-price"/><circle cx={chart.x(cursor)} cy={chart.y(current.close)} r="5" className="atlas-chart-point"/>
     <text x="40" y="17" className="atlas-chart-label">{money(chart.high)}</text><text x="40" y="204" className="atlas-chart-label">{money(chart.low)}</text>
    </svg>
    <div className="atlas-replay-controls"><button type="button" className="primary-button" onClick={()=>{if(!playing&&cursor>=replay.bars.length-1)setCursor(0);setPlaying(v=>!v);}}>{playing?<><Pause size={16}/> Pause</>:<><Play size={16}/> Play</>}</button>
     <button type="button" className="secondary-button" onClick={()=>{setPlaying(false);setCursor(0);}}><RotateCcw size={16}/> Start over</button>
     <label className="atlas-replay-scrub">Minute {cursor+1}<input type="range" min="0" max={replay.bars.length-1} value={cursor} onChange={e=>{setPlaying(false);setCursor(Number(e.target.value));}} aria-label="Replay minute"/></label>
     <label>Speed<select value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label></div>
    <div className="atlas-replay-ohlcv"><div><small>Open</small><strong>{money(current.open)}</strong></div><div><small>High</small><strong>{money(current.high)}</strong></div><div><small>Low</small><strong>{money(current.low)}</strong></div><div><small>Close</small><strong>{money(current.close)}</strong></div><div><small>Volume</small><strong>{amount(current.volume)}</strong></div></div>
    <div className="atlas-manual-trade"><div><h2>Try your own entry and exit</h2><p>Choose recorded minutes and a direction. Prices use each minute’s close. This is a historical comparison, not an order or paper fill.</p></div>
     <div className="atlas-manual-controls"><label>Direction<select value={side} onChange={e=>setSide(e.target.value as 'BUY'|'SELL')}><option value="BUY">Buy first</option><option value="SELL">Sell first</option></select></label>
      <label>Entry time<select value={entryTime} onChange={e=>setEntryTime(e.target.value)}>{replay.bars.map((b,i)=><option key={i} value={marker(b.time)}>{marker(b.time)}</option>)}</select></label>
      <label>Exit time<select value={exitTime} onChange={e=>setExitTime(e.target.value)}>{replay.bars.map((b,i)=><option key={i} value={marker(b.time)}>{marker(b.time)}</option>)}</select></label>
      <label>Shares<input type="number" min="1" max="100000" step="1" value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label></div>
     {validComparison?<div className="atlas-manual-result"><span><small>Entry close</small><strong>{money(entry!.close)}</strong></span><span><small>Exit close</small><strong>{money(exit!.close)}</strong></span><span><small>Gross price difference</small><strong className={gross!>=0?'atlas-up':'atlas-down'}>{money(gross!)}</strong></span></div>:<p className="atlas-simple-error" role="status">Choose an exit after the entry and a valid share count.</p>}
     <p className="atlas-simple-note">No fees, slippage, taxes or fill probability are included. This result is never added to strategy performance.</p></div>
    <details className="atlas-history-proof"><summary>Source proof</summary><p>Upstox dated minute receipt · SHA-256 <code>{replay.sourceSha256}</code></p><p>{replay.coverage.replaceAll('_',' ').toLowerCase()}</p></details>
   </div>}
   <div className="panel atlas-replay-rule"><h2>Compare a strategy rule</h2><label>Strategy<select value={ruleId} onChange={e=>setRuleId(e.target.value)}>{ATLAS_RULES.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <p><strong>Pick:</strong> {rule.selection}</p><p><strong>Enter:</strong> {rule.entry}</p><p><strong>Exit:</strong> {rule.exit}</p><p className="atlas-simple-note">Visual inspection only. Profit and win rate need the rule’s complete time-qualified inputs and forward paper validation.</p></div>
  </>}
 </section>;
}
