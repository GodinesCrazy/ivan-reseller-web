#!/usr/bin/env tsx
/**
 * Verifica conectividad con PayPal: POST oauth2/token con credenciales reales.
 * Si falla, re-ejecuta extract-paypal-from-apis2.ts y reintenta.
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
import { spawnSync } from 'child_process';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

let clientId = process.env.PAYPAL_CLIENT_ID;
let clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const env = (process.env.PAYPAL_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';
const baseUrl = env === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

async function tryAuth(): Promise<boolean> {
  if (!clientId || !clientSecret) return false;
  const auth = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return false;
  const data = await res.json();
  return !!data.access_token;
}

async function main(): Promise<void> {
  let ok = await tryAuth();
  if (!ok && (!clientId || !clientSecret)) {
    console.log('[TEST-PAYPAL-AUTH] Credenciales faltantes, ejecutando extract-paypal-from-apis2...');
    const r = spawnSync('npx', ['tsx', 'scripts/extract-paypal-from-apis2.ts'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true,
    });
    if (r.status !== 0) {
      console.error('PAYPAL_CREDENTIALS_INVALID');
      process.exit(1);
    }
    config({ path: path.join(process.cwd(), '.env.local'), override: true });
    clientId = process.env.PAYPAL_CLIENT_ID;
    clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    ok = await tryAuth();
  }
  if (!ok) {
    console.error('PAYPAL_CREDENTIALS_INVALID');
    process.exit(1);
  }
  console.log('PAYPAL_CREDENTIALS_VALID');
  process.exit(0);
}

main().catch(() => {
  console.error('PAYPAL_CREDENTIALS_INVALID');
  process.exit(1);
});
