/**
 * Test AliExpress import with local backend + native scraper.
 * Requires: backend on 4000, native-scraper on 4444.
 * Run: node test-import-local.mjs
 */
import https from 'https';
import http from 'http';

const BASE = 'http://localhost:4000';
const client = BASE.startsWith('https') ? https : http;

function request(method, path, body, cookies = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (cookies) opts.headers['Cookie'] = cookies;
    if (body && method !== 'GET') {
      const data = JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = client.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json;
        try { json = JSON.parse(text); } catch { json = text; }
        resolve({ status: res.statusCode, headers: res.headers, data: json, raw: text });
      });
    });
    req.on('error', reject);
    if (body && method !== 'GET') req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('1. Logging in...');
  const loginRes = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  if (loginRes.status !== 200 || !loginRes.data?.success) {
    console.error('Login failed:', JSON.stringify(loginRes.data));
    process.exit(1);
  }
  const setCookie = loginRes.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie.map(c => c.split(';')[0]).join('; ') : (setCookie || '').split(';')[0] || '';
  console.log('Login OK. Cookies:', cookies ? 'present' : 'MISSING');

  console.log('2. POST add_for_approval (may take 1-2 min if CAPTCHA appears)...');
  const importRes = await request('POST', '/api/publisher/add_for_approval', {
    aliexpressUrl: 'https://es.aliexpress.com/item/1005010682763614.html',
    scrape: true,
  }, cookies);

  console.log('\n--- Response ---');
  console.log('Status:', importRes.status);
  console.log('Body:', JSON.stringify(importRes.data, null, 2));
  const d = importRes.data?.data || importRes.data;
  if (d) {
    console.log('\n--- Output ---');
    console.log('success:', importRes.data?.success ?? importRes.status === 201);
    console.log('title:', d?.title ?? d?.data?.title ?? 'N/A');
    console.log('images.length:', Array.isArray(d?.images) ? d.images.length : (d?.data?.images?.length ?? 'N/A'));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
