/**
 * Script de diagnóstico para verificar conectividad desde Railway hacia AliExpress TOP API
 * Este script prueba:
 * 1. Conectividad básica a los endpoints
 * 2. Resolución DNS
 * 3. Timeout y latencia
 * 4. Respuesta de la API con credenciales reales
 */

import axios from 'axios';
import dns from 'dns';
import { promisify } from 'util';
import logger from '../config/logger';
import { CredentialsManager } from '../services/credentials-manager.service';
import { AliExpressAffiliateAPIService } from '../services/aliexpress-affiliate-api.service';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);

interface ConnectivityTest {
  name: string;
  endpoint: string;
  passed: boolean;
  latency?: number;
  error?: string;
  details?: any;
}

async function testDNSResolution(hostname: string): Promise<{ ipv4?: string[]; ipv6?: string[]; error?: string }> {
  try {
    const ipv4 = await resolve4(hostname);
    return { ipv4 };
  } catch (error: any) {
    try {
      const ipv6 = await resolve6(hostname);
      return { ipv6 };
    } catch (error2: any) {
      return { error: `DNS resolution failed: ${error.message || String(error)}` };
    }
  }
}

async function testHTTPConnectivity(endpoint: string, timeout: number = 10000): Promise<ConnectivityTest> {
  const startTime = Date.now();
  const testName = `HTTP Connectivity to ${endpoint}`;
  
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname;
    
    // Test DNS first
    const dnsResult = await testDNSResolution(hostname);
    if (dnsResult.error) {
      return {
        name: testName,
        endpoint,
        passed: false,
        error: `DNS resolution failed: ${dnsResult.error}`,
        details: { hostname }
      };
    }

    // Test HTTP connectivity
    const response = await axios.get(endpoint, {
      timeout,
      validateStatus: () => true, // Accept any status code
      maxRedirects: 0, // Don't follow redirects
    });

    const latency = Date.now() - startTime;
    
    return {
      name: testName,
      endpoint,
      passed: response.status < 500, // Any status < 500 means server is reachable
      latency,
      details: {
        status: response.status,
        statusText: response.statusText,
        headers: Object.keys(response.headers),
        dns: dnsResult
      }
    };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    const errorMessage = error?.message || String(error);
    
    return {
      name: testName,
      endpoint,
      passed: false,
      latency,
      error: errorMessage,
      details: {
        code: error?.code,
        errno: error?.errno,
        syscall: error?.syscall,
        address: error?.address,
        port: error?.port
      }
    };
  }
}

async function testAliExpressAPIEndpoint(endpoint: string, timeout: number = 30000): Promise<ConnectivityTest> {
  const startTime = Date.now();
  const testName = `AliExpress TOP API Endpoint: ${endpoint}`;
  
  try {
    // Create a minimal test request (without credentials, just to test connectivity)
    const testParams = new URLSearchParams({
      method: 'taobao.time.get',
      app_key: 'test',
      timestamp: new Date().toISOString().replace(/[-:]/g, '').split('.')[0],
      format: 'json',
      v: '2.0',
      sign_method: 'md5',
      sign: 'test'
    });

    const response = await axios.post(endpoint, testParams.toString(), {
      timeout,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      validateStatus: () => true, // Accept any status code
    });

    const latency = Date.now() - startTime;
    
    // Even if we get an error response, if we got a response, connectivity is OK
    const isConnected = response.status === 200 || 
                       (response.status < 500 && response.data);

    return {
      name: testName,
      endpoint,
      passed: isConnected,
      latency,
      details: {
        status: response.status,
        statusText: response.statusText,
        hasResponseData: !!response.data,
        responseType: typeof response.data,
        errorResponse: response.data?.error_response || null
      }
    };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    const errorMessage = error?.message || String(error);
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT');
    const isConnectError = errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND');
    
    return {
      name: testName,
      endpoint,
      passed: false,
      latency,
      error: errorMessage,
      details: {
        code: error?.code,
        errno: error?.errno,
        syscall: error?.syscall,
        address: error?.address,
        port: error?.port,
        isTimeout,
        isConnectError,
        note: isTimeout 
          ? 'Endpoint is reachable but not responding in time (may be firewall/network issue)'
          : isConnectError
          ? 'Cannot connect to endpoint (DNS or network issue)'
          : 'Unknown connectivity issue'
      }
    };
  }
}

async function testWithRealCredentials(userId: number, environment: 'sandbox' | 'production'): Promise<ConnectivityTest> {
  const startTime = Date.now();
  const testName = `AliExpress API with Real Credentials (${environment})`;
  
  try {
    // Get credentials
    const creds = await CredentialsManager.getCredentials(userId, 'aliexpress-affiliate', environment);
    
    if (!creds) {
      return {
        name: testName,
        endpoint: 'N/A',
        passed: false,
        error: `No credentials found for user ${userId} in ${environment} environment`,
        details: {
          recommendation: 'Configure AliExpress Affiliate API credentials in Settings → API Settings'
        }
      };
    }

    // Normalize sandbox flag
    if (creds.sandbox === undefined) {
      creds.sandbox = environment === 'sandbox';
    }

    // Initialize service
    const apiService = new AliExpressAffiliateAPIService();
    apiService.setCredentials(creds);

    // Make a test API call
    const testQuery = 'test';
    const products = await apiService.searchProducts({
      keywords: testQuery,
      pageSize: 1,
      targetCurrency: 'USD',
      targetLanguage: 'ES',
      shipToCountry: 'US',
    });

    const latency = Date.now() - startTime;

    return {
      name: testName,
      endpoint: 'https://gw.api.taobao.com/router/rest',
      passed: true,
      latency,
      details: {
        productsReturned: products?.length || 0,
        sandbox: creds.sandbox,
        appKey: creds.appKey ? `${creds.appKey.substring(0, 6)}...` : 'missing'
      }
    };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    const errorMessage = error?.message || String(error);
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT');
    
    return {
      name: testName,
      endpoint: 'https://gw.api.taobao.com/router/rest',
      passed: false,
      latency,
      error: errorMessage,
      details: {
        isTimeout,
        note: isTimeout
          ? 'API endpoint is reachable but request timed out. This may indicate network latency or API server issues.'
          : 'API call failed. Check credentials and network connectivity.'
      }
    };
  }
}

async function runConnectivityTests() {
  console.log('\n🔍 DIAGNÓSTICO DE CONECTIVIDAD RAILWAY → ALIEXPRESS API\n');
  console.log('='.repeat(80));
  
  const tests: ConnectivityTest[] = [];
  const testUserId = 1;

  // Test 1: DNS Resolution
  console.log('\n1️⃣ Probando resolución DNS...');
  const dnsResult = await testDNSResolution('gw.api.taobao.com');
  if (dnsResult.error) {
    console.log(`   ❌ DNS Error: ${dnsResult.error}`);
  } else {
    console.log(`   ✅ DNS Resolved:`);
    if (dnsResult.ipv4) {
      console.log(`      IPv4: ${dnsResult.ipv4.join(', ')}`);
    }
    if (dnsResult.ipv6) {
      console.log(`      IPv6: ${dnsResult.ipv6.join(', ')}`);
    }
  }

  // Test 2: Basic HTTP connectivity to endpoint
  console.log('\n2️⃣ Probando conectividad HTTP básica...');
  const httpTest = await testHTTPConnectivity('https://gw.api.taobao.com/router/rest', 10000);
  tests.push(httpTest);
  if (httpTest.passed) {
    console.log(`   ✅ ${httpTest.name}`);
    console.log(`      Latency: ${httpTest.latency}ms`);
    console.log(`      Status: ${httpTest.details?.status}`);
  } else {
    console.log(`   ❌ ${httpTest.name}`);
    console.log(`      Error: ${httpTest.error}`);
    if (httpTest.details) {
      console.log(`      Details:`, JSON.stringify(httpTest.details, null, 2));
    }
  }

  // Test 3: AliExpress TOP API endpoint (with test request)
  console.log('\n3️⃣ Probando endpoint de AliExpress TOP API...');
  const apiTest = await testAliExpressAPIEndpoint('https://gw.api.taobao.com/router/rest', 30000);
  tests.push(apiTest);
  if (apiTest.passed) {
    console.log(`   ✅ ${apiTest.name}`);
    console.log(`      Latency: ${apiTest.latency}ms`);
    console.log(`      Status: ${apiTest.details?.status}`);
    if (apiTest.details?.errorResponse) {
      console.log(`      ⚠️  API returned error (but connectivity is OK):`, apiTest.details.errorResponse);
    }
  } else {
    console.log(`   ❌ ${apiTest.name}`);
    console.log(`      Error: ${apiTest.error}`);
    console.log(`      Latency: ${apiTest.latency}ms`);
    if (apiTest.details) {
      console.log(`      Details:`, JSON.stringify(apiTest.details, null, 2));
    }
  }

  // Test 4: Test with real credentials (sandbox)
  console.log('\n4️⃣ Probando con credenciales reales (sandbox)...');
  const sandboxTest = await testWithRealCredentials(testUserId, 'sandbox');
  tests.push(sandboxTest);
  if (sandboxTest.passed) {
    console.log(`   ✅ ${sandboxTest.name}`);
    console.log(`      Latency: ${sandboxTest.latency}ms`);
    console.log(`      Products returned: ${sandboxTest.details?.productsReturned || 0}`);
  } else {
    console.log(`   ❌ ${sandboxTest.name}`);
    console.log(`      Error: ${sandboxTest.error}`);
    console.log(`      Latency: ${sandboxTest.latency}ms`);
    if (sandboxTest.details) {
      console.log(`      Details:`, JSON.stringify(sandboxTest.details, null, 2));
    }
  }

  // Test 5: Test with real credentials (production)
  console.log('\n5️⃣ Probando con credenciales reales (production)...');
  const productionTest = await testWithRealCredentials(testUserId, 'production');
  tests.push(productionTest);
  if (productionTest.passed) {
    console.log(`   ✅ ${productionTest.name}`);
    console.log(`      Latency: ${productionTest.latency}ms`);
    console.log(`      Products returned: ${productionTest.details?.productsReturned || 0}`);
  } else {
    console.log(`   ❌ ${productionTest.name}`);
    console.log(`      Error: ${productionTest.error}`);
    console.log(`      Latency: ${productionTest.latency}ms`);
    if (productionTest.details) {
      console.log(`      Details:`, JSON.stringify(productionTest.details, null, 2));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 RESUMEN DE PRUEBAS:\n');
  
  const passed = tests.filter(t => t.passed).length;
  const failed = tests.filter(t => !t.passed).length;
  
  console.log(`   ✅ Pasadas: ${passed}/${tests.length}`);
  console.log(`   ❌ Fallidas: ${failed}/${tests.length}`);
  
  if (failed > 0) {
    console.log('\n   ⚠️  PRUEBAS FALLIDAS:');
    tests.filter(t => !t.passed).forEach(test => {
      console.log(`      - ${test.name}`);
      console.log(`        Error: ${test.error}`);
      if (test.details?.note) {
        console.log(`        Nota: ${test.details.note}`);
      }
    });
  }

  // Recommendations
  console.log('\n💡 RECOMENDACIONES:\n');
  
  const timeoutTests = tests.filter(t => t.details?.isTimeout);
  const connectErrorTests = tests.filter(t => t.details?.isConnectError);
  
  if (timeoutTests.length > 0) {
    console.log('   ⚠️  Se detectaron timeouts:');
    console.log('      - La API puede estar lenta o bloqueada por firewall');
    console.log('      - Considera aumentar el timeout o verificar reglas de firewall en Railway');
    console.log('      - El sistema tiene fallback a scraping nativo que funciona correctamente');
  }
  
  if (connectErrorTests.length > 0) {
    console.log('   ⚠️  Se detectaron errores de conexión:');
    console.log('      - Verifica la configuración de red en Railway');
    console.log('      - Verifica que Railway permita conexiones salientes a gw.api.taobao.com');
    console.log('      - Verifica la resolución DNS');
  }
  
  if (passed === tests.length) {
    console.log('   ✅ Todas las pruebas pasaron. La conectividad está funcionando correctamente.');
  }

  console.log('\n' + '='.repeat(80));
  console.log('🏁 DIAGNÓSTICO COMPLETADO\n');

  // Log to structured logger
  logger.info('Connectivity test completed', {
    totalTests: tests.length,
    passed,
    failed,
    results: tests.map(t => ({
      name: t.name,
      passed: t.passed,
      latency: t.latency,
      error: t.error
    }))
  });
}

// Run tests
runConnectivityTests()
  .then(() => {
    console.log('✅ Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error fatal:', error);
    logger.error('Connectivity test failed', { error: error?.message || String(error), stack: error?.stack });
    process.exit(1);
  });

