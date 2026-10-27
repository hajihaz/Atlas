// Local development adapter for the same read-only API handlers used on Vercel.
// It binds only to loopback and exposes a fixed route allowlist; it is never a
// broker, order, or production server.
import http from 'node:http';
import {readFile,lstat} from 'node:fs/promises';
import {validatePrivateCloudSnapshot} from './api/cloud-paper.js';
import {validatePublisherIpoSnapshot} from './src/lib/publisherIpoValidation.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {handlePushRequest} from './local-push.js';
import {serveOwnerBuild} from './owner-static.js';
import {handleNseMarket,ownerRequestAllowed} from './local-nse.js';
import {handleNsePaper} from './local-nse-paper.js';
import {handleOwnerStrategy} from './local-scalpstorm-owner.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTES = Object.freeze({
  '/api/closed-candles': () => import('./api/closed-candles.js'),
  '/api/cloud-paper': () => import('./api/cloud-paper.js'),
  '/api/live-feed': () => import('./api/live-feed.js'),
  '/api/market-history': () => import('./api/market-history.js'),
  '/api/market-inr': () => import('./api/market-inr.js'),
  '/api/market-news': () => import('./api/market-news.js'),
  '/api/market-quotes': () => import('./api/market-quotes.js'),
  '/api/strategy-lab': () => import('./api/strategy-lab.js'),
});

const run=promisify(execFile);
async function localPaper(request,response){
 let host;try{host=new URL('http://'+request.headers.host);}catch{response.writeHead(403);response.end();return;}
 if(!['127.0.0.1','localhost'].includes(host.hostname)||Number(host.port||80)!==request.socket.localPort){response.writeHead(403);response.end();return;}
 if(request.headers.origin){try{if(!['127.0.0.1','localhost'].includes(new URL(request.headers.origin).hostname)){response.writeHead(403);response.end();return;}}catch{response.writeHead(403);response.end();return;}}
 response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Content-Type','application/json');
 if(request.method!=='GET'){response.writeHead(405,{'Allow':'GET'});response.end(JSON.stringify({error:'method_not_allowed'}));return;}
 try{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const query=new URL(request.url,'http://127.0.0.1').searchParams;
  const argv=[path.join(root,'scripts/local_paper_report.py')];
  if(query.size){
   if([...query.keys()].some(k=>!['strategy','date','offset'].includes(k))||
      !/^[a-z0-9-]{1,48}$/.test(query.get('strategy')??'')||!/^\d{4}-\d{2}-\d{2}$/.test(query.get('date')??'')||
      !/^\d{1,7}$/.test(query.get('offset')??'0')||Number(query.get('offset')??0)>1000000){response.writeHead(400);response.end(JSON.stringify({error:'invalid_day_query'}));return;}
   argv.push('--strategy',query.get('strategy'),'--date',query.get('date'),'--offset',query.get('offset')??'0');
  }
  const result=await run('/opt/homebrew/bin/python3.11',argv,{
   cwd:root,timeout:8000,maxBuffer:200000,env:{PATH:process.env.PATH,PYTHONPATH:path.join(root,'src'),
    ...(process.env.ATLAS_PAPER_DB_PATH?{ATLAS_PAPER_DB_PATH:process.env.ATLAS_PAPER_DB_PATH}:{})}});
  const data=JSON.parse(result.stdout);
  if(!['atlas.mac-forward-paper.v1','atlas.mac-forward-paper-day.v1'].includes(data.schema)||data.realOrdersEnabled!==false||data.schema==='atlas.mac-forward-paper.v1'&&data.actualCapitalINR!==0)throw Error();
  response.end(JSON.stringify(data));
 }catch{response.writeHead(503);response.end(JSON.stringify({error:'owner_local_paper_unavailable'}));}
}
async function ownerSnapshot(request,response,kind){
 response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
 response.setHeader('Content-Type','application/json');
 if(request.method!=='GET'){response.writeHead(405,{'Allow':'GET'});response.end(JSON.stringify({error:'method_not_allowed'}));return;}
 try{
  const host=new URL('http://'+request.headers.host);
  if(!['127.0.0.1','localhost'].includes(host.hostname)||Number(host.port||80)!==request.socket.localPort)throw Error();
  if(request.headers.origin&&!['127.0.0.1','localhost'].includes(new URL(request.headers.origin).hostname))throw Error();
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const folder=path.join(root,'.atlas-runtime'),subfolder=kind==='paper'?path.join(folder,'published'):folder;
  const file=path.join(subfolder,kind==='paper'?'cloud-paper.json':'ipo-feed.json');
  if((await lstat(folder)).isSymbolicLink()||(await lstat(subfolder)).isSymbolicLink())throw Error();
  const info=await lstat(file);
  if(info.isSymbolicLink()||!info.isFile()||info.size>500000)throw Error();
  const data=JSON.parse(await readFile(file,'utf8'));
  (kind==='paper'?validatePrivateCloudSnapshot:validatePublisherIpoSnapshot)(data);
  response.end(JSON.stringify(data));
 }catch{response.writeHead(503);response.end(JSON.stringify({error:'owner_snapshot_unavailable'}));}
}
export function createLocalApiServer({serveBuild=false,readOnly=false,
  ownerRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')}={}) {
  return http.createServer(async (request, response) => {
    // Match the raw path, not URL's normalized pathname, to reject traversal
    // spellings and prevent arbitrary file/module imports.
    const rawPath = (request.url ?? '/').split('?')[0];
    if(readOnly&&!ownerRequestAllowed(request)){response.writeHead(403);response.end();return;}
    if(readOnly&&!['GET','HEAD','OPTIONS'].includes(request.method)){
      response.writeHead(405,{'Allow':'GET, HEAD, OPTIONS'});response.end();return;
    }
    if(rawPath==='/api/scalpstorm-owner'){await handleOwnerStrategy(request,response,ownerRoot);return;}
    if(rawPath==='/api/scalpstorm-history'){await handleOwnerStrategy(request,response,ownerRoot,'history');return;}
    if(rawPath==='/api/nse-market'){await handleNseMarket(request,response,ownerRoot);return;}
    if(rawPath==='/api/nse-paper'){await handleNsePaper(request,response,ownerRoot);return;}
    if(rawPath==='/api/ipo-push'){
      if(readOnly){response.writeHead(404);response.end();return;}
      await handlePushRequest(request,response);return;
    }
    if(serveBuild&&!rawPath.startsWith('/api/')){await serveOwnerBuild(request,response);return;}
    if(rawPath==='/api/local-paper'){await localPaper(request,response);return;}
    if(rawPath==='/api/ipo-feed'){await ownerSnapshot(request,response,'ipo');return;}
    if(rawPath==='/api/cloud-paper'){await ownerSnapshot(request,response,'paper');return;}
    if (!Object.hasOwn(ROUTES, rawPath)) {
      response.writeHead(404, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    const query = Object.fromEntries(new URL(request.url, 'http://127.0.0.1').searchParams);
    const req = { method: request.method, query, headers: request.headers };
    const res = {
      setHeader: (name, value) => response.setHeader(name, value),
      status(code) { response.statusCode = code; return this; },
      json(value) {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify(value));
      },
    };
    try {
      const { default: handler } = await ROUTES[rawPath]();
      await handler(req, res);
    } catch {
      // Never reflect handler/provider errors or server-side environment data.
      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
      }
      if (!response.writableEnded) response.end(JSON.stringify({ error: 'internal_server_error' }));
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const readOnly=process.env.ATLAS_OWNER_READ_ONLY==='1';
  const port=readOnly?Number(process.env.ATLAS_OWNER_PORT||4310):3001;
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid owner port');
  createLocalApiServer({readOnly,serveBuild:readOnly}).listen(port, '127.0.0.1', () => {
    console.log('Atlas local read-only API listening on http://127.0.0.1:'+port);
  });
}
