import test from 'node:test';
import assert from 'node:assert/strict';
import {isRecentQuote,connectionDescription} from '../src/lib/quoteFreshness.js';

test('source timestamps determine freshness, never the local receipt alone',()=>{
 const now=1900000000000;
 const quote={price:100,sourceAt:new Date(now-90000).toISOString()};
 assert.equal(isRecentQuote(quote,now),true);
 assert.equal(isRecentQuote(quote,now+1),false);
 assert.equal(isRecentQuote({price:100,sourceAt:new Date(now+5001).toISOString()},now),false);
 assert.equal(isRecentQuote({price:null,sourceAt:quote.sourceAt},now),false);
 assert.equal(isRecentQuote({price:100,sourceAt:'not-a-time'},now),false);
});
test('stream wording never implies active INR streaming after its last event',()=>{
 assert.match(connectionDescription('STREAMING',true),/1s public stream/);
 assert.match(connectionDescription('STREAMING',false),/idle.*REST fallback/);
 assert.match(connectionDescription('DISCONNECTED',false),/disconnected.*REST fallback/);
});
