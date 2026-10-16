import { useMemo, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowDownRight, ArrowRight, ArrowUpRight,
  BarChart3, Bell, BookOpenText, ChartNoAxesCombined, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleHelp, Clock3,
  Command, Copy, Download, ExternalLink, FileClock, Fingerprint, Gauge,
  GitBranch, History, Layers3, LayoutDashboard, LockKeyhole, Menu,
  MoreHorizontal, Play, Search, Shield, ShieldAlert, ShieldCheck, SlidersHorizontal,
  Sparkles, TerminalSquare, TrendingUp, Wallet, X, Zap,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import snapshot from './data/snapshot.json';

type Page = 'overview' | 'strategies' | 'research' | 'risk' | 'orders' | 'audit';
type WindowSize = 7 | 14 | 30;
const nav = [
  { id: 'overview', title: 'Overview', Icon: LayoutDashboard },
  { id: 'strategies', title: 'Strategies', Icon: Layers3 },
  { id: 'research', title: 'Research Lab', Icon: ChartNoAxesCombined },
  { id: 'risk', title: 'Risk Center', Icon: ShieldCheck },
  { id: 'orders', title: 'Orders & Activity', Icon: History },
  { id: 'audit', title: 'Audit & Evidence', Icon: FileClock },
] as const;

const usd = (n: number, decimals = 2) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals,
}).format(n);
const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const positive = (v: number) => v >= 0 ? 'positive' : 'negative';
const all = snapshot.historical;
const firstEquity = snapshot.historicalInitialCapital;
const finalEquity = all[all.length - 1].equity;
const totalReturn = (finalEquity / firstEquity - 1) * 100;
const lastCertified = new Date(snapshot.certifiedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function downloadFile(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SmallTag({ children, style = 'neutral' }: { children: React.ReactNode; style?: 'neutral' | 'mint' | 'gold' | 'red' }) {
  return <span className={`tag tag-${style}`}>{children}</span>;
}
function HeaderHint({ children }: { children: React.ReactNode }) {
  return <span className="header-hint">{children}</span>;
}
function ArrowLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="text-link" type="button">{children} <ArrowUpRight size={15} /></button>;
}

function Sidebar({ page, setPage, collapsed, toggle, mobileOpen, closeMobile }: {
  page: Page; setPage: (v: Page) => void; collapsed: boolean; toggle: () => void;
  mobileOpen: boolean; closeMobile: () => void;
}) {
  function go(id: Page) { setPage(id); closeMobile(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  return <>
    {mobileOpen && <button className="mobile-backdrop" onClick={closeMobile} aria-label="Close navigation" />}
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="brand-section">
        <button className="brand" onClick={() => go('overview')} aria-label="Atlas overview">
          <span className="brand-mark"><svg viewBox="0 0 42 42" fill="none" aria-hidden="true"><path d="M21 4 39 36H3L21 4Z" stroke="currentColor" strokeWidth="3"/><path d="M14 26h14M21 12v14" stroke="currentColor" strokeWidth="2.4"/></svg></span>
          {!collapsed && <span className="brand-copy"><strong>ATLAS<span className="brand-dot">.</span></strong><small>QUANTITATIVE SYSTEMS</small></span>}
        </button>
        <button className="collapse-button" onClick={toggle} title="Toggle sidebar" aria-label="Toggle sidebar"><ChevronLeft size={18} /></button>
      </div>
      <div className="sidebar-inner">
        <div className="nav-section-name">{!collapsed ? 'WORKSPACE' : '•••'}</div>
        <nav className="nav-links" aria-label="Main navigation">
          {nav.map(({ id, title, Icon }) => <button title={title} key={id} className={`nav-link ${page === id ? 'active' : ''}`} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}>
            <Icon size={19} strokeWidth={1.8}/>{!collapsed && <span>{title}</span>}{!collapsed && page === id && <span className="active-indicator" />}
          </button>)}
        </nav>
        {!collapsed && <div className="nav-section-name secondary-label">SYSTEM STATUS</div>}
        <button className="nav-link safety-side" onClick={() => go('risk')} title="Capital execution locked"><LockKeyhole size={18}/>{!collapsed && <><span>Capital locked</span><span className="mini-status-dot" /></>}</button>
      </div>
      <div className="sidebar-footer">
        {!collapsed && <div className="sidebar-system-card"><div className="status-led"/><div><strong>System protected</strong><span>Offline research mode</span></div><ShieldCheck size={18}/></div>}
        <button className="account-entry" onClick={() => go('audit')} title="Evidence and build"><span className="user-avatar">A</span>{!collapsed && <><span className="account-name"><strong>Atlas Console</strong><small>Read-only public preview</small></span><MoreHorizontal size={18}/></>}</button>
      </div>
    </aside>
  </>;
}

function Overview({ setPage }: { setPage: (page: Page) => void }) {
  const [windowSize, setWindowSize] = useState<WindowSize>(30);
  const chartData = useMemo(() => all.slice(-windowSize).map((item) => ({ ...item, dateLabel: item.date.slice(5) })), [windowSize]);
  const rangeStart = windowSize === 30 ? firstEquity : all[all.length - windowSize - 1]?.equity ?? firstEquity;
  const rangeReturn = (finalEquity / rangeStart - 1) * 100;
  const max = Math.ceil(Math.max(...chartData.map(v => v.equity)) / 500) * 500;
  const min = Math.floor(Math.min(...chartData.map(v => v.equity)) / 500) * 500;

  return <>
    <section className="intro-row">
      <div><div className="breadcrumb">WORKSPACE <ChevronRight size={13}/> OVERVIEW</div><h1>Good to see you<span className="period">.</span></h1><p>Here's an overview of your Atlas research environment.</p></div>
      <div className="intro-actions"><span className="asof-label"><Clock3 size={14}/> Evidence as of {lastCertified}</span><button className="primary-button" type="button" onClick={() => setPage('research')}>View research <ArrowUpRight size={16}/></button></div>
    </section>
    <div className="alert-banner"><div className="alert-icon"><LockKeyhole size={19}/></div><div><strong>Live trading is disabled</strong><span>This is an offline research dashboard displaying archived LEAN sample results. No broker connection or real portfolio data.</span></div><button onClick={() => setPage('risk')} type="button">Safety details <ArrowRight size={15}/></button></div>
    <section className="metrics-grid" aria-label="Key statistics">
      <Metric icon={Wallet} title="Archived replay equity" value={usd(finalEquity)} sub="30 historical sessions · illustrative" subIcon={<span className="small-dot"/>} />
      <Metric icon={TrendingUp} title="Archived replay return" value={pct(totalReturn)} isPositive={totalReturn >= 0} sub="Versus $100,000 simulation start" subIcon={<ArrowUpRight size={14}/>} />
      <Metric icon={Gauge} title="Engineering tests" value={snapshot.testsPassed.toLocaleString()} sub={`${snapshot.testsSkippedLocal} DB tests skipped locally`} subIcon={<CheckCircle2 size={14} />} />
      <Metric icon={ShieldCheck} title="Capital authorization" value="BLOCKED" kind="warning" sub="No live execution permissions" subIcon={<LockKeyhole size={14}/>} />
    </section>
    <section className="dashboard-grid">
      <div className="chart-card panel">
        <div className="panel-heading"><div><div className="heading-kicker">HISTORICAL PERFORMANCE</div><h2>Portfolio equity curve</h2><p>Archived SPY / AAPL LEAN sample · <strong>not live performance</strong></p></div><div className="period-control" role="group" aria-label="Historical time period">{([7,14,30] as const).map(n=><button className={windowSize === n ? 'selected' : ''} type="button" onClick={()=>setWindowSize(n)} key={n}>{n}S</button>)}</div></div>
        <div className="chart-big-number"><strong>{usd(finalEquity)}</strong><span className={`change-pill ${positive(rangeReturn)}`}>{rangeReturn >= 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {pct(rangeReturn)}</span><small>over selected {windowSize} sessions</small></div>
        <div className="chart-graphic"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:10,right:5,left:-15,bottom:5}}><defs><linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#72e5bb" stopOpacity={0.25}/><stop offset="95%" stopColor="#72e5bb" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#24313d" strokeDasharray="4 7" vertical={false}/><XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{fill:'#697c8c',fontSize:11}} minTickGap={23} dy={12}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#697c8c',fontSize:11}} tickFormatter={(v:number)=>`$${(v/1000).toFixed(0)}k`} domain={[min,max]} width={56}/><Tooltip cursor={{stroke:'#86eac5',strokeDasharray:'3 6'}} content={({active,payload,label})=>active&&payload?.length ? <div className="chart-tooltip"><span>Historical date · {label}</span><strong>{usd(Number(payload[0].value))}</strong></div> : null}/><ReferenceLine y={100000} stroke="#658078" strokeDasharray="3 6"/><Area type="monotone" dataKey="equity" stroke="#8eebc9" strokeWidth={2.7} fill="url(#equityFill)" dot={false} activeDot={{r:4,fill:'#b0f7dd',stroke:'#0f191d',strokeWidth:3}} isAnimationActive/></AreaChart></ResponsiveContainer></div>
        <div className="chart-foot"><span><span className="legend-line"/> Archived portfolio equity</span><span><span className="legend-dashed"/> Starting capital</span><span className="chart-foot-end">Source SHA {snapshot.researchSourceHash}</span></div>
      </div>
      <div className="readiness-card panel"><div className="panel-heading tight"><div><div className="heading-kicker">CONTROL ENVIRONMENT</div><h2>System readiness</h2></div><Shield size={19} className="muted-icon"/></div><div className="readiness-ring" role="img" aria-label="Offline certification complete, live capital blocked"><div className="ring-inner"><span>17 / 17</span><strong>Passed</strong><small>Offline gates</small></div></div><div className="readiness-divider"/><div className="readiness-list"><div><span className="check-mark"><Check size={12}/></span> Offline certification <SmallTag style="mint">VERIFIED</SmallTag></div><div><span className="check-mark"><Check size={12}/></span> LEAN fixture matrix <span className="small-value">{snapshot.leanGoldenFixtures} / {snapshot.leanGoldenFixtures}</span></div><div><span className="blocked-mark"><X size={12}/></span> Live execution <SmallTag style="red">LOCKED</SmallTag></div></div><ArrowLink onClick={()=>setPage('risk')}>Review safety controls</ArrowLink></div>
    </section>
    <section className="bottom-grid"><div className="panel cohort-panel"><div className="panel-heading"><div><div className="heading-kicker">RESEARCH VALIDATION</div><h2>Historical research windows</h2><p>Three independent 125-session sample windows</p></div><ArrowLink onClick={()=>setPage('research')}>View all</ArrowLink></div><div className="table-scroller"><table><thead><tr><th>WINDOW START</th><th>SESSIONS</th><th>ENDING EQUITY*</th><th>RETURN*</th><th>TYPE</th></tr></thead><tbody>{snapshot.cohorts.map(c=>{const change=(c.finalEquity/100000-1)*100;return <tr key={c.start}><td><span className="table-icon"><Activity size={14}/></span>{c.start}</td><td>{c.sessions}</td><td>{usd(c.finalEquity)}</td><td className={positive(change)}>{pct(change)}</td><td><SmallTag>ARCHIVED</SmallTag></td></tr>})}</tbody></table></div><div className="table-caption">*Illustrative simulation figures. Not actual invested capital or realized gains.</div></div><div className="panel health-panel"><div className="panel-heading"><div><div className="heading-kicker">ENGINEERING HEALTH</div><h2>Verification snapshot</h2></div><ArrowLink onClick={()=>setPage('audit')}>Audit</ArrowLink></div><div className="verification-list"><div><span className="verification-icon"><CheckCircle2 size={19}/></span><div><strong>{snapshot.testsPassed} passing tests</strong><span>Certified local Python run</span></div><small>PASS</small></div><div><span className="verification-icon"><GitBranch size={19}/></span><div><strong>Version {snapshot.revision}</strong><span>Source-bound certification</span></div><small>TRACEABLE</small></div><div><span className="verification-icon warning"><CircleAlert size={19}/></span><div><strong>LEAN full-suite limitation</strong><span>Python.NET host issue outstanding</span></div><small className="warning-text">OPEN</small></div></div></div></section>
  </>;
}

function Metric({icon: Icon, title, value, sub, subIcon, isPositive, kind}: {icon:typeof Wallet;title:string;value:string;sub:string;subIcon:React.ReactNode;isPositive?:boolean;kind?:'warning'}) {
  return <div className="metric-card panel"><div className="metric-heading"><span>{title}</span><Icon size={19} strokeWidth={1.7}/></div><div className={`metric-value ${kind === 'warning' ? 'warning-text' : ''}`}>{value}</div><div className={`metric-sub ${isPositive ? 'positive' : ''}`}>{subIcon}<span>{sub}</span></div></div>;
}

function ResearchPage() {
  const [selected, setSelected] = useState(0);
  const cohort = snapshot.cohorts[selected];
  const change = (cohort.finalEquity / 100000 - 1) * 100;
  return <><SectionTitle kicker="RESEARCH LAB" title="Evidence before execution." desc="Explore reproducible historical tests. Nothing here represents a live broker account." />
    <div className="section-warning"><CircleAlert size={18} /><span><strong>Archived test fixtures only.</strong> These periods use the same fixed strategy and should not be interpreted as independently validated trading alpha.</span></div>
    <div className="research-grid"><div className="panel research-main"><div className="panel-heading"><div><div className="heading-kicker">RESEARCH CAMPAIGNS</div><h2>Historical cohort analysis</h2><p>Select a validated 125-session sample window.</p></div><BookOpenText size={21} className="muted-icon"/></div><div className="cohort-selector">{snapshot.cohorts.map((c, i) => <button key={c.start} className={i === selected ? 'selected' : ''} onClick={()=>setSelected(i)}><small>COHORT {String(i+1).padStart(2,'0')}</small><strong>{c.start}</strong><span>{c.sessions} sessions</span></button>)}</div><div className="selected-cohort"><div><small>HISTORICAL ENDING EQUITY</small><strong>{usd(cohort.finalEquity)}</strong><span className={positive(change)}>{pct(change)} against $100k modeled start</span></div><div><small>WINDOW</small><strong>{cohort.sessions} days</strong><span>Archived LEAN SPY / AAPL data</span></div></div><div className="research-note"><Fingerprint size={20}/><span>Data snapshot hash: <code>{snapshot.researchSourceHash}…</code><br/>Cohorts are reproducible, not broker paper evidence.</span></div></div>
    <div className="panel protocol-card"><div className="heading-kicker">RESEARCH RULES</div><h2>Safety by design.</h2>{[{Icon:ShieldCheck,t:'Point-in-time replay',d:'Decisions based on archived data with next-session fill timing.'},{Icon:GitBranch,t:'Source traceability',d:'Historical inputs and certification artifacts are hash-bound.'},{Icon:LockKeyhole,t:'No execution authority',d:'Research cannot independently place broker orders.'}].map(({Icon,t,d})=><div className="protocol-item" key={t}><div className="protocol-item-icon"><Icon size={18}/></div><div><strong>{t}</strong><p>{d}</p></div></div>)}</div></div></>;
}

function StrategiesPage() {
  const methods = [
    { title:'Historical equal-weight model', sub:'Illustrative SPY / AAPL allocation', tag:'RESEARCH ONLY', type:'Historical fixture', desc:'Rule-based strategy replay with date-separated decisions and fills. No live signal generation.' },
    { title:'LEAN multi-asset scenario', sub:'Portfolio order flow validation', tag:'ENGINE TEST', type:'Golden fixture', desc:'Tests portfolio changes and order execution behavior in a deterministic LEAN environment.'},
    { title:'Cash-limit safety scenario', sub:'Blocked order on insufficient cash', tag:'SAFETY TEST', type:'Golden fixture', desc:'Validates expected order rejection when a modeled account cannot afford the order.'},
    { title:'Partial-fill & cancel scenarios', sub:'Order state transitions', tag:'ENGINE TEST', type:'Golden fixtures', desc:'Validates the LEAN engine’s real partial-fill sequence and cancellation without broker connectivity.'},
  ];
  return <><SectionTitle kicker="STRATEGY WORKSPACE" title="Research strategies." desc="Model experiments and engine fixtures—nothing here is deployed to a brokerage." /><div className="collection-heading"><strong>{methods.length} research modules</strong><SmallTag style="red">NO LIVE STRATEGIES</SmallTag></div><div className="strategy-grid">{methods.map((m,i)=><div className="panel strategy-card" key={m.title}><div className="strategy-card-top"><span className={`strategy-symbol s${i}`}><ChartNoAxesCombined size={21}/></span><MoreHorizontal size={20} className="muted-icon"/></div><h2>{m.title}</h2><p>{m.sub}</p><div className="strategy-divider"/><div className="strategy-desc">{m.desc}</div><div className="strategy-card-bottom"><SmallTag style={i===2?'gold':'neutral'}>{m.tag}</SmallTag><span>{m.type}</span></div></div>)}</div><div className="section-warning"><ShieldAlert size={18}/><span>Strategy activation is unavailable in this dashboard. An independent risk and broker authorization workflow would be required.</span></div></>;
}

function RiskPage() {
  const controls = [
    {name:'Live-capital authorization',detail:'Explicit human authorization has not been granted',status:'BLOCKED',good:false},
    {name:'Broker execution integration',detail:'No authenticated broker connected to this UI',status:'DISABLED',good:false},
    {name:'Independent risk simulation',detail:'7 deterministic synthetic stress scenarios',status:'VERIFIED',good:true},
    {name:'Historical evidence checks',detail:'Source hashes and archived cohort validation',status:'VERIFIED',good:true},
    {name:'Emergency-state durability',detail:'Offline persistence and recovery checks passed',status:'TESTED',good:true},
    {name:'Full LEAN test host',detail:'Intermittent Python.NET GIL issue still open',status:'OPEN ISSUE',good:false},
    {name:'Genuine broker paper evidence',detail:'Sustained independent market sessions required',status:'NOT VERIFIED',good:false},
  ];
  return <><SectionTitle kicker="INDEPENDENT CONTROL" title="Risk comes first." desc="Execution remains locked until every real-capital gate is separately satisfied." /><div className="risk-hero"><span><ShieldAlert size={32}/></span><div><small>CURRENT AUTHORIZATION</small><strong>Capital execution is blocked.</strong><p>Atlas is a research system at this stage. A successful offline test does not grant broker-writing authority.</p></div><span className="blocked-stamp"><LockKeyhole size={16}/> ENFORCED</span></div><div className="panel controls-panel"><div className="panel-heading"><div><div className="heading-kicker">SAFETY REQUIREMENTS</div><h2>Execution readiness checklist</h2></div><SmallTag style="red">NOT LIVE READY</SmallTag></div><div className="control-list">{controls.map(item=><div className="control-row" key={item.name}><span className={item.good?'control-icon good':'control-icon stop'}>{item.good?<CheckCircle2 size={19}/>:<LockKeyhole size={18}/>}</span><div><strong>{item.name}</strong><small>{item.detail}</small></div><SmallTag style={item.good?'mint':'red'}>{item.status}</SmallTag></div>)}</div></div></>;
}

function OrdersPage() {
  return <><SectionTitle kicker="EXECUTION HISTORY" title="Orders & activity." desc="Broker order placement is not available. This interface intentionally never sends trade instructions." /><div className="orders-summary"><div className="panel mini-summary"><span>LIVE BROKER ORDERS</span><strong>0</strong><small>No execution integration configured</small></div><div className="panel mini-summary"><span>BROKER CONNECTION</span><strong className="warning-text">None</strong><small>No brokerage credentials included</small></div><div className="panel mini-summary"><span>EXECUTION STATUS</span><strong className="warning-text">Locked</strong><small>Owner and compliance gates pending</small></div></div><div className="panel empty-orders"><div className="empty-orbit"><LockKeyhole size={31}/></div><h2>No live orders to display</h2><p>This is the public read-only Atlas preview. No live broker connection or real transaction database is attached.</p><SmallTag style="red">REAL-MONEY EXECUTION DISABLED</SmallTag></div></>;
}

function AuditPage() {
  const [copied,setCopied]=useState(false);
  function copy() { void navigator.clipboard?.writeText(snapshot.revision).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500);}); }
  function exportEvidence() {
    downloadFile('atlas-public-research-snapshot.json', JSON.stringify(snapshot,null,2), 'application/json');
  }
  return <><SectionTitle kicker="PROVENANCE & CONTROLS" title="Audit & evidence." desc="Read-only engineering certification, traceable to the Atlas source repository." /><div className="audit-top"><div className="panel audit-card"><div className="heading-kicker">CERTIFIED BUILD</div><div className="audit-main-line"><GitBranch size={23}/><h2>{snapshot.revision}</h2><button className="icon-button" aria-label="Copy revision" title="Copy revision" onClick={copy}>{copied?<Check size={17}/>:<Copy size={17}/>}</button></div><p>Evidence generated {lastCertified} (UTC) using offline certification artifacts.</p><SmallTag style="mint">HASH-BOUND SOURCE</SmallTag></div><div className="panel audit-card"><div className="heading-kicker">TEST COVERAGE</div><div className="audit-main-line"><CheckCircle2 size={25}/><h2>{snapshot.testsPassed}</h2></div><p>Passing Python tests · {snapshot.testsSkippedLocal} database checks skipped in local manifest.</p><SmallTag style="mint">LOCAL PASS</SmallTag></div><div className="panel audit-card"><div className="heading-kicker">ENGINE VERIFICATION</div><div className="audit-main-line"><Activity size={25}/><h2>{snapshot.leanGoldenFixtures} / {snapshot.leanGoldenFixtures}</h2></div><p>Deterministic LEAN golden trading fixtures; not the full upstream test suite.</p><SmallTag style="mint">FIXTURES PASS</SmallTag></div></div><div className="panel audit-detail"><div className="panel-heading"><div><div className="heading-kicker">ARTIFACT TRANSPARENCY</div><h2>What this console does—and doesn't prove</h2></div></div><div className="audit-lines"><div><span><CheckCircle2 size={18}/></span><div><strong>Auditable archived experiments</strong><small>30-session sample replay and three independent historical windows are displayed from the certified research artifacts.</small></div></div><div><span><CheckCircle2 size={18}/></span><div><strong>Local engineering certification</strong><small>Certification manifest counts and source revision are exported as read-only aggregate information.</small></div></div><div><span className="audit-risk"><CircleAlert size={18}/></span><div><strong>No live provider attestation</strong><small>There is no externally authenticated real-market feed, genuine paper-trading track record, or actual customer portfolio on this site.</small></div></div><div><span className="audit-risk"><LockKeyhole size={18}/></span><div><strong>Execution has no route</strong><small>The frontend contains no broker API keys, order-submission API, or live-capital authorization controls.</small></div></div></div><div className="audit-actions"><button className="secondary-button" onClick={exportEvidence}><Download size={17}/> Export safe snapshot</button><a className="secondary-button" href="https://github.com/hajihaz/Atlas" target="_blank" rel="noreferrer">Source repository <ExternalLink size={16}/></a></div></div></>;
}

function SectionTitle({kicker,title,desc}:{kicker:string;title:string;desc:string}) {
  return <div className="sub-page-header"><div className="breadcrumb">ATLAS <ChevronRight size={13}/> {kicker}</div><h1>{title}</h1><p>{desc}</p></div>;
}

export default function App() {
  const [page,setPage]=useState<Page>('overview');
  const [collapsed,setCollapsed]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [notices,setNotices]=useState(false);
  const pages:Record<Page,string> = {overview:'Overview',strategies:'Strategies',research:'Research Lab',risk:'Risk Center',orders:'Orders & Activity',audit:'Audit & Evidence'};
  return <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <Sidebar page={page} setPage={setPage} collapsed={collapsed} toggle={()=>setCollapsed(s=>!s)} mobileOpen={mobileOpen} closeMobile={()=>setMobileOpen(false)}/>
    <div className="app-body"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="Open menu"><Menu size={22}/></button><span className="topbar-context"><span className="topbar-world"><Command size={15}/></span> Atlas Workspace <ChevronRight size={14}/><strong>{pages[page]}</strong></span></div><div className="topbar-right"><span className="topbar-mode"><span className="mode-dot"/> Offline Mode</span><div className="topbar-separator"/><div className="notice-wrap"><button onClick={()=>setNotices(v=>!v)} className="icon-button header-bell" title="System notices" aria-label="System notices"><Bell size={19}/><span className="notification-dot"/></button>{notices&&<div className="notice-popover"><strong>System notification</strong><p>Live-capital execution is locked. Research figures are archived simulations.</p><button onClick={()=>{setPage('risk');setNotices(false);}}>Review safety <ArrowRight size={14}/></button></div>}</div><button className="header-user" onClick={()=>setPage('audit')} title="Audit profile" aria-label="Audit and evidence">A</button></div></header><main className="main-content" key={page}>{page==='overview'?<Overview setPage={setPage}/>:page==='strategies'?<StrategiesPage/>:page==='research'?<ResearchPage/>:page==='risk'?<RiskPage/>:page==='orders'?<OrdersPage/>:<AuditPage/>}<footer className="app-footer"><span>© 2026 ATLAS QUANTITATIVE SYSTEMS</span><div><span className="footer-safety-dot"/> Offline-certified research preview <span className="footer-separator">·</span> No live trading <span className="footer-separator">·</span> Build {snapshot.revision}</div></footer></main></div>
  </div>;
}
