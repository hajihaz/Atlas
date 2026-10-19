import {useEffect,useState} from 'react';
import {Activity,BookOpenText,BrainCircuit,ChartNoAxesCombined,
  CircleAlert,Newspaper,ShieldCheck} from 'lucide-react';
import {evaluateCouncil} from '../lib/councilEngine.js';
import type {CouncilLab} from '../lib/councilEngine.js';

type Headline={title:string;url:string;domain:string;publishedAt:string};
type News={schema:1;mode:'SOURCE_LINKS_ONLY';symbol:string;status:string;
  source:string;observedAt:string;articles:Headline[];
  liveOrdersEnabled:false;paperOrdersExecuted:false};
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
  const report=evaluateCouncil(lab,strategyId);
  const [news,setNews]=useState<News|null>(null);
  const [loadingNews,setLoadingNews]=useState(true);
  const [newsError,setNewsError]=useState('');
  useEffect(()=>{
    let active=true;
    const ac=new AbortController();
    setNews(null);setLoadingNews(true);setNewsError('');
    const load=async()=>{
      try{
        const r=await fetch('/api/market-news?'+new URLSearchParams({symbol:lab.symbol}),
          {signal:ac.signal,credentials:'omit'});
        if(!r.ok)throw Error('Public headline source unavailable');
        const data=await r.json() as News;
        if(data.schema!==1||data.mode!=='SOURCE_LINKS_ONLY'
          ||data.symbol!==lab.symbol||data.liveOrdersEnabled!==false
          ||data.paperOrdersExecuted!==false||!Array.isArray(data.articles)
          ||data.articles.length>5||data.articles.some(a=>
            typeof a.url!=='string'||!/^https?:\/\//.test(a.url)
            ||typeof a.title!=='string'||typeof a.publishedAt!=='string'))
          throw Error('Untrusted news feed');
        if(active)setNews(data);
      }catch(e){
        if(active&&!ac.signal.aborted)setNewsError(e instanceof Error?e.message:'News unavailable');
      }finally{if(active)setLoadingNews(false)}
    };
    void load();
    return ()=>{active=false;ac.abort()};
  },[lab.symbol]);
  return <section className="panel council-shell" aria-label="Atlas six-role research council">
    <div className="council-header">
      <div><div className="premium-kicker">EVIDENCE-FIRST RESEARCH</div>
        <h2>Six-role research council</h2>
        <p>Six explainable evaluation roles—not six connected Grok bots.
          The council inspects selected historical data. News shows public source links
          only; it never generates a trade signal from headlines.</p>
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
        const isNews=id==='news';
        const observed=isNews&&news?.status==='OBSERVED'&&news.articles.length>0;
        const status=isNews
          ?loadingNews?'CHECKING':observed?'SOURCE LINKS':'UNAVAILABLE'
          :result?.status??'NO DATA';
        const detail=isNews
          ?loadingNews?'Checking independent GDELT metadata, without fabricating results…'
            :observed?'Public matching article links; relevance and truth have NOT been independently verified.'
              :newsError||'No recent source-matched article references.'
          :result?.detail??'No verified evidence.';
        const unavailable=!observed&&(['NOT CONNECTED','NO DATA','NO SIGNAL','VETO','UNAVAILABLE'].includes(status));
        return <article className="council-agent" key={id}>
          <div className="council-role"><Icon size={17} aria-hidden="true"/>
            <strong>{title}</strong></div>
          <span className={'council-status '+(unavailable?'council-caution':'')}>
            {status}</span>
          <p>{detail}</p>
          {observed&&<div className="council-headline-list">
            {news?.articles.slice(0,3).map(a=><a key={a.url} href={a.url}
              target="_blank" rel="noopener noreferrer nofollow">
              {a.title}<small>{a.domain} · {new Date(a.publishedAt).toLocaleDateString('en-IN',{
                timeZone:'Asia/Kolkata',day:'2-digit',month:'short'})}</small>
            </a>)}
            <small>Source: {news?.source}. Publisher rights retained.</small>
          </div>}
        </article>;
      })}
    </div>
    <div className="council-footer"><CircleAlert size={17}/>
      <span>Historical returns and article mentions are not current buy signals.
        Sentiment is not connected; headlines are not independently verified. Real
        capital requires independent risk approval and explicit owner authorization.</span></div>
  </section>;
}
