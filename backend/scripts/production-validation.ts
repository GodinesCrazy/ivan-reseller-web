#!/usr/bin/env tsx
/**
 * Production post-sale pipeline validation.
 * Run with: railway run npx tsx scripts/production-validation.ts
 * Uses Railway env: BACKEND_URL, INTERNAL_RUN_SECRET, DATABASE_URL
 */
const BACKEND_URL = (process.env.BACKEND_URL || process.env.RAILWAY_STATIC_URL || 'https://ivan-reseller-backend-production.up.railway.app').replace(/\/$/, '');
const SECRET = process.env.INTERNAL_RUN_SECRET;

async function main(): Promise<void> {
  console.log('[VALIDATION] BACKEND_URL:', BACKEND_URL);
  console.log('[VALIDATION] INTERNAL_RUN_SECRET:', SECRET ? '***' : 'NOT SET');

  // Phase 3: Integrity check
  try {
    const icRes = await fetch(`${BACKEND_URL}/api/debug/post-sale-integrity-check`);
    const icData = await icRes.json().catch(() => ({}));
    console.log('\n[PHASE 3] Integrity Check Response:');
    console.log(JSON.stringify(icData, null, 2));
    if (icData.overallFinancialIntegrityScore !== undefined) {
      if (icData.overallFinancialIntegrityScore !== 100) {
        console.error('\n[STOP] overallFinancialIntegrityScore != 100. Cause:', icData);
        process.exit(1);
      }
      console.log('[OK] overallFinancialIntegrityScore = 100');
    } else {
      console.warn('[WARN] No overallFinancialIntegrityScore in response - may need deploy');
    }
  } catch (e: any) {
    console.error('[PHASE 3] Integrity check failed:', e?.message || e);
  }

  if (!SECRET) {
    console.error('\n[STOP] INTERNAL_RUN_SECRET not set - cannot run Phase 4');
    process.exit(1);
  }

  // Phase 4: Real test (simulate: false)
  try {
    const res = await fetch(`${BACKEND_URL}/api/internal/test-post-sale-flow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': SECRET },
      body: JSON.stringify({ simulate: false }),
    });
    const data = await res.json().catch(() => ({}));
    console.log('\n[PHASE 4] Real Test Response:');
    console.log(JSON.stringify(data, null, 2));
    if (!data.success) {
      console.error('\n[WARN] Real test did not succeed:', data.error || data.message);
    }
  } catch (e: any) {
    console.error('[PHASE 4] Real test failed:', e?.message || e);
  }
}

main();
