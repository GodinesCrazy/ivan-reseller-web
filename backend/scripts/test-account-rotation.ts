#!/usr/bin/env tsx
/**
 * Account Rotation verifier: POST /api/internal/test-account-rotation
 * Exit 0 only if account health and rotation work.
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

const BASE_URL = process.env.VERIFIER_TARGET_URL || 'http://localhost:4000';
const INTERNAL_SECRET = process.env.INTERNAL_RUN_SECRET;

async function main(): Promise<number> {
  if (!INTERNAL_SECRET) {
    console.error('INTERNAL_RUN_SECRET not set');
    return 1;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/internal/test-account-rotation`, {
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

    const success = data.success === true;
    if (success) {
      console.log('Account rotation PASSED', data);
      return 0;
    }

    console.error('Account rotation FAILED', data);
    return 1;
  } catch (err: unknown) {
    console.error('Request failed:', err instanceof Error ? err.message : err);
    return 1;
  }
}

main().then((code) => process.exit(code));
