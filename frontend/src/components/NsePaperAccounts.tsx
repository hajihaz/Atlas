import {useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';

const names:Record<string,string> = {
  scalpstorm_x:'ScalpStorm X', scalpstorm_x2:'ScalpStorm X2', scalpstorm_x3:'ScalpStorm X3',
  scalpstorm_xtreme:'ScalpStorm Xtreme', vwap_precision:'VWAP Precision',
  rsi2_snapback:'RSI-2 Snapback', dual_momentum_rotation:'Dual Momentum Rotation',
};
type Account = {strategyId:string; paperFills:number; positionCount:number; pendingCount:number;
  realizedPnlINR:number; updatedAt:number};
const stamp = (time:number) => new Date(time).toLocaleString('en-IN',{
  timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false,
})+' IST';
const money = new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'});
const count = (n:number) => Number.isSafeInteger(n) && n>=0;
function readAccounts(data:{schema?:string; paperOnly?:boolean; realOrdersEnabled?:boolean; accounts?:Account[]}):Account[] {
  const rows=data?.accounts;
  if(data?.schema!=='atlas.seven-paper-accounts.v1' || data.paperOnly!==true || data.realOrdersEnabled!==false ||
    !Array.isArray(rows) || rows.length!==7 || rows.some(a=>!a || !Object.hasOwn(names,a.strategyId) ||
      !count(a.paperFills) || !count(a.positionCount) || !count(a.pendingCount) ||
      !Number.isFinite(a.realizedPnlINR) || !Number.isSafeInteger(a.updatedAt) || !a.updatedAt ||
      a.updatedAt>Date.now()+60000) || new Set(rows.map(a=>a.strategyId)).size!==rows.length)
    throw Error('The private ledger response could not be verified.');
  return Object.keys(names).map(id=>rows.find(row=>row.strategyId===id)!);
}

export default function NsePaperAccounts(){
  const [rows,setRows]=useState<Account[]>([]);
  const [locked,setLocked]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[readAt,setReadAt]=useState(0),[generation,refresh]=useState(0);
  const keyField=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    const controller=new AbortController();
    let running=false;
    async function load(){
      if(running)return;
      running=true;
      try {
        const res=await fetch('/api/cloud-paper?action=seven-accounts',{cache:'no-store',credentials:'same-origin',
          signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});
        if(controller.signal.aborted)return;
        if(res.status===401){setRows([]);setLocked(true);return;}
        if(!res.ok)throw Error('Private ledger unavailable.');
        const verified=readAccounts(await res.json());
        if(!controller.signal.aborted){setRows(verified);setReadAt(Date.now());setLocked(false);setError('');}
      }catch(e){if(!controller.signal.aborted){setRows([]);setError(e instanceof Error?e.message:'Private ledger unavailable.');}}
      finally{running=false;}
    }
    void load();
    const timer=setInterval(()=>{if(!document.hidden)void load();},60000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[generation]);

  async function session(event?:FormEvent){
    event?.preventDefault();
    const login=Boolean(event);
    const secret=keyField.current?.value??'';
    if(keyField.current)keyField.current.value='';
    setBusy(true);setError('');
    try {
      const response=await fetch('/api/cloud-paper?action=session',{method:login?'POST':'DELETE',cache:'no-store',
        credentials:'same-origin',signal:AbortSignal.timeout(12000),
        ...(login?{headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:'{}'}:{})});
      if(!response.ok)throw Error(login?'Owner sign-in failed.':'Sign-out could not be confirmed.');
      setRows([]);setReadAt(0);setLocked(!login);refresh(v=>v+1);
    }catch(e){setError(e instanceof Error?e.message:'Session unavailable.');}
    finally{setBusy(false);}
  }
  return <section className="panel paper-forward-ledger" aria-label="Private NSE paper ledger">
    <div className="research-detail-title"><h2>NSE paper accounts</h2>
    {rows.length>0&&<button className="secondary-button" disabled={busy} onClick={()=>void session()}>Sign out</button>}</div>
    {error&&<p role="alert">{error}</p>}
    {locked?<form onSubmit={session}><label htmlFor="nse-owner-key">Owner recovery key</label>{' '}
      <input ref={keyField} id="nse-owner-key" type="password" autoComplete="off" required minLength={32} maxLength={256}/>{' '}
      <button className="primary-button" disabled={busy}>Open private ledger</button></form>:
    rows.length>0?<><p>Cloud ledger checked {stamp(readAt)}. All amounts are virtual.</p>
    <div className="research-trade-scroll"><table><thead><tr><th>Strategy</th><th>Fills</th><th>Open positions</th>
      <th>Pending</th><th>Realized P&amp;L</th><th>Last account change</th></tr></thead>
      <tbody>{rows.map(a=><tr key={a.strategyId}><td>{names[a.strategyId]}</td><td>{a.paperFills}</td>
        <td>{a.positionCount}</td><td>{a.pendingCount}</td><td>{money.format(a.realizedPnlINR)}</td>
        <td>{stamp(a.updatedAt)}</td></tr>)}</tbody></table></div></>:
    !error&&<p role="status">Reading the private ledger…</p>}
  </section>;
}
