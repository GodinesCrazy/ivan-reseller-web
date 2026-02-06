#!/usr/bin/env tsx
/**
 * Phase 11: Railway readiness verifier
 * Checks: GET /health -> 200, GET /ready -> 200, POST /api/internal/test-platform-commission -> success true
 * Exit 0 only if all pass.
 */

import 'dotenv/config';

const BASE_URL = process.env.VERIFIER_TARGET_URL || process.env.API_URL || 'http://localhost:4000';
const INTERNAL_SECRET = process.env.INTERNAL_RUN_SECRET;

async function main(): Promise<number> {
  const failures: string[] = [];

  // 1. GET /health -> 200
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (res.status !== 200) {
      failures.push(`GET /health: expected 200, got ${res.status}`);
    }
  } catch (err) {
    failures.push(`GET /health: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. GET /ready -> 200
  try {
    const res = await fetch(`${BASE_URL}/ready`);
    if (res.status !== 200) {
      failures.push(`GET /ready: expected 200, got ${res.status}`);
    }
  } catch (err) {
    failures.push(`GET /ready: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. POST /api/internal/test-platform-commission -> success true (optional if INTERNAL_RUN_SECRET not set)
  if (INTERNAL_SECRET) {
    try {
      const res = await fetch(`${BASE_URL}/api/internal/test-platform-commission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        failures.push(`POST /api/internal/test-platform-commission: HTTP ${res.status}`);
      } else if (data.success !== true) {
        failures.push(`POST /api/internal/test-platform-commission: success !== true`);
      }
    } catch (err) {
      failures.push(`POST /api/internal/test-platform-commission: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    console.log('INTERNAL_RUN_SECRET not set - skipping test-platform-commission');
  }

  if (failures.length > 0) {
    console.error('test-railway-ready FAILED:');
    failures.forEach((f) => console.error('  -', f));
    return 1;
  }
  console.log('test-railway-ready PASSED');
  return 0;
}

main().then((code) => process.exit(code));
