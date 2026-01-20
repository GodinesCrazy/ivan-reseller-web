#!/usr/bin/env node
/**
 * ? Smoke Test Script for Production Endpoints
 * 
 * Verifica que los endpoints críticos respondan correctamente sin errores 500.
 * 
 * Uso:
 *   node scripts/smoke-prod.mjs
 *   node scripts/smoke-prod.mjs --base-url=https://www.ivanreseller.com
 */

const BASE_URL = process.env.BASE_URL || process.argv.find(arg => arg.startsWith('--base-url='))?.split('=')[1] || 'https://www.ivanreseller.com';

const endpoints = [
  { path: '/api/health', method: 'GET', expectedStatus: 200, description: 'Health check' },
  { path: '/api/setup-status', method: 'GET', expectedStatus: [200, 401], description: 'Setup status (may require auth)' },
  { path: '/api/opportunities?query=test&maxItems=1', method: 'GET', expectedStatus: [200, 401, 422], description: 'Opportunities search (may require auth/credentials)' },
];

async function testEndpoint(endpoint) {
  const url = `${BASE_URL}${endpoint.path}`;
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, {
      method: endpoint.method,
      headers: {
        'Accept': 'application/json',
      },
    });
    
    const duration = Date.now() - startTime;
    const status = response.status;
    const expectedStatuses = Array.isArray(endpoint.expectedStatus) ? endpoint.expectedStatus : [endpoint.expectedStatus];
    const isExpected = expectedStatuses.includes(status);
    
    let body = '';
    try {
      body = await response.text();
      // Intentar parsear como JSON si es posible
      try {
        const json = JSON.parse(body);
        body = JSON.stringify(json, null, 2);
      } catch {}
    } catch {}
    
    const bodyPreview = body.length > 200 ? body.substring(0, 200) + '...' : body;
    
    return {
      endpoint: endpoint.path,
      description: endpoint.description,
      url,
      status,
      expectedStatuses,
      isExpected,
      duration: `${duration}ms`,
      bodyPreview,
      success: isExpected && status !== 500,
      error: status === 500 ? 'Internal Server Error (500)' : (!isExpected ? `Unexpected status ${status}` : null)
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      endpoint: endpoint.path,
      description: endpoint.description,
      url,
      status: 'ERROR',
      duration: `${duration}ms`,
      success: false,
      error: error.message || String(error)
    };
  }
}

async function runSmokeTests() {
  console.log('');
  console.log('?? Smoke Tests for Production Endpoints');
  console.log('========================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Testing ${endpoints.length} endpoints...`);
  console.log('');
  
  const results = [];
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint);
    results.push(result);
    
    const statusIcon = result.success ? '?' : '?';
    const statusText = typeof result.status === 'number' ? result.status : result.status;
    console.log(`${statusIcon} ${endpoint.description}`);
    console.log(`   ${endpoint.method} ${endpoint.path}`);
    console.log(`   Status: ${statusText} ${result.isExpected ? '(expected)' : '(unexpected)'}`);
    console.log(`   Duration: ${result.duration}`);
    if (result.error) {
      console.log(`   ??  Error: ${result.error}`);
    }
    if (result.bodyPreview) {
      console.log(`   Body: ${result.bodyPreview}`);
    }
    console.log('');
    
    // Peque?o delay entre requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Resumen
  console.log('========================================');
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  const has500 = results.some(r => r.status === 500);
  
  console.log(`Results: ${successCount}/${results.length} passed`);
  if (failCount > 0) {
    console.log(`??  ${failCount} endpoint(s) failed or returned unexpected status`);
  }
  if (has500) {
    console.log(`? CRITICAL: Found 500 Internal Server Error(s) - endpoints are crashing!`);
    process.exit(1);
  }
  if (failCount === 0) {
    console.log('? All endpoints responded correctly (no 500 errors)');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSmokeTests().catch(error => {
  console.error('? Smoke test script failed:', error);
  process.exit(1);
});
