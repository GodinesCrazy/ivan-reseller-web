#!/usr/bin/env tsx
/**
 * Evolution cycle verifier: calls POST /api/internal/test-evolution-cycle
 * Exit 0 only if success === true.
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

// Prefer VERIFIER_TARGET_URL; API_URL may be 3000 (callbacks), server listens on 4000
const BASE_URL = process.env.VERIFIER_TARGET_URL || 'http://localhost:4000';
const INTERNAL_SECRET = process.env.INTERNAL_RUN_SECRET;

async function main(): Promise<number> {
  if (!INTERNAL_SECRET) {
    console.error('INTERNAL_RUN_SECRET not set');
    return 1;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/internal/test-evolution-cycle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('HTTP', res.status, data);
      return 1;
    }

    console.log(JSON.stringify(data, null, 2));

    const success = data.success === true;
    if (success) {
      console.log('Evolution cycle PASSED');
      return 0;
    }

    console.error('Evolution cycle FAILED');
    return 1;
  } catch (err: unknown) {
    console.error('Request failed:', err instanceof Error ? err.message : err);
    return 1;
  }
}

main().then((code) => process.exit(code));
