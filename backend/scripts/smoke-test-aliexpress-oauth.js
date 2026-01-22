/**
 * ? FIX OAUTH: Smoke Test para AliExpress Dropshipping OAuth
 * 
 * Script para validar:
 * - Login funciona
 * - GET /api/marketplace/auth-url/aliexpress-dropshipping devuelve authUrl
 * - Endpoints no devuelven 500
 * - Credenciales se pueden leer
 */

const https = require('https');
const http = require('http');

const API_URL = process.env.API_URL || 'https://www.ivanreseller.com';
const USERNAME = process.env.TEST_USERNAME || 'admin';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

let sessionCookie = '';

/**
 * Helper para hacer requests HTTP/HTTPS
 */
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        // Guardar cookies de Set-Cookie header
        if (res.headers['set-cookie']) {
          sessionCookie = res.headers['set-cookie']
            .map(cookie => cookie.split(';')[0])
            .join('; ');
        }
        
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: body,
          data: (() => {
            try {
              return JSON.parse(body);
            } catch {
              return body;
            }
          })(),
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

/**
 * Test 1: Login
 */
async function testLogin() {
  console.log('\n[TEST 1] Login...');
  
  const url = new URL(`${API_URL}/api/auth/login`);
  const body = JSON.stringify({
    username: USERNAME,
    password: PASSWORD,
  });

  try {
    const response = await makeRequest({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      protocol: url.protocol,
    }, body);

    if (response.status === 200 && response.data.success) {
      console.log('  ? Login exitoso');
      console.log(`  Token: ${response.data.data?.token?.substring(0, 20)}...`);
      return response.data.data?.token || null;
    } else {
      console.log(`  ? Login falló: ${response.status} - ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (error) {
    console.log(`  ? Error en login: ${error.message}`);
    return null;
  }
}

/**
 * Test 2: Auth URL
 */
async function testAuthUrl(token) {
  console.log('\n[TEST 2] Obtener auth URL...');
  
  const url = new URL(`${API_URL}/api/marketplace/auth-url/aliexpress-dropshipping`);
  url.searchParams.set('redirect_uri', 'https://www.ivanreseller.com/api/aliexpress/callback');

  const headers = {
    'Cookie': sessionCookie || `token=${token}`,
  };

  if (token && !sessionCookie) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await makeRequest({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers,
      protocol: url.protocol,
    });

    if (response.status === 200 && response.data.success && response.data.data?.authUrl) {
      console.log('  ? Auth URL obtenida');
      console.log(`  Auth URL: ${response.data.data.authUrl.substring(0, 80)}...`);
      return true;
    } else {
      console.log(`  ? Auth URL falló: ${response.status} - ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    console.log(`  ? Error obteniendo auth URL: ${error.message}`);
    return false;
  }
}

/**
 * Test 3: Debug Credentials
 */
async function testDebugCredentials(token) {
  console.log('\n[TEST 3] Verificar credenciales guardadas...');
  
  const url = new URL(`${API_URL}/api/debug/aliexpress-dropshipping-credentials`);

  const headers = {
    'Cookie': sessionCookie || `token=${token}`,
  };

  if (token && !sessionCookie) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await makeRequest({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers,
      protocol: url.protocol,
    });

    if (response.status === 200 && response.data.ok) {
      console.log('  ? Credenciales obtenidas');
      const summary = response.data.summary;
      console.log(`  Production token: ${summary.hasProductionToken ? '?' : '?'}`);
      console.log(`  Sandbox token: ${summary.hasSandboxToken ? '?' : '?'}`);
      console.log(`  Any configured: ${summary.anyConfigured ? '?' : '?'}`);
      return true;
    } else {
      console.log(`  ? Credenciales fallaron: ${response.status} - ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    console.log(`  ? Error obteniendo credenciales: ${error.message}`);
    return false;
  }
}

/**
 * Test 4: Validar que endpoints no devuelven 500
 */
async function testNo500(token) {
  console.log('\n[TEST 4] Validar que endpoints no devuelven 500...');
  
  const endpoints = [
    '/api/auth-status',
    '/api/products',
  ];

  let allPassed = true;

  for (const endpoint of endpoints) {
    const url = new URL(`${API_URL}${endpoint}`);
    
    const headers = {
      'Cookie': sessionCookie || `token=${token}`,
    };

    if (token && !sessionCookie) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await makeRequest({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'GET',
        headers,
        protocol: url.protocol,
      });

      if (response.status >= 500) {
        console.log(`  ? ${endpoint} devolvió ${response.status}`);
        allPassed = false;
      } else {
        console.log(`  ? ${endpoint} OK (${response.status})`);
      }
    } catch (error) {
      console.log(`  ? Error en ${endpoint}: ${error.message}`);
      allPassed = false;
    }
  }

  return allPassed;
}

/**
 * Main
 */
async function main() {
  console.log('?? Smoke Test: AliExpress Dropshipping OAuth');
  console.log(`API URL: ${API_URL}`);
  console.log(`Username: ${USERNAME}`);

  const token = await testLogin();
  if (!token) {
    console.log('\n? Login falló, abortando tests');
    process.exit(1);
  }

  const authUrlOk = await testAuthUrl(token);
  const debugOk = await testDebugCredentials(token);
  const no500Ok = await testNo500(token);

  console.log('\n?? Resumen:');
  console.log(`  Login: ?`);
  console.log(`  Auth URL: ${authUrlOk ? '?' : '?'}`);
  console.log(`  Debug Credentials: ${debugOk ? '?' : '?'}`);
  console.log(`  No 500 errors: ${no500Ok ? '?' : '?'}`);

  if (authUrlOk && debugOk && no500Ok) {
    console.log('\n? Todos los tests pasaron');
    process.exit(0);
  } else {
    console.log('\n? Algunos tests fallaron');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\n? Error fatal:', error);
  process.exit(1);
});
