/**
 * RAILWAY: Minimal bootstrap - listen BEFORE loading heavy modules.
 * /health returns 200 within ~100ms so healthcheck passes.
 * Then loads the full server which attaches Express/Socket.IO.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';

dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true });

const rawPort = process.env.PORT;
const PORT = Number(rawPort) || 4000;
console.error('[BOOT] server-bootstrap', {
  cwd: process.cwd(),
  NODE_ENV: process.env.NODE_ENV,
  PORT_env: rawPort,
  PORT_effective: PORT,
});
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
  console.error('Invalid PORT:', process.env.PORT);
  process.exit(1);
}

function pathOnly(url: string | undefined): string {
  if (!url) return '/';
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  const end = Math.min(q >= 0 ? q : Infinity, h >= 0 ? h : Infinity);
  return end === Infinity ? url : url.slice(0, end);
}

const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
  const pathname = pathOnly(req.url);
  const isHealthPath =
    pathname === '/health' || pathname === '/health/' || pathname.startsWith('/health/');
  const isHealthProbe =
    isHealthPath && (req.method === 'GET' || req.method === 'HEAD');
  if (isHealthProbe) {
    if (req.method === 'HEAD') {
      res.writeHead(200)
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }
  const app = (global as any).__expressApp;
  if (app) return app(req, res, () => {});
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'loading' }));
};

// Prevent uncaught errors from killing the process - /health must stay up
process.on('uncaughtException', (err) => {
  console.error('[BOOT] Uncaught exception (keeping /health alive):', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[BOOT] Unhandled rejection (keeping /health alive):', reason);
});

const server = http.createServer(handler);
server.on('error', (err: NodeJS.ErrnoException) => {
  console.error('[BOOT] HTTP server error (cannot bind / health will fail):', err.code, err.message);
  process.exit(1);
});
server.listen(PORT, '0.0.0.0', () => {
  console.log('[BOOT] Health listening on port', PORT, '(env PORT=', rawPort ?? 'unset', ')');
  (global as any).__earlyHttpServer = server;
  (global as any).__earlyPort = PORT;
  // Load full server in next tick so /health can be served immediately (Railway healthcheck)
  setImmediate(() => {
    try {
      require('./server'); // eslint-disable-line
    } catch (err: any) {
      console.error('[BOOT] Server load failed (/health still works):', err?.message || err);
    }
  });
});
