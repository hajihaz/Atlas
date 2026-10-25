import {useEffect,useState} from 'react';
const RECEIPT_KEY='atlas.ipo.test-receipt.v1';
function pendingReceipt(){
 try{const value=JSON.parse(sessionStorage.getItem(RECEIPT_KEY)||'null');
  return value&&/^[a-f0-9]{64}$/.test(value.id)&&typeof value.at==='number'&&
   Date.now()-value.at>=0&&Date.now()-value.at<600000?value.id as string:'';
 }catch{return '';}
}
export default function BackgroundIpoAlerts(){
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const [device,setDevice]=useState<{id:string;pairing:string}|null>(null);
 const [receiptId,setReceiptId]=useState(pendingReceipt);
 const [deadlineAudit,setDeadlineAudit]=useState<{company:string;status:string;createdAt:string}[]|null>(null);
 useEffect(()=>{
  const controller=new AbortController();let loading=false;
  const poll=async()=>{
   if(loading)return;loading=true;
   try{const response=await fetch('/api/ipo-push?audit=deadline',{cache:'no-store',credentials:'omit',signal:controller.signal});
    if(!response.ok)return;
    const data=await response.json();
    if(data?.mode==='OWNER_LOCAL_ONLY'&&Array.isArray(data.deliveries)&&!controller.signal.aborted)
     setDeadlineAudit(data.deliveries.slice(0,3).filter((r:unknown)=>r&&typeof r==='object'&&
      typeof (r as Record<string,unknown>).company==='string'&&typeof (r as Record<string,unknown>).status==='string'));
   }catch{}finally{loading=false;}
  };
  void poll();const timer=setInterval(()=>void poll(),60000);
  return()=>{controller.abort();clearInterval(timer);};
 },[]);
 useEffect(()=>{
  if(!receiptId)return;
  let active=true,loading=false,displayNoted=false;
  const controller=new AbortController();
  const check=async()=>{
   if(loading)return;loading=true;
   try{
    const response=await fetch('/api/ipo-push?receipt='+encodeURIComponent(receiptId),{
     cache:'no-store',credentials:'omit',signal:controller.signal});
    const receipt=await response.json() as {deviceConfirmed?:boolean;browserDisplayed?:boolean;status?:string};
    if(active&&response.ok&&receipt.deviceConfirmed===true&&receipt.status==='device_notification_clicked'){
     setStatus('Test notification clicked on this device. Deadline reminders need fresh IPO data and the Mac sender online.');
     try{sessionStorage.removeItem(RECEIPT_KEY);}catch{}
     setReceiptId('');
    }else if(active&&response.ok&&receipt.browserDisplayed===true&&!displayNoted){
     displayNoted=true;
     setStatus('The browser displayed the test notification. Check Notification Centre and tap it to confirm device interaction.');
    }
   }catch{}finally{loading=false;}
  };
  const timer=setInterval(()=>void check(),5000);
  const expiry=setTimeout(()=>{if(active){setStatus('No device click received yet. Check notification permission and tap the test notification.');setReceiptId('');}},120000);
  return()=>{active=false;controller.abort();clearInterval(timer);clearTimeout(expiry);};
 },[receiptId]);
 async function enable(){
  setBusy(true);setStatus('');
  try{
   if(!('serviceWorker' in navigator)||!('PushManager' in window)||typeof Notification==='undefined')
    throw Error('Background notifications are unavailable in this browser.');
   const response=await fetch('/api/ipo-push',{cache:'no-store',credentials:'omit'});
   if(!response.ok)throw Error('Background sender is not connected on this Atlas address.');
   const config=await response.json() as {supported:boolean;publicKey:string;pairing:string;mode:string};
   if(config.supported!==true||config.mode!=='OWNER_LOCAL_ONLY'||typeof config.pairing!=='string')
    throw Error('Notification setup could not be verified.');
   const permission=await Notification.requestPermission();
   if(permission!=='granted')throw Error('Notification permission is required.');
   const registration=await navigator.serviceWorker.register('/atlas-sw.js?atlas-receipts=4',{
    scope:'/',updateViaCache:'none'});
   await registration.update();
   const worker=registration.installing??registration.waiting??registration.active;
   if(!worker)throw Error('The notification worker is unavailable.');
   if(worker.state!=='activated')await new Promise<void>((resolve,reject)=>{
    const changed=()=>{
     if(worker.state==='activated'){cleanup();resolve();}
     else if(worker.state==='redundant'){cleanup();reject(Error('The notification worker could not activate.'));}
    };
    const timeout=setTimeout(()=>{cleanup();reject(Error('Notification setup timed out. Try connecting again.'));},15000);
    const cleanup=()=>{clearTimeout(timeout);worker.removeEventListener('statechange',changed);};
    worker.addEventListener('statechange',changed);changed();
   });
   await navigator.serviceWorker.ready;
   const bytes=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
   const subscription=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({
    userVisibleOnly:true,applicationServerKey:bytes});
   const saved=await fetch('/api/ipo-push',{method:'POST',credentials:'omit',
    headers:{'Content-Type':'application/json','X-Atlas-Push-Pairing':config.pairing},
    body:JSON.stringify(subscription.toJSON())});
   if(!saved.ok)throw Error('The background sender could not save this device.');
   const result=await saved.json() as {id:string};
   if(!/^[a-f0-9]{64}$/.test(result.id))throw Error('Device registration could not be verified.');
   setDevice({id:result.id,pairing:config.pairing});
   setStatus('Device subscribed. Send a test, then tap its notification to verify delivery.');
  }catch(e){setStatus(e instanceof Error?e.message:'Background setup unavailable.');}
  finally{setBusy(false);}
 }
 async function sendTest(){
  if(!device)return;
  setBusy(true);
  try{
   const response=await fetch('/api/ipo-push',{method:'POST',credentials:'omit',
    headers:{'Content-Type':'application/json','X-Atlas-Push-Pairing':device.pairing},
    body:JSON.stringify({action:'test',id:device.id})});
   const result=await response.json() as {receiptId:string;status:string};
   if(!response.ok||!result.receiptId)throw Error('Test unavailable. Reconnect the device, or wait one minute after the previous test.');
   try{sessionStorage.setItem(RECEIPT_KEY,JSON.stringify({id:result.receiptId,at:Date.now()}));}catch{}
   setReceiptId(result.receiptId);
   setStatus(result.status==='accepted_by_push_service'
    ?'Push service accepted the test. Tap the notification on your device to confirm actual delivery.'
    :'Test delivery is unconfirmed. Check browser and device notification settings.');
  }catch(e){setStatus(e instanceof Error?e.message:'Notification test unavailable.');}
  finally{setBusy(false);}
 }
 return <div className="ipo-background-alerts">
  <button type="button" className="ipo-alert-button" disabled={busy} onClick={()=>void enable()}>{busy?'Connecting…':'Enable background alerts'}</button>
  {device?<button type="button" className="ipo-alert-button" disabled={busy||!!receiptId} onClick={()=>void sendTest()}>Send test notification</button>:null}
  {status?<p role="status" className="ipo-small-notice">{status}</p>:null}
  {deadlineAudit!==null&&<div className="ipo-background-audit"><strong>Real deadline delivery audit</strong>
   {deadlineAudit.length?deadlineAudit.map((r,i)=><p key={i}>{r.company}: {r.status==='device_notification_clicked'?'Notification clicked':r.status==='browser_notification_displayed'?'Browser displayed notification; click not recorded':r.status==='accepted_by_push_service'?'Push service accepted; device receipt pending':'Delivery unconfirmed'}.</p>):<p>No real deadline attempt recorded yet. An eligible issue needs a fresh source, and the Mac sender must be online.</p>}
   <small>Push-service acceptance, browser display and a click are separate stages. Test notifications are excluded.</small>
  </div>}
 </div>;
}
