#!/usr/bin/env tsx
/**
 * Check state of order by eBay order ID (e.g. 17-14370-63716).
 * Run from backend/: npx tsx scripts/check-order-ebay-id.ts [ebayOrderId]
 * With production DB: railway run npx tsx scripts/check-order-ebay-id.ts 17-14370-63716
 */
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';
config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';

const EBAY_ORDER_ID = process.argv[2]?.trim() || '17-14370-63716';

async function main() {
  const paypalOrderId = `ebay:${EBAY_ORDER_ID}`;
  const order = await prisma.order.findFirst({
    where: { paypalOrderId },
    include: {
      user: { select: { id: true, username: true, email: true } },
    },
  });
  if (!order) {
    console.log(JSON.stringify({
      found: false,
      ebayOrderId: EBAY_ORDER_ID,
      message: 'Order not in database. Use "Traer pedido desde eBay" in UI or POST /api/orders/fetch-ebay-order.',
    }, null, 2));
    return;
  }
  const sale = await prisma.sale.findUnique({
    where: { orderId: order.id },
    select: { id: true, status: true, trackingNumber: true, salePrice: true, createdAt: true },
  });
  console.log(JSON.stringify({
    found: true,
    ebayOrderId: EBAY_ORDER_ID,
    order: {
      id: order.id,
      status: order.status,
      title: order.title,
      price: String(order.price),
      currency: order.currency,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      paypalOrderId: order.paypalOrderId,
      aliexpressOrderId: order.aliexpressOrderId,
      errorMessage: order.errorMessage,
      fulfillRetryCount: order.fulfillRetryCount,
      createdAt: order.createdAt.toISOString(),
      userId: order.userId,
    },
    sale: sale ? {
      id: sale.id,
      status: sale.status,
      trackingNumber: sale.trackingNumber,
      salePrice: sale.salePrice?.toString(),
      createdAt: sale.createdAt.toISOString(),
    } : null,
  }, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
