import {useEffect,useMemo,useRef,useState} from 'react';
import {createChart,LineSeries,type UTCTimestamp} from 'lightweight-charts';

type EquityPoint={time:number;equityINR:number;closeINR:number};
type Props={points:EquityPoint[]};

export default function LightweightEquityReplay({points}:Props){
 const host=useRef<HTMLDivElement>(null);
 const clean=useMemo(()=>points
   .filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.equityINR)&&p.equityINR>0)
   .map(p=>({...p,time:Math.floor(p.time/1000)}))
   .sort((a,b)=>a.time-b.time)
   .filter((p,i,arr)=>i===0||p.time>arr[i-1].time),[points]);
 const [cursor,setCursor]=useState<number|null>(null);
 const last=clean.length-1;
 const index=cursor===null?last:Math.min(cursor,last);
 const visible=clean.slice(0,index+1);
 useEffect(()=>{
   if(!host.current||visible.length===0)return;
   const container=host.current;
   const chart=createChart(container,{
     width:container.clientWidth,height:255,
     layout:{background:{color:'transparent'},textColor:'#9aaab6'},
     grid:{vertLines:{visible:false},horzLines:{color:'rgba(155,175,190,.1)'}},
     rightPriceScale:{borderVisible:false},
     timeScale:{borderVisible:false,timeVisible:true,secondsVisible:false},
   });
   const series=chart.addSeries(LineSeries,{
     color:'#279d72',lineWidth:2,
     priceFormat:{type:'price',precision:2,minMove:0.01}
   });
   series.setData(visible.map(p=>({time:p.time as UTCTimestamp,value:p.equityINR})));
   chart.timeScale().fitContent();
   const observer=new ResizeObserver(()=>chart.applyOptions({width:container.clientWidth}));
   observer.observe(container);
   return ()=>{observer.disconnect();chart.remove()};
 },[visible.length,clean,index]);
 const current=clean[index];
 return <div>
   <div className="research-chart" ref={host} role="img"
     aria-label="Historical hypothetical portfolio value on a TradingView Lightweight Chart" />
   {current&&<div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap',marginTop:10}}>
     <label htmlFor="research-replay-cursor">Historical replay</label>
     <input id="research-replay-cursor" type="range" min={0} max={last}
       value={index} disabled={last<=0}
       onChange={e=>setCursor(Number(e.target.value))}
       style={{flex:'1 1 160px'}}/>
     <span aria-live="polite">{new Date(current.time*1000).toLocaleString('en-IN',
       {timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})}
       {' · ₹'}{current.equityINR.toLocaleString('en-IN',{maximumFractionDigits:2})}</span>
   </div>}
   <p style={{fontSize:12,opacity:0.75}}>
     <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">
       Charts by TradingView
     </a> · Replay uses provider historical candles and modeled equity;
     not authenticated orders or an executable price feed.</p>
 </div>;
}
