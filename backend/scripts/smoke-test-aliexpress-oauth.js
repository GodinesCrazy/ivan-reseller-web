/**
 * Smoke Test: AliExpress Dropshipping OAuth E2E (Node.js)
 *
 * Uses fetch (Node 18+). Does NOT use curl.exe.
 * Run: node backend/scripts/smoke-test-aliexpress-oauth.js
 *
 * - Login via POST /api/auth/login
 * - Store cookies, call /api/auth-status, /api/products
 * - GET /api/marketplace/auth-url/aliexpress-dropshipping?environment=production
 * - Print instructions to open authUrl manually
 * - GET /api/debug/aliexpress-dropshipping-credentials
 */

const API_BASE = process.env.API_URL || 'https://www.ivanreseller.com';
const USERNAME = process.env.TEST_USERNAME || 'admin';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

let cookieHeader = '';

function parseSetCookie(res) {
  const headers = res.headers;
  let parts = [];
  if (typeof headers.getSetCookie === 'function') {
    parts = headers.getSetCookie();
  } else {
    const v = headers.get?.('set-cookie');
    if (v) parts = [v];
  }
  const pairs = parts.map((c) => String(c).split(';')[0].trim()).filter(Boolean);
  if (pairs.length) cookieHeader = pairs.join('; ');
}

async function fetchApi(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = { ...opts.headers };
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { ...opts, headers, redirect: 'manual' });
  parseSetCookie(res);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  console.log('\n=== Smoke Test: AliExpress Dropshipping OAuth E2E (Node) ===\n');
  console.log('API_BASE:', API_BASE);
  console.log('USERNAME:', USERNAME);
  console.log('');

  // 1. Login
  console.log('[1] Login POST /api/auth/login ...');
  const loginRes = await fetchApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });

  if (loginRes.status !== 200 || !loginRes.data?.success) {
    console.error('  FAIL Login:', loginRes.status, JSON.stringify(loginRes.data));
    process.exit(1);
  }
  console.log('  OK Login success');
  const token = loginRes.data?.data?.token;
  if (token) console.log('  Token preview:', token.substring(0, 24) + '...');

  // 2. Auth-status & Products
  console.log('\n[2] GET /api/auth-status ...');
  const authStatusRes = await fetchApi('/api/auth-status');
  console.log('  Status:', authStatusRes.status, authStatusRes.ok ? 'OK' : 'FAIL');

  console.log('\n[3] GET /api/products ...');
  const productsRes = await fetchApi('/api/products');
  console.log('  Status:', productsRes.status, productsRes.ok ? 'OK' : 'FAIL');

  // 3. Auth URL
  console.log('\n[4] GET /api/marketplace/auth-url/aliexpress-dropshipping?environment=production ...');
  const authUrlRes = await fetchApi(
    '/api/marketplace/auth-url/aliexpress-dropshipping?environment=production'
  );

  if (authUrlRes.status !== 200 || !authUrlRes.data?.success || !authUrlRes.data?.data?.authUrl) {
    console.error('  FAIL Auth URL:', authUrlRes.status, JSON.stringify(authUrlRes.data));
    console.log('\n  Ensure App Key / App Secret are configured for aliexpress-dropshipping.');
    process.exit(1);
  }

  const authUrl = authUrlRes.data.data.authUrl;
  console.log('  OK Auth URL obtained');
  console.log('  Preview:', authUrl.substring(0, 80) + '...');
  console.log('\n  --- INSTRUCTIONS ---');
  console.log('  1. Open this URL in your browser to authorize AliExpress Dropshipping:');
  console.log('     ' + authUrl);
  console.log('  2. After authorizing, the callback will run and tokens will be stored.');
  console.log('  3. Re-run this script (or call /api/debug/aliexpress-dropshipping-credentials)');
  console.log('     to verify that credentials are saved.');
  console.log('  -------------------\n');

  // 4. Debug credentials (may not have tokens yet if OAuth not completed)
  console.log('[5] GET /api/debug/aliexpress-dropshipping-credentials ...');
  const debugRes = await fetchApi('/api/debug/aliexpress-dropshipping-credentials');

  if (debugRes.status !== 200) {
    console.log('  Status:', debugRes.status, debugRes.data ? JSON.stringify(debugRes.data) : '');
  } else if (debugRes.data?.ok) {
    const s = debugRes.data?.summary ?? {};
    console.log('  OK Credentials endpoint');
    console.log('  Production token:', s.hasProductionToken ? 'yes' : 'no');
    console.log('  Sandbox token:', s.hasSandboxToken ? 'yes' : 'no');
    console.log('  Any configured:', s.anyConfigured ? 'yes' : 'no');
  } else {
    console.log('  Response:', JSON.stringify(debugRes.data));
  }

  console.log('\n=== Smoke test finished ===\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
