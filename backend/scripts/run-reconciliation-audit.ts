/**
 * Phase 15: Run listing state reconciliation audit against production (or given URL).
 * Uses AUTOPILOT_LOGIN_USER / AUTOPILOT_LOGIN_PASSWORD for auth.
 *
 * Usage:
 *   npx tsx scripts/run-reconciliation-audit.ts
 *   npx tsx scripts/run-reconciliation-audit.ts https://ivan-reseller-backend-production.up.railway.app
 */
import '../src/config/env';

const BASE_URL = process.argv[2]?.replace(/\/$/, '') || 'https://ivan-reseller-backend-production.up.railway.app';

function parseTokenFromSetCookie(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/token=([^;]+)/);
  return match ? match[1].trim() : null;
}

async function login(baseUrl: string): Promise<string> {
  const user = process.env.AUTOPILOT_LOGIN_USER || 'admin';
  const pass = process.env.AUTOPILOT_LOGIN_PASSWORD || 'admin123';
  const url = `${baseUrl}/api/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Login failed ${res.status}. Set AUTOPILOT_LOGIN_USER and AUTOPILOT_LOGIN_PASSWORD.`);
  }
  const tokenFromBody = data.token ?? data.data?.token;
  if (tokenFromBody) return tokenFromBody;
  const token = parseTokenFromSetCookie(res.headers.get('set-cookie'));
  if (!token) throw new Error('Login OK but no token in cookie or body.');
  return token;
}

async function main() {
  console.log('Backend URL:', BASE_URL);
  console.log('Logging in...');
  const token = await login(BASE_URL);
  console.log('Running reconciliation audit (POST /api/publisher/listings/run-reconciliation-audit)...');
  const res = await fetch(`${BASE_URL}/api/publisher/listings/run-reconciliation-audit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Audit request failed:', res.status, data);
    process.exit(1);
  }
  console.log('Result:', JSON.stringify(data, null, 2));
  if (data.success) {
    console.log(`Done. Scanned: ${data.scanned}, corrected: ${data.corrected}, errors: ${data.errors}.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
