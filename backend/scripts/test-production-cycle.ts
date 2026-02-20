#!/usr/bin/env tsx
/**
 * Production cycle test: runs autopilot executeCycle (runSingleCycle) directly or via API.
 *
 * Usage:
 *   # Direct mode (executes autopilotSystem.runSingleCycle locally):
 *   npx tsx scripts/test-production-cycle.ts --direct
 *   USER_ID=1 npx tsx scripts/test-production-cycle.ts --direct
 *
 *   # API mode (requires INTERNAL_RUN_SECRET):
 *   npx tsx scripts/test-production-cycle.ts
 *   npm run test-production-cycle
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

const BASE_URL = process.env.VERIFIER_TARGET_URL || process.env.API_URL || 'http://localhost:4000';
const INTERNAL_SECRET = process.env.INTERNAL_RUN_SECRET;
const USE_DIRECT = process.argv.includes('--direct');

async function runDirect(): Promise<number> {
  const { autopilotSystem } = await import('../src/services/autopilot.service');
  const { prisma } = await import('../src/config/database');

  const userId = parseInt(process.env.USER_ID || '1', 10);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error('User not found:', userId);
    return 1;
  }

  console.log('[AUTOPILOT] CYCLE START (direct mode, userId=%d)', userId);
  try {
    const result = await autopilotSystem.runSingleCycle(
      process.env.QUERY || 'phone case',
      userId,
      (process.env.ENV as 'sandbox' | 'production') || 'production'
    );
    console.log('[AUTOPILOT] CYCLE COMPLETE');
    console.log('[AUTOPILOT] opportunities found:', result.opportunitiesFound);
    console.log('[AUTOPILOT] products published:', result.productsPublished);
    console.log(JSON.stringify(result, null, 2));
    return result.success ? 0 : 1;
  } catch (err: unknown) {
    console.error('Cycle error:', err instanceof Error ? err.message : err);
    return 1;
  }
}

async function runViaApi(): Promise<number> {
  if (!INTERNAL_SECRET) {
    console.error('INTERNAL_RUN_SECRET not set (use --direct for local execution)');
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
        keyword: process.env.keyword || process.env.QUERY || 'phone case',
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
      console.log('Production cycle PASSED (success: true)');
      return 0;
    }

    console.error('Production cycle FAILED (success !== true). Check stages and diagnostics.');
    return 1;
  } catch (err: unknown) {
    console.error('Request failed:', err instanceof Error ? err.message : err);
    return 1;
  }
}

async function main(): Promise<number> {
  if (USE_DIRECT) {
    return runDirect();
  }
  return runViaApi();
}

main().then((code) => process.exit(code));
