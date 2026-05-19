#!/usr/bin/env tsx
/**
 * Read-only PICO readiness/status probe.
 *
 * Env:
 *   PICO_API_BASE_URL or API_BASE_URL       default http://localhost:4000
 *   PICO_AUTH_TOKEN or AUTH_TOKEN           optional Bearer token
 *   AUTOPILOT_LOGIN_USER / E2E_LOGIN_USER   login user if no token is provided
 *   AUTOPILOT_LOGIN_PASSWORD / E2E_LOGIN_PASSWORD
 *
 * Usage:
 *   npm run pico:status
 *   npm run pico:status -- https://ivan-reseller-backend-production.up.railway.app
 */
import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });
config({ path: path.join(process.cwd(), '.env'), override: true });

type PicoStatusResponse = {
  ok?: boolean;
  generatedAt?: string;
  readiness?: Record<string, boolean>;
  stats?: Record<string, number>;
  candidates?: Record<string, number>;
  candidatesDetail?: Record<string, unknown[]>;
  recentActivity?: Array<{ message?: string; createdAt?: string; meta?: unknown }>;
  error?: string;
  message?: string;
};

const baseUrlArg = process.argv[2];
const defaultBase = (process.env.PICO_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:4000').replace(
  /\/$/,
  '',
);
const API_BASE_URL =
  baseUrlArg && (baseUrlArg.startsWith('http://') || baseUrlArg.startsWith('https://'))
    ? baseUrlArg.replace(/\/$/, '')
    : defaultBase;

function parseTokenFromSetCookie(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/token=([^;]+)/);
  return match ? match[1].trim() : null;
}

async function loginForToken(baseUrl: string): Promise<string> {
  const user = process.env.AUTOPILOT_LOGIN_USER || process.env.E2E_LOGIN_USER;
  const pass = process.env.AUTOPILOT_LOGIN_PASSWORD || process.env.E2E_LOGIN_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      'Set PICO_AUTH_TOKEN/AUTH_TOKEN or AUTOPILOT_LOGIN_USER and AUTOPILOT_LOGIN_PASSWORD in .env.local/Railway.',
    );
  }

  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; token?: string; data?: { token?: string }; error?: string };
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Login failed with HTTP ${res.status}.`);
  }

  const tokenFromBody = data.token ?? data.data?.token;
  if (tokenFromBody) return tokenFromBody;

  const tokenFromCookie = parseTokenFromSetCookie(res.headers.get('set-cookie'));
  if (tokenFromCookie) return tokenFromCookie;

  throw new Error('Login succeeded but no token was returned in body or cookie.');
}

function printBoolMap(title: string, values: Record<string, boolean> | undefined): void {
  console.log(`\n${title}`);
  if (!values || Object.keys(values).length === 0) {
    console.log('  n/a');
    return;
  }
  for (const [key, value] of Object.entries(values)) {
    console.log(`  ${value ? 'OK  ' : 'MISS'} ${key}`);
  }
}

function printNumberMap(title: string, values: Record<string, number> | undefined): void {
  console.log(`\n${title}`);
  if (!values || Object.keys(values).length === 0) {
    console.log('  n/a');
    return;
  }
  for (const [key, value] of Object.entries(values)) {
    console.log(`  ${key}: ${value}`);
  }
}

async function main(): Promise<void> {
  const token = process.env.PICO_AUTH_TOKEN || process.env.AUTH_TOKEN || (await loginForToken(API_BASE_URL));
  const res = await fetch(`${API_BASE_URL}/api/cj-shopify-usa/pico/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as PicoStatusResponse;

  if (!res.ok || data.ok === false) {
    console.error(`[pico:status] Request failed HTTP ${res.status}: ${data.error || data.message || 'UNKNOWN_ERROR'}`);
    process.exit(1);
  }

  console.log('PICO status');
  console.log(`  backend: ${API_BASE_URL}`);
  console.log(`  generatedAt: ${data.generatedAt ?? 'n/a'}`);

  printBoolMap('Readiness', data.readiness);
  printNumberMap('Stats', data.stats);
  printNumberMap('Candidates', data.candidates);

  const recent = data.recentActivity ?? [];
  console.log('\nRecent activity');
  if (recent.length === 0) {
    console.log('  none');
  } else {
    for (const item of recent.slice(0, 5)) {
      console.log(`  ${item.createdAt ?? 'n/a'} ${item.message ?? 'event'}`);
    }
  }

  const requiredForPhase4 = ['openai', 'creatomate'];
  const missingCore = requiredForPhase4.filter((key) => data.readiness?.[key] !== true);
  if (missingCore.length > 0) {
    console.log(`\nPICO core not fully ready: missing ${missingCore.join(', ')}.`);
    process.exit(2);
  }

  console.log('\nPICO core ready. Social publishers can stay optional until their OAuth tokens are active.');
}

main().catch((error) => {
  console.error('[pico:status] Fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
