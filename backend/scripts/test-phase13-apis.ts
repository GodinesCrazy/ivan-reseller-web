/**
 * Test Phase 13 APIs with auth.
 * Usage: npx tsx scripts/test-phase13-apis.ts [baseUrl]
 * Uses AUTOPILOT_LOGIN_USER / AUTOPILOT_LOGIN_PASSWORD or admin/admin from env.
 */
import '../src/config/env';
import { authService } from '../src/services/auth.service';

const BASE = process.argv[2] || process.env.API_URL || 'http://localhost:4000';

async function request(
  method: string,
  path: string,
  token: string,
  body?: object
): Promise<{ status: number; data: any }> {
  const url = `${BASE.replace(/\/$/, '')}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  const user = process.env.AUTOPILOT_LOGIN_USER || 'admin';
  const pass = process.env.AUTOPILOT_LOGIN_PASSWORD || 'admin';

  console.log('Base URL:', BASE);
  console.log('Logging in as', user, '...');

  let token: string;
  try {
    const result = await authService.login(user, pass);
    token = result.token;
    console.log('Login OK, token length:', token.length);
  } catch (e: any) {
    console.error('Login failed:', e?.message || e);
    process.exit(1);
  }

  console.log('\n--- GET /api/system/launch-readiness ---');
  const r1 = await request('GET', '/api/system/launch-readiness', token);
  console.log('Status:', r1.status);
  console.log(JSON.stringify(r1.data, null, 2));

  console.log('\n--- GET /api/system/launch-report ---');
  const r2 = await request('GET', '/api/system/launch-report', token);
  console.log('Status:', r2.status);
  console.log(JSON.stringify(r2.data, null, 2));

  console.log('\n--- POST /api/system/run-listing-compliance-audit ---');
  const r3 = await request('POST', '/api/system/run-listing-compliance-audit', token);
  console.log('Status:', r3.status);
  console.log(JSON.stringify(r3.data, null, 2));

  console.log('\n--- GET /api/analytics/fee-intelligence?marketplace=ebay&listingPrice=50&supplierCost=25 ---');
  const r4 = await request('GET', '/api/analytics/fee-intelligence?marketplace=ebay&listingPrice=50&supplierCost=25', token);
  console.log('Status:', r4.status);
  console.log(JSON.stringify(r4.data, null, 2));

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
