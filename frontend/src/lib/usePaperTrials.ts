import {useCallback,useEffect,useRef,useState} from 'react';
import {PAPER_STORE_KEY,createPaperGroup,pausePaperGroup,resumePaperGroup,
 advancePaperGroup} from './paperEngine.js';
import type {PaperGroup} from './paperEngine.js';

function loadSaved():PaperGroup|null{
 try{
  const raw=window.localStorage.getItem(PAPER_STORE_KEY);
  if(!raw)return null;
  const data=JSON.parse(raw);
  if(data?.schema!==1||data.mode!=='LOCAL_FORWARD_PAPER_TRIAL'
     ||data.realOrdersEnabled!==false||!Array.isArray(data.sessions)
     ||data.sessions.length!==5||data.sessions.some((s:unknown)=>{
       if(!s||typeof s!=='object')return true;
       const obj=s as {events?:unknown;cash?:number;quantity?:number;status?:string};
       return !Array.isArray(obj.events)||obj.events.length>120
         ||!Number.isFinite(obj.cash)||!Number.isFinite(obj.quantity)
         ||!['running','paused'].includes(obj.status??'');
     }))return null;
  return data as PaperGroup;
 }catch{return null;}
}
function persist(g:PaperGroup|null){
 try{if(g)window.localStorage.setItem(PAPER_STORE_KEY,JSON.stringify(g));
 else window.localStorage.removeItem(PAPER_STORE_KEY);}catch{/* private mode unavailable */}
}
export function usePaperTrials(){
 const [group,setGroup]=useState<PaperGroup|null>(loadSaved);
 const [providerMessage,setProviderMessage]=useState('');
 const ref=useRef(group);
 const update=useCallback((next:PaperGroup|null)=>{
   ref.current=next;setGroup(next);persist(next);
 },[]);
 const start=useCallback((symbol:string)=>{update(createPaperGroup(symbol));setProviderMessage('Running in this browser. New candles only.');},[update]);
 const pause=useCallback(()=>{if(ref.current)update(pausePaperGroup(ref.current));},[update]);
 const resume=useCallback(()=>{if(ref.current)update(resumePaperGroup(ref.current));},[update]);
 const clear=useCallback(()=>update(null),[update]);
 useEffect(()=>{
  let alive=true;
  let busy=false;
  const load=async()=>{
    const current=ref.current;
    if(!alive||!current||!current.sessions.some(s=>s.status==='running')||busy)return;
    busy=true;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const [historyResponse,quotesResponse]=await Promise.all([
        fetch('/api/market-history?'+new URLSearchParams({symbol:current.symbol,range:'1H'}),
          {credentials:'omit',cache:'no-store',signal:controller.signal}),
        fetch('/api/live-feed',{credentials:'omit',cache:'no-store',signal:controller.signal}),
      ]);
      if(!historyResponse.ok||!quotesResponse.ok)throw Error('Provider did not respond');
      const [history,feed]=await Promise.all([historyResponse.json(),quotesResponse.json()]);
      if(history.schema!==1||history.symbol!==current.symbol||history.currency!=='INR'
         ||history.realOrdersEnabled!==false||history.paperExecutionEnabled!==false
         ||!Array.isArray(history.candles)||feed.schema!==1
         ||feed.realOrdersEnabled!==false||!Array.isArray(feed.quotes))
        throw Error('Untrusted paper input');
      const quote=feed.quotes.find((x:{symbol:string})=>x.symbol===current.symbol);
      if(!quote?.sourceAt||typeof quote.price!=='number'){
        setProviderMessage('Waiting for a fresh INR exchange reference. No paper fill.');
        return;
      }
      if(!alive||ref.current!==current)return;
      const next=advancePaperGroup(current,history.candles,quote,Date.now());
      update(next);
      setProviderMessage('Forward paper checked against completed 1-minute candles and source-timestamped quotes.');
    }catch(e){
      if(alive)setProviderMessage(e instanceof Error?e.message:'Paper provider unavailable');
    }finally{clearTimeout(timeout);busy=false;}
  };
  void load();
  const timer=setInterval(()=>void load(),15000);
  return ()=>{alive=false;clearInterval(timer)};
 },[group?.createdAt,group?.symbol,update]);
 return {group,providerMessage,start,pause,resume,clear};
}
