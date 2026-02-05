#!/usr/bin/env tsx
/**
 * Smoke test for post-sale dropshipping flow
 * Exits 0 if finalStatus === PURCHASED or SIMULATED, 1 otherwise
 *
 * Requires: INTERNAL_RUN_SECRET (from .env or env)
 * Optional: API_URL (default http://localhost:4000)
 */

import 'dotenv/config';

const API_URL = process.env.API_URL || 'http://localhost:4000';
const INTERNAL_SECRET = process.env.INTERNAL_RUN_SECRET;

async function main(): Promise<number> {
  if (!INTERNAL_SECRET) {
    console.error('INTERNAL_RUN_SECRET not set');
    return 1;
  }

  const body = {
    productUrl: 'https://www.aliexpress.com/item/example.html',
    price: 10.99,
    customer: {
      name: 'John Doe',
      email: 'john@test.com',
      address: '123 Main St, Miami, FL, US',
    },
  };

  try {
    const res = await fetch(`${API_URL}/api/internal/test-post-sale-flow`, {
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
      console.log('? Post-sale flow PASSED');
      return 0;
    }
    console.error('? Post-sale flow FAILED');
    return 1;
  } catch (err: any) {
    console.error('? Request failed:', err?.message || err);
    return 1;
  }
}

main().then((code) => process.exit(code));
