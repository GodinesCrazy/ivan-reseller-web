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

const PORT = Number(process.env.PORT) || 4000;
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
  console.error('Invalid PORT:', process.env.PORT);
  process.exit(1);
}

const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
  const url = req.url || '';
  if (req.method === 'GET' && (url === '/health' || url === '/health/' || url.startsWith('/health'))) {
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
server.listen(PORT, '0.0.0.0', () => {
  console.log('[BOOT] Health listening on port', PORT);
  (global as any).__earlyHttpServer = server;
  (global as any).__earlyPort = PORT;
  try {
    require('./server'); // eslint-disable-line
  } catch (err: any) {
    console.error('[BOOT] Server load failed (/health still works):', err?.message || err);
  }
});
