#!/usr/bin/env node
/**
 * Standalone verification of real-orders filter logic (no TS, no project deps).
 * Run: node scripts/verify-orders-filter-standalone.mjs
 */
const MARKETPLACE = ['ebay:', 'mercadolibre:', 'amazon:'];
const EXCLUDE = ['TEST', 'test', 'DEMO', 'demo', 'MOCK', 'mock', 'SIM_', 'ORD-TEST'];

function isReal(pid) {
  if (!pid || !String(pid).trim()) return false;
  const p = String(pid).trim();
  if (!MARKETPLACE.some((pre) => p.startsWith(pre))) return false;
  return !EXCLUDE.some((pre) => p.startsWith(pre));
}

let ok = true;
if (!isReal('ebay:17-14370-63716')) { console.error('FAIL: ebay order'); ok = false; }
if (!isReal('mercadolibre:123')) { console.error('FAIL: mercadolibre'); ok = false; }
if (!isReal('amazon:AMZ-1')) { console.error('FAIL: amazon'); ok = false; }
if (isReal('checkout:abc')) { console.error('FAIL: checkout should be excluded'); ok = false; }
if (isReal('TEST-1')) { console.error('FAIL: TEST should be excluded'); ok = false; }
if (isReal(null)) { console.error('FAIL: null should be excluded'); ok = false; }
if (isReal('')) { console.error('FAIL: empty should be excluded'); ok = false; }

if (ok) {
  console.log('OK: orders real filter logic verified.');
  process.exit(0);
} else {
  process.exit(1);
}
