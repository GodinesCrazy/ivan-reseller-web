/**
 * ? P0: Absolute Minimal Server
 * 
 * Este servidor mùnimo se activa cuando FORCE_ROUTING_OK=true.
 * Su propùsito es asegurar que Railway siempre responda 200 a /health, /ready, /api/debug/ping y /api/debug/build-info
 * incluso si todo lo demùs estù roto.
 * 
 * Caracterùsticas:
 * - NO importa app.ts ni rutas
 * - NO usa Express (solo http nativo)
 * - Inicia en <50ms
 * - Jamùs crashea
 * - Responde siempre 200 a rutas crùticas
 */

import http from 'http';
import { URL } from 'url';

const PORT = Number(process.env.PORT || 3000);
// ? FIX: FORCE_ROUTING_OK debe ser explùcitamente 'true' para activar minimal server
// Default: false (NO activar minimal server por defecto)
// Minimal server solo se usa en emergencias extremas
const FORCE_ROUTING_OK = process.env.FORCE_ROUTING_OK === 'true'; // Solo si explùcitamente 'true'

// Build info
const gitSha = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || 'unknown').toString().substring(0, 7);
const buildTime = process.env.BUILD_TIME || process.env.RAILWAY_BUILD_TIME || new Date().toISOString();

function getBuildInfo() {
  return {
    gitSha,
    buildTime,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    mode: 'minimal',
  };
}

function createMinimalServer(): http.Server {
  const server = http.createServer((req, res) => {
    const startTime = Date.now();
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;
    const method = req.method;

    // CORS headers bùsicos
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Handle OPTIONS
    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health endpoint
    if (path === '/health' && method === 'GET') {
      const responseTime = Date.now() - startTime;
      const response = {
        ok: true,
        mode: 'minimal',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        port: PORT,
        uptime: process.uptime(),
        sha: gitSha,
        responseTime: `${responseTime}ms`,
        service: 'ivan-reseller-backend',
      };
      res.writeHead(200, {
        'X-Response-Time': `${responseTime}ms`,
        'X-Health': 'ok',
        'X-Mode': 'minimal',
      });
      res.end(JSON.stringify(response, null, 2));
      return;
    }

    // Ready endpoint
    if (path === '/ready' && method === 'GET') {
      const responseTime = Date.now() - startTime;
      const response = {
        ok: true,
        ready: true,
        mode: 'minimal',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        port: PORT,
        uptime: process.uptime(),
        sha: gitSha,
        responseTime: `${responseTime}ms`,
        service: 'ivan-reseller-backend',
      };
      res.writeHead(200, {
        'X-Response-Time': `${responseTime}ms`,
        'X-Health': 'ok',
        'X-Mode': 'minimal',
      });
      res.end(JSON.stringify(response, null, 2));
      return;
    }

    // Debug ping endpoint
    if (path === '/api/debug/ping' && method === 'GET') {
      const responseTime = Date.now() - startTime;
      const response = {
        ok: true,
        mode: 'minimal',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        port: PORT,
        uptime: process.uptime(),
        sha: gitSha,
        responseTime: `${responseTime}ms`,
        message: 'pong',
      };
      res.writeHead(200, {
        'X-Response-Time': `${responseTime}ms`,
        'X-Mode': 'minimal',
      });
      res.end(JSON.stringify(response, null, 2));
      return;
    }

    // Debug build-info endpoint
    if (path === '/api/debug/build-info' && method === 'GET') {
      const responseTime = Date.now() - startTime;
      const mem = process.memoryUsage();
      const response = {
        ok: true,
        mode: 'minimal',
        timestamp: new Date().toISOString(),
        build: getBuildInfo(),
        runtime: {
          pid: process.pid,
          port: PORT,
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        memory: {
          used: Math.round(mem.heapUsed / 1024 / 1024),
          total: Math.round(mem.heapTotal / 1024 / 1024),
          unit: 'MB',
        },
        responseTime: `${responseTime}ms`,
      };
      res.writeHead(200, {
        'X-Response-Time': `${responseTime}ms`,
        'X-Mode': 'minimal',
      });
      res.end(JSON.stringify(response, null, 2));
      return;
    }

    // Cualquier otra ruta -> 404 JSON
    const responseTime = Date.now() - startTime;
    const response = {
      ok: false,
      error: 'Not Found',
      mode: 'minimal',
      path,
      method,
      timestamp: new Date().toISOString(),
      message: 'Endpoint not available in minimal mode',
    };
    res.writeHead(404, {
      'X-Mode': 'minimal',
    });
    res.end(JSON.stringify(response, null, 2));
  });

  // Error handler - nunca crashear
  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error('[MINIMAL-SERVER] Error:', error.message);
    if (error.code === 'EADDRINUSE') {
      console.error(`[MINIMAL-SERVER] Port ${PORT} is already in use`);
      process.exit(1);
    }
    // Para otros errores, solo loggear
  });

  return server;
}

export function startMinimalServer(): void {
  // ? FIX: Minimal server SOLO se activa si FORCE_ROUTING_OK es explÌcitamente 'true'
  // En producciÛn normal, esto NUNCA debe activarse
  if (!FORCE_ROUTING_OK) {
    console.log('[MINIMAL-SERVER] FORCE_ROUTING_OK not set to "true", skipping minimal server');
    console.log('[MINIMAL-SERVER] Express will start normally');
    return;
  }

  // ?? ADVERTENCIA: Minimal server solo para emergencias extremas
  console.log('');
  console.log('??  ??  ??  MINIMAL SERVER MODE (EMERGENCY ONLY) ??  ??  ??');
  console.log('================================');
  console.log('   ??  WARNING: Minimal server is active');
  console.log('   ??  Express endpoints will NOT be available');
  console.log('   ??  Only /health, /ready, /api/debug/ping, /api/debug/build-info work');
  console.log('   ??  This should ONLY be used in extreme emergencies');
  console.log('================================');
  console.log(`   FORCE_ROUTING_OK=${FORCE_ROUTING_OK}`);
  console.log(`   PORT=${PORT}`);
  console.log(`   pid=${process.pid}`);
  console.log(`   gitSha=${gitSha}`);
  console.log('================================');
  console.log('');

  const server = createMinimalServer();
  const startTime = Date.now();

  server.listen(PORT, '0.0.0.0', () => {
    const bootTime = Date.now() - startTime;
    const address = server.address();
    const addressStr = typeof address === 'string'
      ? address
      : address ? `${address.address}:${address.port}` : 'unknown';

    console.log('');
    console.log('? MINIMAL SERVER LISTENING');
    console.log('================================');
    console.log(`   LISTENING host=0.0.0.0 port=${PORT}`);
    console.log(`   ADDR actual=${addressStr}`);
    console.log(`   Boot time: ${bootTime}ms`);
    console.log(`   pid: ${process.pid}`);
    console.log('');
    console.log('?? Minimal endpoints available:');
    console.log(`   Health: http://0.0.0.0:${PORT}/health`);
    console.log(`   Ready: http://0.0.0.0:${PORT}/ready`);
    console.log(`   Debug Ping: http://0.0.0.0:${PORT}/api/debug/ping`);
    console.log(`   Debug Build-Info: http://0.0.0.0:${PORT}/api/debug/build-info`);
    console.log('================================');
    console.log('? Minimal server ready - Railway health checks will pass');
    console.log('');
  });
}
