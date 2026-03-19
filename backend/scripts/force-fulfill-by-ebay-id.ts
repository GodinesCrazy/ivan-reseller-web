#!/usr/bin/env tsx
/**
 * Force fulfillment for one order by eBay order ID (API-only, no Puppeteer).
 * Usage (from backend/): EBAY_ORDER_ID=17-14378-63716 npx tsx scripts/force-fulfill-by-ebay-id.ts
 * Or: npx tsx scripts/force-fulfill-by-ebay-id.ts 17-14378-63716
 */

import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';

async function main(): Promise<number> {
  const ebayOrderId = (process.env.EBAY_ORDER_ID || process.argv[2] || '').trim();
  if (!ebayOrderId) {
    console.error('Usage: EBAY_ORDER_ID=17-14378-63716 npx tsx scripts/force-fulfill-by-ebay-id.ts');
    console.error('   Or: npx tsx scripts/force-fulfill-by-ebay-id.ts 17-14378-63716');
    return 1;
  }

  const paypalOrderId = `ebay:${ebayOrderId}`;
  const order = await prisma.order.findFirst({
    where: { paypalOrderId },
    select: { id: true, status: true, userId: true, productUrl: true },
  });

  if (!order) {
    console.error('Order not found for eBay ID:', ebayOrderId);
    return 1;
  }

  if (order.status === 'PURCHASED') {
    console.log('Order already PURCHASED:', order.id);
    return 0;
  }

  if (order.status === 'PURCHASING') {
    console.error('Order is already PURCHASING. Wait or reset it first.');
    return 1;
  }

  if (order.status === 'FAILED') {
    if (!(order.productUrl || '').trim()) {
      console.error('Order is FAILED and has no productUrl. Set supplier URL first.');
      return 1;
    }
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAID', errorMessage: null },
    });
    console.log('Reset order to PAID for retry:', order.id);
  }

  if (order.userId == null) {
    const defaultUserId = process.env.TEST_USER_ID ? parseInt(process.env.TEST_USER_ID, 10) : undefined;
    if (defaultUserId && !isNaN(defaultUserId)) {
      await prisma.order.update({
        where: { id: order.id },
        data: { userId: defaultUserId },
      });
      console.log('Set order userId:', defaultUserId);
    }
  }

  const prevApiOnly = process.env.ALIEXPRESS_DROPSHIPPING_API_ONLY;
  process.env.ALIEXPRESS_DROPSHIPPING_API_ONLY = 'true';

  try {
    const { orderFulfillmentService } = await import('../src/services/order-fulfillment.service');
    const result = await orderFulfillmentService.fulfillOrder(order.id);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'PURCHASED') {
      console.log('OK Order is PURCHASED. aliexpressOrderId:', result.aliexpressOrderId);
      return 0;
    }
    console.error('Fulfillment ended with status:', result.status, result.error || '');
    return 1;
  } finally {
    if (prevApiOnly !== undefined) process.env.ALIEXPRESS_DROPSHIPPING_API_ONLY = prevApiOnly;
    else delete process.env.ALIEXPRESS_DROPSHIPPING_API_ONLY;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
