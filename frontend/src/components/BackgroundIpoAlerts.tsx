import {useState} from 'react';
export default function BackgroundIpoAlerts(){
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 async function enable(){
  setBusy(true);setStatus('');
  try{
   if(!('serviceWorker' in navigator)||!('PushManager' in window)||typeof Notification==='undefined')
    throw Error('Background notifications are unavailable in this browser.');
   const response=await fetch('/api/ipo-push',{cache:'no-store',credentials:'omit'});
   if(!response.ok)throw Error('Background sender is not connected on this Atlas address.');
   const config=await response.json() as {supported:boolean;publicKey:string;pairing:string;mode:string};
   if(config.supported!==true||config.mode!=='OWNER_LOCAL_ONLY'||typeof config.pairing!=='string')throw Error('Notification setup could not be verified.');
   const permission=await Notification.requestPermission();
   if(permission!=='granted')throw Error('Notification permission is required.');
   const registration=await navigator.serviceWorker.register('/atlas-sw.js',{scope:'/'});
   await navigator.serviceWorker.ready;
   const bytes=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
   const subscription=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
   const saved=await fetch('/api/ipo-push',{method:'POST',credentials:'omit',
    headers:{'Content-Type':'application/json','X-Atlas-Push-Pairing':config.pairing},
    body:JSON.stringify(subscription.toJSON())});
   if(!saved.ok)throw Error('The background sender could not save this device.');
   setStatus('Device subscribed. Delivery needs the Mac sender online and fresh verified IPO details.');
  }catch(e){setStatus(e instanceof Error?e.message:'Background setup unavailable.');}
  finally{setBusy(false);}
 }
 return <div className="ipo-background-alerts">
  <button type="button" className="ipo-alert-button" disabled={busy} onClick={()=>void enable()}>{busy?'Connecting…':'Enable background alerts'}</button>
  {status?<p role="status" className="ipo-small-notice">{status}</p>:null}
 </div>;
}
