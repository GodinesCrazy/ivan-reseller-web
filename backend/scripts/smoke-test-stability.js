#!/usr/bin/env node
/**
 * ? FIX STABILITY: Smoke test para estabilidad de endpoints críticos
 * Verifica que /api/auth-status y /api/debug/auth-status-crash-safe respondan correctamente
 * 
 * Uso:
 *   node scripts/smoke-test-stability.js
 *   API_URL=https://www.ivanreseller.com AUTH_TOKEN=tu_token node scripts/smoke-test-stability.js
 */

const https = require('https');
const http = require('http');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

const TOTAL_REQUESTS = 50;
let successCount = 0;
let failCount = 0;
let errorCount = 0;
let unauthorizedCount = 0;

function makeRequest(endpoint, index) {
  return new Promise((resolve) => {
    const url = new URL(`${API_URL}${endpoint}`);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(AUTH_TOKEN ? { 'Authorization': `Bearer ${AUTH_TOKEN}` } : {}),
      },
      timeout: 5000, // 5 segundos timeout
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          successCount++;
          console.log(`Request ${index + 1}/${TOTAL_REQUESTS} [${endpoint}]: ? 200 OK`);
          resolve({ status: res.statusCode, success: true, endpoint });
        } else if (res.statusCode === 401) {
          unauthorizedCount++;
          console.log(`Request ${index + 1}/${TOTAL_REQUESTS} [${endpoint}]: ?? 401 Unauthorized`);
          resolve({ status: res.statusCode, success: false, error: 'unauthorized', endpoint });
        } else if (res.statusCode === 502 || res.statusCode === 503 || res.statusCode === 504) {
          failCount++;
          console.log(`Request ${index + 1}/${TOTAL_REQUESTS} [${endpoint}]: ? ${res.statusCode} (CRASH/BAD_GATEWAY)`);
          resolve({ status: res.statusCode, success: false, error: 'crash', endpoint });
        } else {
          errorCount++;
          console.log(`Request ${index + 1}/${TOTAL_REQUESTS} [${endpoint}]: ??  ${res.statusCode}`);
          resolve({ status: res.statusCode, success: false, error: 'other', endpoint });
        }
      });
    });

    req.on('error', (error) => {
      failCount++;
      console.log(`Request ${index + 1}/${TOTAL_REQUESTS} [${endpoint}]: ? Connection failed: ${error.message}`);
      resolve({ status: 0, success: false, error: 'connection_failed', endpoint });
    });

    req.on('timeout', () => {
      req.destroy();
      failCount++;
      console.log(`Request ${index + 1}/${TOTAL_REQUESTS} [${endpoint}]: ? Timeout`);
      resolve({ status: 0, success: false, error: 'timeout', endpoint });
    });

    req.end();
  });
}

async function runSmokeTest() {
  console.log('?? Smoke Test: Stability Endpoints');
  console.log('===================================');
  console.log(`API_URL: ${API_URL}`);
  console.log(`Requests per endpoint: ${TOTAL_REQUESTS}`);
  console.log(`Total requests: ${TOTAL_REQUESTS * 2}`);
  console.log('');

  const endpoints = [
    '/api/auth-status',
    '/api/debug/auth-status-crash-safe',
  ];

  const requests = [];
  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    for (const endpoint of endpoints) {
      requests.push(makeRequest(endpoint, i * endpoints.length + endpoints.indexOf(endpoint)));
      // Peque?o delay entre requests (50ms)
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  await Promise.all(requests);

  console.log('');
  console.log('===================================');
  console.log('?? Resultados:');
  console.log(`   ? Exitosos (200): ${successCount}/${TOTAL_REQUESTS * 2}`);
  console.log(`   ?? No autorizados (401): ${unauthorizedCount}/${TOTAL_REQUESTS * 2}`);
  console.log(`   ??  Otros errores: ${errorCount}/${TOTAL_REQUESTS * 2}`);
  console.log(`   ? Fallos críticos (502/503/504/000): ${failCount}/${TOTAL_REQUESTS * 2}`);
  console.log('');

  if (failCount > 0) {
    console.log(`? FALLO: Se detectaron ${failCount} errores críticos (502/503/504 o connection failed)`);
    console.log('   El backend está crasheando o no está disponible - revisar logs');
    process.exit(1);
  } else if (successCount === TOTAL_REQUESTS * 2) {
    console.log('? ÉXITO: Todos los requests respondieron 200 OK');
    process.exit(0);
  } else {
    console.log('??  ADVERTENCIA: Algunos requests fallaron pero no hay crashes');
    console.log('   Revisar logs para más detalles');
    process.exit(0);
  }
}

runSmokeTest().catch((error) => {
  console.error('? Error ejecutando smoke test:', error);
  process.exit(1);
});
