#!/usr/bin/env node
import {readFile,lstat} from 'node:fs/promises';
import {createPushStore} from '../frontend/local-push.js';
import {validFeed} from '../frontend/src/lib/ipoIntelligence.ts';
import {validatePublisherIpoSnapshot} from '../frontend/src/lib/publisherIpoValidation.js';
const feeds=[];
for(const path of ['../.atlas-runtime/ipo-feed.json','../frontend/public/ipo-feed.json']){
 try{
  const file=new URL(path,import.meta.url),info=await lstat(file);
  if(info.isSymbolicLink()||!info.isFile()||info.size>500000)continue;
  const feed=JSON.parse(await readFile(file,'utf8'));
  if(!validFeed(feed)||Date.parse(feed.generatedAt)>Date.now()+60000)continue;
  if(feed.sourceKind==='PUBLISHER_AGGREGATE')validatePublisherIpoSnapshot(feed);
  feeds.push(feed);
 }catch{/* Retain only a validated dated source; deliver() refuses stale evidence. */}
}
const feed=feeds.sort((a,b)=>Date.parse(b.generatedAt)-Date.parse(a.generatedAt))[0];
const result=await createPushStore().deliver(feed,{enabled:process.env.ATLAS_IPO_ALERTS_APPROVED==='1'});
console.log(JSON.stringify(result));
