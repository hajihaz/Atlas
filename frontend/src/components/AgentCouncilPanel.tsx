import {useEffect,useState} from 'react';
import {Activity,BookOpenText,BrainCircuit,ChartNoAxesCombined,
  CircleAlert,Newspaper,ShieldCheck} from 'lucide-react';
import {evaluateCouncil} from '../lib/councilEngine.js';
import type {CouncilLab,CouncilNews} from '../lib/councilEngine.js';

const agents=[
  {id:'scout',title:'01 · Scout',Icon:Activity},
  {id:'news',title:'02 · News',Icon:Newspaper},
  {id:'sentiment',title:'03 · Sentiment',Icon:BrainCircuit},
  {id:'charts',title:'04 · Charts',Icon:ChartNoAxesCombined},
  {id:'risk',title:'05 · Risk',Icon:ShieldCheck},
  {id:'decision',title:'06 · Decision',Icon:BookOpenText},
] as const;
export default function AgentCouncilPanel({lab,strategyId}:{
  lab:CouncilLab;strategyId:string;
}){
  const [news,setNews]=useState<CouncilNews|null>(null);
  const [newsStatus,setNewsStatus]=useState('Checking source headlines…');
  useEffect(()=>{
    const controller=new AbortController();
    let active=true,busy=false;
    setNews(null);setNewsStatus('Checking source headlines…');
    const load=async()=>{
      if(!active||busy)return;
      busy=true;
      try{
        const response=await fetch('/api/news-evidence?'+new URLSearchParams({symbol:lab.symbol}),
          {credentials:'omit',cache:'no-store',signal:controller.signal});
        if(!response.ok)throw Error('News source unavailable');
        const data=await response.json() as CouncilNews;
        if(data.schema!==1||data.mode!=='SOURCE_HEADLINES_ONLY'
          ||data.symbol!==lab.symbol||data.source!=='GDELT DOC 2.0'
          ||data.publicationVerified!==false||data.liveOrdersEnabled!==false
          ||data.realOrdersPlaced!==0||!Array.isArray(data.articles)
          ||data.articles.length>8)throw Error('Invalid news evidence');
        if(!active)return;
        setNews(data);
        setNewsStatus(data.status==='OBSERVED'?
          data.articles.length+' attributed recent headline observations':
          'No source-validated recent headlines available');
      }catch{
        if(active&&!controller.signal.aborted){
          setNews(null);setNewsStatus('News provider unavailable · no assumed sentiment');
        }
      }finally{busy=false}
    };
    void load();
    const timer=setInterval(()=>void load(),300000);
    return ()=>{active=false;clearInterval(timer);controller.abort()};
  },[lab.symbol]);
  const report=evaluateCouncil(lab,strategyId,Date.now(),news);
  const headlines=news?.status==='OBSERVED'?news.articles:[];
  return <section className="panel council-shell" aria-label="Atlas six-role research council">
    <div className="council-header">
      <div><div className="premium-kicker">EVIDENCE-FIRST RESEARCH</div>
        <h2>Six-role research council</h2>
        <p>Six explainable evaluation roles—not six connected Grok bots.
          News headlines are actual source discoveries, not predictions.
          The council fails closed whenever independent evidence is missing.</p>
      </div>
      <div className="council-outcome" aria-live="polite">
        <small>RESEARCH DECISION</small>
        <strong>{report.outcome}</strong>
        <span>No real or paper order</span>
      </div>
    </div>
    <div className="council-grid">
      {agents.map(({id,title,Icon})=>{
        const result=report.agents.find(a=>a.id===id);
        const unavailable=result?.status==='NOT CONNECTED'||result?.status==='UNAVAILABLE'
          ||result?.status==='NO DATA'||result?.status==='NO SIGNAL'
          ||result?.status==='VETO';
        return <article className="council-agent" key={id}>
          <div className="council-role"><Icon size={17} aria-hidden="true"/>
            <strong>{title}</strong></div>
          <span className={'council-status '+(unavailable?'council-caution':'')}>
            {result?.status??'NO DATA'}</span>
          <p>{result?.detail??'No verified evidence.'}</p>
        </article>;
      })}
    </div>
    <div className="council-news">
      <div className="council-news-title">
        <Newspaper size={17}/><strong>Source-linked news observations</strong>
      </div>
      <p>{newsStatus}. GDELT first-seen timestamps are not publication timestamps.</p>
      {headlines.length>0&&<ul className="council-news-items">
        {headlines.map(a=><li key={a.url}>
          <a href={a.url} target="_blank" rel="noopener noreferrer nofollow">{a.title}</a>
          <small>{a.sourceDomain} · GDELT seen {new Intl.DateTimeFormat('en-IN',
            {timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'numeric',
              minute:'2-digit',hour12:true}).format(Date.parse(a.discoveredAt))} IST</small>
        </li>)}
      </ul>}
    </div>
    <div className="council-footer"><CircleAlert size={17}/>
      <span>Historical results and news mentions are not current buy signals.
        Sentiment is still not connected. Real capital requires independent
        live risk approval and explicit owner authorization.</span></div>
  </section>;
}
