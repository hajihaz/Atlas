import { useEffect, useState } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, Bell, ChartNoAxesCombined,
  ChevronLeft, ChevronRight, CircleAlert, Clock3, Command, FileClock,
  History, Layers3, LayoutDashboard, LockKeyhole, Menu, Moon,
  MoreHorizontal, ShieldCheck, Sun, X, BarChart3, BookOpenText,
} from 'lucide-react';
import RealMarketPage from './components/RealMarketPage';
import LiveLabPage from './components/LiveLabPage';

type Page='live'|'overview'|'markets'|'strategies'|'research'|'scalpstorm'|'risk'|'orders'|'audit';
type Theme='light'|'dark';
const THEME_KEY='atlas.theme.preference';
function initialTheme():Theme{
  try{return window.localStorage.getItem(THEME_KEY)==='dark'?'dark':'light';}
  catch{return 'light';}
}
const nav=[
  {id:'live',title:'Live Paper Lab',Icon:Activity},
  {id:'overview',title:'Overview',Icon:LayoutDashboard},
  {id:'markets',title:'Market Watch',Icon:ChartNoAxesCombined},
  {id:'strategies',title:'Strategies',Icon:Layers3},
  {id:'research',title:'Research Lab',Icon:BookOpenText},
  {id:'scalpstorm',title:'ScalpStorm X',Icon:BarChart3},
  {id:'risk',title:'Risk Center',Icon:ShieldCheck},
  {id:'orders',title:'Orders & Activity',Icon:History},
  {id:'audit',title:'Audit & Evidence',Icon:FileClock},
] as const;
const facts=[
  {title:'Live-capital authorization',status:'BLOCKED',text:'Owner/compliance authorisation has not been granted.'},
  {title:'Authenticated NSE market data',status:'NOT CONNECTED',text:'Broker-owned credentials and licensed data access are required.'},
  {title:'Paper-trading ledger',status:'NOT VERIFIED',text:'No reconciled simulated orders or independently verified trade records.'},
  {title:'Crypto public references',status:'INDICATIVE',text:'Direct INR provider observations, not guaranteed executable prices.'},
  {title:'Independent execution gate',status:'BLOCKED',text:'This public frontend cannot place orders or enable real trading.'},
];
function SimplePage({page,go}:{page:Exclude<Page,'overview'|'markets'|'live'>;go:(next:Page)=>void}){
  const data={
    strategies:{heading:'Strategies',desc:'Strategies require verified market data, reproducible results and risk approval.',title:'No verified live strategy results',
      detail:'Historical LEAN sample returns and illustrative portfolio simulations are no longer displayed as real performance.'},
    research:{heading:'Research Lab',desc:'Build research on market evidence, not archived example profits.',title:'Awaiting validated INR trading datasets',
      detail:'Point-in-time exchange data, source timestamps, a reproducible stock universe and an auditable paper ledger are required before returns can be shown.'},
    scalpstorm:{heading:'ScalpStorm X',desc:'Paper-trading research, without fabricated stock positions.',title:'Stock trading results not verified',
      detail:'Top-volume NSE stocks, exact entries and exits, margins, fees, profits and losses cannot be displayed as completed trades until source-matched real historical data and a reconciled ledger exist.'},
    risk:{heading:'Risk Center',desc:'Independent controls stay locked until verified.',title:'Trading authority remains blocked',
      detail:'No public-facing controls can place or authorize an order. A live execution permit requires separate owner review, broker integration and risk certification.'},
    orders:{heading:'Orders & Activity',desc:'Only actual or independently reconciled trading records belong here.',title:'No broker order records connected',
      detail:'An unavailable order history is not the same as zero executed orders. No authenticated broker account, statements or paper-trading ledger are connected.'},
    audit:{heading:'Audit & Evidence',desc:'Only verifiable current status; no outdated static test counts.',title:'Engineering evidence remains on GitHub',
      detail:'The previous static dashboard embedded older archived samples, old revision IDs and stale test totals. They have been removed from the active financial display. Review CI results and commit hashes directly at source.'},
  }[page];
  return <section className="real-empty-page">
    <div className="sub-page-header"><div className="breadcrumb">ATLAS <ChevronRight size={13}/> {data.heading.toUpperCase()}</div>
      <h1>{data.heading}</h1><p>{data.desc}</p></div>
    <div className="real-message"><LockKeyhole size={20}/><span><strong>Only verified data.</strong> No dollar examples, invented returns or placeholder trading profits are published here.</span></div>
    <div className="panel real-empty-card">
      <div className="real-empty-icon"><Activity size={27}/></div>
      <h2>{data.title}</h2><p>{data.detail}</p>
      <div className="real-empty-buttons">
        <button className="primary-button" type="button" onClick={()=>go('markets')}>Check market data <ArrowRight size={16}/></button>
        {page!=='risk'&&<button className="secondary-button" type="button" onClick={()=>go('risk')}>View risk controls <ShieldCheck size={16}/></button>}
      </div>
    </div>
    {page==='risk'?<div className="panel real-readiness">
      <h2>Execution readiness</h2>
      {facts.map(item=><div className="real-readiness-row" key={item.title}><div><strong>{item.title}</strong><p>{item.text}</p></div><span>{item.status}</span></div>)}
    </div>:<div className="panel real-evidence">
      <h2>Next verified milestone</h2>
      <p>Connect a legally authorized NSE quote source and validate point-in-time market data. Paper orders need separately approved risk checks, a simulated matching engine and an auditable persistent ledger.</p>
      {page==='audit'&&<a href="https://github.com/hajihaz/Atlas/actions" target="_blank" rel="noopener noreferrer" className="secondary-button">
        Review source CI evidence <ArrowUpRight size={16}/>
      </a>}
    </div>}
  </section>;
}
export default function App(){
  const [page,setPage]=useState<Page>(window.location.hash==='#scalpstorm'?'scalpstorm':'live');
  const [collapsed,setCollapsed]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [notices,setNotices]=useState(false);
  const [theme,setTheme]=useState<Theme>(initialTheme);
  useEffect(()=>{
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme=theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#f7f9fc':'#090f17');
    try{window.localStorage.setItem(THEME_KEY, theme);}catch{/* restricted browser storage */}
  },[theme]);
  function go(next:Page){setPage(next);setMobileOpen(false);setNotices(false);window.scrollTo({top:0,behavior:'auto'});}
  const label=nav.find(item=>item.id===page)?.title??'Overview';
  return <div className={'app-shell '+(collapsed?'sidebar-collapsed':'')}>
    {mobileOpen&&<button type="button" className="mobile-backdrop" onClick={()=>setMobileOpen(false)} aria-label="Close navigation"/>}
    <aside className={'sidebar '+(collapsed?'collapsed ':'')+(mobileOpen?'mobile-open':'')}>
      <div className="brand-section"><button className="brand" onClick={()=>go('overview')} aria-label="Atlas overview" type="button">
        <span className="brand-mark"><svg viewBox="0 0 42 42" fill="none" aria-hidden="true"><path d="M21 4 39 36H3L21 4Z" stroke="currentColor" strokeWidth="3"/><path d="M14 26h14M21 12v14" stroke="currentColor" strokeWidth="2.4"/></svg></span>
        {!collapsed&&<span className="brand-copy"><strong>ATLAS<span className="brand-dot">.</span></strong><small>QUANTITATIVE SYSTEMS</small></span>}
      </button><button className="collapse-button" onClick={()=>setCollapsed(v=>!v)} aria-label="Toggle sidebar" type="button"><ChevronLeft size={18}/></button></div>
      <div className="sidebar-inner"><div className="nav-section-name">{!collapsed?'WORKSPACE':'•••'}</div>
        <nav className="nav-links" aria-label="Main navigation">{nav.map(({id,title,Icon})=>
          <button key={id} type="button" title={title} className={'nav-link '+(page===id?'active':'')}
            onClick={()=>go(id)} aria-current={page===id?'page':undefined}><Icon size={19}/>
            {!collapsed&&<span>{title}</span>}{!collapsed&&page===id&&<span className="active-indicator"/>}
          </button>)}</nav>
        <button className="nav-link safety-side" title="Capital execution locked" type="button" onClick={()=>go('risk')}><LockKeyhole size={18}/>{!collapsed&&<span>Capital locked</span>}</button>
      </div>
      <div className="sidebar-footer">{!collapsed&&<div className="sidebar-system-card"><span className="status-led"/><div><strong>Public read-only</strong><span>Real INR references only</span></div><ShieldCheck size={17}/></div>}
        <button className="account-entry" type="button" onClick={()=>go('audit')}><span className="user-avatar">A</span>{!collapsed&&<span className="account-name"><strong>Atlas Console</strong><small>Market observations</small></span>}<MoreHorizontal size={17}/></button>
      </div>
    </aside>
    <div className="app-body"><header className="topbar">
      <div className="topbar-left"><button className="icon-button mobile-menu" type="button" onClick={()=>setMobileOpen(true)} aria-label="Open menu"><Menu size={22}/></button>
        <span className="topbar-context"><span className="topbar-world"><Command size={15}/></span><span className="workspace-label">Atlas Workspace</span><ChevronRight size={14}/><strong>{label}</strong></span></div>
      <div className="topbar-right"><button type="button" className="icon-button theme-toggle" aria-label={theme === 'light'?'Switch to dark theme':'Switch to light theme'} aria-pressed={theme === 'dark'} onClick={()=>setTheme(v=>v==='light'?'dark':'light')}>{theme==='light'?<Moon size={18}/>:<Sun size={18}/>}</button>
        <span className="topbar-mode"><span className="mode-dot"/> Read-only INR</span><div className="topbar-separator"/>
        <div className="notice-wrap"><button type="button" className="icon-button header-bell" onClick={()=>setNotices(v=>!v)} aria-label="System notices"><Bell size={18}/><span className="notification-dot"/></button>
        {notices&&<div className="notice-popover"><strong>Atlas safety notice</strong><p>Real trades and stock market quotes are unverified. Public crypto references are indicative only. Live trading remains locked.</p><button type="button" onClick={()=>go('risk')}>Review safety <ArrowRight size={15}/></button></div>}</div>
        <button type="button" className="header-user" onClick={()=>go('audit')} aria-label="Audit and evidence">A</button>
      </div>
    </header><main className="main-content premium-page-view" key={page}>
      {page==='live'?<LiveLabPage goStrategies={()=>go('strategies')} goMarkets={()=>go('markets')} goScalpStorm={()=>go('scalpstorm')}/>:
       page==='overview'?<RealMarketPage variant="overview" onNavigate={v=>go(v)}/>:
        page==='markets'?<RealMarketPage variant="markets"/>:<SimplePage page={page} go={go}/>}
      <footer className="app-footer"><span>© 2026 ATLAS QUANTITATIVE SYSTEMS</span><div><span className="footer-safety-dot"/> All financial amounts in ₹ <span className="footer-separator">·</span> No verified broker portfolio <span className="footer-separator">·</span> Live trading blocked</div></footer>
    </main></div>
  </div>;
}
