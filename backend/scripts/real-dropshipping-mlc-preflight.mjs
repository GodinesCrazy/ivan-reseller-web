#!/usr/bin/env node
/**
 * Preflight checks for a REAL MercadoLibre Chile E2E test (no publish, no mocks in this script).
 *
 * Env:
 *   BASE_URL              — default https://ivan-reseller-backend-production.up.railway.app
 *   INTERNAL_RUN_SECRET   — for POST /api/internal/active-listings-risk-scan
 *   JWT                   — optional; if set, calls GET /api/system/readiness-report
 *
 * Usage:
 *   BASE_URL=... INTERNAL_RUN_SECRET=... JWT=... node scripts/real-dropshipping-mlc-preflight.mjs
 */

const BASE = (process.env.BASE_URL || 'https://ivan-reseller-backend-production.up.railway.app').replace(
  /\/+$/,
  ''
);
const SECRET = process.env.INTERNAL_RUN_SECRET || '';
const JWT = process.env.JWT || process.env.AUTH_TOKEN || '';

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: JWT ? { Authorization: `Bearer ${JWT}` } : {} });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { ok: r.ok, status: r.status, json };
}

async function post(path, body, headers = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { ok: r.ok, status: r.status, json };
}

function print(title, result) {
  console.log('\n===', title, '===');
  console.log('HTTP', result.status, result.ok ? 'OK' : 'FAIL');
  console.log(JSON.stringify(result.json, null, 2).slice(0, 8000));
}

async function main() {
  console.log('[preflight] BASE_URL =', BASE);

  print('GET /health', await get('/health'));
  print('GET /api/debug/ping', await get('/api/debug/ping'));
  print('GET /api/debug/db-health', await get('/api/debug/db-health'));

  if (!SECRET) {
    console.log('\n[SKIP] INTERNAL_RUN_SECRET not set — skipping active-listings-risk-scan');
  } else {
    print(
      'POST /api/internal/active-listings-risk-scan (dryRun)',
      await post(
        '/api/internal/active-listings-risk-scan',
        { dryRun: true },
        { 'x-internal-secret': SECRET }
      )
    );
  }

  if (!JWT) {
    console.log('\n[SKIP] JWT not set — skipping GET /api/system/readiness-report (Stage 2)');
  } else {
    print('GET /api/system/readiness-report', await get('/api/system/readiness-report'));
  }

  console.log('\n[preflight] Done. See docs/PHASE_REAL_DROPSHIPPING_TEST.md for full E2E stages.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
