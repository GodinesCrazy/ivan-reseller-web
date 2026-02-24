#!/usr/bin/env tsx
/**
 * Test fulfillment only (AliExpress purchase) without PayPal capture.
 * Use when AUTOPILOT_MODE=production and you want to test real purchase only.
 * Requires: INTERNAL_RUN_SECRET, API_URL (optional, default http://localhost:4000)
 */

import 'dotenv/config';

const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const INTERNAL_SECRET = process.env.INTERNAL_RUN_SECRET;

async function main(): Promise<number> {
  if (!INTERNAL_SECRET) {
    console.error('INTERNAL_RUN_SECRET not set');
    return 1;
  }

  const body = {
    productUrl: process.env.TEST_PRODUCT_URL || 'https://www.aliexpress.com/item/example.html',
    price: parseFloat(process.env.TEST_PRICE || '10.99'),
    customer: {
      name: 'John Doe',
      email: 'john@test.com',
      address: '123 Main St, Miami, FL, US',
    },
  };

  try {
    const res = await fetch(`${API_URL}/api/internal/test-fulfillment-only`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    const success =
      data.success === true &&
      (data.finalStatus === 'PURCHASED' ||
        data.finalStatus === 'SIMULATED' ||
        data.aliexpressOrderId === 'SIMULATED_ORDER_ID');

    console.log(JSON.stringify(data, null, 2));

    if (success) {
      console.log('OK Fulfillment test PASSED');
      return 0;
    }
    console.error('FAIL Fulfillment test FAILED');
    return 1;
  } catch (err: any) {
    console.error('FAIL Request failed:', err?.message || err);
    return 1;
  }
}

main().then((code) => process.exit(code));
