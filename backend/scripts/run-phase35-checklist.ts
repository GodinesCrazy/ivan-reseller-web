/**
 * Phase 35: Run Workers / APIs / Autopilot checklist against the backend.
 * Uses AUTOPILOT_LOGIN_USER / AUTOPILOT_LOGIN_PASSWORD for auth (same as run-reconciliation-audit).
 *
 * Usage:
 *   npx tsx scripts/run-phase35-checklist.ts
 *   npx tsx scripts/run-phase35-checklist.ts https://tu-backend.up.railway.app
 */
import '../src/config/env';

const BASE_URL = process.argv[2]?.replace(/\/$/, '') || process.env.BACKEND_URL || 'https://ivan-reseller-backend-production.up.railway.app';

function parseTokenFromSetCookie(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/token=([^;]+)/);
  return match ? match[1].trim() : null;
}

async function login(baseUrl: string): Promise<string> {
  const user = process.env.AUTOPILOT_LOGIN_USER || 'admin';
  const pass = process.env.AUTOPILOT_LOGIN_PASSWORD || 'admin123';
  const res = await fetch(`${baseUrl}/api/auth/login`, {
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

async function get<T = unknown>(url: string, token: string): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data as T };
}

function statusIcon(s: string): string {
  if (s === 'ok') return '✅';
  if (s === 'degraded') return '⚠️';
  return '❌';
}

async function main() {
  console.log('Phase 35 — Workers / APIs / Autopilot checklist');
  console.log('Backend URL:', BASE_URL);
  console.log('');

  const token = await login(BASE_URL);

  // 1. Readiness report (DB, Redis, BullMQ, workers, marketplaceApi, supplierApi)
  const readiness = await get<{
    success?: boolean;
    health?: { database?: string; redis?: string; bullmq?: string; workers?: string; marketplaceApi?: string; supplierApi?: string; alerts?: string[] };
    workerStatus?: string;
  }>(`${BASE_URL}/api/system/readiness-report`, token);

  if (!readiness.ok) {
    console.log('❌ Readiness report failed:', readiness.status, readiness.data);
  } else {
    const h = readiness.data?.health;
    console.log('1. System readiness (GET /api/system/readiness-report)');
    if (h) {
      console.log('   database:      ', statusIcon(h.database || ''), h.database || '—');
      console.log('   redis:         ', statusIcon(h.redis || ''), h.redis || '—');
      console.log('   bullmq:        ', statusIcon(h.bullmq || ''), h.bullmq || '—');
      console.log('   workers:      ', statusIcon(h.workers || ''), h.workers || '—');
      console.log('   marketplaceApi:', statusIcon(h.marketplaceApi || ''), h.marketplaceApi || '—');
      console.log('   supplierApi:   ', statusIcon(h.supplierApi || ''), h.supplierApi || '—');
      if (h.alerts?.length) console.log('   alerts:        ', h.alerts.join('; '));
    }
    console.log('   workerStatus:  ', readiness.data?.workerStatus || '—');
    console.log('');
  }

  // 2. Workers health (Redis + BullMQ detail)
  const workers = await get<{ success?: boolean; ok?: boolean; redisAvailable?: boolean; redisPing?: boolean; bullMQConnection?: boolean; issues?: string[] }>(
    `${BASE_URL}/api/system/phase28/workers-health`,
    token
  );
  if (!workers.ok) {
    console.log('❌ Workers health failed:', workers.status);
  } else {
    console.log('2. Workers health (GET /api/system/phase28/workers-health)');
    console.log('   ', workers.data?.redisPing ? '✅' : '❌', 'Redis PING:', workers.data?.redisPing ?? '—');
    console.log('   ', workers.data?.bullMQConnection ? '✅' : '❌', 'BullMQ connection:', workers.data?.bullMQConnection ?? '—');
    console.log('   ok:', workers.data?.ok ?? '—');
    if (workers.data?.issues?.length) console.log('   issues:', workers.data.issues.join('; '));
    console.log('');
  }

  // 3. API health per marketplace
  const apiHealth = await get<{ success?: boolean; health?: Array<{ api?: string; status?: string }> }>(
    `${BASE_URL}/api/system/phase30/api-health`,
    token
  );
  if (!apiHealth.ok) {
    console.log('❌ API health failed:', apiHealth.status);
  } else {
    console.log('3. API health (GET /api/system/phase30/api-health)');
    const list = apiHealth.data?.health || [];
    for (const item of list) {
      const icon = item.status === 'OK' ? '✅' : item.status === 'DEGRADED' ? '⚠️' : '❌';
      console.log('   ', icon, item.api || '—', ':', item.status || '—');
    }
    if (list.length === 0) console.log('   (no entries)');
    console.log('');
  }

  // 4. Autopilot status
  const autopilot = await get<{ running?: boolean; currentPhase?: string; stats?: { currentStatus?: string } }>(
    `${BASE_URL}/api/autopilot/status`,
    token
  );
  if (!autopilot.ok) {
    console.log('❌ Autopilot status failed:', autopilot.status);
  } else {
    console.log('4. Autopilot (GET /api/autopilot/status)');
    console.log('   running:', autopilot.data?.running ? '✅ yes' : 'no');
    console.log('   phase: ', autopilot.data?.currentPhase || '—');
    console.log('   status:', autopilot.data?.stats?.currentStatus || '—');
    console.log('');
  }

  // 5. Autopilot health (optional)
  const autopilotHealth = await get<{ healthy?: boolean }>(`${BASE_URL}/api/autopilot/health`, token);
  if (autopilotHealth.ok) {
    console.log('5. Autopilot health (GET /api/autopilot/health)');
    console.log('   healthy:', autopilotHealth.data?.healthy ? '✅ yes' : 'no');
    console.log('');
  }

  console.log('Checklist done. See docs/phase35_checklist_workers_apis_autopilot.md for full steps.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
