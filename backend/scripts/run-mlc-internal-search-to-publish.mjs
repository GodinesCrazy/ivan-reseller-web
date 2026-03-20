#!/usr/bin/env node
/**
 * POST /api/internal/test-full-cycle-search-to-publish with MercadoLibre Chile.
 *
 * Env: BASE_URL, INTERNAL_RUN_SECRET
 * Optional: MLC_CREDENTIAL_ENV=production|sandbox (default production — evita fallo si el workflow del usuario está en sandbox)
 * Args: --dry-run  → body.dryRun true (no publish)
 *
 * Example:
 *   INTERNAL_RUN_SECRET=xxx node scripts/run-mlc-internal-search-to-publish.mjs --dry-run
 *   INTERNAL_RUN_SECRET=xxx node scripts/run-mlc-internal-search-to-publish.mjs
 */

const BASE = (process.env.BASE_URL || 'https://ivan-reseller-backend-production.up.railway.app').replace(
  /\/+$/,
  ''
);
const SECRET = process.env.INTERNAL_RUN_SECRET || '';
const dryRun = process.argv.includes('--dry-run');

if (!SECRET) {
  console.error('Set INTERNAL_RUN_SECRET');
  process.exit(1);
}

const userId = parseInt(process.env.MLC_USER_ID || process.env.USER_ID || '', 10);
const credEnv = String(process.env.MLC_CREDENTIAL_ENV || 'production').toLowerCase();
const body = {
  marketplace: 'mercadolibre',
  maxPriceUsd: 10,
  dryRun,
  keyword: process.env.MLC_KEYWORD || 'phone case',
  ...(credEnv === 'production' || credEnv === 'sandbox' ? { credentialEnvironment: credEnv } : {}),
  ...(Number.isFinite(userId) && userId > 0 ? { userId } : {}),
};

async function main() {
  const url = `${BASE}/api/internal/test-full-cycle-search-to-publish`;
  console.log('POST', url, JSON.stringify(body));
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': SECRET,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log('HTTP', r.status);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text.slice(0, 4000));
  }
  if (!r.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
