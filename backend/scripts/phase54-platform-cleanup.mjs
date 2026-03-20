#!/usr/bin/env node
/**
 * Phase 54 — Platform risk scan + optional real cleanup (calls live backend APIs).
 *
 * Env:
 *   BASE_URL              — default http://localhost:4000 (override for Railway)
 *   INTERNAL_RUN_SECRET   — required (same as Railway INTERNAL_RUN_SECRET)
 *
 * Usage:
 *   node scripts/phase54-platform-cleanup.mjs              # dry run only
 *   node scripts/phase54-platform-cleanup.mjs --execute   # real unpublish + flags
 *
 * Never commit secrets. Do not paste INTERNAL_RUN_SECRET into git-tracked files.
 */

const BASE_URL = (process.env.BASE_URL || process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const SECRET = process.env.INTERNAL_RUN_SECRET || '';
const EXECUTE = process.argv.includes('--execute');

if (!SECRET) {
  console.error('[phase54] Missing INTERNAL_RUN_SECRET in environment.');
  process.exit(1);
}

async function postScan(body, attempt = 1) {
  const url = `${BASE_URL}/api/internal/active-listings-risk-scan`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-internal-secret': SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function withRetries(fn, label) {
  let last;
  for (let i = 1; i <= 3; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      console.error(`[phase54] ${label} attempt ${i}/3 failed:`, e.message || e);
      if (i < 3) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw last;
}

async function main() {
  console.log('[phase54] BASE_URL =', BASE_URL);
  console.log('[phase54] mode =', EXECUTE ? 'EXECUTE (dryRun false)' : 'DRY RUN');

  const dry = await withRetries(
    () =>
      postScan({
        dryRun: true,
      }),
    'dry-run'
  );

  console.log('[phase54] dry-run summary:', JSON.stringify(dry.summary || {}, null, 2));
  console.log('[phase54] dangerous count:', (dry.dangerous || []).length);
  console.log('[phase54] scanned:', dry.scanned);

  if (!EXECUTE) {
    console.log('[phase54] Done (dry run only). Re-run with --execute after review.');
    return;
  }

  const real = await withRetries(
    () =>
      postScan({
        dryRun: false,
        autoUnpublishUnshippable: true,
        autoUnpublishUnprofitable: true,
        writeFlags: true,
      }),
    'cleanup'
  );

  console.log('[phase54] cleanup summary:', JSON.stringify(real.summary || {}, null, 2));
  console.log('[phase54] dangerous after cleanup:', (real.dangerous || []).length);
  console.log('[phase54] Cleanup request finished.');
}

main().catch((e) => {
  console.error('[phase54] FATAL:', e.message || e);
  process.exit(1);
});
