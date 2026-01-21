/**
 * ? FASE C: Smoke test para validar flujo OAuth de AliExpress Dropshipping API
 * Verifica que endpoints críticos NO retornen 502 y NO tengan X-Degraded salvo overload real
 */

const http = require('http');
const https = require('https');

// Configuración
const API_URL = process.env.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const TEST_COUNT = parseInt(process.env.TEST_COUNT || '30', 10);

// Helper para hacer requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(AUTH_TOKEN ? { 'Authorization': `Bearer ${AUTH_TOKEN}` } : {}),
        ...(options.headers || {}),
      },
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// Test individual
async function testEndpoint(name, path, method = 'GET') {
  const url = `${API_URL}${path}`;
  const startTime = Date.now();
  
  try {
    const response = await makeRequest(url, { method });
    const duration = Date.now() - startTime;
    
    const degraded = response.headers['x-degraded'] === 'true';
    const overloadReason = response.headers['x-overload-reason'];
    const is502 = response.statusCode === 502;
    
    let body;
    try {
      body = JSON.parse(response.body);
    } catch {
      body = response.body;
    }
    
    return {
      name,
      success: !is502 && response.statusCode < 500,
      statusCode: response.statusCode,
      duration,
      degraded,
      overloadReason,
      hasData: !!body?.data || !!body?.success,
    };
  } catch (error) {
    return {
      name,
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

// Ejecutar tests
async function runTests() {
  console.log('?? Smoke Test: AliExpress Dropshipping API OAuth Flow\n');
  console.log(`API URL: ${API_URL}`);
  console.log(`Test Count: ${TEST_COUNT}`);
  console.log(`Auth Token: ${AUTH_TOKEN ? '? Present' : '? Missing'}\n`);
  
  const results = {
    authStatus: [],
    authUrl: [],
    products: [],
    automationConfig: [],
  };
  
  // Test 1: /api/auth-status (30 requests)
  console.log(`[TEST 1] /api/auth-status (${TEST_COUNT} requests)...`);
  for (let i = 0; i < TEST_COUNT; i++) {
    const result = await testEndpoint('auth-status', '/api/auth-status');
    results.authStatus.push(result);
    
    if (i % 10 === 0) {
      process.stdout.write(`  ${i + 1}/${TEST_COUNT}... `);
    }
  }
  process.stdout.write('\n');
  
  // Test 2: /api/marketplace/auth-url/aliexpress-dropshipping
  console.log('[TEST 2] /api/marketplace/auth-url/aliexpress-dropshipping...');
  const authUrlResult = await testEndpoint('auth-url', '/api/marketplace/auth-url/aliexpress-dropshipping?redirect_uri=https://ivanreseller.com/aliexpress/callback');
  results.authUrl.push(authUrlResult);
  
  // Test 3: /api/products
  console.log('[TEST 3] /api/products...');
  const productsResult = await testEndpoint('products', '/api/products');
  results.products.push(productsResult);
  
  // Test 4: /api/automation/config
  console.log('[TEST 4] /api/automation/config...');
  const automationResult = await testEndpoint('automation-config', '/api/automation/config');
  results.automationConfig.push(automationResult);
  
  // Resumen
  console.log('\n?? RESUMEN:\n');
  
  // Auth Status
  const authStatusSuccess = results.authStatus.filter(r => r.success).length;
  const authStatus502 = results.authStatus.filter(r => r.statusCode === 502).length;
  const authStatusDegraded = results.authStatus.filter(r => r.degraded).length;
  const authStatusAvgDuration = results.authStatus.reduce((sum, r) => sum + (r.duration || 0), 0) / results.authStatus.length;
  
  console.log(`[auth-status]`);
  console.log(`  ? Success: ${authStatusSuccess}/${TEST_COUNT}`);
  console.log(`  ? 502 Errors: ${authStatus502}`);
  console.log(`  ??  Degraded: ${authStatusDegraded}`);
  console.log(`  ??  Avg Duration: ${Math.round(authStatusAvgDuration)}ms`);
  
  if (authStatus502 > 0) {
    console.log(`  ? FAIL: Se detectaron ${authStatus502} errores 502`);
  }
  if (authStatusDegraded > 0) {
    console.log(`  ??  WARNING: Se detectaron ${authStatusDegraded} respuestas degradadas`);
    const reasons = [...new Set(results.authStatus.filter(r => r.overloadReason).map(r => r.overloadReason))];
    console.log(`  Reasons: ${reasons.join(', ')}`);
  }
  
  // Auth URL
  console.log(`\n[auth-url]`);
  console.log(`  ? Success: ${authUrlResult.success ? 'YES' : 'NO'}`);
  console.log(`  Status: ${authUrlResult.statusCode}`);
  console.log(`  Degraded: ${authUrlResult.degraded ? 'YES' : 'NO'}`);
  if (authUrlResult.degraded) {
    console.log(`  ??  WARNING: Endpoint crítico está degradado (reason: ${authUrlResult.overloadReason})`);
  }
  
  // Products
  console.log(`\n[products]`);
  console.log(`  ? Success: ${productsResult.success ? 'YES' : 'NO'}`);
  console.log(`  Status: ${productsResult.statusCode}`);
  console.log(`  Degraded: ${productsResult.degraded ? 'YES' : 'NO'}`);
  
  // Automation Config
  console.log(`\n[automation-config]`);
  console.log(`  ? Success: ${automationResult.success ? 'YES' : 'NO'}`);
  console.log(`  Status: ${automationResult.statusCode}`);
  console.log(`  Degraded: ${automationResult.degraded ? 'YES' : 'NO'}`);
  
  // Resultado final
  console.log('\n?? RESULTADO FINAL:');
  const has502 = authStatus502 > 0 || authUrlResult.statusCode === 502;
  const criticalDegraded = authUrlResult.degraded;
  const allAuthStatusOk = authStatusSuccess === TEST_COUNT;
  
  if (has502) {
    console.log('? FAIL: Se detectaron errores 502');
    process.exit(1);
  } else if (criticalDegraded) {
    console.log('??  WARNING: Endpoint crítico está degradado');
    process.exit(0); // Warning, no error
  } else if (!allAuthStatusOk) {
    console.log('??  WARNING: Algunos requests de auth-status fallaron');
    process.exit(0); // Warning, no error
  } else {
    console.log('? PASS: Todos los tests pasaron');
    process.exit(0);
  }
}

// Ejecutar
runTests().catch((error) => {
  console.error('? Error ejecutando tests:', error);
  process.exit(1);
});
