import {Activity,BookOpenText,BrainCircuit,ChartNoAxesCombined,
  CircleAlert,Newspaper,ShieldCheck} from 'lucide-react';
import {evaluateCouncil} from '../lib/councilEngine.js';
import type {CouncilLab} from '../lib/councilEngine.js';

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
  return <section className="panel council-shell" aria-label="Atlas six-role research council">
    <div className="council-header">
      <div><div className="premium-kicker">EVIDENCE-FIRST RESEARCH</div>
        <h2>Six-role research council</h2>
        <p>Six explainable evaluation roles—not six connected Grok bots.
          The council inspects the selected historical strategy and fails closed
          whenever independent evidence is missing.</p>
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
        const unavailable=result?.status==='NOT CONNECTED'||result?.status==='NO DATA'
          ||result?.status==='NO SIGNAL'||result?.status==='VETO';
        return <article className="council-agent" key={id}>
          <div className="council-role"><Icon size={17} aria-hidden="true"/>
            <strong>{title}</strong></div>
          <span className={'council-status '+(unavailable?'council-caution':'')}>
            {result?.status??'NO DATA'}</span>
          <p>{result?.detail??'No verified evidence.'}</p>
        </article>;
      })}
    </div>
    <div className="council-footer"><CircleAlert size={17}/>
      <span>Historical results are not current buy signals. Missing news and sentiment
        have not been invented. Real capital requires separate independent risk
        approval and explicit owner authorization.</span></div>
  </section>;
}
