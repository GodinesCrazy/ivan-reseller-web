#!/usr/bin/env npx tsx
import 'dotenv/config';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env'), override: false });
config({ path: path.join(process.cwd(), '.env.local'), override: true });

import { prisma } from '../src/config/database';
import { markOrderCancelledOnMarketplace } from '../src/services/order-truth.service';

async function main(): Promise<void> {
  const ebayOrderId = String(process.argv[2] || '').trim();
  const reason =
    String(process.argv[3] || '').trim() ||
    'Order manually cancelled on eBay because it was not commercially viable.';

  if (!ebayOrderId) {
    throw new Error('Usage: npx tsx scripts/mark-order-marketplace-cancelled.ts <ebayOrderId> [reason]');
  }

  const order = await prisma.order.findFirst({
    where: { paypalOrderId: `ebay:${ebayOrderId}` },
    select: { id: true },
  });

  if (!order) {
    throw new Error(`Order ebay:${ebayOrderId} not found`);
  }

  const result = await markOrderCancelledOnMarketplace({
    orderId: order.id,
    marketplaceObservedStatus: 'MANUALLY_CANCELLED_OPERATOR_CONFIRMED',
    reason,
  });

  const updatedOrder = await prisma.order.findUnique({
    where: { id: order.id },
    select: {
      id: true,
      status: true,
      failureReason: true,
      errorMessage: true,
      fulfillmentNotes: true,
    },
  });
  const sale = await prisma.sale.findUnique({
    where: { orderId: order.id },
    select: { id: true, status: true },
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        ebayOrderId,
        result,
        order: updatedOrder,
        sale,
      },
      null,
      2
    )
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error?.message || error);
    await prisma.$disconnect();
    process.exit(1);
  });
