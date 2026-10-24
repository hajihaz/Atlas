#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {createPushStore} from '../frontend/local-push.js';
const feed=JSON.parse(await readFile(new URL('../frontend/public/ipo-feed.json',import.meta.url),'utf8'));
const result=await createPushStore().deliver(feed,{enabled:process.env.ATLAS_IPO_ALERTS_APPROVED==='1'});
console.log(JSON.stringify(result));
