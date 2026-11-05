import {useEffect,useMemo,useRef,useState} from 'react';
import {Area,Bar,BarChart,Brush,CartesianGrid,Cell,ComposedChart,Line,ReferenceLine,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {Maximize2,Minimize2,TrendingUp} from 'lucide-react';
import {cloudPaperRequest,cloudPaperUsesGateway} from '../lib/cloudPaperRead';
import type {Experiment} from './PaperExperimentReport';
const money=(n:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
const clock=(n:number)=>new Date(n).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false});
type Candle={time:number;open:number;high:number;low:number;close:number;volume:number};
type Receipt={schema:string;mode:string;realOrdersEnabled:boolean;sourceDate:string;symbol:string;sourceSha256:string;sourceKnownAt:string;bars:Candle[];coverage:string};
type View='performance'|'price';
type Metric='cumulative'|'daily'|'stocks';
type Props={report?:Experiment;strategy:string;ownerConnected:boolean;ownerToken:string;day:string;symbol:string;onDay:(v:string)=>void;onSymbol:(v:string)=>void;dates:{day:string;symbols?:number}[];stocks:string[];onJournalDay:(v:string)=>void};
export default function PaperChartWorkspace({report:r,strategy,ownerConnected,ownerToken,day,symbol,onDay,onSymbol,dates,stocks,onJournalDay}:Props){
 const [view,setView]=useState<View>('performance'),[metric,setMetric]=useState<Metric>('cumulative'),[range,setRange]=useState('ALL');
 const [receipt,setReceipt]=useState<Receipt|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [indicator,setIndicator]=useState('none'),[expanded,setExpanded]=useState(false),[picked,setPicked]=useState('');
 const request=useRef(0);
 useEffect(()=>{if(!expanded)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false);};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[expanded]);
 useEffect(()=>{setPicked('');},[strategy]);
 useEffect(()=>{
  const id=++request.current;setReceipt(null);setError('');setLoading(false);
  if(!ownerConnected||!day||!symbol)return;
  setLoading(true);
  cloudPaperRequest<Receipt>(cloudPaperUsesGateway?'':ownerToken,'market-replay',{day,symbol}).then(v=>{
   if(id!==request.current)return;
   if(v.schema!=='atlas.market-replay.v1'||v.mode!=='PAPER_ONLY'||v.realOrdersEnabled!==false||v.sourceDate!==day||v.symbol!==symbol||!/^[a-f0-9]{64}$/.test(v.sourceSha256)||!Number.isFinite(Date.parse(v.sourceKnownAt))||!Array.isArray(v.bars)||!v.bars.every((b,i)=>Number.isFinite(b.time)&&new Date(b.time).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})===day&&[b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)&&[b.open,b.high,b.low,b.close].every(n=>n>0)&&b.volume>=0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)&&(i===0||b.time>v.bars[i-1].time)))throw Error('This price receipt could not be verified.');
   setReceipt(v);
  }).catch(e=>{if(id===request.current)setError(e instanceof Error?e.message:'Price history unavailable.');}).finally(()=>{if(id===request.current)setLoading(false);});
 },[ownerConnected,ownerToken,day,symbol]);
 const candles=useMemo(()=>{
  let volume=0,weighted=0,gain=0,loss=0;
  return (receipt?.bars??[]).map((b,i,all)=>{
   volume+=b.volume;weighted+=((b.high+b.low+b.close)/3)*b.volume;
   const change=i?b.close-all[i-1].close:0;
   if(i>0&&i<=14){gain+=Math.max(0,change)/14;loss+=Math.max(0,-change)/14;}
   if(i>14){gain=(gain*13+Math.max(0,change))/14;loss=(loss*13+Math.max(0,-change))/14;}
   return {...b,label:clock(b.time),sma:i>=19?all.slice(i-19,i+1).reduce((s,x)=>s+x.close,0)/20:null,vwap:volume?weighted/volume:null,rsi:i<14?null:gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss)};
  });
 },[receipt]);
 const trades=useMemo(()=>r?.historyComplete?[...r.closedTradesJournal].sort((a,b)=>a.exitAt.localeCompare(b.exitAt)):[],[r]);
 const latestDay=r?.daily.map(x=>x.day).sort().at(-1)??'';
 const cutoff=range==='ALL'?'':new Date(Date.parse(latestDay+'T00:00:00Z')-(range==='1W'?6:29)*86400000).toISOString().slice(0,10);
 const performance=useMemo(()=>{
  if(!r?.historyComplete)return [];
  if(metric==='daily')return r.daily.filter(x=>!cutoff||x.day>=cutoff).map(x=>({label:x.day,value:x.realizedPnlINR}));
  if(metric==='stocks'){
   const sums=new Map<string,number>();trades.filter(t=>!cutoff||new Date(t.exitAt).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})>=cutoff).forEach(t=>sums.set(t.symbol,(sums.get(t.symbol)??0)+t.netPnlINR));
   return [...sums].map(([label,value])=>({label,value}));
  }
  let sum=0;
  const points=trades.map(t=>{sum+=t.netPnlINR;return {label:new Date(t.exitAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}),value:sum,at:t.exitAt};});
  if(trades.length)points.unshift({label:new Date(trades[0].entryAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}),value:0,at:trades[0].entryAt});
  return points.filter(t=>!cutoff||new Date(t.at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})>=cutoff);
 },[r,trades,cutoff,metric]);
 const last=candles.at(-1),first=candles[0],delta=first&&last?last.close-first.open:0;
 const pick=(label:string)=>{
  setPicked(label);
  if(metric==='daily')onJournalDay(label);
  if(metric==='stocks'){onSymbol(label);setView('price');}
 };
 const symbols=[...new Set([symbol,...stocks].filter(Boolean))];
 const empty=!ownerConnected?'Connect the owner view to see verified charts.':view==='price'?(loading?'Loading recorded stock prices…':error||'No archived minute prices for this stock and date. Choose another recorded session.'):(r&&!r.historyComplete?'Retained trade history is incomplete. Performance charts are withheld.':'No verified closed trades yet. A P&L chart appears after recorded exits.');
 return <div className={'atlas-chart-workspace'+(expanded?' atlas-chart-expanded':'')}>
  <section className="panel atlas-main-chart" aria-label="Interactive paper trading charts">
   <div className="atlas-chart-top"><div className="atlas-view-tabs" aria-label="Chart view">
    <button type="button" aria-pressed={view==='performance'} onClick={()=>setView('performance')}>Strategy P&amp;L</button>
    <button type="button" aria-pressed={view==='price'} onClick={()=>setView('price')}>Stock price</button>
   </div><button type="button" className="atlas-icon-button" aria-label={expanded?'Restore chart size':'Expand chart'} onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize2 size={19}/>:<Maximize2 size={19}/>}</button></div>
   {view==='performance'?<>
    <div className="atlas-chart-title"><div><small>FORWARD PAPER RESULTS · {r?.historyComplete?'RECORDED EXITS':'AWAITING VERIFIED HISTORY'}</small><h3>{metric==='cumulative'?'Cumulative realized P&L':metric==='daily'?'Daily realized P&L':'Closed P&L by stock'}</h3></div><strong className={(trades.reduce((s,t)=>s+t.netPnlINR,0)>=0?'atlas-up':'atlas-down')}>{trades.length?money(trades.reduce((s,t)=>s+t.netPnlINR,0)):'—'}<small>All recorded closed trades</small></strong></div>
    <div className="atlas-chart-toolbar"><div className="atlas-segment" aria-label="Performance chart type">{([['cumulative','P&L curve'],['daily','By day'],['stocks','By stock']] as const).map(([id,label])=><button key={id} type="button" aria-pressed={metric===id} onClick={()=>{setMetric(id);setPicked('');}}>{label}</button>)}</div><div className="atlas-segment" aria-label="Performance date range">{['1W','1M','ALL'].map(v=><button key={v} type="button" aria-pressed={range===v} onClick={()=>setRange(v)}>{v==='ALL'?'All recorded':v}</button>)}</div></div>
    {performance.length>0?<div className="atlas-chart-canvas" role="img" aria-label={metric==='cumulative'?'Cumulative realized P&L from verified closed trades':metric==='daily'?'Daily realized paper P&L':'Recorded closed paper P&L by stock'}>
     <ResponsiveContainer width="100%" height="100%">
      {metric==='cumulative'?<ComposedChart data={performance} margin={{top:24,right:24,left:8,bottom:12}} accessibilityLayer>
       <CartesianGrid vertical={false} stroke="var(--line,#dce5e8)" strokeDasharray="3 5"/><XAxis dataKey="label" minTickGap={48} tick={{fontSize:11,fill:'currentColor'}} tickLine={false}/><YAxis width={70} tick={{fontSize:11,fill:'currentColor'}} tickFormatter={v=>'₹'+v} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:'var(--surface,#fff)',borderRadius:10,color:'var(--text-primary,#20343f)'}} formatter={(v:number)=>[money(v),'Realized P&L']}/><ReferenceLine y={0} stroke="#879da5"/><Area dataKey="value" type="stepAfter" stroke="#168768" strokeWidth={2.5} fill="#17a47c" fillOpacity={.08} dot={{r:4}} activeDot={{r:6}} isAnimationActive={false}/>{performance.length>6&&<Brush dataKey="label" height={24} stroke="#168768"/>}
      </ComposedChart>:<BarChart data={performance} margin={{top:24,right:24,left:8,bottom:12}} accessibilityLayer onClick={s=>{if(s?.activeLabel)pick(String(s.activeLabel));}}>
       <CartesianGrid vertical={false} stroke="var(--line,#dce5e8)" strokeDasharray="3 5"/><XAxis dataKey="label" minTickGap={30} tick={{fontSize:11,fill:'currentColor'}}/><YAxis width={70} tick={{fontSize:11,fill:'currentColor'}} tickFormatter={v=>'₹'+v} axisLine={false}/><ReferenceLine y={0} stroke="#879da5"/><Tooltip cursor={{fill:'rgba(23,164,124,.06)'}} contentStyle={{background:'var(--surface,#fff)',color:'var(--text-primary,#20343f)'}} formatter={(v:number)=>[money(v),'Net P&L']}/><Bar dataKey="value" maxBarSize={70} radius={[5,5,0,0]} isAnimationActive={false}>{performance.map(p=><Cell key={p.label} fill={p.value>=0?'#17a47c':'#d26068'}/>)}</Bar>
      </BarChart>}
     </ResponsiveContainer>
    </div>:<div className="atlas-chart-empty" role="status"><TrendingUp size={36}/><strong>{empty}</strong></div>}
    <p className="atlas-chart-caption">Realized results include recorded modeled fees. Open-position gains and full equity history are not included.{cutoff?' Range ends on the latest recorded activity date.':''}</p>
    {metric!=='cumulative'&&performance.length>0&&<div className="atlas-chart-picks" aria-label={metric==='daily'?'Select a day':'Select a stock'}>{performance.map(p=><button key={p.label} type="button" aria-pressed={picked===p.label} onClick={()=>pick(p.label)}>{p.label} <span className={p.value>=0?'atlas-up':'atlas-down'}>{money(p.value)}</span></button>)}</div>}
   </>:<>
    <div className="atlas-price-controls"><label>Stock<select aria-label="Chart stock" value={symbol} onChange={e=>onSymbol(e.target.value)}>{!symbol&&<option value="">Select a stock</option>}{symbols.map(s=><option key={s}>{s}</option>)}</select></label><label>Recorded session<select aria-label="Chart session" value={day} onChange={e=>onDay(e.target.value)}>{dates.length===0&&<option value="">No archived dates</option>}{dates.map(d=><option key={d.day} value={d.day}>{d.day}</option>)}</select></label><label>Overlay<select aria-label="Chart indicator" value={indicator} onChange={e=>setIndicator(e.target.value)}><option value="none">Price only</option><option value="sma">SMA 20</option><option value="vwap">VWAP · captured bars</option></select></label><span>1-minute bars · IST</span></div>
    <div className="atlas-chart-title"><div><small>ARCHIVED MARKET PRICES · {day||'SELECT A SESSION'}</small><h3>{symbol||'Stock price'}</h3></div><strong>{last?money(last.close):'—'}<small className={delta>=0?'atlas-up':'atlas-down'}>{first&&last?`${delta>=0?'+':''}${money(delta)} (${(delta/first.open*100).toFixed(2)}%) from first captured open`:'No verified price'}</small></strong></div>
    {candles.length>0?<><div className="atlas-chart-canvas" role="img" aria-label={`${symbol} archived minute closing prices on ${day}`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={candles} syncId="atlas-stock" margin={{top:20,right:24,left:8,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} stroke="var(--line,#dce5e8)" strokeDasharray="3 5"/><XAxis dataKey="label" minTickGap={55} tick={{fontSize:11,fill:'currentColor'}}/><YAxis domain={['auto','auto']} width={70} tickFormatter={v=>'₹'+Number(v).toFixed(2)} tick={{fontSize:11,fill:'currentColor'}} axisLine={false}/><Tooltip contentStyle={{background:'var(--surface,#fff)',color:'var(--text-primary,#20343f)'}} formatter={(v:number,name:string)=>[money(v),name]}/><Area name="Close" dataKey="close" stroke="#168768" fill="#17a47c" fillOpacity={.08} strokeWidth={2} isAnimationActive={false}/>{indicator!=='none'&&<Line name={indicator==='sma'?'SMA 20':'VWAP · captured bars'} dataKey={indicator} stroke="#d69b36" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false}/>}<Brush dataKey="label" height={24} stroke="#168768"/></ComposedChart></ResponsiveContainer></div>
     <div className="atlas-volume-chart" role="img" aria-label="Captured minute trading volume"><ResponsiveContainer width="100%" height="100%"><BarChart data={candles} syncId="atlas-stock" margin={{left:8,right:24,bottom:0}}><XAxis dataKey="label" hide/><YAxis width={70} tick={{fontSize:10,fill:'currentColor'}} tickFormatter={v=>v>=1000?(v/1000).toFixed(0)+'k':String(v)} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:'var(--surface,#fff)',color:'var(--text-primary,#20343f)'}} formatter={(v:number)=>[v.toLocaleString('en-IN'),'Volume']}/><Bar dataKey="volume" fill="#80c9b3" isAnimationActive={false}/></BarChart></ResponsiveContainer></div>
     <p className="atlas-chart-caption">{candles.length} captured bars · {clock(first!.time)}–{clock(last!.time)} IST. Drag the chart handles to zoom. Archived prices are separate from forward paper fills.</p>
    </>:<div className="atlas-chart-empty" role="status"><TrendingUp size={36}/><strong>{empty}</strong></div>}
   </>}
  </section>
  {view==='price'&&<section className="panel atlas-analysis-panel" aria-label="Stock analysis"><div><span className="premium-kicker">STOCK ANALYSIS</span><h3>{symbol||'Selected stock'} · {day||'Recorded session'}</h3><p>Computed from the selected archive. These readings describe captured one-minute bars.</p></div>
   <div className="atlas-analysis-metrics">{[['First open',first?money(first.open):'—'],['Captured high',candles.length?money(Math.max(...candles.map(b=>b.high))):'—'],['Captured low',candles.length?money(Math.min(...candles.map(b=>b.low))):'—'],['SMA 20',last?.sma!=null?money(last.sma):'Needs 20 bars'],['RSI 14 · Wilder',last?.rsi!=null?last.rsi.toFixed(1):'Needs 15 bars'],['VWAP · captured bars',last?.vwap!=null?money(last.vwap):'No volume']].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
   <details><summary>Indicator method and price source</summary><p>SMA uses the last 20 captured closes. RSI uses Wilder smoothing over 14 captured close changes. VWAP uses typical price × volume since the first archived bar; it is not a full-session VWAP if opening bars are missing. Missing minutes are not interpolated.</p>{receipt&&<><p>Upstox archived minute receipt · published {new Date(receipt.sourceKnownAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST · {receipt.coverage.replaceAll('_',' ').toLowerCase()}</p><code>{receipt.sourceSha256}</code></>}</details>
   <details><summary>Fundamental analysis · data unavailable</summary><p>Verified company financial statements and valuation data are not connected for {symbol||'this stock'}. P/E, revenue, earnings and market capitalisation remain unavailable.</p></details>
  </section>}
 </div>;
}
