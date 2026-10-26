import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import path from 'node:path';
import {validateNseMarketSnapshot} from './src/lib/nseMarketSnapshot.js';

export function ownerRequestAllowed(request) {
  try {
    const host = new URL('http://' + request.headers.host);
    if (!['127.0.0.1','localhost'].includes(host.hostname) || host.username || host.password ||
        host.pathname !== '/' || host.search || host.hash ||
        Number(host.port || 80) !== request.socket.localPort ||
        !['127.0.0.1','::ffff:127.0.0.1','::1'].includes(request.socket.remoteAddress)) return false;
    if (request.headers.origin && request.headers.origin !== host.origin) return false;
    return !['cross-site'].includes(request.headers['sec-fetch-site']);
  } catch { return false; }
}

export async function handleNseMarket(request,response,ownerRoot) {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Content-Type','application/json; charset=utf-8');
  if (!ownerRequestAllowed(request)) {
    response.writeHead(403); response.end(JSON.stringify({error:'owner_origin_required'})); return;
  }
  if (request.method !== 'GET') {
    response.writeHead(405,{'Allow':'GET'}); response.end(JSON.stringify({error:'method_not_allowed'})); return;
  }
  if (request.url !== '/api/nse-market') {
    response.writeHead(400); response.end(JSON.stringify({error:'unexpected_query'})); return;
  }
  let handle;
  try {
    const directory = path.join(ownerRoot,'.atlas-runtime');
    const dir = await lstat(directory);
    if (!dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o077) ||
        typeof process.getuid === 'function' && dir.uid !== process.getuid()) throw Error();
    handle = await open(path.join(directory,'nse-market.json'),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || info.size > 65536 || (info.mode & 0o077) ||
        typeof process.getuid === 'function' && info.uid !== process.getuid()) throw Error();
    const buffer = Buffer.alloc(65537);
    const {bytesRead} = await handle.read(buffer,0,buffer.length,0);
    if (bytesRead > 65536) throw Error();
    const snapshot = validateNseMarketSnapshot(JSON.parse(buffer.subarray(0,bytesRead).toString('utf8')));
    response.end(JSON.stringify(snapshot));
  } catch {
    response.writeHead(503);
    response.end(JSON.stringify({error:'owner_nse_observation_unavailable'}));
  } finally { await handle?.close(); }
}
