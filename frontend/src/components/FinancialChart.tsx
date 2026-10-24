import {useEffect,useRef,useState} from 'react';
import {createChart,CandlestickSeries,LineSeries,ColorType,type IChartApi,type ISeriesApi,type UTCTimestamp} from 'lightweight-charts';
import {chartCandles,chartObservations,type SourceCandle} from '../lib/financialChartData.js';

type Props={symbol:string;candles:SourceCandle[];observations:{time:number;close:number}[]};
export default function FinancialChart({symbol,candles,observations}:Props){
 const container=useRef<HTMLDivElement>(null),chart=useRef<IChartApi|null>(null);
 const candleSeries=useRef<ISeriesApi<'Candlestick'>|null>(null),lineSeries=useRef<ISeriesApi<'Line'>|null>(null);
 const fitted=useRef(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!container.current)return;
  const view=createChart(container.current,{autoSize:true,height:320,
   layout:{background:{type:ColorType.Solid,color:'transparent'},textColor:document.documentElement.dataset.theme==='dark'?'#91aeb9':'#4f6675',attributionLogo:true},
   grid:{vertLines:{visible:false},horzLines:{color:'rgba(120,150,160,.15)'}},
   rightPriceScale:{borderVisible:false},timeScale:{timeVisible:true,secondsVisible:true,borderVisible:false},
   localization:{priceFormatter:(price:number)=>'₹'+price.toLocaleString('en-IN',{maximumFractionDigits:2}),
    timeFormatter:(time:number)=>new Date(time*1000).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'short',timeStyle:'medium'})}});
  const theme=new MutationObserver(()=>view.applyOptions({layout:{textColor:document.documentElement.dataset.theme==='dark'?'#91aeb9':'#4f6675'}}));
  theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  chart.current=view;
  candleSeries.current=view.addSeries(CandlestickSeries,{upColor:'#14845d',downColor:'#c45555',borderVisible:false,wickUpColor:'#14845d',wickDownColor:'#c45555'});
  lineSeries.current=view.addSeries(LineSeries,{color:'#14845d',lineWidth:2,lastValueVisible:true,priceLineVisible:false});
  fitted.current=false;
  return()=>{theme.disconnect();view.remove();chart.current=null;candleSeries.current=null;lineSeries.current=null;};
 },[symbol]);
 useEffect(()=>{
  try{
   const data=chartCandles(candles);
   const actual=chartObservations(observations,candles.at(-1)?.time??0);
   candleSeries.current?.setData(data.map(r=>({...r,time:r.time as UTCTimestamp})));
   lineSeries.current?.setData(actual.map(r=>({...r,time:r.time as UTCTimestamp})));
   if(!fitted.current&&data.length){chart.current?.timeScale().fitContent();fitted.current=true;}
   setError('');
  }catch{candleSeries.current?.setData([]);lineSeries.current?.setData([]);setError('Provider observations could not be validated.');}
 },[symbol,candles,observations]);
 const last=candles.at(-1);
 return <div>
  {error?<p role="status">{error}</p>:null}
  <div ref={container} role="img" aria-label={symbol+' provider OHLC candles and subsequent observed prices'} style={{height:320,width:'100%'}}/>
  {last?<p className="live-chart-evidence">Latest source candle: open ₹{last.open.toLocaleString('en-IN')}, high ₹{last.high.toLocaleString('en-IN')}, low ₹{last.low.toLocaleString('en-IN')}, close ₹{last.close.toLocaleString('en-IN')}.</p>:null}
  <a className="text-link" href="/open-source-notices.txt" target="_blank" rel="noopener noreferrer">Open-source notices</a>
 </div>;
}
