/**
 * Test AliExpress product import pipeline
 * Run: node backend/test-aliexpress-import.mjs
 * Or: cd backend && node test-aliexpress-import.mjs (uses axios)
 */
const BASE = process.env.TEST_BASE || 'https://ivanreseller.com';

async function request(method, path, body = null, cookies = '') {
  const axios = (await import('axios')).default;
  const url = path.startsWith('http') ? path : BASE + (path.startsWith('/') ? path : '/' + path);
  const res = await axios({
    method,
    url,
    data: body,
    headers: {
      'Content-Type': 'application/json',
      ...(cookies ? { 'Cookie': cookies } : {}),
    },
    maxRedirects: 5,
    validateStatus: () => true,
    timeout: 120000,
  });
  return {
    status: res.status,
    headers: res.headers,
    data: res.data,
    raw: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
  };
}

async function main() {
  console.log('=== AliExpress Product Import Test ===');
  console.log('Base URL:', BASE);
  console.log('');

  // 1. Login
  console.log('1. POST /api/auth/login');
  const loginRes = await request('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin123',
  });
  console.log('   Status:', loginRes.status);
  console.log('   Body:', JSON.stringify(loginRes.data, null, 2));
  const setCookie = loginRes.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie || '');
  if (loginRes.status !== 200 || !loginRes.data?.success) {
    console.error('   Login failed. Cannot proceed.');
    process.exit(1);
  }
  console.log('   Cookie received:', cookies ? 'yes' : 'no');
  console.log('');

  // 2. Test import - POST /api/publisher/add_for_approval
  const importBody = {
    aliexpressUrl: 'https://www.aliexpress.com/item/1005000000000.html',
    scrape: true,
  };
  console.log('2. POST /api/publisher/add_for_approval');
  console.log('   Request body:', JSON.stringify(importBody, null, 2));
  const importRes = await request('POST', '/api/publisher/add_for_approval', importBody, cookies);
  console.log('   Status:', importRes.status);
  console.log('   Response:', JSON.stringify(importRes.data, null, 2));
  if (importRes.raw && !importRes.data) console.log('   Raw:', importRes.raw);
  console.log('');

  // 3. Also test POST /api/jobs/scraping (alternative - queues job)
  const jobsBody = { aliexpressUrl: 'https://www.aliexpress.com/item/1005000000000.html' };
  console.log('3. POST /api/jobs/scraping (alternative)');
  console.log('   Request body:', JSON.stringify(jobsBody, null, 2));
  const jobsRes = await request('POST', '/api/jobs/scraping', jobsBody, cookies);
  console.log('   Status:', jobsRes.status);
  console.log('   Response:', JSON.stringify(jobsRes.data, null, 2));
}

main().catch((e) => {
  console.error('Error:', e.message || e);
  process.exit(1);
});
