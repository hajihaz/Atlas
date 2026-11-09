import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, Bell, ChartNoAxesCombined,
  ChevronLeft, ChevronRight, CircleAlert, Clock3, Command, FileClock,
  History, Layers3, LayoutDashboard, LockKeyhole, Menu, Moon,
  MoreHorizontal, ShieldCheck, Sun, X, BarChart3, BookOpenText, TrendingUp,
} from 'lucide-react';
import {usePaperTrials} from './lib/usePaperTrials';
// Pages load on demand so the initial bundle only carries the shell (ADR-0070 keeps all of them).
const RealMarketPage = lazy(() => import('./components/RealMarketPage'));
const StrategyLabPage = lazy(() => import('./components/StrategyLabPage'));
const DebateXPage = lazy(() => import('./components/DebateXPage'));
const StockWatchPage = lazy(() => import('./components/StockWatchPage'));
const PaperTrialsPage = lazy(() => import('./components/PaperTrialsPage'));
const RiskAuditPage = lazy(() => import('./components/RiskAuditPage'));
const LiveLabPage = lazy(() => import('./components/LiveLabPage'));
const OwnerStrategyPage = lazy(() => import('./components/OwnerStrategyPage'));
const OwnerEvidencePage = lazy(() => import('./components/OwnerEvidencePage'));
const IPOIntelligencePage = lazy(() => import('./components/IPOIntelligencePage'));

type Page='live'|'overview'|'ipo'|'markets'|'nse'|'strategies'|'research'|'scalpstorm'|'debate'|'trials'|'strategyrisk'|'risk'|'orders'|'audit';
type Theme='light'|'dark';
const THEME_KEY='atlas.theme.preference';
const HASH_BY_PAGE:Record<Page,string>={
  live:'#live',overview:'#overview',ipo:'#ipo',markets:'#markets',nse:'#nse-paper',strategies:'#strategies',
  research:'#research',scalpstorm:'#scalpstorm',debate:'#debate-x',trials:'#trials',strategyrisk:'#strategy-risk',
  risk:'#risk',orders:'#orders',audit:'#audit',
};
function pageFromHash(hash:string):Page{
  const found=(Object.keys(HASH_BY_PAGE) as Page[]).find(key=>HASH_BY_PAGE[key]===hash);
  return found??'overview';
}
function initialTheme():Theme{
  try{return window.localStorage.getItem(THEME_KEY)==='dark'?'dark':'light';}
  catch{return 'light';}
}
// ScalpStorm X is the flagship (ADR-0070); the five approved strategies, Debate X and
// the browser paper trials remain first-class. Removing any entry needs a new ADR.
const nav=[
  {id:'live',title:'Live Paper Lab',Icon:Activity},
  {id:'overview',title:'Overview',Icon:LayoutDashboard},
  {id:'scalpstorm',title:'ScalpStorm X',Icon:BarChart3},
  {id:'markets',title:'Market Watch',Icon:ChartNoAxesCombined},
  {id:'ipo',title:'IPO Intelligence',Icon:TrendingUp},
  {id:'strategies',title:'Strategies',Icon:Layers3},
  {id:'research',title:'Research Lab',Icon:BookOpenText},
  {id:'debate',title:'Debate X',Icon:BookOpenText},
  {id:'trials',title:'Paper Trials',Icon:History},
  {id:'orders',title:'Paper Journal',Icon:History},
  {id:'strategyrisk',title:'Strategy Risk',Icon:ShieldCheck},
  {id:'risk',title:'Risk & Sources',Icon:ShieldCheck},
  {id:'audit',title:'Audit & Evidence',Icon:FileClock},
] as const;
export default function App(){
  const paper=usePaperTrials();
  const [page,setPage]=useState<Page>(()=>pageFromHash(window.location.hash));
  const [collapsed,setCollapsed]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [mobileViewport,setMobileViewport]=useState(()=>window.matchMedia('(max-width:800px)').matches);
  const [notices,setNotices]=useState(false);
  const [theme,setTheme]=useState<Theme>(initialTheme);
  useEffect(()=>{
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme=theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#f7f9fc':'#090f17');
    try{window.localStorage.setItem(THEME_KEY, theme);}catch{/* restricted browser storage */}
  },[theme]);
  useEffect(()=>{
    // Notification clicks can navigate an existing client without remounting it.
    const updateFromHash=()=>{
      setPage(pageFromHash(window.location.hash));
      setMobileOpen(false);setNotices(false);
      window.scrollTo({top:0,behavior:'auto'});
      requestAnimationFrame(()=>document.getElementById('atlas-main')?.focus());
    };
    window.addEventListener('hashchange',updateFromHash);
    return ()=>window.removeEventListener('hashchange',updateFromHash);
  },[]);
  function focusMenu(){document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus();}
  function closeMenu(){setMobileOpen(false);requestAnimationFrame(focusMenu);}
  useEffect(()=>{
    const media=window.matchMedia('(max-width:800px)');
    const update=()=>{setMobileViewport(media.matches);if(!media.matches)setMobileOpen(false);};
    media.addEventListener('change',update);
    return ()=>media.removeEventListener('change',update);
  },[]);
  useEffect(()=>{
    if(!mobileViewport||!mobileOpen)return;
    const panel=document.getElementById('atlas-sidebar');
    requestAnimationFrame(()=>panel?.querySelector<HTMLButtonElement>('.collapse-button')?.focus());
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();closeMenu();return;}
      if(event.key!=='Tab'||!panel)return;
      const items=Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"]'))
        .filter(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden');
      const first=items[0],last=items.at(-1);
      if(!first||!last)return;
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',keydown);
    return ()=>document.removeEventListener('keydown',keydown);
  },[mobileViewport,mobileOpen]);
  function go(next:Page){
    const hash=HASH_BY_PAGE[next];
    window.history.replaceState(null,'',window.location.pathname+window.location.search+hash);
    setPage(next);setMobileOpen(false);setNotices(false);
    window.scrollTo({top:0,behavior:'auto'});
    requestAnimationFrame(()=>document.getElementById('atlas-main')?.focus());
  }
  const label=nav.find(item=>item.id===page)?.title??'Overview';
  return <div className={'app-shell '+(collapsed?'sidebar-collapsed':'')}>
    <a className="atlas-skip-link" href="#atlas-main" inert={mobileViewport&&mobileOpen} onClick={event=>{event.preventDefault();document.getElementById('atlas-main')?.focus();}}>Skip to main content</a>
    {mobileOpen&&<button type="button" className="mobile-backdrop" tabIndex={-1} aria-hidden="true" onClick={closeMenu} aria-label="Close navigation"/>}
    <aside id="atlas-sidebar" className={'sidebar '+(collapsed?'collapsed ':'')+(mobileOpen?'mobile-open':'')}
      inert={mobileViewport&&!mobileOpen} aria-hidden={mobileViewport&&!mobileOpen?true:undefined}
      role={mobileViewport&&mobileOpen?'dialog':undefined} aria-modal={mobileViewport&&mobileOpen?true:undefined}
      aria-label="Workspace navigation">
      <div className="brand-section"><button className="brand" onClick={()=>go('overview')} aria-label="ATLAS. QUANTITATIVE SYSTEMS overview" type="button">
        <span className="brand-mark"><svg viewBox="0 0 42 42" fill="none" aria-hidden="true"><path d="M21 4 39 36H3L21 4Z" stroke="currentColor" strokeWidth="3"/><path d="M14 26h14M21 12v14" stroke="currentColor" strokeWidth="2.4"/></svg></span>
        {!collapsed&&<span className="brand-copy"><strong>ATLAS<span className="brand-dot">.</span></strong><small>QUANTITATIVE SYSTEMS</small></span>}
      </button><button className="collapse-button" onClick={()=>mobileViewport?closeMenu():setCollapsed(v=>!v)} aria-label={mobileViewport?'Close menu':'Toggle sidebar'} type="button"><ChevronLeft size={18}/></button></div>
      <div className="sidebar-inner"><div className="nav-section-name">{!collapsed?'WORKSPACE':'•••'}</div>
        <nav className="nav-links" aria-label="Main navigation">{nav.map(({id,title,Icon})=>
          <button key={id} type="button" title={title} className={'nav-link '+(page===id?'active':'')}
            onClick={()=>go(id)} aria-current={page===id?'page':undefined}><Icon size={19}/>
            {!collapsed&&<span>{title}</span>}{!collapsed&&page===id&&<span className="active-indicator"/>}
          </button>)}</nav>
        <button className="nav-link safety-side" title="Capital execution locked" type="button" onClick={()=>go('risk')}><LockKeyhole size={18}/>{!collapsed&&<span>Capital locked</span>}</button>
      </div>
      <div className="sidebar-footer">{!collapsed&&<div className="sidebar-system-card"><span className="status-led"/><div><strong>Paper trading</strong><span>Source-observed INR data</span></div><ShieldCheck size={17}/></div>}
        <button className="account-entry" type="button" onClick={()=>go('audit')}><span className="user-avatar">A</span>{!collapsed&&<span className="account-name"><strong>Atlas Console</strong><small>Market observations</small></span>}<MoreHorizontal size={17}/></button>
      </div>
    </aside>
    <div className="app-body" inert={mobileViewport&&mobileOpen}><header className="topbar">
      <div className="topbar-left"><button className="icon-button mobile-menu" type="button" onClick={()=>setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen} aria-controls="atlas-sidebar"><Menu size={22}/></button>
        <span className="topbar-context"><span className="topbar-world"><Command size={15}/></span><span className="workspace-label">Atlas Workspace</span><ChevronRight size={14}/><strong>{label}</strong></span></div>
      <div className="topbar-right"><button type="button" className="icon-button theme-toggle" aria-label={theme === 'light'?'Switch to dark theme':'Switch to light theme'} aria-pressed={theme === 'dark'} onClick={()=>setTheme(v=>v==='light'?'dark':'light')}>{theme==='light'?<Moon size={18}/>:<Sun size={18}/>}</button>
        <span className="topbar-mode"><span className="mode-dot"/> Read-only INR</span><div className="topbar-separator"/>
        <div className="notice-wrap"><button type="button" className="icon-button header-bell" onClick={()=>setNotices(v=>!v)} aria-label="System notices"><Bell size={18}/><span className="notification-dot"/></button>
        {notices&&<div className="notice-popover"><strong>Atlas safety notice</strong><p>ScalpStorm X uses an owner-local paper account. Financial results require source observations and recorded fills. Broker orders remain disabled.</p><button type="button" onClick={()=>go('risk')}>Review safety <ArrowRight size={15}/></button></div>}</div>
        <button type="button" className="header-user" onClick={()=>go('audit')} aria-label="A — Audit and evidence"><span aria-hidden="true">A</span></button>
      </div>
    </header><main id="atlas-main" tabIndex={-1} className="main-content premium-page-view" key={page}>
      <Suspense fallback={<div role="status" className="panel market-loading">Loading…</div>}>
      {page==='live'?<Suspense fallback={<div role="status" className="panel market-loading">Checking live INR sources…</div>}><LiveLabPage goStrategies={()=>go('strategies')} goMarkets={()=>go('markets')} goScalpStorm={()=>go('scalpstorm')}/></Suspense>:
        page==='overview'?<RealMarketPage variant="overview" paperGroup={paper.group} onNavigate={v=>go(v)}/>:
        page==='ipo'?<Suspense fallback={<div className='panel market-loading' role='status'>Loading IPO research…</div>}><IPOIntelligencePage/></Suspense>:
        page==='markets'?<StockWatchPage theme={theme} goResearch={()=>go('strategies')}/>:
        page==='debate'?<DebateXPage/>:
        page==='strategies'||page==='research'?<StrategyLabPage mode={page} goRisk={()=>go('strategyrisk')}/>:
        page==='trials'?<PaperTrialsPage group={paper.group} statusMessage={paper.providerMessage}
          start={paper.start} pause={paper.pause} resume={paper.resume} clear={paper.clear}
          goStrategies={()=>go('strategies')}/>:
        page==='strategyrisk'?<RiskAuditPage mode="risk" group={paper.group}
          openPaper={()=>go('trials')} openResearch={()=>go('strategies')}/>:
        page==='risk'||page==='audit'?<Suspense fallback={<div role="status" className="panel market-loading">Reading account evidence…</div>}><OwnerEvidencePage/></Suspense>:
        // scalpstorm (flagship), orders (Paper Journal) and nse: the owner 09:40 paper desk.
        page==='scalpstorm'||page==='orders'||page==='nse'?<Suspense fallback={<div role="status" className="panel market-loading">Reading ScalpStorm X…</div>}><OwnerStrategyPage/></Suspense>:
        <RealMarketPage variant="overview" paperGroup={paper.group} onNavigate={v=>go(v)}/>}
      </Suspense>

      <footer className="app-footer"><span>© 2026 ATLAS QUANTITATIVE SYSTEMS</span><div><span className="footer-safety-dot"/> All financial amounts in ₹ <span className="footer-separator">·</span> Owner-local paper account <span className="footer-separator">·</span> Broker orders disabled</div></footer>
    </main></div>
  </div>;
}
