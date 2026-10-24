// Local development adapter for the same read-only API handlers used on Vercel.
// It binds only to loopback and exposes a fixed route allowlist; it is never a
// broker, order, or production server.
import http from 'node:http';
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

export function createLocalApiServer() {
  return http.createServer(async (request, response) => {
    // Match the raw path, not URL's normalized pathname, to reject traversal
    // spellings and prevent arbitrary file/module imports.
    const rawPath = (request.url ?? '/').split('?')[0];
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
  createLocalApiServer().listen(3001, '127.0.0.1', () => {
    console.log('Atlas local read-only API listening on http://127.0.0.1:3001');
  });
}
