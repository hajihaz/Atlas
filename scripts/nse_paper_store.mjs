// One private SQLite commit couples every NSE virtual fill to its account state.
import {DatabaseSync} from 'node:sqlite';
import {lstatSync,mkdirSync,chmodSync,existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {advanceNsePaper,assertNseState,createNsePaper,digest,POLICY,summarizeNsePaper} from './nse_paper_engine.mjs';
const GENESIS='0'.repeat(64);
export const CODE_HASH=digest([
  readFileSync(new URL('./nse_paper_engine.mjs',import.meta.url),'utf8'),
  readFileSync(new URL('../frontend/lib/research-engine.js',import.meta.url),'utf8'),
  readFileSync(new URL('./nse_paper_store.mjs',import.meta.url),'utf8')]);
function privatePath(file,{readOnly=false}={}){
  const folder=path.dirname(file);
  if(!readOnly)mkdirSync(folder,{recursive:true,mode:0o700});
  const dir=lstatSync(folder);
  if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)||dir.uid!==process.getuid())throw Error('Private NSE directory required');
  for(const name of [file,file+'-wal',file+'-shm']){
    if(!existsSync(name)){if(lstatMaybe(name)?.isSymbolicLink())throw Error('Unsafe NSE path');continue;}
    const info=lstatSync(name);
    if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077))throw Error('Unsafe NSE journal path');
  }
}
function lstatMaybe(p){try{return lstatSync(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const stateHash=(state,head)=>digest({state,head});
export class NsePaperStore{
  constructor(file,{universe,startedAt=Date.now(),mode='FORWARD',readOnly=false}={}){
    this.file=path.resolve(file);this.readOnly=readOnly;privatePath(this.file,{readOnly});
    if(readOnly&&!existsSync(this.file))throw Error('Existing NSE journal required');
    this.db=new DatabaseSync(this.file,{readOnly});
    if(readOnly)this.db.exec('PRAGMA query_only=ON; BEGIN;');
    else{
      chmodSync(this.file,0o600);
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
      this.db.exec(`CREATE TABLE IF NOT EXISTS paper_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),
        state_json TEXT NOT NULL,state_hash TEXT NOT NULL,head_seq INTEGER NOT NULL,head_hash TEXT NOT NULL,
        code_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS paper_events(seq INTEGER PRIMARY KEY,event_id TEXT UNIQUE NOT NULL,
        payload_json TEXT NOT NULL,prev_hash TEXT NOT NULL,chain_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS paper_bars(symbol TEXT NOT NULL,time INTEGER NOT NULL,
        payload_json TEXT NOT NULL,payload_hash TEXT NOT NULL,first_seen INTEGER NOT NULL,
        PRIMARY KEY(symbol,time));`);
      if(!this.db.prepare('SELECT 1 FROM paper_state WHERE singleton=1').get()){
        if(!universe)throw Error('Universe required for new NSE pilot');
        const state=createNsePaper(universe,startedAt,mode),head={seq:0,hash:GENESIS};
        this.db.prepare('INSERT INTO paper_state VALUES(1,?,?,?,?,?)').run(
          JSON.stringify(state),stateHash(state,head),0,GENESIS,CODE_HASH);
      }
    }
    this.verify();
  }
  close(){this.db.close();}
  load(){
    const row=this.db.prepare('SELECT * FROM paper_state WHERE singleton=1').get();
    if(!row||row.code_hash!==CODE_HASH)throw Error('NSE pilot code changed; explicit reviewed migration required');
    const state=assertNseState(JSON.parse(row.state_json));
    const head={seq:Number(row.head_seq),hash:row.head_hash};
    if(stateHash(state,head)!==row.state_hash)throw Error('NSE state checksum mismatch');
    const last=this.db.prepare('SELECT seq,chain_hash FROM paper_events ORDER BY seq DESC LIMIT 1').get();
    if((last?.seq??0)!==head.seq||(last?.chain_hash??GENESIS)!==head.hash)throw Error('NSE ledger checkpoint mismatch');
    return {state,head};
  }
  verify(){
    const {state,head}=this.load(),cash={},positions={},fees={},realized={},counts={},decisions={};
    for(const s of state.sessions){cash[s.strategyId]=POLICY.capitalPaise;positions[s.strategyId]={};
      fees[s.strategyId]=0;realized[s.strategyId]=0;counts[s.strategyId]=0;decisions[s.strategyId]=0;}
    let hash=GENESIS,seq=0;
    for(const row of this.db.prepare('SELECT * FROM paper_events ORDER BY seq').iterate()){
      const event=JSON.parse(row.payload_json);
      if(row.seq!==++seq||row.prev_hash!==hash||row.chain_hash!==digest([hash,event])||row.event_id!==event.id)
        throw Error('NSE event chain invalid');
      hash=row.chain_hash;
      if(!(event.strategyId in cash))throw Error('Unknown NSE account in ledger');
      if(event.type==='DECISION'){decisions[event.strategyId]++;continue;}
      if(event.type!=='FILL'||!Number.isSafeInteger(event.quantity)||event.quantity<=0||
        !Number.isSafeInteger(event.pricePaise)||event.pricePaise<=0||
        event.sourceTradeAt<=event.signalObservedAt)throw Error('Invalid NSE fill evidence');
      const id=event.strategyId,gross=event.quantity*event.pricePaise;
      if(event.feePaise!==Math.ceil(gross*POLICY.feeBps/10000))throw Error('NSE modeled fee mismatch');
      if(event.side==='BUY'){
        if(positions[id][event.symbol]||gross+event.feePaise>POLICY.slotPaise)throw Error('NSE allocation mismatch');
        cash[id]-=gross+event.feePaise;
        positions[id][event.symbol]={quantity:event.quantity,cost:gross+event.feePaise};
      }else if(event.side==='SELL'){
        const p=positions[id][event.symbol];
        if(!p||p.quantity!==event.quantity||event.realizedPaise!==gross-event.feePaise-p.cost)
          throw Error('NSE position/PnL mismatch');
        cash[id]+=gross-event.feePaise;realized[id]+=event.realizedPaise;delete positions[id][event.symbol];
      }else throw Error('Invalid NSE fill side');
      if(cash[id]!==event.cashAfterPaise||cash[id]<0)throw Error('NSE cash mismatch');
      fees[id]+=event.feePaise;counts[id]++;
    }
    if(seq!==head.seq||hash!==head.hash)throw Error('NSE ledger head invalid');
    for(const s of state.sessions){
      if(cash[s.strategyId]!==s.cashPaise||fees[s.strategyId]!==s.feesPaise||
        realized[s.strategyId]!==s.realizedPaise||counts[s.strategyId]!==s.fills||
        decisions[s.strategyId]!==s.decisions||
        Object.keys(positions[s.strategyId]).length!==Object.keys(s.positions).length)
        throw Error('NSE accounts diverge from immutable fills');
      for(const [symbol,p] of Object.entries(s.positions)){
        const expected=positions[s.strategyId][symbol];
        if(!expected||expected.quantity!==p.quantity||expected.cost!==p.entryCostPaise)
          throw Error('NSE holding differs from fill replay');
      }
    }
    for(const row of this.db.prepare('SELECT payload_json,payload_hash FROM paper_bars').iterate()){
      if(digest(JSON.parse(row.payload_json))!==row.payload_hash)throw Error('NSE candle receipt altered');
    }
    return {events:seq,hash,verified:true};
  }
  advance(input,now=Date.now(),hook=()=>{}){
    if(this.readOnly)throw Error('NSE read-only journal');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const {state,head}=this.load();
      // Admit a complete candidate before mutating either financial state or provenance.
      const result=advanceNsePaper(state,input,now);
      if(result.status==='DUPLICATE_INPUT'){this.db.exec('ROLLBACK');return result;}
      for(const [symbol,history] of Object.entries(input.history??{})){
        if(!state.universe.some(x=>x.symbol===symbol))throw Error('Unknown NSE history identity');
        const bars=history.bars;
        if(!bars.length)continue;
        const date=new Date(bars[0].time+19800000).toISOString().slice(0,10);
        const prior=state.historyHashes[symbol];
        const sameDay=prior?.date===date;
        if(sameDay&&(bars.length<prior.count||digest(bars.slice(0,prior.count))!==prior.hash))
          throw Error('Previously admitted NSE closed candle revised or truncated');
        const start=sameDay?prior.count:0;
        const insert=this.db.prepare('INSERT INTO paper_bars VALUES(?,?,?,?,?)');
        for(const bar of bars.slice(start)){
          const hash=digest(bar),old=this.db.prepare('SELECT payload_hash FROM paper_bars WHERE symbol=? AND time=?').get(symbol,bar.time);
          if(old&&old.payload_hash!==hash)throw Error('Previously admitted NSE closed candle revised');
          if(!old)insert.run(symbol,bar.time,JSON.stringify(bar),hash,now);
        }
        result.state.historyHashes[symbol]={date,count:bars.length,hash:digest(bars)};
      }
      let seq=head.seq,hash=head.hash;
      for(const event of result.events){
        const next=digest([hash,event]);
        this.db.prepare('INSERT INTO paper_events VALUES(?,?,?,?,?)').run(++seq,event.id,JSON.stringify(event),hash,next);
        hash=next;
      }
      hook('after_events');
      const nextHead={seq,hash};
      this.db.prepare('UPDATE paper_state SET state_json=?,state_hash=?,head_seq=?,head_hash=? WHERE singleton=1')
        .run(JSON.stringify(result.state),stateHash(result.state,nextHead),seq,hash);
      hook('before_commit');
      this.db.exec('COMMIT');hook('after_commit');return result;
    }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
  }
  report(now=Date.now(),query={}){
    const audit=this.verify(),{state}=this.load();
    let events;
    if(query.strategy&&query.date){
      const start=Date.parse(query.date+'T00:00:00+05:30'),end=start+86400000;
      events=this.db.prepare(`SELECT payload_json FROM paper_events
        WHERE json_extract(payload_json,'$.type')='FILL' AND json_extract(payload_json,'$.strategyId')=?
        AND json_extract(payload_json,'$.at')>=? AND json_extract(payload_json,'$.at')<?
        ORDER BY seq DESC LIMIT 201 OFFSET ?`).all(query.strategy,start,end,query.offset??0);
    }else events=this.db.prepare("SELECT payload_json FROM paper_events WHERE json_extract(payload_json,'$.type')='FILL' ORDER BY seq DESC LIMIT 200").all();
    const hasMore=events.length>200;
    if(hasMore)events=events.slice(0,200);
    const report=summarizeNsePaper(state,events.map(x=>JSON.parse(x.payload_json)).reverse(),now);
    const days=this.db.prepare(`SELECT json_extract(payload_json,'$.strategyId') AS strategyId,
      date(json_extract(payload_json,'$.at')/1000,'unixepoch','+330 minutes') AS date,
      count(*) AS fills,sum(json_extract(payload_json,'$.realizedPaise'))/100.0 AS realizedPnlINR,
      sum(json_extract(payload_json,'$.feePaise'))/100.0 AS feesINR
      FROM paper_events WHERE json_extract(payload_json,'$.type')='FILL'
      GROUP BY strategyId,date ORDER BY date DESC LIMIT 200`).all();
    return {...report,ledger:{events:audit.events,headHash:audit.hash},days,
      query:query.strategy?query:null,hasMore};
  }
}
