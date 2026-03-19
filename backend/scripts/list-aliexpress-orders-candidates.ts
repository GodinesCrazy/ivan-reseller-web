#!/usr/bin/env tsx
/**
 * List AliExpress fulfillment candidates from DB.
 * Usage (from backend/): npx tsx scripts/list-aliexpress-orders-candidates.ts
 */

import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ['FAILED', 'PAID'] },
      productUrl: { not: null },
      userId: { not: null },
      paypalOrderId: { startsWith: 'ebay:' },
    },
    take: 15,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      userId: true,
      price: true,
      currency: true,
      paypalOrderId: true,
      productUrl: true,
      errorMessage: true,
      fulfillRetryCount: true,
      createdAt: true,
    },
  });

  const mapped = orders.map((o) => ({
    id: o.id,
    status: o.status,
    userId: o.userId,
    ebayOrderId: o.paypalOrderId ? o.paypalOrderId.replace('ebay:', '') : null,
    price: Number(o.price),
    currency: o.currency,
    productUrlPrefix: (o.productUrl || '').substring(0, 80),
    errorMessage: o.errorMessage || null,
    fulfillRetryCount: o.fulfillRetryCount ?? null,
    createdAt: o.createdAt?.toISOString?.() ?? String(o.createdAt),
  }));

  console.log(JSON.stringify({ count: mapped.length, orders: mapped }, null, 2));

  if (mapped.length === 0) {
    console.log('No candidate orders found. Ensure orders exist in DB with status FAILED/PAID and productUrl.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    try {
      await prisma.$disconnect();
    } catch {
      // ignore
    }
    process.exit(1);
  });

