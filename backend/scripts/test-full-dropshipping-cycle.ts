#!/usr/bin/env tsx
/**
 * Full dropshipping cycle test script.
 * Calls POST /api/internal/test-full-dropshipping-cycle and exits 0 only if success === true.
 *
 * Requires: INTERNAL_RUN_SECRET (from .env or env)
 * Optional: API_URL (default http://localhost:4000).
 * Default: skipPostSale=true (discovery-only) so verifier can pass with real trends + AliExpress.
 * Set SKIP_POST_SALE=0 to run full cycle (PayPal + AliExpress purchase).
 *
 * Usage:
 *   npm run test-full-dropshipping-cycle
 *   npx tsx scripts/test-full-dropshipping-cycle.ts
 *   SKIP_POST_SALE=0 npx tsx scripts/test-full-dropshipping-cycle.ts  # full cycle
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

const BASE_URL = process.env.VERIFIER_TARGET_URL || process.env.API_URL || 'http://localhost:4000';
const INTERNAL_SECRET = process.env.INTERNAL_RUN_SECRET;
const SKIP_POST_SALE = process.env.SKIP_POST_SALE === '0' ? false : (process.env.skipPostSale === '1' || process.env.SKIP_POST_SALE === '1' || true);

async function main(): Promise<number> {
  if (!INTERNAL_SECRET) {
    console.error('INTERNAL_RUN_SECRET not set');
    return 1;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/internal/test-full-dropshipping-cycle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        keyword: process.env.keyword || 'phone case',
        skipPostSale: SKIP_POST_SALE,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('HTTP', res.status, data);
      return 1;
    }

    console.log(JSON.stringify(data, null, 2));

    const success = data.success === true;
    if (success) {
      console.log('Full dropshipping cycle PASSED (success: true)');
      return 0;
    }

    console.error('Full dropshipping cycle FAILED (success !== true). Check stages and diagnostics.');
    return 1;
  } catch (err: unknown) {
    console.error('Request failed:', err instanceof Error ? err.message : err);
    return 1;
  }
}

main().then((code) => process.exit(code));
