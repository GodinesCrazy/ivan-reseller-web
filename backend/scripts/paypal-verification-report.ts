#!/usr/bin/env tsx
/**
 * PayPal API Verification Report
 * Consolidates env, OAuth, create-order, and webhook configuration status.
 * Plan: Revisión PayPal API - Configuración y Funcionamiento
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

const has = (k: string) => !!(process.env[k] || '').trim();

async function main(): Promise<void> {
  const report: string[] = [];
  report.push('=== PayPal API Verification Report ===\n');

  // A) Env vars
  report.push('A) Variables de entorno:');
  const clientId = has('PAYPAL_CLIENT_ID');
  const clientSecret = has('PAYPAL_CLIENT_SECRET');
  const env = (process.env.PAYPAL_ENVIRONMENT || process.env.PAYPAL_ENV || 'sandbox').trim();
  const webhookId = has('PAYPAL_WEBHOOK_ID');

  report.push(`  PAYPAL_CLIENT_ID: ${clientId ? 'present' : 'MISSING'}`);
  report.push(`  PAYPAL_CLIENT_SECRET: ${clientSecret ? 'present' : 'MISSING'}`);
  report.push(`  PAYPAL_ENVIRONMENT/ENV: ${env}`);
  report.push(`  PAYPAL_WEBHOOK_ID: ${webhookId ? 'present' : 'MISSING (webhooks will fail verification)'}`);
  report.push('');

  if (!clientId || !clientSecret) {
    report.push('Result: PAYPAL_NOT_CONFIGURED - Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET');
    console.log(report.join('\n'));
    process.exit(1);
  }

  // B) OAuth token
  report.push('B) OAuth token (v1/oauth2/token):');
  const baseUrl = env === 'production' || env === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  try {
    const auth = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
      'utf8'
    ).toString('base64');
    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const data = await res.json();
    const oauthOk = res.ok && !!data?.access_token;
    report.push(`  ${oauthOk ? 'OK' : 'FAIL'} (${res.status})`);
    if (!oauthOk) report.push(`  Error: ${JSON.stringify(data).slice(0, 120)}...`);
  } catch (e: unknown) {
    report.push(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }
  report.push('');

  // C) Create order (optional - may fail with 401 if sandbox/production mismatch)
  report.push('C) Create order (v2/checkout/orders):');
  try {
    const { PayPalCheckoutService } = await import('../src/services/paypal-checkout.service');
    const svc = PayPalCheckoutService.fromEnv();
    if (!svc) {
      report.push('  SKIP (service null)');
    } else {
      const result = await svc.createOrder({
        amount: 0.01,
        currency: 'USD',
        productTitle: 'Verification Test',
        returnUrl: 'http://localhost/checkout',
        cancelUrl: 'http://localhost/checkout?cancel=1',
      });
      report.push(`  ${result.success ? 'OK' : 'FAIL'}: ${result.success ? 'orderId=' + result.orderId : result.error}`);
    }
  } catch (e: unknown) {
    report.push(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }
  report.push('');

  // D) Webhook
  report.push('D) Webhook:');
  report.push(`  PAYPAL_WEBHOOK_ID: ${webhookId ? 'configured' : 'NOT SET - webhook verification will return 401'}`);
  report.push('  Configure in PayPal Developer Dashboard and set PAYPAL_WEBHOOK_ID in env.');
  report.push('');

  report.push('=== End Report ===');
  console.log(report.join('\n'));
}

main().catch((e) => {
  console.error('Report failed:', e?.message || String(e));
  process.exit(1);
});
