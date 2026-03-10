#!/usr/bin/env tsx
/**
 * Start Autopilot via API (login + POST /api/autopilot/start + optional status check).
 * Use when the backend is already running (local or production).
 *
 * Env:
 *   API_BASE_URL          - default http://localhost:4000
 *   AUTOPILOT_LOGIN_USER  - username for login
 *   AUTOPILOT_LOGIN_PASSWORD - password for login
 *
 * Usage:
 *   API_BASE_URL=http://localhost:4000 AUTOPILOT_LOGIN_USER=admin AUTOPILOT_LOGIN_PASSWORD=xxx npx tsx scripts/start-autopilot.ts
 *   Or from backend: npm run start-autopilot (after adding script to package.json)
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';
import axios, { AxiosInstance } from 'axios';

config({ path: path.join(process.cwd(), '.env.local'), override: true });
config({ path: path.join(process.cwd(), '.env'), override: true });

const API_BASE_URL = (process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const LOGIN_USER = process.env.AUTOPILOT_LOGIN_USER || process.env.E2E_LOGIN_USER;
const LOGIN_PASSWORD = process.env.AUTOPILOT_LOGIN_PASSWORD || process.env.E2E_LOGIN_PASSWORD;

function parseCookieFromResponse(setCookieHeader: string | string[] | undefined): string | null {
  if (!setCookieHeader) return null;
  const first = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!first) return null;
  const tokenPart = first.split(';')[0].trim();
  return tokenPart || null;
}

async function main(): Promise<void> {
  if (!LOGIN_USER || !LOGIN_PASSWORD) {
    console.error(
      'Missing credentials. Set AUTOPILOT_LOGIN_USER and AUTOPILOT_LOGIN_PASSWORD (or E2E_LOGIN_USER / E2E_LOGIN_PASSWORD) in .env.local.'
    );
    process.exit(1);
  }

  console.log('[start-autopilot] API_BASE_URL:', API_BASE_URL);
  console.log('[start-autopilot] Logging in as:', LOGIN_USER);

  const client: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    validateStatus: () => true,
  });

  const loginRes = await client.post('/api/auth/login', {
    username: LOGIN_USER,
    password: LOGIN_PASSWORD,
  });

  if (loginRes.status !== 200 || !loginRes.data?.success) {
    console.error('[start-autopilot] Login failed:', loginRes.status, loginRes.data?.error || loginRes.data);
    process.exit(1);
  }

  const cookieHeader = parseCookieFromResponse(loginRes.headers['set-cookie']);
  if (!cookieHeader) {
    console.error('[start-autopilot] No cookie received from login (check backend cookie settings).');
    process.exit(1);
  }

  const authHeaders = { Cookie: cookieHeader };

  console.log('[start-autopilot] Login OK. Calling POST /api/autopilot/start ...');

  const startRes = await client.post('/api/autopilot/start', undefined, { headers: authHeaders });

  if (startRes.status !== 200) {
    console.error('[start-autopilot] Start failed:', startRes.status, startRes.data?.error || startRes.data);
    process.exit(1);
  }

  if (!startRes.data?.success) {
    console.error('[start-autopilot] Start returned success: false', startRes.data);
    process.exit(1);
  }

  console.log('[start-autopilot] Autopilot started successfully.');
  console.log('[start-autopilot] Message:', (startRes.data as { message?: string }).message || 'OK');

  const statusRes = await client.get('/api/autopilot/status', { headers: authHeaders });
  if (statusRes.status === 200 && statusRes.data?.stats) {
    const stats = statusRes.data.stats as { currentStatus?: string; lastCycle?: unknown };
    console.log('[start-autopilot] Status: currentStatus =', stats.currentStatus ?? 'unknown');
    if (stats.lastCycle) {
      console.log('[start-autopilot] Last cycle:', JSON.stringify(stats.lastCycle));
    }
    if (stats.currentStatus === 'running') {
      console.log('[start-autopilot] Verified: Autopilot is running. Cycle optimized started correctly.');
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[start-autopilot] Error:', err?.message || err);
  process.exit(1);
});
