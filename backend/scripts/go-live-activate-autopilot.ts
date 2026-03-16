/**
 * Go-Live: Enable autopilot and run first cycle.
 * Usage: npx tsx scripts/go-live-activate-autopilot.ts [baseUrl] [--force]
 *
 * Uses AUTOPILOT_LOGIN_USER / AUTOPILOT_LOGIN_PASSWORD (or admin/admin).
 * If --force is not set, checks launch-readiness and skips activation when
 * systemReadyForAutonomousOperation is false.
 *
 * Token: prefers cookie from POST /api/auth/login. If no cookie (e.g. cross-origin),
 * uses authService.login when BASE matches API_URL (same env as backend).
 */
import '../src/config/env';

const BASE = process.argv[2] || process.env.API_URL || 'http://localhost:4000';
const force = process.argv.includes('--force');

function parseTokenFromSetCookie(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/token=([^;]+)/);
  return match ? match[1].trim() : null;
}

async function login(baseUrl: string): Promise<string> {
  const user = process.env.AUTOPILOT_LOGIN_USER || 'admin';
  const pass = process.env.AUTOPILOT_LOGIN_PASSWORD || 'admin';
  const apiUrl = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
  const baseNorm = baseUrl.replace(/\/$/, '');
  if (baseNorm === apiUrl) {
    try {
      const { authService } = await import('../src/services/auth.service');
      const result = await authService.login(user, pass);
      if (result?.token) return result.token;
    } catch (_) {}
  }
  const url = `${baseNorm}/api/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Login failed ${res.status}. Use AUTOPILOT_LOGIN_USER and AUTOPILOT_LOGIN_PASSWORD for a valid production admin user.`);
  }
  const tokenFromBody = data.token ?? data.data?.token;
  if (tokenFromBody) return tokenFromBody;
  const setCookie = res.headers.get('set-cookie');
  const token = parseTokenFromSetCookie(setCookie);
  if (!token) {
    throw new Error(
      'Login OK but no token in cookie or body. Set API_URL to the same backend URL and ensure AUTOPILOT_LOGIN_* are correct, or run from backend with same DATABASE_URL/JWT_SECRET.'
    );
  }
  return token;
}

async function request(
  method: string,
  path: string,
  token: string,
  baseUrl: string,
  body?: object
): Promise<{ status: number; data: any }> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
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
  console.log('Base URL:', BASE);
  console.log('Logging in...');

  let token: string;
  try {
    token = await login(BASE);
    console.log('Login OK.');
  } catch (e: any) {
    console.error('Login failed:', e?.message || e);
    process.exit(1);
  }

  if (!force) {
    const r = await request('GET', '/api/system/launch-readiness', token, BASE);
    const ready = r.data?.systemReadyForAutonomousOperation === true;
    if (!ready && r.status === 200) {
      console.warn('Launch readiness: systemReadyForAutonomousOperation is false. Alerts:', r.data?.alerts || []);
      console.warn('Run with --force to enable autopilot anyway, or fix issues and run again.');
      process.exit(1);
    }
    if (r.status !== 200) {
      console.warn('Could not fetch launch-readiness:', r.status, r.data);
      console.warn('Run with --force to skip readiness check.');
      process.exit(1);
    }
    console.log('Launch readiness OK.');
  } else {
    console.log('Skipping launch-readiness (--force).');
  }

  console.log('Enabling autopilot config...');
  const putRes = await request('PUT', '/api/autopilot/config', token, BASE, {
    enabled: true,
    targetMarketplaces: ['mercadolibre', 'ebay'],
  });
  if (putRes.status !== 200) {
    console.error('PUT /api/autopilot/config failed:', putRes.status, putRes.data);
    process.exit(1);
  }
  console.log('Config updated.');

  console.log('Starting autopilot...');
  const startRes = await request('POST', '/api/autopilot/start', token, BASE);
  if (startRes.status !== 200) {
    console.error('POST /api/autopilot/start failed:', startRes.status, startRes.data);
    process.exit(1);
  }
  console.log('Autopilot started.');

  console.log('Running first cycle (production)...');
  const cycleRes = await request('POST', '/api/autopilot/run-cycle', token, BASE, {
    environment: 'production',
  });
  if (cycleRes.status !== 200) {
    console.error('POST /api/autopilot/run-cycle failed:', cycleRes.status, cycleRes.data);
    process.exit(1);
  }
  console.log('Cycle result:', JSON.stringify(cycleRes.data?.result || cycleRes.data, null, 2));
  console.log('Done. Autopilot is enabled and first cycle completed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
