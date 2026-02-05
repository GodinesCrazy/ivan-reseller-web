#!/usr/bin/env tsx
/**
 * Check that env has all variables required for discovery-only verifier (success: true).
 * Exit 0 if all present; exit 1 and list missing vars otherwise.
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

const REQUIRED_DISCOVERY = [
  'INTERNAL_RUN_SECRET',
  'DATABASE_URL',
  'JWT_SECRET',
] as const;

const REQUIRED_FOR_REAL_TRENDS = ['SERP_API_KEY', 'GOOGLE_TRENDS_API_KEY'];
const REQUIRED_FOR_REAL_ALIEXPRESS = ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET'];

function has(key: string): boolean {
  const v = (process.env[key] || '').trim();
  return v.length > 0 && v !== 'REPLACE_ME' && !v.startsWith('REPLACE_ME');
}

function main(): number {
  const missing: string[] = [];
  for (const key of REQUIRED_DISCOVERY) {
    if (!has(key)) missing.push(key);
  }
  const hasTrendsApi = REQUIRED_FOR_REAL_TRENDS.some((k) => has(k));
  if (!hasTrendsApi) missing.push('SERP_API_KEY or GOOGLE_TRENDS_API_KEY');
  const hasAliexpress = REQUIRED_FOR_REAL_ALIEXPRESS.every((k) => has(k));
  if (!hasAliexpress) missing.push('ALIEXPRESS_APP_KEY and ALIEXPRESS_APP_SECRET');

  if (missing.length === 0) {
    console.log('OK: All discovery-only verifier env vars are set.');
    return 0;
  }
  console.error('Missing or placeholder env (set in .env.local or env):');
  missing.forEach((m) => console.error('  -', m));
  return 1;
}

process.exit(main());
