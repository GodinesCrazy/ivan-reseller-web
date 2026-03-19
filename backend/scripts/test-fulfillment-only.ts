#!/usr/bin/env tsx
/**
 * Test fulfillment only (AliExpress purchase) without PayPal capture.
 * Use when AUTOPILOT_MODE=production and you want to test real purchase only.
 * Requires: INTERNAL_RUN_SECRET (in .env or .env.local), API_URL (optional, default http://localhost:4000)
 * Optional: TEST_USER_ID (for Dropshipping API), TEST_PRODUCT_URL, TEST_PRICE
 */

import 'dotenv/config';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const INTERNAL_SECRET = process.env.INTERNAL_RUN_SECRET;

async function main(): Promise<number> {
  if (!INTERNAL_SECRET) {
    console.error('INTERNAL_RUN_SECRET not set');
    return 1;
  }

  const userIdEnv = process.env.TEST_USER_ID;
  const userId = userIdEnv != null && userIdEnv !== '' ? parseInt(userIdEnv, 10) : undefined;
  if (userId != null && (isNaN(userId) || userId < 1)) {
    console.error('TEST_USER_ID must be a positive number');
    return 1;
  }

  const body: Record<string, unknown> = {
    productUrl: process.env.TEST_PRODUCT_URL || 'https://www.aliexpress.com/item/1005007891234567.html',
    price: parseFloat(process.env.TEST_PRICE || '10.99'),
    customer: {
      name: 'John Doe',
      email: 'john@test.com',
      address: '123 Main St, Miami, FL, US',
    },
  };
  if (userId != null) {
    body.userId = userId;
  }
  body.dropshippingApiOnly = true; // Use only AliExpress Dropshipping API, no browser fallback

  const requestTimeoutMs = 150_000; // 150s to exceed backend FULFILLMENT_TIMEOUT_MS (120s)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
    const res = await fetch(`${API_URL}/api/internal/test-fulfillment-only`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

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
    const msg = err?.message || String(err);
    const cause = err?.cause ? ` (cause: ${err.cause?.message ?? err.cause})` : '';
    console.error('FAIL Request failed:', msg + cause);
    if (err?.code) console.error('  code:', err.code);
    return 1;
  }
}

main().then((code) => process.exit(code));
