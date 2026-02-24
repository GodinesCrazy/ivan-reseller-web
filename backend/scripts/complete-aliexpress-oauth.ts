#!/usr/bin/env tsx
/**
 * Complete AliExpress OAuth flow: try refresh first, else open auth URL for manual completion.
 * After user authorizes, callback saves token to DB. Then run verify-production-system.
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

const BASE_URL = process.env.API_URL || 'http://localhost:4000';

async function main(): Promise<number> {
  // 1. Try to refresh existing token
  try {
    const { prisma } = await import('../src/config/database');
    const token = await prisma.aliExpressToken.findUnique({ where: { id: 'global' } });
    if (token?.refreshToken && token.expiresAt < new Date()) {
      console.log('[OAUTH] Token expired, attempting refresh...');
      const { refreshAccessToken } = await import('../src/services/aliexpress-oauth.service');
      await refreshAccessToken(token.refreshToken);
      console.log('[OAUTH] Token refreshed successfully.');
      return runVerify();
    }
    if (token?.accessToken && token.expiresAt > new Date()) {
      console.log('[OAUTH] Valid token already in DB.');
      return runVerify();
    }
  } catch (e: any) {
    console.log('[OAUTH] No valid token, starting auth flow...');
  }

  // 2. Get auth URL and open in browser
  const authUrl = `${BASE_URL}/api/aliexpress/oauth/url`;
  const res = await fetch(authUrl);
  const data = await res.json();
  const url = data?.url;
  if (!url) {
    console.error('[OAUTH] Could not get auth URL:', data);
    return 1;
  }

  console.log('[OAUTH] Opening auth URL in browser...');
  const { execSync } = await import('child_process');
  try {
    execSync(`start "" "${url}"`, { shell: true });
  } catch {
    console.log('[OAUTH] Run this URL manually:\n', url);
  }

  console.log('\n[OAUTH] Complete the login in the browser, then authorize.');
  console.log('[OAUTH] Callback will save the token. Waiting 60s before verify...');
  await new Promise((r) => setTimeout(r, 60000));

  return runVerify();
}

async function runVerify(): Promise<number> {
  const { spawnSync } = await import('child_process');
  const r = spawnSync('npx', ['tsx', 'scripts/verify-production-system.ts'], {
    cwd: path.join(process.cwd()),
    env: { ...process.env, API_URL: BASE_URL },
    stdio: 'inherit',
  });
  return r.status ?? 1;
}

main().then((code) => process.exit(code));
