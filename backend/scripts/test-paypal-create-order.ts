#!/usr/bin/env tsx
/**
 * Test POST /api/paypal/create-order flow
 * Uses PayPalCheckoutService directly - no server required
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { PayPalCheckoutService } from '../src/services/paypal-checkout.service';

async function main(): Promise<void> {
  const service = PayPalCheckoutService.fromEnv();
  if (!service) {
    console.error('PAYPAL_NOT_CONFIGURED: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET required');
    process.exit(1);
  }

  const baseUrl = 'http://localhost:4000';
  const result = await service.createOrder({
    amount: 1.99,
    currency: 'USD',
    productTitle: 'Test Product',
    productUrl: 'https://example.com/product',
    returnUrl: `${baseUrl}/api/paypal/success`,
    cancelUrl: `${baseUrl}/api/paypal/cancel`,
  });

  if (!result.success) {
    console.error('CREATE_ORDER_FAILED:', result.error);
    process.exit(1);
  }

  console.log('CREATE_ORDER_SUCCESS');
  console.log('paypalOrderId:', result.orderId);
  console.log('approveUrl:', result.approveUrl?.slice(0, 80) + '...');
  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR:', e?.message || String(e));
  process.exit(1);
});
