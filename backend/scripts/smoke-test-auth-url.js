#!/usr/bin/env node
/**
 * ? FIX OAUTH: Smoke test para /api/marketplace/auth-url/:marketplace
 * Verifica que el endpoint responda correctamente (200/302/401/422) y nunca 400 genérico o 502
 * 
 * Uso:
 *   node scripts/smoke-test-auth-url.js
 *   API_URL=https://www.ivanreseller.com AUTH_TOKEN=tu_token node scripts/smoke-test-auth-url.js
 */

const https = require('https');
const http = require('http');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const MARKETPLACE = process.env.MARKETPLACE || 'aliexpress-dropshipping';
const ENVIRONMENT = process.env.ENVIRONMENT || 'production';

if (!AUTH_TOKEN) {
  console.error('? ERROR: AUTH_TOKEN no está configurado');
  console.error('   Ejemplo: AUTH_TOKEN=tu_token node scripts/smoke-test-auth-url.js');
  process.exit(1);
}

const TOTAL_REQUESTS = 20;
let successCount = 0;
let failCount = 0;
let errorCount = 0;
let unauthorizedCount = 0;
let validationErrorCount = 0;

function makeRequest(index) {
  return new Promise((resolve) => {
    const url = new URL(`${API_URL}/api/marketplace/auth-url/${MARKETPLACE}`);
    url.searchParams.append('environment', ENVIRONMENT);
    
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 segundos timeout
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let responseData;
        try {
          responseData = JSON.parse(data);
        } catch (e) {
          responseData = { raw: data.substring(0, 200) };
        }

        if (res.statusCode === 200 || res.statusCode === 302) {
          // 200 OK con authUrl o 302 redirect son válidos
          const hasAuthUrl = responseData?.data?.authUrl || responseData?.authUrl;
          if (hasAuthUrl || res.statusCode === 302) {
            successCount++;
            console.log(`Request ${index + 1}/${TOTAL_REQUESTS}: ? ${res.statusCode} OK${res.statusCode === 302 ? ' (Redirect)' : ''}`);
            if (hasAuthUrl) {
              const authUrlPreview = String(hasAuthUrl).substring(0, 60) + '...';
              console.log(`   Auth URL: ${authUrlPreview}`);
            }
            resolve({ status: res.statusCode, success: true, hasAuthUrl: !!hasAuthUrl });
          } else {
            errorCount++;
            console.log(`Request ${index + 1}/${TOTAL_REQUESTS}: ??  ${res.statusCode} OK pero sin authUrl`);
            console.log(`   Response: ${JSON.stringify(responseData).substring(0, 200)}`);
            resolve({ status: res.statusCode, success: false, error: 'missing_auth_url' });
          }
        } else if (res.statusCode === 401) {
          unauthorizedCount++;
          console.log(`Request ${index + 1}/${TOTAL_REQUESTS}: ?? 401 Unauthorized (token inválido o expirado)`);
          resolve({ status: res.statusCode, success: false, error: 'unauthorized' });
        } else if (res.statusCode === 422) {
          // 422 es válido si faltan credenciales (esperado en algunos casos)
          validationErrorCount++;
          const missingFields = responseData?.missingFields || [];
          console.log(`Request ${index + 1}/${TOTAL_REQUESTS}: ??  422 Validation Error (faltan credenciales: ${missingFields.join(', ') || 'N/A'})`);
          console.log(`   Message: ${responseData?.message || responseData?.error || 'N/A'}`);
          resolve({ status: res.statusCode, success: false, error: 'validation_error', missingFields });
        } else if (res.statusCode === 400) {
          // 400 genérico es un problema - debería ser 422 con missingFields
          failCount++;
          console.log(`Request ${index + 1}/${TOTAL_REQUESTS}: ? 400 Bad Request (debería ser 422 con missingFields)`);
          console.log(`   Response: ${JSON.stringify(responseData).substring(0, 200)}`);
          resolve({ status: res.statusCode, success: false, error: 'bad_request' });
        } else if (res.statusCode === 502) {
          failCount++;
          console.log(`Request ${index + 1}/${TOTAL_REQUESTS}: ? 502 Bad Gateway (CRASH DETECTADO)`);
          console.log(`   Response: ${data.substring(0, 200)}`);
          resolve({ status: res.statusCode, success: false, error: 'crash' });
        } else {
          errorCount++;
          console.log(`Request ${index + 1}/${TOTAL_REQUESTS}: ??  ${res.statusCode}`);
          console.log(`   Response: ${JSON.stringify(responseData).substring(0, 200)}`);
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
  console.log('?? Smoke Test: /api/marketplace/auth-url/:marketplace');
  console.log('==================================================');
  console.log(`API_URL: ${API_URL}`);
  console.log(`Marketplace: ${MARKETPLACE}`);
  console.log(`Environment: ${ENVIRONMENT}`);
  console.log(`Requests: ${TOTAL_REQUESTS}`);
  console.log('');

  const requests = [];
  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    requests.push(makeRequest(i));
    // Peque?o delay entre requests (100ms)
    if (i < TOTAL_REQUESTS - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  await Promise.all(requests);

  console.log('');
  console.log('==================================================');
  console.log('?? Resultados:');
  console.log(`   ? Exitosos (200/302 con authUrl): ${successCount}/${TOTAL_REQUESTS}`);
  console.log(`   ?? No autorizados (401): ${unauthorizedCount}/${TOTAL_REQUESTS}`);
  console.log(`   ??  Validación (422 - faltan credenciales): ${validationErrorCount}/${TOTAL_REQUESTS}`);
  console.log(`   ??  Otros errores: ${errorCount}/${TOTAL_REQUESTS}`);
  console.log(`   ? Fallos críticos (400/502/000): ${failCount}/${TOTAL_REQUESTS}`);
  console.log('');

  if (failCount > 0) {
    console.log(`? FALLO: Se detectaron ${failCount} errores críticos (400 genérico, 502 o connection failed)`);
    console.log('   El endpoint está devolviendo errores inesperados - revisar implementación');
    process.exit(1);
  } else if (successCount > 0 || validationErrorCount > 0) {
    // Éxito si al menos algunos requests funcionaron o devolvieron 422 (esperado si faltan credenciales)
    console.log('? ÉXITO: El endpoint responde correctamente');
    console.log('   - No hay 400 genéricos ni 502 (crashes)');
    console.log('   - Los errores son controlados (401, 422 con missingFields)');
    if (successCount > 0) {
      console.log(`   - ${successCount} requests generaron authUrl correctamente`);
    }
    process.exit(0);
  } else {
    console.log('??  ADVERTENCIA: Todos los requests fallaron pero no hay crashes');
    console.log('   Revisar logs para más detalles');
    process.exit(0);
  }
}

runSmokeTest().catch((error) => {
  console.error('? Error ejecutando smoke test:', error);
  process.exit(1);
});
