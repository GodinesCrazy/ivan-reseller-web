#!/usr/bin/env tsx
/**
 * Read-only script: check autopilot status (running, lastRun, targetMarketplaces) and sales count.
 * Use when the backend is already running (local or production).
 *
 * Env:
 *   API_BASE_URL          - default http://localhost:4000
 *   AUTOPILOT_LOGIN_USER  - username for login (or E2E_LOGIN_USER)
 *   AUTOPILOT_LOGIN_PASSWORD - password for login (or E2E_LOGIN_PASSWORD)
 *
 * Usage:
 *   npm run check-autopilot-and-sales
 *   npx tsx scripts/check-autopilot-and-sales.ts https://ivan-reseller-backend-production.up.railway.app
 *   Or: API_BASE_URL=https://... AUTOPILOT_LOGIN_USER=... AUTOPILOT_LOGIN_PASSWORD=... npx tsx scripts/check-autopilot-and-sales.ts
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';
import axios, { AxiosInstance } from 'axios';

config({ path: path.join(process.cwd(), '.env.local'), override: true });
config({ path: path.join(process.cwd(), '.env'), override: true });

const baseUrlArg = process.argv[2];
const defaultBase = (process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const API_BASE_URL =
  baseUrlArg && (baseUrlArg.startsWith('http://') || baseUrlArg.startsWith('https://'))
    ? baseUrlArg.replace(/\/$/, '')
    : defaultBase;
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
      'Missing credentials. Set AUTOPILOT_LOGIN_USER and AUTOPILOT_LOGIN_PASSWORD (or E2E_LOGIN_*) in .env.local.'
    );
    process.exit(1);
  }

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
    console.error('[check-autopilot-and-sales] Login failed:', loginRes.status, loginRes.data?.error || loginRes.data);
    process.exit(1);
  }

  const cookieHeader = parseCookieFromResponse(loginRes.headers['set-cookie']);
  if (!cookieHeader) {
    console.error('[check-autopilot-and-sales] No cookie received from login.');
    process.exit(1);
  }

  const authHeaders = { Cookie: cookieHeader };

  // 1. Autopilot status
  const statusRes = await client.get('/api/autopilot/status', { headers: authHeaders });
  if (statusRes.status !== 200) {
    console.error('[check-autopilot-and-sales] GET /api/autopilot/status failed:', statusRes.status);
    process.exit(1);
  }

  const statusData = statusRes.data as {
    running?: boolean;
    status?: string;
    lastRun?: string | null;
    config?: { targetMarketplaces?: string[]; targetMarketplace?: string };
  };
  const running = statusData.running ?? (statusData.status === 'running');
  const lastRun = statusData.lastRun ?? null;
  const targetMarketplaces: string[] =
    statusData.config?.targetMarketplaces?.map((m: string) => String(m).toLowerCase()) ??
    (statusData.config?.targetMarketplace ? [String(statusData.config.targetMarketplace).toLowerCase()] : []);

  const marketplacesStr = targetMarketplaces.length > 0 ? targetMarketplaces.join(', ') : 'none';
  console.log('--- Autopilot ---');
  console.log(`Autopilot activado: ${running ? 'sí' : 'no'}`);
  console.log(`Autopilot: ${running ? 'running' : 'stopped'} | lastRun: ${lastRun ?? 'n/a'} | targetMarketplaces: ${marketplacesStr}`);

  // 2. Optional: GET config to confirm
  const configRes = await client.get('/api/autopilot/config', { headers: authHeaders });
  if (configRes.status === 200 && configRes.data?.config?.targetMarketplaces) {
    const cfg = configRes.data.config as { targetMarketplaces?: string[] };
    if (cfg.targetMarketplaces && JSON.stringify(cfg.targetMarketplaces) !== JSON.stringify(targetMarketplaces)) {
      console.log('(config) targetMarketplaces:', cfg.targetMarketplaces.join(', '));
    }
  }

  // 3. Sales
  const salesRes = await client.get('/api/sales', { headers: authHeaders, params: {} });
  if (salesRes.status !== 200) {
    console.error('[check-autopilot-and-sales] GET /api/sales failed:', salesRes.status);
    process.exit(1);
  }

  const salesList = Array.isArray(salesRes.data?.sales) ? salesRes.data.sales : Array.isArray(salesRes.data) ? salesRes.data : [];
  const byMarketplace: Record<string, number> = {};
  for (const s of salesList) {
    const mp = (s.marketplace || 'unknown').toLowerCase();
    byMarketplace[mp] = (byMarketplace[mp] || 0) + 1;
  }
  const total = salesList.length;
  if (total === 0) {
    console.log('--- Ventas ---');
    console.log('Ventas: 0');
  } else {
    const parts = Object.entries(byMarketplace).map(([mp, count]) => `${mp}: ${count}`);
    console.log('--- Ventas ---');
    console.log(`Ventas: ${total} total (${parts.join(', ')})`);
  }

  // 4. Autopilot metrics (profit today/month, daily sales, active listings)
  console.log('--- Utilidades ---');
  const metricsRes = await client.get('/api/dashboard/autopilot-metrics', { headers: authHeaders });
  if (metricsRes.status !== 200) {
    console.error('[check-autopilot-and-sales] GET /api/dashboard/autopilot-metrics failed:', metricsRes.status);
    console.log('Generando utilidades: no disponible (error API)');
  } else {
    const m = metricsRes.data as {
      profitToday?: number;
      profitMonth?: number;
      dailySales?: number;
      activeListings?: number;
    };
    const profitToday = m.profitToday ?? 0;
    const profitMonth = m.profitMonth ?? 0;
    const dailySales = m.dailySales ?? 0;
    const activeListings = m.activeListings ?? 0;
    console.log(`profitToday: ${profitToday}, profitMonth: ${profitMonth}, dailySales: ${dailySales}, activeListings: ${activeListings}`);
    const hasProfit = (profitMonth != null && profitMonth > 0) || (profitToday != null && profitToday > 0);
    console.log(`Generando utilidades: ${hasProfit ? 'sí' : 'no'}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[check-autopilot-and-sales] Error:', err?.message || err);
  process.exit(1);
});
