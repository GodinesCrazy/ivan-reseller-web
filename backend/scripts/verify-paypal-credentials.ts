#!/usr/bin/env tsx
/**
 * Valida credenciales PayPal contra la API real (sin mocks).
 * POST https://api-m.sandbox.paypal.com/v1/oauth2/token con Basic Auth.
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const env = (process.env.PAYPAL_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

const baseUrl = env === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

async function main(): Promise<void> {
  if (!clientId || !clientSecret) {
    console.error('PAYPAL_CREDENTIALS_INVALID');
    process.exit(1);
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('PAYPAL_CREDENTIALS_INVALID');
    console.error(res.status, text);
    process.exit(1);
  }

  const data = await res.json();
  if (!data.access_token) {
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
