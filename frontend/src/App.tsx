import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {Activity,Bitcoin,CalendarClock,ChartNoAxesCombined,Clapperboard,Database,Menu,Moon,ShieldCheck,Sun,X} from 'lucide-react';
import CloudPaperPage from './components/CloudPaperPage';
import PaperTestingPage from './components/PaperTestingPage';
import MarketEvidencePage from './components/MarketEvidencePage';
import DataAvailabilityPage from './components/DataAvailabilityPage';
import CryptoPricesPage from './components/CryptoPricesPage';
import MarketReplayPage from './components/MarketReplayPage';
import {ownerSession} from './lib/cloudPaperRead';
import './styles.css';
const IPOIntelligencePage=lazy(()=>import('./components/IPOIntelligencePage'));


type Page='paper'|'markets'|'data'|'replay'|'schedule'|'crypto'|'ipo';
type Theme='light'|'dark';
const choices=[
 {id:'paper',label:'Paper Trading',Icon:Activity},
 {id:'markets',label:'Market Watch',Icon:ChartNoAxesCombined},
 {id:'data',label:'Available Market Data',Icon:Database},
 {id:'replay',label:'Market Replay',Icon:Clapperboard},
 {id:'schedule',label:'Scheduled Orders',Icon:CalendarClock},
 {id:'crypto',label:'Crypto Prices',Icon:Bitcoin},
] as const;
function initialPage():Page{
 const hash=window.location.hash.slice(1);
 return hash==='markets'||hash==='data'||hash==='replay'||hash==='schedule'||hash==='crypto'||hash==='ipo'?hash:'paper';
}
function initialTheme():Theme{
 try{return window.localStorage.getItem('atlas.theme.preference')==='dark'?'dark':'light';}
 catch{return 'light';}
}
export default function App(){
 const [page,setPage]=useState<Page>(initialPage);
 const [theme,setTheme]=useState<Theme>(initialTheme);
 const [mobileOpen,setMobileOpen]=useState(false);
 const [ownerToken,setOwnerToken]=useState('');
 const [ownerConnected,setOwnerConnected]=useState(false);
 const sessionEpoch=useRef(0);
 function updateOwnerConnected(value:boolean){sessionEpoch.current++;setOwnerConnected(value);}
 useEffect(()=>{
  let active=true;
  const check=()=>{const epoch=sessionEpoch.current;void ownerSession('GET').then(ok=>{if(active&&epoch===sessionEpoch.current)setOwnerConnected(ok);}).catch(()=>{/* retain state during a temporary network outage */});};
  const visible=()=>{if(document.visibilityState==='visible')check();};
  check();
  const timer=setInterval(check,6*60*60*1000);
  document.addEventListener('visibilitychange',visible);
  return ()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[]);
 useEffect(()=>{
  document.documentElement.dataset.theme=theme;
  document.documentElement.style.colorScheme=theme;
  try{window.localStorage.setItem('atlas.theme.preference',theme);}catch{/* optional browser preference */}
 },[theme]);
 useEffect(()=>{
  const changed=()=>setPage(initialPage());
  window.addEventListener('hashchange',changed);
  return ()=>window.removeEventListener('hashchange',changed);
 },[]);
 function go(next:Page){
  window.history.replaceState(null,'','#'+next);
  setPage(next);setMobileOpen(false);window.scrollTo({top:0,behavior:'auto'});
 }
 return <div className={'app-shell atlas-simple-shell '+(mobileOpen?'mobile-open':'')}>
  {mobileOpen&&<button className="mobile-backdrop" type="button" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}/>}
  <aside className={'sidebar atlas-simple-sidebar '+(mobileOpen?'mobile-open':'')}>
   <div className="brand-section"><button type="button" className="brand" onClick={()=>go('paper')} aria-label="Atlas paper trading home">
    <span className="brand-mark"><svg viewBox="0 0 42 42" fill="none" aria-hidden="true"><path d="M21 4 39 36H3L21 4Z" stroke="currentColor" strokeWidth="3"/><path d="M14 26h14M21 12v14" stroke="currentColor" strokeWidth="2.4"/></svg></span>
    <span className="brand-copy"><strong>ATLAS<span className="brand-dot">.</span></strong><small>PAPER TRADING</small></span>
   </button></div>
   <nav className="nav-links atlas-simple-nav" aria-label="Main navigation">
    {choices.map(({id,label,Icon})=><button type="button" key={id} className={'nav-link '+(page===id?'active':'')} aria-current={page===id?'page':undefined} onClick={()=>go(id)}>
     <Icon size={19}/><span>{label}</span>
    </button>)}
   </nav>
   <div className="sidebar-footer"><div className="sidebar-system-card"><span className="status-led"/><div><strong>Paper only</strong><span>Real orders disabled</span></div><ShieldCheck size={17}/></div></div>
  </aside>
  <div className="app-body">
   <header className="topbar"><div className="topbar-left">
    <button className="icon-button mobile-menu" type="button" aria-label="Open menu" onClick={()=>setMobileOpen(true)}><Menu size={22}/></button>
    <strong>{choices.find(x=>x.id===page)?.label??'IPO Research'}</strong>
   </div><div className="topbar-right"><span className="topbar-mode"><span className="mode-dot"/> PAPER ONLY</span>
    <button type="button" className="icon-button theme-toggle" aria-label={theme==='light'?'Switch to dark theme':'Switch to light theme'} onClick={()=>setTheme(v=>v==='light'?'dark':'light')}>{theme==='light'?<Moon size={18}/>:<Sun size={18}/>}</button>
    {mobileOpen&&<button type="button" className="icon-button" aria-label="Close menu" onClick={()=>setMobileOpen(false)}><X size={18}/></button>}
   </div></header>
   <main className="main-content premium-page-view">
    {page==='paper'?<PaperTestingPage ownerToken={ownerToken} setOwnerToken={setOwnerToken} ownerConnected={ownerConnected} setOwnerConnected={updateOwnerConnected} goMarket={()=>go('markets')} goReplay={()=>go('replay')} goSchedule={()=>go('schedule')}/>:
     page==='markets'?<MarketEvidencePage ownerConnected={ownerConnected} goPaper={()=>go('paper')}/>:
     page==='data'?<DataAvailabilityPage ownerConnected={ownerConnected} goPaper={()=>go('paper')}/>:
     page==='replay'?<MarketReplayPage ownerConnected={ownerConnected} goPaper={()=>go('paper')}/>:
     page==='schedule'?<CloudPaperPage initialToken={ownerToken} setOwnerToken={setOwnerToken} ownerConnected={ownerConnected} setOwnerConnected={updateOwnerConnected}/>:
     page==='crypto'?<CryptoPricesPage/>:
     <Suspense fallback={<div className="panel" role="status">Loading IPO research…</div>}><IPOIntelligencePage/></Suspense>}
    <footer className="app-footer"><span>© 2026 ATLAS</span><div>₹ virtual capital · Source-qualified evidence · Real broker orders disabled · <button type="button" className="atlas-footer-link" onClick={()=>go('ipo')}>IPO research</button></div></footer>
   </main>
  </div>
 </div>;
}
