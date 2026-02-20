#!/usr/bin/env tsx
/**
 * Production system verification script
 * Verifies: DB, OAuth token, Affiliate API, Autopilot cycle, Product persistence
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

const BASE_URL = process.env.API_URL || process.env.VERIFIER_TARGET_URL || 'http://localhost:4000';

async function main(): Promise<number> {
  const results: Record<string, string | number | boolean> = {};
  let allOk = true;

  // 1. DB connection (via diagnostics)
  try {
    const r = await fetch(`${BASE_URL}/api/system/diagnostics`);
    const data = await r.json();
    if (!data?.success || !data?.data) {
      results.db = 'FAIL';
      allOk = false;
    } else {
      const d = data.data;
      results.db = d.database || 'FAIL';
      results.aliexpressOAuth = d.aliexpressOAuth || 'FAIL';
      results.aliexpressToken = d.aliexpressToken || 'FAIL';
      results.affiliateAPI = d.affiliateAPI || 'FAIL';
      results.autopilot = d.autopilot || 'FAIL';
      results.productsInDB = d.productsInDB ?? 0;
      results.opportunitiesInDB = d.opportunitiesInDB ?? 0;
      results.paypal = d.paypal || 'FAIL';
      results.ebay = d.ebay || 'FAIL';
    }
  } catch (e: any) {
    results.db = 'FAIL';
    results.error = e?.message || String(e);
    allOk = false;
  }

  // 2. Test full cycle
  try {
    const r = await fetch(`${BASE_URL}/api/system/test-full-cycle`);
    const data = await r.json();
    results.testFullCycle = data?.success === true ? 'OK' : 'FAIL';
    results.productsFound = data?.productsFound ?? 0;
    results.productsSaved = data?.productsSaved ?? 0;
    if (!data?.success) allOk = false;
  } catch (e: any) {
    results.testFullCycle = 'FAIL';
    results.testError = e?.message || String(e);
    allOk = false;
  }

  console.log(JSON.stringify(results, null, 2));
  console.log('\n--- SUMMARY ---');
  console.log('OAuth status:', results.aliexpressOAuth ?? 'FAIL');
  console.log('Access token stored:', results.aliexpressToken === 'OK' ? 'YES' : 'NO');
  console.log('Affiliate API working:', results.affiliateAPI === 'OK' ? 'YES' : 'NO');
  console.log('Products saved in DB:', results.productsInDB ?? 0);
  console.log('Autopilot working:', (results.autopilot === 'OK' || results.autopilot === 'IDLE') ? 'YES' : 'NO');
  console.log('Diagnostics endpoint working:', results.error ? 'NO (fetch failed)' : 'YES');
  console.log('RAILWAY_DEPLOY_READY:', allOk ? 'TRUE' : 'FALSE');
  console.log('SYSTEM_PRODUCTION_READY:', allOk ? 'TRUE' : 'FALSE');

  return allOk ? 0 : 1;
}

main().then((code) => process.exit(code));
