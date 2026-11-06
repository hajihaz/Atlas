import {useEffect,useMemo,useRef,useState} from 'react';
import {Activity,ArrowDownRight,ArrowUpRight,BrainCircuit,CheckCircle2,
  ChevronRight,FileJson,FlaskConical,Scale,ShieldAlert,ShieldCheck,TrendingDown,
  TrendingUp,UploadCloud,XCircle} from 'lucide-react';
import {CartesianGrid,Legend,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import '../debate-x.css';

type Stance='APPROVE'|'REJECT'|'REVIEW'|'SUPPORT'|'OPPOSE';
type Agent={role:'bull'|'bear'|'judge';stance:Stance;reason:string;evidence_ids:string[];risks:string[]};
type Review={schema:1;mode:'SHADOW_PAPER_ONLY';candidate_id:string;status:string;
  decision:'APPROVE'|'SKIP';judge_stance?:Stance;agents:Agent[];reasons:string[];
  live_orders_enabled:false;real_orders_placed:0;decision_time?:string;snapshot_id?:string};
type Journal={candidate_id:string;strategy_id:string;symbol:string;decision_at:string;
  exit_at:string;source:string;review_status:string;ai_decision:string;
  baseline_pnl_inr:string;filtered_pnl_inr:string;baseline_equity_inr:string;
  filtered_equity_inr:string;missed_profitable_trade:boolean;chain_hash:string};
type Report={schema:1;mode:'CLOSED_TRADE_PAPER_REPLAY';status:string;
  comparison_valid:boolean;certified_forward:false;live_orders_enabled:false;
  real_orders_placed:0;connected_model:boolean;initial_capital_inr:string;
  max_trade_inr:string;trade_count:number;approved_count:number;
  missed_profitable_count:number;baseline_equity_inr:string;filtered_equity_inr:string;
  baseline_max_drawdown_pct:string;filtered_max_drawdown_pct:string;
  equity_curve:{step:number;baseline_inr:string;filtered_inr:string}[];
  evaluations:Review[];rows:Journal[];ledger_chain_head:string;disclaimer:string};
function validate(raw:unknown):Report{
  if(!raw||typeof raw!=='object')throw Error('Not a Debate X report');
  const r=raw as Report;
  if(r.schema!==1||r.mode!=='CLOSED_TRADE_PAPER_REPLAY'
    ||r.live_orders_enabled!==false||r.real_orders_placed!==0
    ||r.certified_forward!==false||!Array.isArray(r.rows)
    ||!Array.isArray(r.evaluations)||!Array.isArray(r.equity_curve)
    ||!Number.isInteger(r.trade_count)||r.trade_count!==r.rows.length
    ||r.trade_count>200||typeof r.comparison_valid!=='boolean'
    ||typeof r.connected_model!=='boolean'
    ||r.evaluations.some(e=>e.mode!=='SHADOW_PAPER_ONLY'
      ||e.live_orders_enabled!==false||e.real_orders_placed!==0
      ||!Array.isArray(e.agents))
    ||r.rows.some(t=>!t.candidate_id||!t.chain_hash
      ||!Number.isFinite(Number(t.baseline_equity_inr))
      ||!Number.isFinite(Number(t.filtered_equity_inr)))){
    throw Error('Report failed paper-only schema validation');
  }
  return r;
}
const inr=(value:string|number)=>Number.isFinite(Number(value))
  ?new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',
      maximumFractionDigits:2}).format(Number(value)):'—';
const pct=(value:string)=>Number.isFinite(Number(value))?Number(value).toFixed(2)+'%':'—';
export default function DebateXPage(){
  const [report,setReport]=useState<Report|null>(null);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const [filter,setFilter]=useState<'ALL'|'APPROVE'|'SKIP'>('ALL');
  const [provenance,setProvenance]=useState('Bundled read-only report');
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/debate-x-report.json',{credentials:'omit',signal:controller.signal})
      .then(async r=>{if(!r.ok)throw Error('No published Debate X report');return validate(await r.json())})
      .then(x=>setReport(x))
      .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Report unavailable')});
    return ()=>controller.abort();
  },[]);
  const rows=useMemo(()=>(report?.rows??[]).filter(row=>filter==='ALL'||row.ai_decision===filter),
    [report,filter]);
  const current=report?.rows.find(row=>row.candidate_id===selected)??rows[0]??null;
  const review=report?.evaluations.find(x=>x.candidate_id===current?.candidate_id)??null;
  const equity=useMemo(()=>(report?.equity_curve??[]).map(x=>({
    step:x.step,baseline:Number(x.baseline_inr),filtered:Number(x.filtered_inr),
  })).filter(x=>Number.isFinite(x.baseline)&&Number.isFinite(x.filtered)),[report]);
  const measured=!!report?.comparison_valid&&!!report.connected_model&&report.trade_count>0;
  const handleImport=async(file:File|undefined)=>{
    if(!file)return;
    if(file.size>1024*1024){setError('Report exceeds 1 MB limit');return;}
    try{
      const x=validate(JSON.parse(await file.text()) as unknown);
      setReport(x);setSelected(null);setFilter('ALL');setError('');
      setProvenance('Local file (not independently certified or uploaded)');
    }catch(e){setError(e instanceof Error?e.message:'Invalid report');}
    if(input.current)input.current.value='';
  };
  return <section className="debate-page" aria-label="Atlas Debate X paper research">
    <div className="sub-page-header">
      <div className="breadcrumb">ATLAS <ChevronRight size={13}/> RESEARCH / DEBATE X</div>
      <h1>Debate <span className="period">X.</span></h1>
      <p>Adversarial Bull · Bear · Judge. Point-in-time evidence, deterministic vetoes,
        and isolated ₹1,00,000 virtual-book comparisons.</p>
    </div>
    <div className="debate-topline">
      <span className="debate-pill"><FlaskConical size={15}/> Research &amp; shadow paper only</span>
      <span className="debate-pill"><ShieldCheck size={15}/> Live broker execution disabled</span>
      <button type="button" className="secondary-button debate-import" onClick={()=>input.current?.click()}>
        <UploadCloud size={16}/> Import local report</button>
      <input ref={input} type="file" accept=".json,application/json" hidden
        aria-label="Import Debate X report" onChange={e=>void handleImport(e.target.files?.[0])}/>
    </div>
    {error&&<div className="panel debate-error" role="alert"><ShieldAlert size={17}/>{error}</div>}
    <div className="debate-summary-grid">
      <div className="panel debate-summary-card"><small>Comparison status</small>
        <strong className="debate-summary-status">{measured?'Replay reviewed':'Awaiting verified run'}</strong>
        <span>{report?.trade_count??0} settled opportunities · {provenance}</span></div>
      <div className="panel debate-summary-card"><small>Baseline equity</small>
        <strong>{measured?inr(report!.baseline_equity_inr):'—'}</strong>
        <span>Original Atlas · virtual</span></div>
      <div className="panel debate-summary-card"><small>Debate-filtered equity</small>
        <strong>{measured?inr(report!.filtered_equity_inr):'—'}</strong>
        <span>AI filter · virtual</span></div>
      <div className="panel debate-summary-card"><small>Missed profitable candidates</small>
        <strong>{measured?report!.missed_profitable_count:'—'}</strong>
        <span>Rejected despite positive modeled P&amp;L</span></div>
    </div>
    <div className="debate-dashboard-grid">
      <div className="panel debate-equity-card">
        <div className="debate-section-head"><div><span className="premium-kicker">A/B EXPERIMENT</span>
          <h2>Independent virtual equity</h2></div>
          <span className="debate-mini-label">{measured?'Historical closed-trade replay':'No certified results'}</span>
        </div>
        {measured&&equity.length>1?<div className="debate-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={equity} margin={{top:10,bottom:5,left:0,right:12}}>
              <CartesianGrid vertical={false} strokeOpacity={0.12}/>
              <XAxis dataKey="step" tick={{fontSize:11}}/>
              <YAxis tickFormatter={n=>'₹'+Math.round(n).toLocaleString('en-IN')}
                tick={{fontSize:10}} width={82} domain={['auto','auto']}/>
              <Tooltip formatter={n=>inr(Number(n))}/>
              <Legend verticalAlign="bottom"/>
              <Line name="Original Atlas" dataKey="baseline" stroke="#6995e8"
                isAnimationActive={false} strokeWidth={2.7} dot={false}/>
              <Line name="Debate X" dataKey="filtered" stroke="#23a47b"
                isAnimationActive={false} strokeWidth={2.7} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>:<div className="debate-empty-chart">
          <BrainCircuit size={34}/><strong>No validated AI equity history yet</strong>
          <p>Connect an explicitly authorized model and point-in-time evidence, run the
            local paper replay, then import its JSON output. No returns are invented.</p></div>}
        <div className="debate-chart-footer">
          <span><Activity size={15}/> Original strategy stays unchanged</span>
          <span><ShieldCheck size={15}/> Risk manager has final veto</span>
        </div>
      </div>
      <div className="panel debate-roles">
        <div className="debate-section-head"><div><span className="premium-kicker">ARCHITECTURE</span>
          <h2>Three independent roles</h2></div></div>
        <div className="debate-role debate-bull"><TrendingUp size={19}/><div><strong>01 · Bull</strong>
          <p>Argues for the candidate using dated, source-matched evidence.</p></div></div>
        <div className="debate-role debate-bear"><TrendingDown size={19}/><div><strong>02 · Bear</strong>
          <p>Finds falsifying evidence, event risk and adverse scenarios.</p></div></div>
        <div className="debate-role debate-judge"><Scale size={19}/><div><strong>03 · Judge</strong>
          <p>Reviews both arguments. APPROVE / REJECT / REVIEW — never a real order.</p></div></div>
        <div className="debate-hard-gate"><ShieldCheck size={19}/>
          <span>Deterministic Atlas risk controls always apply independently.</span></div>
      </div>
    </div>
    <div className="panel debate-journal">
      <div className="debate-section-head">
        <div><span className="premium-kicker">INSPECTABLE RESEARCH</span><h2>Trade debate journal</h2>
          <p>Inspect each role's cited evidence and the outcome after the signal.</p></div>
        <div className="debate-filters" role="group" aria-label="Filter debate outcomes">
          {(['ALL','APPROVE','SKIP'] as const).map(x=><button key={x} type="button"
            className={filter===x?'selected':''} aria-pressed={filter===x}
            onClick={()=>{setFilter(x);setSelected(null)}}>{x==='ALL'?'All':x==='APPROVE'?'Approved':'Skipped'}</button>)}
        </div>
      </div>
      {rows.length?<div className="debate-journal-layout">
        <div className="debate-trade-list">
          {rows.map(row=><button key={row.candidate_id} type="button"
            onClick={()=>setSelected(row.candidate_id)}
            className={'debate-trade-row '+(current?.candidate_id===row.candidate_id?'active':'')}>
            <span><strong>{row.symbol}</strong><small>{row.strategy_id}</small></span>
            <span className={'debate-decision '+(row.ai_decision==='APPROVE'?'approved':'skipped')}>
              {row.ai_decision==='APPROVE'?<CheckCircle2 size={15}/>:<XCircle size={15}/>}
              {row.ai_decision}</span>
            <small>{row.decision_at}</small>
          </button>)}
        </div>
        {current&&<div className="debate-decision-detail">
          <div className="debate-detail-heading"><div><strong>{current.symbol}</strong>
            <small>Snapshot {review?.snapshot_id??'unavailable'} · {current.decision_at}</small></div>
            <span className="debate-mini-label">{review?.status??'NO REVIEW'}</span></div>
          {(review?.agents??[]).map(agent=><article key={agent.role} className="debate-argument">
            <div className="debate-argument-title"><strong>{agent.role.toUpperCase()}</strong>
              <span>{agent.stance}</span></div>
            <p>{agent.reason}</p>
            <small>Source evidence IDs: {agent.evidence_ids.join(', ')||'None'}</small>
            {agent.risks.length>0&&<small>Risks: {agent.risks.join(' · ')}</small>}
          </article>)}
          {!review?.agents.length&&<div className="debate-unavailable"><ShieldAlert size={18}/>
            AI debate was unavailable. No agent recommendation was fabricated.</div>}
          <div className="debate-outcome-row">
            <div><small>Original paper P&amp;L</small><strong>{inr(current.baseline_pnl_inr)}</strong></div>
            <div><small>AI-filtered paper P&amp;L</small><strong>{inr(current.filtered_pnl_inr)}</strong></div>
            <div><small>Missed positive move?</small><strong>{current.missed_profitable_trade?'Yes':'No'}</strong></div>
          </div>
          <div className="debate-provenance"><FileJson size={15}/>
            <span>Settlement source: {current.source} · journal hash {current.chain_hash.slice(0,16)}…</span></div>
        </div>}
      </div>:<div className="debate-empty-journal"><FileJson size={24}/>
        <strong>No settled debates for this filter</strong>
        <p>Atlas has not certified a forward NSE AI paper session here. Import a validated local
          Debate X research report to inspect actual case records.</p></div>}
    </div>
    <div className="debate-bottom-note"><ShieldAlert size={20}/>
      <p><strong>Research-only boundary.</strong> {report?.disclaimer??'No broker connectivity or real capital authority.'}
        {' '}An LLM cannot substitute for licensed NSE data, a point-in-time audit trail or
        the existing Atlas kill switch. AI is opt-in and disabled by default.</p>
      {measured?<span><ArrowUpRight size={15}/> Baseline drawdown {pct(report!.baseline_max_drawdown_pct)}
        {' '}· Debate drawdown {pct(report!.filtered_max_drawdown_pct)}</span>:
        <span><ArrowDownRight size={15}/> Waiting for evidence</span>}
    </div>
  </section>;
}
