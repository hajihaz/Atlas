import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('./dist/',import.meta.url));
const MIME={'.txt':'text/plain; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
export async function serveOwnerBuild(req,res){
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 let raw=(req.url??'/').split('?')[0];
 if(raw==='/')raw='/index.html';
 if(!/^\/[A-Za-z0-9_./-]+$/.test(raw)||raw.split('/').some(p=>p==='..'||p.startsWith('.'))){res.writeHead(404);res.end();return;}
 const type=MIME[extname(raw)];
 if(!type){res.writeHead(404);res.end();return;}
 try{
  const root=await realpath(ROOT),file=await realpath(resolve(ROOT,'.'+raw));
  if(!file.startsWith(root+sep)){res.writeHead(404);res.end();return;}
  const body=await readFile(file);
  res.writeHead(200,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':raw.startsWith('/assets/')?'private,max-age=31536000,immutable':'no-store'});
  res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(404);res.end();}
}
