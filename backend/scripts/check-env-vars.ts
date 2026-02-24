#!/usr/bin/env tsx
/**
 * Verifica presencia de variables PayPal en .env.local (sin mostrar valores).
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

const ok =
  !!process.env.PAYPAL_CLIENT_ID &&
  !!process.env.PAYPAL_CLIENT_SECRET &&
  (process.env.PAYPAL_ENVIRONMENT || 'sandbox') === (process.env.PAYPAL_ENVIRONMENT || 'sandbox');

console.log('[CHECK] PAYPAL_CLIENT_ID:', !!process.env.PAYPAL_CLIENT_ID ? 'present' : 'MISSING');
console.log('[CHECK] PAYPAL_CLIENT_SECRET:', !!process.env.PAYPAL_CLIENT_SECRET ? 'present' : 'MISSING');
console.log('[CHECK] PAYPAL_ENVIRONMENT:', process.env.PAYPAL_ENVIRONMENT || 'sandbox (default)');

if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  console.error('[CHECK] FALTA: Configure PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en .env.local');
  process.exit(1);
}
process.exit(0);
