/* Atlas independent free-tier cloud paper worker. NEVER routes real orders. */
const MAX_DELAY=90000,MAX_STALENESS=15000,CAPITAL=10000000;
const SYMBOL=/^[A-Z][A-Z0-9&-]{0,29}$/;
const IST_FORMATTER = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const reply=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const row=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const rows=(db,sql,...args)=>db.prepare(sql).bind(...args).all().then(r=>r.results);
const log=(db,now,type,message)=>db.prepare('INSERT INTO events(observed_ms,type,message) VALUES(?,?,?)').bind(now,type,message.slice(0,290));
const dateStr=ms=>new Date(ms).toISOString();
function ist(ms){const parts=Object.fromEntries(IST_FORMATTER.formatToParts(ms).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return {day:`${parts.year}-${parts.month}-${parts.day}`,minute:Number(parts.hour)*60+Number(parts.minute),weekday:!['Sat','Sun'].includes(parts.weekday)};}
function session(ms){const x=ist(ms);return x.weekday&&x.minute>=555&&x.minute<930;}
function parseDate(text){if(typeof text!=='string'||!/^\d{4}-\d\d-\d\dT/.test(text)||!/(Z|[+-]\d\d:\d\d)$/.test(text))throw Error('timezone required');const x=Date.parse(text);if(!Number.isFinite(x))throw Error('invalid timestamp');return x;}
function authorized(req,token){if(typeof token!=='string'||token.length<32)return false;const a=new TextEncoder().encode(req.headers.get('Authorization')||''),b=new TextEncoder().encode('Bearer '+token);if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a[i]^b[i];return n===0;}
async function readBody(req){if(req.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('JSON content-type required');const text=await req.text();if(text.length>2000000)throw Error('body too large');const payload=JSON.parse(text);if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('invalid JSON object');return payload;}
function fresh(q,now){return q&&q.exchange_open===1&&session(now)&&q.observed_ms<=now+2000&&now-q.observed_ms<=MAX_STALENESS;}
const quote=(db,s,now)=>row(db,'SELECT * FROM quotes WHERE symbol=?',s).then(q=>fresh(q,now)?q:null);
async function overview(db,now){const account=await row(db,'SELECT cash_paise FROM account WHERE id=1');const orders=await rows(db,'SELECT id,kind,symbol,side,qty,due_ms,status,fill_paise,fee_paise,reason FROM orders ORDER BY created_ms DESC,id DESC LIMIT 100');const positions=await rows(db,'SELECT symbol,qty FROM positions WHERE qty!=0 ORDER BY symbol');const events=await rows(db,'SELECT * FROM events ORDER BY id DESC LIMIT 40');const strategy=(await row(db,"SELECT value FROM settings WHERE key='strategy_enabled'"))?.value==='1';const phase=await row(db,'SELECT * FROM runs ORDER BY completed_ms DESC LIMIT 1');let equity=account.cash_paise;for(const p of positions){const q=await quote(db,p.symbol,now);if(!q){equity=null;break;}equity+=p.qty*q.price_paise;}
return {mode:'PAPER_ONLY',realOrdersEnabled:false,cash_paise:account.cash_paise,equity_paise:equity,positions,orders:orders.map(o=>({...o,due_at:dateStr(o.due_ms)})),events:events.map(e=>({...e,observed_at:dateStr(e.observed_ms)})),strategy_enabled:strategy,strategy:'NSE_TOP_VOLUME_0940_EXIT_1515',last_strategy_phase:phase?{status:phase.status,reason:phase.reason,completed_at:dateStr(phase.completed_ms)}:null,server_time:dateStr(now),market_session:session(now)};}
async function schedule(db,data,now){if(typeof data.symbol!=='string'||!SYMBOL.test(data.symbol)||!['BUY','SELL'].includes(data.side)||!Number.isSafeInteger(data.quantity)||data.quantity<=0||data.quantity>100000)throw Error('invalid order');const due=parseDate(data.scheduled_at);if(due<now||due>now+30*86400000||!session(due))throw Error('invalid market schedule');const key=data.idempotency_key;if(typeof key!=='string'||!/^[A-Za-z0-9_-]{12,80}$/.test(key))throw Error('invalid idempotency key');await db.prepare("INSERT OR IGNORE INTO orders(id,client_key,kind,symbol,side,qty,due_ms,created_ms) VALUES(?,?,'MANUAL',?,?,?,?,?)").bind(crypto.randomUUID(),key,data.symbol,data.side,data.quantity,due,now).run();const existing=await row(db,'SELECT * FROM orders WHERE client_key=?',key);if(existing.symbol!==data.symbol||existing.side!==data.side||existing.qty!==data.quantity||existing.due_ms!==due)throw Error('idempotency conflict');return {id:existing.id,status:existing.status,realOrdersEnabled:false};}
async function cancel(db,id,now){if(typeof id!=='string')throw Error('invalid id');const result=await db.prepare("UPDATE orders SET status='CANCELLED',completed_ms=? WHERE id=? AND kind='MANUAL' AND status='QUEUED'").bind(now,id).run();if(result.meta.changes!==1)throw Error('order no longer cancellable');return {id,status:'CANCELLED'};}
async function setStrategy(db,enabled,now){if(typeof enabled!=='boolean')throw Error('enabled must be boolean');await db.batch([db.prepare("UPDATE settings SET value=? WHERE key='strategy_enabled'").bind(enabled?'1':'0'),log(db,now,'STRATEGY',enabled?'Enabled':'Disabled')]);return {enabled,realOrdersEnabled:false};}
async function ingest(db,body,now,sourceName){if(!sourceName||typeof sourceName!=='string')throw Error('verified feed source not configured');if(!Array.isArray(body.quotes)||body.quotes.length<1||body.quotes.length>4000)throw Error('invalid quote batch');const seen=new Set(),normalized=[],observedSessionCache=new Map();for(const q of body.quotes){if(!q||typeof q.symbol!=='string'||!SYMBOL.test(q.symbol)||seen.has(q.symbol)||!Number.isSafeInteger(q.price_paise)||q.price_paise<=0||!Number.isSafeInteger(q.cumulative_volume)||q.cumulative_volume<0||q.source!==sourceName||q.exchange_open!==true)throw Error('invalid source quote');const observed=parseDate(q.observed_at);if(!observedSessionCache.has(observed))observedSessionCache.set(observed,session(observed));if(!observedSessionCache.get(observed)||observed>now+2000||now-observed>MAX_STALENESS)throw Error('stale source quote');seen.add(q.symbol);normalized.push({...q,observed});}
const cv=body.coverage;if(!cv&&normalized.length>30)throw Error('intraday quote batch capped at 30 symbols without coverage');
if(cv&&![579,580].includes(ist(now).minute))throw Error('full-universe snapshots only accepted at the 09:39–09:40 entry window');
if(cv!==undefined&&(cv?.complete!==true||!Number.isSafeInteger(cv.eligible_count)||cv.eligible_count!==normalized.length||normalized.length<500||!Number.isSafeInteger(cv.nifty_change_bps)||Math.abs(cv.nifty_change_bps)>10000||new Set(normalized.map(x=>x.observed)).size!==1))throw Error('invalid complete NSE universe');if(cv&&await row(db,'SELECT 1 FROM coverage WHERE session=?',ist(normalized[0].observed).day))throw Error('full-universe daily quota already consumed');
// On Workers Free, D1 permits only 50 queries per invocation. A single bound JSON
// array + SQLite json_each inserts the whole point-in-time quote snapshot in one
// SQL statement, rather than 500-4000 individual D1 queries.
const rowsJson=JSON.stringify(normalized.map(q=>[q.symbol,q.price_paise,q.cumulative_volume,q.observed,sourceName]));
if(rowsJson.length>1600000)throw Error('quote batch too large for free worker');
const quoteStatement=db.prepare(`INSERT INTO quotes(symbol,price_paise,cumulative_volume,observed_ms,source,exchange_open)
 SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),
        json_extract(value,'$[3]'),json_extract(value,'$[4]'),1
 FROM json_each(?) WHERE 1=1
 ON CONFLICT(symbol) DO UPDATE SET price_paise=excluded.price_paise,
 cumulative_volume=excluded.cumulative_volume,observed_ms=excluded.observed_ms,
 source=excluded.source,exchange_open=1
 WHERE excluded.observed_ms>=quotes.observed_ms+12000`).bind(rowsJson);
const statements=[quoteStatement];
if(cv)statements.push(db.prepare(`INSERT INTO coverage(session,eligible_count,observed_ms,nifty_change_bps,source)
 VALUES(?,?,?,?,?) ON CONFLICT(session) DO UPDATE SET eligible_count=excluded.eligible_count,
 observed_ms=excluded.observed_ms,nifty_change_bps=excluded.nifty_change_bps,
 source=excluded.source WHERE excluded.observed_ms>coverage.observed_ms`).bind(
 ist(normalized[0].observed).day,normalized.length,normalized[0].observed,cv.nifty_change_bps,sourceName));
await db.batch(statements);
return {accepted:normalized.length,realOrdersEnabled:false};}
async function skip(db,order,now,reason){
// The D1 trigger writes the SKIP event only when the guarded state transition
// succeeds. Competing cron invocations cannot generate duplicate skip audits.
await db.prepare("UPDATE orders SET status='SKIPPED',completed_ms=?,reason=? WHERE id=? AND status='QUEUED'")
 .bind(now,reason,order.id).run();
}
async function fill(db,o,now){if(o.status!=='QUEUED')return false;
// One joined D1 read gives source, position and cash snapshot; the UPDATE guard
// below re-checks these values atomically so concurrent cron jobs cannot double-fill.
const q=await row(db,`SELECT q.*,COALESCE(p.qty,0) AS held_qty,p.entry_paise,p.intraday,
 a.cash_paise FROM quotes q CROSS JOIN account a LEFT JOIN positions p ON p.symbol=q.symbol
 WHERE q.symbol=? AND a.id=1`,o.symbol);
if(!fresh(q,now)){await skip(db,o,now,'MISSING_OR_STALE_MARKET_QUOTE');return false;}
const position={qty:q.held_qty,entry_paise:q.entry_paise,intraday:q.intraday},held=q.held_qty;
if(o.kind==='ENTRY'&&held!==0){await skip(db,o,now,'EXISTING_POSITION');return false;}
if(o.side==='SELL'&&o.kind!=='ENTRY'&&held<o.qty){await skip(db,o,now,'INSUFFICIENT_HOLDINGS');return false;}
const slip=Math.ceil(q.price_paise*5/10000),px=o.side==='BUY'?q.price_paise+slip:Math.max(1,q.price_paise-slip),notional=o.qty*px,fee=Math.ceil(notional*10/10000),cost=notional+fee;
if(!Number.isSafeInteger(cost)){await skip(db,o,now,'AMOUNT_OVERFLOW');return false;}
if(o.side==='BUY'&&q.cash_paise<cost){await skip(db,o,now,'INSUFFICIENT_CASH');return false;}
if(o.side==='SELL'&&o.kind==='ENTRY'){
 const shortLedger=await row(db,`SELECT COALESCE(SUM(ABS(p.qty)*q.price_paise),0) AS exposure,
 COALESCE(SUM(CASE WHEN q.observed_ms<? OR q.observed_ms>? OR q.exchange_open!=1
 OR q.symbol IS NULL THEN 1 ELSE 0 END),0) AS stale
 FROM positions p LEFT JOIN quotes q ON q.symbol=p.symbol WHERE p.qty<0`,now-MAX_STALENESS,now+2000);
 if(shortLedger.stale){await skip(db,o,now,'STALE_SHORT_VALUATION');return false;}
 if(shortLedger.exposure+notional>CAPITAL){await skip(db,o,now,'SHORT_EXPOSURE_LIMIT');return false;}
}
const execution=crypto.randomUUID();
const shortEntry=o.side==='SELL'&&o.kind==='ENTRY';
const shortExposureGate=shortEntry?` AND ? + COALESCE((SELECT SUM(ABS(p.qty)*q.price_paise)
 FROM positions p JOIN quotes q ON q.symbol=p.symbol WHERE p.qty<0),0)<=?`:'';
const guard="AND COALESCE((SELECT qty FROM positions WHERE symbol=?),0)=?"+
 (o.side==='BUY'?' AND (SELECT cash_paise FROM account WHERE id=1)>=?':'')+
 " AND (SELECT observed_ms FROM quotes WHERE symbol=?)=?"+shortExposureGate;
const guardedArgs=[o.symbol,held,...(o.side==='BUY'?[cost]:[]),o.symbol,q.observed_ms,...(shortEntry?[notional,CAPITAL]:[])];
// D1 Free allows 50 queries per invocation: the single guarded UPDATE invokes
// atlas_settle_paper_fill, an SQLite trigger created by schema.sql. Thus a
// simulated fill settles its cash, position, and audit row atomically without
// issuing four separate Worker->D1 queries for every selected stock.
const updated=await db.prepare(`UPDATE orders SET status='FILLED',fill_paise=?,fee_paise=?,
 completed_ms=?,execution_id=? WHERE id=? AND status='QUEUED' ${guard}
 RETURNING execution_id`).bind(px,fee,now,execution,o.id,...guardedArgs).first();
return updated?.execution_id===execution;
}
async function strategyOrder(db,day,phase,symbol,side,qty,now){if(qty<1)return;const key=`${day}-${phase}-${symbol}`;
let o=await row(db,"INSERT OR IGNORE INTO orders(id,client_key,kind,symbol,side,qty,due_ms,created_ms) VALUES(?,?,?,?,?,?,?,?) RETURNING *",crypto.randomUUID(),key,phase,symbol,side,qty,now,now);
if(!o)o=await row(db,'SELECT * FROM orders WHERE client_key=?',key);
if((phase==='STOP'||phase==='EXIT')&&o.status==='SKIPPED'&&o.reason==='MISSING_OR_STALE_MARKET_QUOTE'){
  await db.prepare("UPDATE orders SET status='QUEUED',reason=NULL,completed_ms=NULL WHERE id=? AND status='SKIPPED' AND reason='MISSING_OR_STALE_MARKET_QUOTE'").bind(o.id).run();
  o=await row(db,'SELECT * FROM orders WHERE client_key=?',key);
}
if(o.status==='QUEUED')await fill(db,o,now);}

async function strategyPhases(db,now,enabled){const t=ist(now);if(!session(now))return;
if(t.minute===580&&enabled){
 if(await row(db,"SELECT 1 FROM runs WHERE session=? AND phase='ENTRY'",t.day))return;
 if(await row(db,'SELECT 1 FROM positions WHERE intraday=1 AND qty!=0 LIMIT 1'))return;
 const c=await row(db,'SELECT * FROM coverage WHERE session=?',t.day);
 if(!c||!fresh({exchange_open:1,observed_ms:c.observed_ms},now))return;
 const count=await row(db,'SELECT COUNT(*) AS n FROM quotes WHERE observed_ms BETWEEN ? AND ? AND exchange_open=1',now-MAX_STALENESS,now+2000);
 if(count.n!==c.eligible_count||count.n<500)return;
 if(Math.abs(c.nifty_change_bps)<20){await db.prepare("INSERT OR IGNORE INTO runs(session,phase,status,reason,completed_ms) VALUES(?,'ENTRY','NO_TRADE','NEUTRAL_NIFTY',?)").bind(t.day,now).run();return;}
 const side=c.nifty_change_bps>=20?'BUY':'SELL',cash=(await row(db,'SELECT cash_paise FROM account WHERE id=1')).cash_paise,alloc=Math.floor(Math.min(cash,CAPITAL)/10);
 const top=await rows(db,'SELECT symbol,price_paise FROM quotes WHERE observed_ms BETWEEN ? AND ? ORDER BY cumulative_volume DESC,symbol ASC LIMIT 10',now-MAX_STALENESS,now+2000);
 for(const q of top){const qty=Math.floor((alloc*995/1000)/q.price_paise);await strategyOrder(db,t.day,'ENTRY',q.symbol,side,qty,now);}
 const filled=await row(db,"SELECT COUNT(*) AS n FROM orders WHERE kind='ENTRY' AND client_key LIKE ? AND status='FILLED'",`${t.day}-ENTRY-%`);
 const actual=filled?.n||0;
 await db.prepare("INSERT OR IGNORE INTO runs(session,phase,status,reason,completed_ms) VALUES(?,'ENTRY',?,?,?)")
  .bind(t.day,actual===10?'EXECUTED':'PARTIAL',actual===10?null:`FILLED_${actual}_OF_10`,now).run();
}
if(t.minute===915){const positions=await rows(db,'SELECT symbol,qty FROM positions WHERE intraday=1 AND qty!=0');for(const p of positions)await strategyOrder(db,t.day,'EXIT',p.symbol,p.qty>0?'SELL':'BUY',Math.abs(p.qty),now);
if(!(await row(db,'SELECT 1 FROM positions WHERE intraday=1 AND qty!=0 LIMIT 1')))await db.prepare("INSERT OR IGNORE INTO runs(session,phase,status,completed_ms) VALUES(?,'EXIT','EXECUTED',?)").bind(t.day,now).run();
}}
async function stops(db,now){
 if(!session(now))return;
 // One D1 query screens every stop against fresh quotes, rather than doing
 // one select for positions plus one D1 read for every held symbol.
 const hits=await rows(db,`SELECT p.symbol,p.qty FROM positions p
 JOIN quotes q ON q.symbol=p.symbol WHERE p.intraday=1 AND p.qty!=0
 AND p.entry_paise IS NOT NULL AND q.exchange_open=1
 AND q.observed_ms BETWEEN ? AND ?
 AND ((p.qty>0 AND q.price_paise*100<=p.entry_paise*98)
   OR (p.qty<0 AND q.price_paise*100>=p.entry_paise*102))`,now-MAX_STALENESS,now+2000);
 for(const p of hits)await strategyOrder(db,ist(now).day,'STOP',p.symbol,
   p.qty>0?'SELL':'BUY',Math.abs(p.qty),now);
}
async function tick(env,now=Date.now()){
 const db=env.DB;if(!db)throw Error('D1 binding missing');
 // Protect the 50-query Workers Free ceiling: stop/exit/entry work takes
 // priority over a large owner-submitted manual queue. Backlog may be SKIPPED
 // later; it must never be silently filled from historical quotes.
 const minute=ist(now).minute;
 const riskOpen=await row(db,'SELECT 1 FROM positions WHERE intraday=1 AND qty!=0 LIMIT 1');
 const queueLimit=(minute===580||minute===915)?1:(riskOpen?5:12);
 const pending=await rows(db,`SELECT * FROM orders WHERE status='QUEUED' AND due_ms<=?
  ORDER BY due_ms,id LIMIT ?`,now,queueLimit);
for(const o of pending){if(now-o.due_ms>MAX_DELAY)await skip(db,o,now,'SCHEDULE_MISSED_NO_BACKFILL');else if(!session(now))await skip(db,o,now,'MARKET_CLOSED');else await fill(db,o,now);}
await stops(db,now);const enabled=(await row(db,"SELECT value FROM settings WHERE key='strategy_enabled'"))?.value==='1';await strategyPhases(db,now,enabled);const t=ist(now);
if(t.weekday&&t.minute>580&&enabled)await db.prepare("INSERT OR IGNORE INTO runs(session,phase,status,reason,completed_ms) VALUES(?,'ENTRY','SKIPPED','MISSED_OR_UNVERIFIED_COVERAGE',?)").bind(t.day,now).run();
if(t.weekday&&t.minute>915&&await row(db,'SELECT 1 FROM positions WHERE intraday=1 AND qty!=0'))await db.prepare("INSERT OR IGNORE INTO runs(session,phase,status,reason,completed_ms) VALUES(?,'EXIT','PARTIAL','UNRESOLVED_POSITIONS',?)").bind(t.day,now).run();
return {processed:pending.length,strategy_enabled:enabled,realOrdersEnabled:false};}
export const testing={ist,session,parseDate,tick,schedule,ingest,overview,strategyPhases,fill};
export default {
 async fetch(req,env){const path=new URL(req.url).pathname,now=Date.now();if(path==='/healthz')return reply({mode:'PAPER_ONLY',service:'atlas-free-cloud-paper',configured:Boolean(env.DB)});if(!env.DB)return reply({error:'D1_NOT_CONNECTED'},503);
 const actions={'/api/cloud-paper/state':'GET','/api/cloud-paper/orders':'POST','/api/cloud-paper/cancel':'POST','/api/cloud-paper/strategy':'POST','/api/cloud-paper/quotes':'POST'};
 if(!Object.hasOwn(actions,path))return reply({error:'NOT_FOUND'},404);if(req.method!==actions[path])return reply({error:'METHOD_NOT_ALLOWED'},405);
 if(!authorized(req,path.endsWith('/quotes')?env.FEED_TOKEN:env.OWNER_TOKEN))return reply({error:'UNAUTHORIZED'},401);
 try {if(path.endsWith('/state'))return reply(await overview(env.DB,now));const p=await readBody(req);
 if(path.endsWith('/orders'))return reply(await schedule(env.DB,p,now));if(path.endsWith('/cancel'))return reply(await cancel(env.DB,p.id,now));if(path.endsWith('/strategy'))return reply(await setStrategy(env.DB,p.enabled,now));return reply(await ingest(env.DB,p,now,env.FEED_SOURCE_ID));
 }catch(e){if(e instanceof SyntaxError||/(invalid|required|stale|conflict|cancellable|timestamp|JSON|timezone|schedule|source|body|boolean)/i.test(e?.message||''))return reply({error:String(e.message).slice(0,140)},400);
 console.error('paper worker error:',e?.name);return reply({error:'PAPER_SERVICE_UNAVAILABLE'},503);}
 },
 async scheduled(_event,env,ctx){ctx.waitUntil(tick(env).catch(e=>console.error('scheduled paper tick error:',e?.name)));},
};
