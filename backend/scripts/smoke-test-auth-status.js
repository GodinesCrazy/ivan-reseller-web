#!/usr/bin/env node
/**
 * ? FIX SIGSEGV: Smoke test para /api/auth-status
 * Verifica que el endpoint no crashee ni devuelva 502
 * 
 * Uso:
 *   node scripts/smoke-test-auth-status.js
 *   API_URL=https://www.ivanreseller.com AUTH_TOKEN=tu_token node scripts/smoke-test-auth-status.js
 */

const https = require('https');
const http = require('http');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

if (!AUTH_TOKEN) {
  console.error('? ERROR: AUTH_TOKEN no está configurado');
  console.error('   Ejemplo: AUTH_TOKEN=tu_token node scripts/smoke-test-auth-status.js');
  process.exit(1);
}

const TOTAL_REQUESTS = 20;
let successCount = 0;
let failCount = 0;
let errorCount = 0;

function makeRequest(index) {
  return new Promise((resolve) => {
    const url = new URL(`${API_URL}/api/auth-status`);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 5000, // 5 segundos timeout
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          successCount++;
          console.log(`Request ${index + 1}/${TOTAL_REQUESTS}: ? 200 OK`);
          resolve({ status: res.statusCode, success: true });
        } else if (res.statusCode === 401) {
          errorCount++;
          console.log(`Request ${index + 1}/${TOTAL_REQUESTS}: ??  401 Unauthorized (token inválido)`);
          resolve({ status: res.statusCode, success: false, error: 'unauthorized' });
        } else if (res.statusCode === 502) {
          failCount++;
          console.log(`Request ${index + 1}/${TOTAL_REQUESTS}: ? 502 Bad Gateway (CRASH DETECTADO)`);
          console.log(`   Response: ${data.substring(0, 200)}`);
          resolve({ status: res.statusCode, success: false, error: 'crash' });
        } else {
          errorCount++;
          console.log(`Request ${index + 1}/${TOTAL_REQUESTS}: ??  ${res.statusCode}`);
          resolve({ status: res.statusCode, success: false, error: 'other' });
        }
      });
    });

    req.on('error', (error) => {
      failCount++;
      console.log(`Request ${index + 1}/${TOTAL_REQUESTS}: ? Connection failed: ${error.message}`);
      resolve({ status: 0, success: false, error: 'connection_failed' });
    });

    req.on('timeout', () => {
      req.destroy();
      failCount++;
      console.log(`Request ${index + 1}/${TOTAL_REQUESTS}: ? Timeout`);
      resolve({ status: 0, success: false, error: 'timeout' });
    });

    req.end();
  });
}

async function runSmokeTest() {
  console.log('?? Smoke Test: /api/auth-status');
  console.log('=================================');
  console.log(`API_URL: ${API_URL}`);
  console.log(`Requests: ${TOTAL_REQUESTS}`);
  console.log('');

  const requests = [];
  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    requests.push(makeRequest(i));
    // Peque?o delay entre requests (50ms)
    if (i < TOTAL_REQUESTS - 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  await Promise.all(requests);

  console.log('');
  console.log('=================================');
  console.log('?? Resultados:');
  console.log(`   ? Exitosos (200): ${successCount}/${TOTAL_REQUESTS}`);
  console.log(`   ??  Errores (401/otros): ${errorCount}/${TOTAL_REQUESTS}`);
  console.log(`   ? Fallos (502/000): ${failCount}/${TOTAL_REQUESTS}`);
  console.log('');

  if (failCount > 0) {
    console.log(`? FALLO: Se detectaron ${failCount} crashes (502 o connection failed)`);
    console.log('   El endpoint está crasheando - revisar logs del servidor');
    process.exit(1);
  } else if (successCount === TOTAL_REQUESTS) {
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
